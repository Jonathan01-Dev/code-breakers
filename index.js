const net = require('net');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const nacl = require('tweetnacl');
require('dotenv').config();

const { startTcpServer, sendPeerList, encodeFrame, TLV } = require('./src/network/server');

const app = express();
const webServer = http.createServer(app);
const io = new Server(webServer);

const CONFIG = {
    UI_PORT: Number(process.env.UI_PORT || 3000),
    MULTICAST_ADDR: process.env.MULTICAST_ADDR || '239.255.42.99',
    MULTICAST_PORT: Number(process.env.MULTICAST_PORT || 6000),
    TCP_PORT: Number(process.env.TCP_PORT || 7777),
    KEYS_PATH: process.env.KEYS_PATH || path.join(__dirname, 'keys_ed25519.json'),
    PEERS_PATH: path.join(__dirname, 'peers.json')
};

const sessions = new Map();
const pendingHandshakes = new Map();
const pendingMessages = new Map();
const socketContexts = new WeakMap();
const handshakeWaiters = new Map();

function normalizeHex(hex) {
    if (!hex) return null;
    const clean = String(hex).trim().toLowerCase().replace(/^0x/, '');
    return clean.length % 2 === 1 ? `0${clean}` : clean;
}

function normalizeIp(address) {
    if (!address) return null;
    const raw = String(address).trim();
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    if (raw === '::1') return '127.0.0.1';
    return raw;
}

function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (Buffer.isBuffer(value)) return new Uint8Array(value);
    if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'utf8'));
    return new Uint8Array(value || []);
}

const TYPE = {
    HELLO: 0x01,
    PING: 0x02,
    PONG: 0x03
};

const PEER_TTL_MS = 90_000;
const peers = new Map();
let currentTcpPort = CONFIG.TCP_PORT;
app.use(express.static(path.join(__dirname, 'src/ui')));

function normalizeNodeId(hexLike) {
    const clean = String(hexLike || '').toLowerCase().replace(/^0x/, '').replace(/[^0-9a-f]/g, '');
    return clean.padEnd(16, '0').slice(0, 16);
}

function fallbackNodeId() {
    const basis = process.env.NODE_NAME || `${process.pid}-${Date.now()}`;
    return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

function deriveInstanceNodeId(baseNodeId, tcpPort) {
    const base = normalizeNodeId(baseNodeId);
    const hostTag = (process.env.NODE_INSTANCE || process.env.COMPUTERNAME || os.hostname() || '').toLowerCase();
    const salt = `${base}:${Number(tcpPort || CONFIG.TCP_PORT)}:${hostTag}`;
    return `0x${crypto.createHash('sha256').update(salt).digest('hex').slice(0, 16)}`;
}

function buildSigningIdentity(seedBuffer, publicKeyHexOverride, machineIdOverride) {
    const keyPair = nacl.sign.keyPair.fromSeed(seedBuffer);
    const publicKeyHex = normalizeHex(publicKeyHexOverride) || Buffer.from(keyPair.publicKey).toString('hex');
    const machineIdRaw = machineIdOverride || fallbackNodeId();
    const machineIdNormalized = normalizeHex(machineIdRaw) || fallbackNodeId();
    return {
        machine_id: `0x${machineIdNormalized.slice(0, 16)}`,
        public_key_hex: publicKeyHex,
        sign: (data) => Buffer.from(nacl.sign.detached(toUint8Array(data), keyPair.secretKey)),
        verify: (data, signature, pubHex) => {
            const targetHex = normalizeHex(pubHex) || publicKeyHex;
            return nacl.sign.detached.verify(
                toUint8Array(data),
                toUint8Array(signature),
                new Uint8Array(Buffer.from(targetHex, 'hex'))
            );
        }
    };
}

function loadIdentity() {
    if (fs.existsSync(CONFIG.KEYS_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG.KEYS_PATH, 'utf8'));
            const seedHex = normalizeHex(data.private_key_hex);
            if (!seedHex) throw new Error('Clé private invalide');
            const seed = Buffer.from(seedHex, 'hex');
            return buildSigningIdentity(seed, data.public_key_hex, data.machine_id);
        } catch (err) {
            console.warn('[IDENTITY] Impossible de charger la clé Ed25519:', err.message);
        }
    } else {
        console.warn(`[IDENTITY] Fichier ${CONFIG.KEYS_PATH} introuvable, génération temporaire d'un couple de clés.`);
    }
    const randomSeed = nacl.sign.keyPair().secretKey.slice(0, 32);
    return buildSigningIdentity(Buffer.from(randomSeed));
}

