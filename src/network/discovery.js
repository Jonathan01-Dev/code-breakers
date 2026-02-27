// discovery.js
const dgram = require('dgram');
const { parseHello } = require('./packet');

const MULTICAST_ADDR = '239.255.42.99';
const PORT = 6000;

function startDiscovery(callback) {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('message', (msg, rinfo) => {
        const data = parseHello(msg);
        if (data) {
            // On renvoie les infos au chef d'orchestre (index.js)
            callback({
                id: data.nodeId,
                ip: rinfo.address,
                port: 7777 // Port par défaut pour le futur TCP
            });
        }
    });

    socket.bind(PORT, () => {
        socket.addMembership(MULTICAST_ADDR);
        console.log(`📡 Radar UDP à l'écoute sur ${MULTICAST_ADDR}`);
    });
}

module.exports = { startDiscovery };