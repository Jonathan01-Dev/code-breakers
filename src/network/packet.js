function normalizeNodeId(hexLike) {
    const clean = String(hexLike || '').toLowerCase().replace(/^0x/, '').replace(/[^0-9a-f]/g, '');
    return `0x${clean.padEnd(16, '0').slice(0, 16)}`;
}

function parsePacket(msg, defaultTcpPort = 7777) {
    if (!Buffer.isBuffer(msg) || msg.length < 13) return null;
    if (msg.slice(0, 3).toString() !== 'ARC') return null;

    const version = msg.readUInt8(3);
    const type = msg.readUInt8(4);
    const nodeId = normalizeNodeId(msg.slice(5, 13).toString('hex'));
    const tcpPort = type === 0x01 && msg.length >= 15 ? msg.readUInt16BE(13) : defaultTcpPort;
    const timestamp = type === 0x01 && msg.length >= 23 ? Number(msg.readBigUInt64BE(15)) : null;

    return { version, type, nodeId, tcpPort, timestamp };
}

module.exports = { parsePacket, normalizeNodeId };