const identity = loadIdentity();
const explicitNodeId = process.env.NODE_ID ? `0x${normalizeNodeId(process.env.NODE_ID)}` : null;
let selfNodeId = explicitNodeId || deriveInstanceNodeId(identity.machine_id, CONFIG.TCP_PORT);

function createEphemeralPair() {
    const pair = crypto.generateKeyPairSync('x25519');
    return {
        privateKey: pair.privateKey,
        publicDer: pair.publicKey.export({ type: 'spki', format: 'der' })
    };
}

function importEphemeralPublic(base64) {
    return crypto.createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
}

function deriveSharedSecret(localPrivateKey, remotePublicKey) {
    return crypto.diffieHellman({ privateKey: localPrivateKey, publicKey: remotePublicKey });
}

function deriveSessionKeys(sharedSecret) {
    const sessionKey = crypto.hkdfSync('sha256', sharedSecret, Buffer.from('archipel-v1'), Buffer.from('session-key'), 32);
    const hmacKey = crypto.hkdfSync('sha256', sharedSecret, Buffer.from('archipel-v1'), Buffer.from('auth-key'), 32);
    return { sessionKey, hmacKey, sharedSecret };
}

function computeHmac(key, chunks) {
    const hmac = crypto.createHmac('sha256', key);
    for (const chunk of chunks) {
        hmac.update(chunk);
    }
    return hmac.digest();
}

function encryptMessage(session, plaintext) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', session.sessionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const hmac = computeHmac(session.hmacKey, [nonce, ciphertext, tag]);
    return { nonce, ciphertext, tag, hmac };
}

function decryptMessage(session, payload) {
    const { nonce, ciphertext, tag, hmac } = payload;
    const expected = computeHmac(session.hmacKey, [nonce, ciphertext, tag]);
    if (expected.length !== hmac.length || !crypto.timingSafeEqual(expected, hmac)) {
        throw new Error('HMAC invalide');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', session.sessionKey, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function handshakeSignatureMaterial({
    initiatorNodeId,
    responderNodeId,
    initiatorEphDer,
    responderEphDer,
    helloTimestamp
}) {
    const tsBuf = Buffer.alloc(8);
    tsBuf.writeBigUInt64BE(BigInt(helloTimestamp || Date.now()));
    return Buffer.concat([
        Buffer.from(String(initiatorNodeId || ''), 'utf8'),
        Buffer.from(String(responderNodeId || ''), 'utf8'),
        initiatorEphDer,
        responderEphDer,
        tsBuf
    ]);
}

function authSignatureMaterial(sharedSecret) {
    const sharedHash = crypto.createHash('sha256').update(sharedSecret).digest();
    return Buffer.concat([Buffer.from('archipel-auth'), sharedHash]);
}

function registerPeerKey(nodeId, publicKeyHex, trustLabel = 'tofu') {
    if (!nodeId || !publicKeyHex) return;
    const normalized = normalizeHex(publicKeyHex);
    const peer = peers.get(nodeId) || {
        node_id: nodeId,
        ip: null,
        tcp_port: CONFIG.TCP_PORT,
        last_seen: Date.now()
    };
    if (peer.public_key && peer.public_key !== normalized) {
        console.warn(`[TRUST] Changement de clé publique pour ${nodeId}`);
    }
    peer.public_key = normalized;
    peer.trust = peer.trust || trustLabel;
    peers.set(nodeId, peer);
    persistPeers();
}

