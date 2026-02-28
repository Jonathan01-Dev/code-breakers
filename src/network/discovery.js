const dgram = require('dgram');
const { parsePacket } = require('./packet');

const MULTICAST_ADDR = '239.255.42.99';
const MULTICAST_PORT = 6000;

function startDiscovery(onHello, options = {}) {
    const addr = options.multicastAddr || MULTICAST_ADDR;
    const port = Number(options.multicastPort || MULTICAST_PORT);
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('message', (msg, rinfo) => {
        const pkt = parsePacket(msg, options.defaultTcpPort || 7777);
        if (!pkt || pkt.type !== 0x01) return;
        if (typeof onHello === 'function') {
            onHello({
                id: pkt.nodeId,
                ip: rinfo.address,
                tcp_port: pkt.tcpPort,
                version: pkt.version,
                timestamp: pkt.timestamp
            });
        }
    });

    socket.bind(port, () => {
        socket.addMembership(addr);
        socket.setBroadcast(true);
        console.log(`[DISCOVERY] UDP multicast actif sur ${addr}:${port}`);
    });

    return socket;
}

module.exports = { startDiscovery };
