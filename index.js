require('dotenv').config();
const { Server } = require("socket.io");
const http = require("http");

// Import de TES modules (que tu vas créer dans /src/network)
const { startDiscovery } = require("./src/network/discovery");
const { startTcpServer } = require("./src/network/server");

const httpServer = http.createServer();
const io = new Server(httpServer, {
    cors: { origin: "*" } // Permet à l'UI locale d'accéder aux données
});

// 2. Ton carnet d'adresses (Peer Table)
let peers = new Map();

// 3. Lancement des services réseau
const MY_ID = process.env.NODE_NAME || "Node-" + Math.floor(Math.random() * 1000);

// Lancer le radar UDP
startDiscovery(MY_ID, (detectedPeer) => {
    // Cette fonction est appelée dès qu'on voit un "HELLO"
    peers.set(detectedPeer.id, {
        ip: detectedPeer.ip,
        lastSeen: Date.now()
    });
    
    // On prévient l'UI immédiatement
    io.emit("peers-update", Array.from(peers.entries()));
});

// Lancer le serveur de transfert TCP
startTcpServer(process.env.TCP_PORT || 7777);

// 4. Nettoyage automatique des voisins déconnectés
setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, info] of peers) {
        if (now - info.lastSeen > 90000) { // 90 secondes
            peers.delete(id);
            changed = true;
        }
    }
    if (changed) io.emit("peers-update", Array.from(peers.entries()));
}, 10000);

httpServer.listen(3000, () => {
    console.log("✅ Système Archipel démarré");
    console.log("🖥️  Interface de monitoring prête sur le port 3000");
});