function storeSession(nodeId, sessionContext) {
    if (!nodeId || !sessionContext) return;
    sessions.set(nodeId, {
        node_id: nodeId,
        sessionKey: sessionContext.sessionKey,
        hmacKey: sessionContext.hmacKey,
        remotePublicKey: sessionContext.remotePublicKey || null,
        lastHandshake: Date.now()
    });
    io.emit('session_ready', { id: nodeId });
    console.log(`[HANDSHAKE] Session AES-GCM prête pour ${nodeId}`);
    const waiter = handshakeWaiters.get(nodeId);
    if (waiter) {
        clearTimeout(waiter.timer);
        waiter.socket.emit('connect_status', { id: nodeId, ok: true });
        handshakeWaiters.delete(nodeId);
    }
    flushPendingMessages(nodeId);
}

function persistPeers() {
    const list = [...peers.values()].map((p) => ({
        node_id: p.node_id,
        ip: p.ip,
        tcp_port: p.tcp_port,
        last_seen: p.last_seen,
        shared_files: p.shared_files || [],
        reputation: typeof p.reputation === 'number' ? p.reputation : 1.0,
        public_key: p.public_key || null,
        trust: p.trust || 'unknown'
    }));
    fs.writeFileSync(CONFIG.PEERS_PATH, JSON.stringify(list, null, 2));
}

function upsertPeer({ node_id, ip, tcp_port, public_key }) {
    if (!node_id || node_id === selfNodeId) return;
    const prev = peers.get(node_id) || {};
    const normalizedIp = normalizeIp(ip) || prev.ip;
    const peer = {
        node_id,
        ip: normalizedIp,
        tcp_port: Number(tcp_port || prev.tcp_port || CONFIG.TCP_PORT),
        last_seen: Date.now(),
        shared_files: prev.shared_files || [],
        reputation: typeof prev.reputation === 'number' ? prev.reputation : 1.0,
        public_key: prev.public_key,
        trust: prev.trust
    };
    if (public_key) {
        peer.public_key = normalizeHex(public_key);
        peer.trust = peer.trust || 'tofu';
    }
    peers.set(node_id, peer);
    persistPeers();

    io.emit('peer_detected', {
        id: peer.node_id,
        address: peer.ip,
        tcp_port: peer.tcp_port,
        status: 'online'
    });

    if (peer.ip && peer.tcp_port) {
        initiateHandshake(peer);
    }
}

function cleanStalePeers() {
    const now = Date.now();
    let changed = false;
    for (const [id, p] of peers.entries()) {
        if (now - p.last_seen > PEER_TTL_MS) {
            peers.delete(id);
            changed = true;
            console.log(`[PEER] Expire: ${id} (${p.ip})`);
            io.emit('peer_timeout', { id });
        }
    }
    if (changed) persistPeers();
}

function parsePacket(msg) {
    if (!Buffer.isBuffer(msg) || msg.length < 13) return null;
    if (msg.slice(0, 3).toString() !== 'ARC') return null;

    const version = msg.readUInt8(3);
    const type = msg.readUInt8(4);
    const senderHex = msg.slice(5, 13).toString('hex');

    let tcpPort = CONFIG.TCP_PORT;
    if (type === TYPE.HELLO && msg.length >= 15) {
        tcpPort = msg.readUInt16BE(13);
    }

    return {
        version,
        type,
        node_id: `0x${normalizeNodeId(senderHex)}`,
        tcp_port: tcpPort
    };
}

