const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const crypto = require('crypto');
require('dotenv').config();

const { startTcpServer, sendPeerList } = require('./src/network/server');

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
    const salt = `${base}:${Number(tcpPort || CONFIG.TCP_PORT)}`;
    return `0x${crypto.createHash('sha256').update(salt).digest('hex').slice(0, 16)}`;
}

function loadIdentity() {
    try {
        if (fs.existsSync(CONFIG.KEYS_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.KEYS_PATH, 'utf8'));
            const id = normalizeNodeId(data.machine_id);
            return { machine_id: `0x${id}` };
        }
    } catch (_) {}
    const id = fallbackNodeId();
    return { machine_id: `0x${id}` };
}

const identity = loadIdentity();
const explicitNodeId = process.env.NODE_ID ? `0x${normalizeNodeId(process.env.NODE_ID)}` : null;
let selfNodeId = explicitNodeId || deriveInstanceNodeId(identity.machine_id, CONFIG.TCP_PORT);

function persistPeers() {
    const list = [...peers.values()].map((p) => ({
        node_id: p.node_id,
        ip: p.ip,
        tcp_port: p.tcp_port,
        last_seen: p.last_seen,
        shared_files: p.shared_files || [],
        reputation: typeof p.reputation === 'number' ? p.reputation : 1.0
    }));
    fs.writeFileSync(CONFIG.PEERS_PATH, JSON.stringify(list, null, 2));
}

function upsertPeer({ node_id, ip, tcp_port }) {
    if (!node_id || node_id === selfNodeId) return;
    const prev = peers.get(node_id) || {};
    const peer = {
        node_id,
        ip: ip || prev.ip,
        tcp_port: Number(tcp_port || prev.tcp_port || CONFIG.TCP_PORT),
        last_seen: Date.now(),
        shared_files: prev.shared_files || [],
        reputation: typeof prev.reputation === 'number' ? prev.reputation : 1.0
    };
    peers.set(node_id, peer);
    persistPeers();

    io.emit('peer_detected', {
        id: peer.node_id,
        address: peer.ip,
        tcp_port: peer.tcp_port,
        status: 'online'
    });
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
    return [...peers.values()].map((p) => ({
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

        if (packet.type === TYPE.HELLO) {
            upsertPeer({ node_id: packet.node_id, ip: rinfo.address, tcp_port: packet.tcp_port });
            console.log(`[HELLO] ${packet.node_id} @ ${rinfo.address}:${packet.tcp_port}`);
            logPeerTable();

            sendPeerList(rinfo.address, packet.tcp_port, {
                from: selfNodeId,
                tcp_port: currentTcpPort,
                peers: currentPeerList()
            });
            return;
        }

        if (packet.type === TYPE.PING) {
            console.log(`[PING] Recu de ${packet.node_id} (${rinfo.address})`);
            radar.send(buildDiscoveryPacket(TYPE.PONG), CONFIG.MULTICAST_PORT, rinfo.address);
            return;
        }

        if (packet.type === TYPE.PONG) {
            console.log(`[PONG] Recu de ${packet.node_id} (${rinfo.address})`);
            io.emit('pong_received', { id: packet.node_id, address: rinfo.address });
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
        for (const entry of message.peers) {
            upsertPeer({
                node_id: entry.node_id,
                ip: entry.ip || remoteAddress,
                tcp_port: Number(entry.tcp_port || CONFIG.TCP_PORT)
            });
        }
        logPeerTable();
    }
});

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
        if (!target || !target.address) return;
        radar.send(buildDiscoveryPacket(TYPE.PING), CONFIG.MULTICAST_PORT, target.address);
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
