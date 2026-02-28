const socket = io();

const peerGrid = document.getElementById('peer-grid');
const logViewer = document.getElementById('logs');
const myIdDisplay = document.getElementById('my-id');
const connStatus = document.getElementById('conn-status');

const peers = new Map();

function addLog(text, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-line ${type}`;
    entry.textContent = `> ${new Date().toLocaleTimeString()} ${text}`;
    logViewer.prepend(entry);
}

function setConnected(connected) {
    connStatus.innerHTML = `<span class="dot ${connected ? 'online' : 'offline'}"></span> ${connected ? 'Connecte' : 'Deconnecte'}`;
}

function createPeerCard(peer) {
    const tpl = document.getElementById('peer-card-tpl');
    const node = tpl.content.cloneNode(true);
    const card = node.querySelector('.peer-card');
    const ip = peer.address || '0.0.0.0';

    card.id = `peer-${peer.id}`;
    card.querySelector('.peer-ip').textContent = `${ip}:${peer.tcp_port || 7777}`;
    card.querySelector('.id-hex').textContent = `${peer.id.slice(0, 16)}...`;
    card.querySelector('.avatar').textContent = ip.split('.').pop();

    const buttons = card.querySelectorAll('.actions button');
    buttons[0].addEventListener('click', () => sendPing(peer));
    buttons[1].disabled = true;
    buttons[2].disabled = true;

    peerGrid.prepend(node);
}

function upsertPeer(peer) {
    if (!peer?.id) return;

    const isNew = !peers.has(peer.id);
    peers.set(peer.id, { ...peer, lastSeen: Date.now() });

    if (isNew) {
        createPeerCard(peer);
        addLog(`HELLO detecte: ${peer.id} @ ${peer.address}:${peer.tcp_port || 7777}`, 'success');
    }
}

function removePeer(id, reason) {
    peers.delete(id);
    const card = document.getElementById(`peer-${id}`);
    if (card) card.remove();
    if (reason) addLog(`${reason}: ${id}`, 'info');
}

function sendPing(peer) {
    socket.emit('send_ping', {
        id: peer.id,
        address: peer.address,
        tcp_port: peer.tcp_port
    });
    addLog(`PING -> ${peer.address}:${peer.tcp_port || 7777}`, 'info');
}

socket.on('connect', () => {
    setConnected(true);
    addLog('Socket.IO connecte', 'success');
});

socket.on('disconnect', () => {
    setConnected(false);
    addLog('Socket.IO deconnecte', 'error');
});

socket.on('local_identity', (data) => {
    myIdDisplay.textContent = data?.machine_id || '0x...';
    addLog(`ID local: ${data?.machine_id || 'inconnu'} | TCP:${data?.tcp_port || '?'}`, 'info');
});

socket.on('peer_table', (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((peer) => upsertPeer(peer));
});

socket.on('peer_detected', (peer) => {
    upsertPeer(peer);
});

socket.on('peer_timeout', ({ id }) => {
    if (!id) return;
    removePeer(id, 'Peer expire');
});

socket.on('pong_received', (data) => {
    addLog(`PONG recu de ${data.address}`, 'success');
    const card = document.getElementById(`peer-${data.id}`);
    if (card) {
        card.classList.add('active');
        setTimeout(() => card.classList.remove('active'), 1200);
    }
});

setInterval(() => {
    const now = Date.now();
    for (const [id, peer] of peers.entries()) {
        if (now - peer.lastSeen > 100_000) {
            removePeer(id, 'Peer retire (inactif)');
        }
    }
}, 15_000);

document.getElementById('btn-scan')?.addEventListener('click', () => {
    socket.emit('request_scan');
    addLog('Scan manuel demande', 'info');
});

document.getElementById('btn-broadcast')?.addEventListener('click', () => {
    socket.emit('request_scan');
    addLog('HELLO multicast envoye', 'info');
});

document.getElementById('btn-clear')?.addEventListener('click', () => {
    peerGrid.innerHTML = '';
    peers.clear();
    addLog('Peer table UI videe', 'info');
});