function buildDiscoveryPacket(type) {
    const idBytes = Buffer.from(normalizeNodeId(selfNodeId), 'hex');
    if (type === TYPE.HELLO) {
        const packet = Buffer.alloc(23);
        packet.write('ARC', 0, 'ascii');
        packet.writeUInt8(0x01, 3);
        packet.writeUInt8(TYPE.HELLO, 4);
        idBytes.copy(packet, 5);
        packet.writeUInt16BE(currentTcpPort, 13);
        packet.writeBigUInt64BE(BigInt(Date.now()), 15);
        return packet;
    }
    return Buffer.concat([Buffer.from('ARC'), Buffer.from([0x01, type]), idBytes]);
}

function currentPeerList() {
    return [...peers.values()]
        .filter((p) => p && p.node_id && p.node_id !== selfNodeId)
        .map((p) => ({
            node_id: p.node_id,
            ip: p.ip,
            tcp_port: p.tcp_port,
            last_seen: p.last_seen
        }));
}

function logPeerTable() {
    const list = currentPeerList();
    console.log(`[PEER_TABLE] ${list.length} peer(s)`);
    if (list.length > 0) {
        console.table(list.map((p) => ({
            node_id: p.node_id,
            ip: p.ip,
            tcp_port: p.tcp_port
        })));
    }
}

const radar = dgram.createSocket({ type: 'udp4', reuseAddr: true });
radar.on('message', (msg, rinfo) => {
    try {
        const packet = parsePacket(msg);
        if (!packet || packet.node_id === selfNodeId) return;
        const remoteIp = normalizeIp(rinfo.address);

        if (packet.type === TYPE.HELLO) {
            upsertPeer({ node_id: packet.node_id, ip: remoteIp, tcp_port: packet.tcp_port });
            console.log(`[HELLO] ${packet.node_id} @ ${remoteIp}:${packet.tcp_port}`);
            logPeerTable();

            sendPeerList(remoteIp, packet.tcp_port, {
                from: selfNodeId,
                tcp_port: currentTcpPort,
                peers: currentPeerList()
            });
            return;
        }

        if (packet.type === TYPE.PING) {
            console.log(`[PING] Recu de ${packet.node_id} (${remoteIp})`);
            radar.send(buildDiscoveryPacket(TYPE.PONG), CONFIG.MULTICAST_PORT, remoteIp);
            return;
        }

        if (packet.type === TYPE.PONG) {
            console.log(`[PONG] Recu de ${packet.node_id} (${remoteIp})`);
            io.emit('pong_received', { id: packet.node_id, address: remoteIp });
        }
    } catch (err) {
        console.error('[RADAR] Erreur parse:', err.message);
    }
});

radar.bind(CONFIG.MULTICAST_PORT, () => {
    radar.setBroadcast(true);
    radar.addMembership(CONFIG.MULTICAST_ADDR);
    console.log(`[RADAR] Listening on ${CONFIG.MULTICAST_ADDR}:${CONFIG.MULTICAST_PORT}`);
});

function sendHello() {
    radar.send(buildDiscoveryPacket(TYPE.HELLO), CONFIG.MULTICAST_PORT, CONFIG.MULTICAST_ADDR);
}

setInterval(sendHello, 30_000);
setTimeout(sendHello, 300);
setInterval(cleanStalePeers, 10_000);

startTcpServer(CONFIG.TCP_PORT, {
    onListening: (port) => {
        currentTcpPort = port;
        if (!explicitNodeId) {
            selfNodeId = deriveInstanceNodeId(identity.machine_id, currentTcpPort);
        }
    },
    onPeerList: (message, remoteAddress) => {
        if (!message || !Array.isArray(message.peers)) return;
        const fallbackRemote = normalizeIp(remoteAddress);
        for (const entry of message.peers) {
            upsertPeer({
                node_id: entry.node_id,
                ip: normalizeIp(entry.ip) || fallbackRemote,
                tcp_port: Number(entry.tcp_port || CONFIG.TCP_PORT)
            });
        }
        logPeerTable();
    },
    onHandshakeFrame: handleServerHandshakeFrame
});

