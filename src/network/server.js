const net = require('net');

const TLV = {
    PEER_LIST: 0x02,
    KEEPALIVE_PING: 0x09,
    KEEPALIVE_PONG: 0x0a,
    HANDSHAKE_HELLO: 0x10,
    HANDSHAKE_HELLO_REPLY: 0x11,
    HANDSHAKE_AUTH: 0x12,
    HANDSHAKE_AUTH_OK: 0x13,
    ENCRYPTED_MESSAGE: 0x20
};

function encodeFrame(type, payloadBuffer = Buffer.alloc(0)) {
    const len = payloadBuffer.length;
    const frame = Buffer.alloc(1 + 4 + len);
    frame.writeUInt8(type, 0);
    frame.writeUInt32BE(len, 1);
    if (len > 0) payloadBuffer.copy(frame, 5);
    return frame;
}

function sendPeerList(host, port, payloadObj) {
    const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    const frame = encodeFrame(TLV.PEER_LIST, payload);

    const client = net.createConnection({ host, port }, () => {
        client.write(frame);
        client.end();
    });
    client.setTimeout(3000);
    client.on('timeout', () => client.destroy());
    client.on('error', () => {});
}

function startTcpServer(initialPort, handlers = {}) {
    const onPeerList = typeof handlers.onPeerList === 'function' ? handlers.onPeerList : () => {};
    const onHandshakeFrame = typeof handlers.onHandshakeFrame === 'function' ? handlers.onHandshakeFrame : () => {};
    const onListening = typeof handlers.onListening === 'function' ? handlers.onListening : () => {};
    const maxOffset = Number(handlers.maxPortOffset || 20);
    let currentPort = Number(initialPort);

    const server = net.createServer((socket) => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 15000);

        let buffer = Buffer.alloc(0);
        const keepAliveTimer = setInterval(() => {
            if (!socket.destroyed) socket.write(encodeFrame(TLV.KEEPALIVE_PING));
        }, 15000);

        socket.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= 5) {
                const type = buffer.readUInt8(0);
                const length = buffer.readUInt32BE(1);
                if (length > 1024 * 1024) {
                    socket.destroy();
                    return;
                }
                if (buffer.length < 5 + length) break;

                const payload = buffer.slice(5, 5 + length);
                buffer = buffer.slice(5 + length);

                if (type === TLV.KEEPALIVE_PING) {
                    socket.write(encodeFrame(TLV.KEEPALIVE_PONG));
                    continue;
                }
                if (type === TLV.PEER_LIST) {
                    try {
                        const message = JSON.parse(payload.toString('utf8'));
                        onPeerList(message, socket.remoteAddress);
                    } catch (err) {
                        console.error('[TCP] PEER_LIST invalide:', err.message);
                    }
                    continue;
                }
                if (type >= TLV.HANDSHAKE_HELLO && type <= TLV.HANDSHAKE_AUTH_OK) {
                    onHandshakeFrame(type, payload, socket);
                    continue;
                }
                if (type === TLV.ENCRYPTED_MESSAGE) {
                    onHandshakeFrame(type, payload, socket);
                    continue;
                }
            }
        });

        const cleanup = () => clearInterval(keepAliveTimer);
        socket.on('close', cleanup);
        socket.on('end', cleanup);
        socket.on('error', cleanup);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && currentPort < Number(initialPort) + maxOffset) {
            currentPort += 1;
            console.warn(`[TCP] Port occupe, nouvel essai sur ${currentPort}`);
            setTimeout(() => server.listen(currentPort, '0.0.0.0'), 200);
            return;
        }
        console.error('[TCP] Erreur serveur:', err.message);
    });
    server.listen(currentPort, '0.0.0.0', () => {
        onListening(currentPort);
        console.log(`[TCP] Serveur d'ecoute actif sur 0.0.0.0:${currentPort}`);
    });
    return server;
}

module.exports = { startTcpServer, sendPeerList, encodeFrame, TLV };
