// server.js
const net = require('net');

function startTcpServer(port) {
    const server = net.createServer((socket) => {
        console.log(`🔗 Connexion TCP entrante de ${socket.remoteAddress}`);
        
        socket.on('data', (data) => {
            console.log("📦 Données TCP reçues :", data.toString());
        });
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Serveur TCP prêt sur le port ${port}`);
    });
}

module.exports = { startTcpServer };