function cleanupPendingHandshake(nodeId) {
    const context = pendingHandshakes.get(nodeId);
    if (!context) return;
    pendingHandshakes.delete(nodeId);
    if (context.socket && !context.socket.destroyed) {
        context.socket.destroy();
    }
}

function initiateHandshake(peer, force = false) {
    if (!peer || !peer.node_id || pendingHandshakes.has(peer.node_id)) return;
    if (!force && sessions.has(peer.node_id)) return;
    if (!peer.ip || !peer.tcp_port) return;
    const context = {
        peer,
        buffer: Buffer.alloc(0),
        role: 'initiator'
    };
    const socket = net.createConnection({ host: normalizeIp(peer.ip), port: peer.tcp_port });
    context.socket = socket;
    pendingHandshakes.set(peer.node_id, context);
    socket.setNoDelay(true);
    socket.on('connect', () => sendHelloHandshake(context));
    socket.on('data', (chunk) => handleInitiatorData(context, chunk));
    const teardown = () => cleanupPendingHandshake(peer.node_id);
    socket.on('error', (err) => {
        console.warn(`[HANDSHAKE] (${peer.node_id}) ${err.message}`);
        io.emit('connect_status', { id: peer.node_id, ok: false, error: err.message });
        teardown();
    });
    socket.on('close', teardown);
}

function tcpPingPeer(peer, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
        if (!peer || !peer.ip || !peer.tcp_port) {
            reject(new Error('Peer sans IP/TCP'));
            return;
        }
        const socket = net.createConnection({ host: normalizeIp(peer.ip), port: peer.tcp_port });
        let settled = false;
        let buffer = Buffer.alloc(0);
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            socket.destroy();
            reject(new Error('Timeout ping TCP'));
        }, timeoutMs);

        const finishOk = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.end();
            resolve(true);
        };
        const finishErr = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            reject(err instanceof Error ? err : new Error(String(err)));
        };

        socket.on('connect', () => {
            socket.write(encodeFrame(TLV.KEEPALIVE_PING));
        });
        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 5) {
                const type = buffer.readUInt8(0);
                const length = buffer.readUInt32BE(1);
                if (buffer.length < 5 + length) return;
                buffer = buffer.slice(5 + length);
                if (type === TLV.KEEPALIVE_PONG) {
                    finishOk();
                    return;
                }
            }
        });
        socket.on('error', finishErr);
    });
}

function sendHelloHandshake(context) {
    if (!context || !context.socket) return;
    const eph = createEphemeralPair();
    context.eph = eph;
    const payload = {
        node_id: selfNodeId,
        permanent_pub: identity.public_key_hex,
        eph_pub: eph.publicDer.toString('base64'),
        timestamp: Date.now()
    };
    context.socket.write(encodeFrame(TLV.HANDSHAKE_HELLO, Buffer.from(JSON.stringify(payload), 'utf8')));
}

function handleInitiatorData(context, chunk) {
    context.buffer = Buffer.concat([context.buffer, chunk]);
    while (context.buffer.length >= 5) {
        const type = context.buffer.readUInt8(0);
        const length = context.buffer.readUInt32BE(1);
        if (context.buffer.length < 5 + length) break;
        const payload = context.buffer.slice(5, 5 + length);
        context.buffer = context.buffer.slice(5 + length);
        handleInitiatorFrame(context, type, payload);
    }
}

function handleInitiatorFrame(context, type, payload) {
    if (type === TLV.HANDSHAKE_HELLO_REPLY) {
        handleHelloReply(context, payload);
        return;
    }
    if (type === TLV.HANDSHAKE_AUTH_OK) {
        handleAuthOk(context);
        return;
    }
    if (type === TLV.ENCRYPTED_MESSAGE) {
        handleServerEncryptedMessage(payload);
    }
}

