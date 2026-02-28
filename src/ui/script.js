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
    buttons[0].addEventListener('click', () => sendPing(peer.id));
    buttons[1].addEventListener('click', () => connectPeer(peer.id));
    buttons[2].addEventListener('click', () => sendEncrypted(peer.id));

    peerGrid.prepend(node);
}

function upsertPeer(peer) {
    if (!peer?.id) return;

    const isNew = !peers.has(peer.id);
    const merged = { ...(peers.get(peer.id) || {}), ...peer, lastSeen: Date.now() };
    peers.set(peer.id, merged);

    if (isNew) {
        createPeerCard(merged);
        addLog(`HELLO detecte: ${peer.id} @ ${peer.address}:${peer.tcp_port || 7777}`, 'success');
        return;
    }

    const card = document.getElementById(`peer-${peer.id}`);
    if (card) {
        const ip = merged.address || '0.0.0.0';
        card.querySelector('.peer-ip').textContent = `${ip}:${merged.tcp_port || 7777}`;
        card.querySelector('.avatar').textContent = ip.split('.').pop();
    }
}

function removePeer(id, reason) {
    peers.delete(id);
    const card = document.getElementById(`peer-${id}`);
    if (card) card.remove();
    if (reason) addLog(`${reason}: ${id}`, 'info');
}

function sendPing(peerId) {
    const peer = peers.get(peerId);
    if (!peer) return;
    socket.emit('send_ping', {
        id: peer.id,
        address: peer.address,
        tcp_port: peer.tcp_port
    });
    addLog(`PING -> ${peer.address}:${peer.tcp_port || 7777}`, 'info');
}

function connectPeer(peerId) {
    if (!peerId) return;
    socket.emit('connect_peer', { id: peerId });
    addLog(`Tentative de handshake avec ${peerId}`, 'info');
}

function sendEncrypted(peerId) {
    if (!peerId) return;
    const peer = peers.get(peerId);
    if (!peer) return;
    const message = window.prompt(`Message a envoyer a ${peer.address}:`, 'Bonjour depuis Archipel');
    if (!message || !message.trim()) return;
    socket.emit('send_encrypted', { id: peerId, message: message.trim() });
    addLog(`Message chiffre envoi demande vers ${peerId}`, 'info');
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

socket.on('ping_error', (data) => {
    addLog(`Echec PING ${data?.address || ''}: ${data?.error || 'inconnu'}`, 'error');
});

socket.on('session_ready', (data) => {
    if (!data?.id) return;
    addLog(`Tunnel sécurisé établi avec ${data.id}`, 'success');
});

socket.on('message_received', (data) => {
    if (!data?.from || !data?.message) return;
    addLog(`Message chiffré reçu de ${data.from}: ${data.message}`, 'success');
});

socket.on('connect_status', (data) => {
    if (!data?.id) return;
    if (data.ok && data.reused) {
        addLog(`Session deja active avec ${data.id}`, 'success');
        return;
    }
    if (data.ok) {
        addLog(`Connexion etablie avec ${data.id}`, 'success');
        return;
    }
    addLog(`Echec connexion ${data.id}: ${data?.error || 'inconnu'}`, 'error');
});

socket.on('message_status', (data) => {
    if (!data?.id) return;
    if (data.ok) {
        addLog(`Message chiffre envoye a ${data.id}`, 'success');
        return;
    }
    if (data.pending) {
        addLog(`Session en cours avec ${data.id}, message mis en attente`, 'info');
        return;
    }
    addLog(`Echec envoi vers ${data.id}: ${data.error || 'erreur inconnue'}`, 'error');
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
