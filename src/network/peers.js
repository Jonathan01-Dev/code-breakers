const peers = new Map();

function upsertPeer(id, ip, tcpPort = 7777) {
    if (!id) return;
    peers.set(id, {
        id,
        ip,
        tcp_port: Number(tcpPort),
        lastSeen: Date.now()
    });
}

function getPeers() {
    return [...peers.values()];
}

function cleanupStalePeers(ttlMs = 90_000) {
    const now = Date.now();
    const expired = [];
    for (const [id, info] of peers.entries()) {
        if (now - info.lastSeen > ttlMs) {
            peers.delete(id);
            expired.push(id);
        }
    }
    return expired;
}

module.exports = { upsertPeer, getPeers, cleanupStalePeers };