function handleHelloReply(context, payloadBuffer) {
    let payload;
    try {
        payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err) {
        console.warn('[HANDSHAKE] Hello reply invalide');
        cleanupPendingHandshake(context.peer.node_id);
        return;
    }
    registerPeerKey(payload.node_id, payload.permanent_pub);
    let remoteEph;
    try {
        remoteEph = importEphemeralPublic(payload.eph_pub);
    } catch (err) {
        console.warn(`[HANDSHAKE] cle eph reply invalide (${payload.node_id}): ${err.message}`);
        cleanupPendingHandshake(context.peer.node_id);
        return;
    }
    const remoteEphDer = remoteEph.export({ type: 'spki', format: 'der' });
    const material = handshakeSignatureMaterial({
        initiatorNodeId: selfNodeId,
        responderNodeId: payload.node_id,
        initiatorEphDer: context.eph.publicDer,
        responderEphDer: remoteEphDer,
        helloTimestamp: payload.hello_timestamp
    });
    const signature = Buffer.from(payload.signature || '', 'base64');
    if (!identity.verify(material, signature, payload.permanent_pub)) {
        console.warn(`[HANDSHAKE] signature HELLO_REPLY invalide (${payload.node_id})`);
        cleanupPendingHandshake(context.peer.node_id);
        return;
    }
    const sharedSecret = deriveSharedSecret(context.eph.privateKey, remoteEph);
    context.session = deriveSessionKeys(sharedSecret);
    context.remotePublicKey = normalizeHex(payload.permanent_pub);
    context.remoteNodeId = payload.node_id;
    const authPayload = {
        node_id: selfNodeId,
        signature: identity.sign(authSignatureMaterial(sharedSecret)).toString('base64'),
        timestamp: Date.now()
    };
    context.socket.write(encodeFrame(TLV.HANDSHAKE_AUTH, Buffer.from(JSON.stringify(authPayload), 'utf8')));
}

function handleAuthOk(context) {
    if (!context || !context.remoteNodeId || !context.session) return;
    storeSession(context.remoteNodeId, {
        sessionKey: context.session.sessionKey,
        hmacKey: context.session.hmacKey,
        remotePublicKey: context.remotePublicKey
    });
    sendEncryptedMessage(context.remoteNodeId, 'Hello Archipel');
    cleanupPendingHandshake(context.peer.node_id);
}

function handleServerHandshakeFrame(type, payloadBuffer, socket) {
    if (type === TLV.HANDSHAKE_HELLO) {
        return respondToHello(socket, payloadBuffer);
    }
    if (type === TLV.HANDSHAKE_AUTH) {
        return respondToAuth(socket, payloadBuffer);
    }
    if (type === TLV.ENCRYPTED_MESSAGE) {
        return handleServerEncryptedMessage(payloadBuffer);
    }
}

function respondToHello(socket, payloadBuffer) {
    let payload;
    try {
        payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err) {
        console.warn('[HANDSHAKE] Hello entrante invalide');
        return;
    }
    registerPeerKey(payload.node_id, payload.permanent_pub);
    const context = {
        socket,
        remoteNodeId: payload.node_id,
        remotePublicKey: normalizeHex(payload.permanent_pub)
    };
    let remoteEph;
    try {
        remoteEph = importEphemeralPublic(payload.eph_pub);
    } catch (err) {
        console.warn(`[HANDSHAKE] cle eph entrante invalide (${payload.node_id}): ${err.message}`);
        return;
    }
    const eph = createEphemeralPair();
    const sharedSecret = deriveSharedSecret(eph.privateKey, remoteEph);
    context.session = deriveSessionKeys(sharedSecret);
    context.eph = eph;
    context.remoteEphDer = remoteEph.export({ type: 'spki', format: 'der' });
    socketContexts.set(socket, context);
    const signatureMaterial = handshakeSignatureMaterial({
        initiatorNodeId: payload.node_id,
        responderNodeId: selfNodeId,
        initiatorEphDer: context.remoteEphDer,
        responderEphDer: context.eph.publicDer,
        helloTimestamp: payload.timestamp
    });
    const signature = identity.sign(signatureMaterial).toString('base64');
    const reply = {
        node_id: selfNodeId,
        permanent_pub: identity.public_key_hex,
        eph_pub: context.eph.publicDer.toString('base64'),
        hello_timestamp: payload.timestamp,
        timestamp: Date.now(),
        signature
    };
    socket.write(encodeFrame(TLV.HANDSHAKE_HELLO_REPLY, Buffer.from(JSON.stringify(reply), 'utf8')));
}

