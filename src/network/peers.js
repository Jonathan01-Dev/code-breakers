const peers = new Map();

function updatePeerTable(id, ip) {
    peers.set(id, {
        ip: ip,
        lastSeen: Date.now()
    });
    console.log(`✨ Voisin actif : ${id} @ ${ip}`);
}

// Nettoyage des machines inactives depuis 90s)
setInterval(() => {
    const now = Date.now();
    for (const [id, info] of peers) {
        if (now - info.lastSeen > 90000) {
            peers.delete(id);
            console.log(`💀 Voisin déconnecté : ${id}`);
        }
    }
}, 10000);