function respondToAuth(socket, payloadBuffer) {
    const context = socketContexts.get(socket);
    if (!context || !context.session) return;
    let payload;
    try {
        payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err) {
        console.warn('[HANDSHAKE] Auth entrante invalide');
        return;
    }
    const signature = Buffer.from(payload.signature || '', 'base64');
    let ok = false;
    try {
        ok = identity.verify(authSignatureMaterial(context.session.sharedSecret), signature, context.remotePublicKey);
    } catch (err) {
        console.warn(`[HANDSHAKE] Auth verification erreur (${context.remoteNodeId}): ${err.message}`);
        return;
    }
    if (!ok) {
        console.warn(`[HANDSHAKE] Auth signature invalide (${context.remoteNodeId})`);
        return;
    }
    socket.write(encodeFrame(TLV.HANDSHAKE_AUTH_OK, Buffer.from(JSON.stringify({
        node_id: selfNodeId,
        timestamp: Date.now()
    }), 'utf8')));
    registerPeerKey(context.remoteNodeId, context.remotePublicKey);
    storeSession(context.remoteNodeId, {
        sessionKey: context.session.sessionKey,
        hmacKey: context.session.hmacKey,
        remotePublicKey: context.remotePublicKey
    });
    sendEncryptedMessage(context.remoteNodeId, 'Archipel message depuis le répondeur');
}

function handleServerEncryptedMessage(payloadBuffer) {
    let frame;
    try {
        frame = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (err) {
        console.warn('[MSG] Paquet chiffré invalide');
        return;
    }
    const session = sessions.get(frame.from);
    if (!session) {
        console.warn(`[MSG] Pas de session pour ${frame.from}`);
        return;
    }
    try {
        const plaintext = decryptMessage(session, {
            nonce: base64ToBuffer(frame.nonce),
            ciphertext: base64ToBuffer(frame.ciphertext),
            tag: base64ToBuffer(frame.tag),
            hmac: base64ToBuffer(frame.hmac)
        });
        const text = plaintext.toString('utf8');
        console.log(`[MSG] ${frame.from} -> ${frame.to}: ${text}`);
        io.emit('message_received', { from: frame.from, message: text });
    } catch (err) {
        console.warn(`[MSG] Decrypt fail: ${err.message}`);
    }
}

function sendEncryptedMessage(nodeId, plaintext) {
    const session = sessions.get(nodeId);
    const peer = peers.get(nodeId);
    const text = String(plaintext || '').trim();
    if (!text) return { ok: false, error: 'Message vide' };
    if (!peer || !peer.ip || !peer.tcp_port) return { ok: false, error: 'Peer introuvable ou hors ligne' };
    if (!session) {
        if (!pendingMessages.has(nodeId)) pendingMessages.set(nodeId, []);
        pendingMessages.get(nodeId).push(text);
        initiateHandshake(peer, true);
        return { ok: false, pending: true, error: 'Session non etablie, handshake en cours' };
    }
    const encrypted = encryptMessage(session, Buffer.from(String(plaintext), 'utf8'));
    const payload = {
        from: selfNodeId,
        to: nodeId,
        nonce: encrypted.nonce.toString('base64'),
        ciphertext: encrypted.ciphertext.toString('base64'),
        tag: encrypted.tag.toString('base64'),
        hmac: encrypted.hmac.toString('base64'),
        timestamp: Date.now()
    };
    const client = net.createConnection({ host: normalizeIp(peer.ip), port: peer.tcp_port }, () => {
        client.write(encodeFrame(TLV.ENCRYPTED_MESSAGE, Buffer.from(JSON.stringify(payload), 'utf8')));
        client.end();
    });
    client.on('error', (err) => console.warn(`[MSG] Échec envoi ${nodeId}: ${err.message}`));
    return { ok: true };
}

function flushPendingMessages(nodeId) {
    const queued = pendingMessages.get(nodeId);
    if (!queued || queued.length === 0) return;
    pendingMessages.delete(nodeId);
    for (const msg of queued) {
        sendEncryptedMessage(nodeId, msg);
    }
}

function base64ToBuffer(value) {
    return Buffer.from(value || '', 'base64');
}

io.on('connection', (socket) => {
    socket.emit('local_identity', {
        machine_id: selfNodeId,
        tcp_port: currentTcpPort
    });

    socket.emit('peer_table', currentPeerList().map((p) => ({
        id: p.node_id,
        address: p.ip,
        tcp_port: p.tcp_port,
        status: 'online'
    })));

    socket.on('send_ping', (target) => {
        if (!target) return;
        const peer = target.id ? peers.get(target.id) : null;
        const targetAddress = normalizeIp(peer?.ip || target.address);
        const targetPort = Number(peer?.tcp_port || target.tcp_port || CONFIG.TCP_PORT);
        if (!targetAddress) {
            socket.emit('ping_error', { id: target.id, address: null, error: 'Adresse peer indisponible' });
            return;
        }

        radar.send(buildDiscoveryPacket(TYPE.PING), CONFIG.MULTICAST_PORT, targetAddress, () => {});

        tcpPingPeer({ ip: targetAddress, tcp_port: targetPort })
            .then(() => socket.emit('pong_received', { id: target.id, address: targetAddress }))
            .catch((err) => socket.emit('ping_error', {
                id: target.id,
                address: targetAddress,
                error: err.message
            }));
    });

    socket.on('connect_peer', ({ id } = {}) => {
        if (!id) return;
        const peer = peers.get(id);
        if (!peer || !peer.ip || !peer.tcp_port) {
            socket.emit('connect_status', { id, ok: false, error: 'Peer introuvable ou hors ligne' });
            return;
        }
        if (sessions.has(id)) {
            socket.emit('connect_status', { id, ok: true, reused: true });
            return;
        }
        const existing = handshakeWaiters.get(id);
        if (existing) {
            clearTimeout(existing.timer);
        }
        const timer = setTimeout(() => {
            const active = handshakeWaiters.get(id);
            if (!active || active.socket !== socket) return;
            socket.emit('connect_status', { id, ok: false, error: 'Timeout handshake' });
            handshakeWaiters.delete(id);
        }, 8000);
        handshakeWaiters.set(id, { socket, timer });
        initiateHandshake(peer, true);
    });

    socket.on('send_encrypted', ({ id, message } = {}) => {
        if (!id) return;
        const result = sendEncryptedMessage(id, message);
        socket.emit('message_status', { id, ...result });
    });

    socket.on('request_scan', () => {
        sendHello();
    });
});

let uiPort = CONFIG.UI_PORT;
webServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && uiPort < CONFIG.UI_PORT + 20) {
        uiPort += 1;
        console.warn(`[UI] Port occupe, nouvel essai sur ${uiPort}`);
        setTimeout(() => webServer.listen(uiPort), 200);
        return;
    }
    console.error('[UI] Erreur serveur:', err.message);
    process.exit(1);
});

webServer.listen(uiPort, () => {
    console.log(`[UI] Dashboard: http://localhost:${uiPort}`);
    console.log(`[NODE] ID local: ${selfNodeId}`);
});
