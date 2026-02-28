import json
import os
import socket
import struct
import threading
import time
import hashlib
from typing import Dict

MCAST_GRP = '239.255.42.99'
MCAST_PORT = 6000
TCP_PORT = int(os.getenv('TCP_PORT', '7777'))
KEYS_FILE = 'keys_ed25519.json'
PEERS_FILE = 'peers_py.json'
HELLO_INTERVAL = 30
PEER_TIMEOUT = 90

TYPE_HELLO = 0x01
TYPE_PING = 0x02
TYPE_PONG = 0x03

TLV_PEER_LIST = 0x02
TLV_KEEPALIVE_PING = 0x09
TLV_KEEPALIVE_PONG = 0x0A

peer_table: Dict[str, dict] = {}
peer_lock = threading.Lock()


def _normalize_node_id(value: str) -> str:
    if not value:
        return '0x0000000000000000'
    clean = value.lower().replace('0x', '')
    clean = ''.join(c for c in clean if c in '0123456789abcdef')
    clean = (clean + ('0' * 16))[:16]
    return '0x' + clean


def load_node_id() -> str:
    node_id_override = os.getenv('NODE_ID')
    if node_id_override:
        return _normalize_node_id(node_id_override)

    base_node_id = '0x_TEST000000000000'
    if os.path.exists(KEYS_FILE):
        try:
            with open(KEYS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                base_node_id = _normalize_node_id(data.get('machine_id', '0x_ERR'))
        except (OSError, json.JSONDecodeError):
            base_node_id = '0x_ERR000000000000'

    # Avoid node-id collisions when multiple local instances share one keys file.
    raw = f"{_normalize_node_id(base_node_id)}:{TCP_PORT}".encode('utf-8')
    return '0x' + hashlib.sha256(raw).hexdigest()[:16]


def _save_peers() -> None:
    with peer_lock:
        payload = list(peer_table.values())
    with open(PEERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)


def _print_peer_table() -> None:
    with peer_lock:
        peers = sorted(peer_table.values(), key=lambda p: p['node_id'])
    print(f"[PEER_TABLE] {len(peers)} peer(s)")
    for p in peers:
        print(f" - {p['node_id']} @ {p['ip']}:{p['tcp_port']}")


def _upsert_peer(node_id: str, ip: str, tcp_port: int) -> None:
    if not node_id:
        return
    now = int(time.time() * 1000)
    with peer_lock:
        prev = peer_table.get(node_id, {})
        peer_table[node_id] = {
            'node_id': node_id,
            'ip': ip or prev.get('ip', '0.0.0.0'),
            'tcp_port': int(tcp_port or prev.get('tcp_port', TCP_PORT)),
            'last_seen': now,
            'shared_files': prev.get('shared_files', []),
            'reputation': prev.get('reputation', 1.0),
        }
    _save_peers()
    _print_peer_table()


def _cleanup_stale_peers() -> None:
    while True:
        time.sleep(10)
        now = int(time.time() * 1000)
        changed = False
        with peer_lock:
            for node_id in list(peer_table.keys()):
                if now - int(peer_table[node_id].get('last_seen', 0)) > (PEER_TIMEOUT * 1000):
                    info = peer_table.pop(node_id)
                    print(f"[PEER] Expire: {node_id} ({info.get('ip', '?')})")
                    changed = True
        if changed:
            _save_peers()


def _build_packet(msg_type: int, node_id: str, tcp_port: int) -> bytes:
    node_hex = _normalize_node_id(node_id).replace('0x', '')
    node_bytes = bytes.fromhex(node_hex)

    if msg_type == TYPE_HELLO:
        timestamp = int(time.time() * 1000)
        return b'ARC' + bytes([0x01, TYPE_HELLO]) + node_bytes + struct.pack('>H', int(tcp_port)) + struct.pack('>Q', timestamp)
    return b'ARC' + bytes([0x01, msg_type]) + node_bytes


def _parse_packet(data: bytes):
    if len(data) < 13 or data[:3] != b'ARC':
        return None

    version = data[3]
    msg_type = data[4]
    sender_id = '0x' + data[5:13].hex()
    sender_tcp_port = TCP_PORT

    if msg_type == TYPE_HELLO and len(data) >= 15:
        sender_tcp_port = int.from_bytes(data[13:15], byteorder='big', signed=False)

    return {
        'version': version,
        'type': msg_type,
        'sender_id': _normalize_node_id(sender_id),
        'sender_tcp_port': sender_tcp_port,
    }


def _encode_tlv(msg_type: int, payload: bytes = b'') -> bytes:
    return bytes([msg_type]) + struct.pack('>I', len(payload)) + payload


def _send_peer_list_unicast(target_ip: str, target_port: int, my_id: str) -> None:
    with peer_lock:
        peers = list(peer_table.values())

    payload = {
        'from': my_id,
        'tcp_port': TCP_PORT,
        'peers': [
            {
                'node_id': p['node_id'],
                'ip': p['ip'],
                'tcp_port': p['tcp_port'],
                'last_seen': p['last_seen'],
            }
            for p in peers
        ],
    }

    frame = _encode_tlv(TLV_PEER_LIST, json.dumps(payload).encode('utf-8'))
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3)
    try:
        s.connect((target_ip, int(target_port)))
        s.sendall(frame)
    except OSError:
        pass
    finally:
        s.close()


def diffuser_presence():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 0)

    node_id = load_node_id()
    try:
        while True:
            payload = _build_packet(TYPE_HELLO, node_id, TCP_PORT)
            try:
                sock.sendto(payload, (MCAST_GRP, MCAST_PORT))
                print(f"[HELLO] Presence diffusee: {node_id} tcp={TCP_PORT}")
            except OSError as e:
                print(f"Erreur envoi multicast: {e}")
            time.sleep(HELLO_INTERVAL)
    except KeyboardInterrupt:
        print('Arret emetteur multicast')
    finally:
        sock.close()


def ecouter_multicast():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 0)
    sock.bind(('0.0.0.0', MCAST_PORT))

    mreq = socket.inet_aton(MCAST_GRP) + socket.inet_aton('0.0.0.0')
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
    print(f"[RADAR] Ecoute multicast sur {MCAST_GRP}:{MCAST_PORT}")

    node_id = load_node_id()

    try:
        while True:
            data, addr = sock.recvfrom(2048)
            pkt = _parse_packet(data)
            if not pkt:
                continue
            if pkt['sender_id'] == node_id:
                continue

            sender_id = pkt['sender_id']
            sender_tcp_port = pkt['sender_tcp_port']

            if pkt['type'] == TYPE_HELLO:
                _upsert_peer(sender_id, addr[0], sender_tcp_port)
                print(f"[HELLO RX] {sender_id} @ {addr[0]}:{sender_tcp_port}")
                _send_peer_list_unicast(addr[0], sender_tcp_port, node_id)
            elif pkt['type'] == TYPE_PING:
                print(f"[PING RX] {sender_id} @ {addr[0]}")
                pong = _build_packet(TYPE_PONG, node_id, TCP_PORT)
                sock.sendto(pong, (addr[0], MCAST_PORT))
            elif pkt['type'] == TYPE_PONG:
                print(f"[PONG RX] {sender_id} @ {addr[0]}")
    except KeyboardInterrupt:
        print("Arret ecouteur multicast")
    finally:
        sock.close()


def tcp_server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('0.0.0.0', TCP_PORT))
    srv.listen(10)
    print(f"[TCP] Serveur en ecoute sur 0.0.0.0:{TCP_PORT}")

    def handle_client(conn: socket.socket, remote: str):
        conn.settimeout(None)
        buffer = b''
        stop_event = threading.Event()

        def keepalive_sender() -> None:
            while not stop_event.wait(15):
                try:
                    conn.sendall(_encode_tlv(TLV_KEEPALIVE_PING, b''))
                except OSError:
                    stop_event.set()
                    return

        threading.Thread(target=keepalive_sender, daemon=True).start()
        try:
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                buffer += chunk

                while len(buffer) >= 5:
                    msg_type = buffer[0]
                    length = int.from_bytes(buffer[1:5], 'big', signed=False)
                    if length > 1024 * 1024:
                        return
                    if len(buffer) < 5 + length:
                        break

                    payload = buffer[5:5 + length]
                    buffer = buffer[5 + length:]

                    if msg_type == TLV_KEEPALIVE_PING:
                        conn.sendall(_encode_tlv(TLV_KEEPALIVE_PONG, b''))
                    elif msg_type == TLV_KEEPALIVE_PONG:
                        continue
                    elif msg_type == TLV_PEER_LIST:
                        try:
                            msg = json.loads(payload.decode('utf-8'))
                            for p in msg.get('peers', []):
                                nid = _normalize_node_id(p.get('node_id', ''))
                                if nid.startswith('0x'):
                                    _upsert_peer(nid, p.get('ip', remote), int(p.get('tcp_port', TCP_PORT)))
                            print(f"[PEER_LIST RX] de {remote} -> {len(msg.get('peers', []))} peers")
                        except (ValueError, TypeError):
                            pass
        finally:
            stop_event.set()
            conn.close()

    while True:
        conn, addr = srv.accept()
        threading.Thread(target=handle_client, args=(conn, addr[0]), daemon=True).start()


if __name__ == '__main__':
    print('Noeud ARCHIPEL Sprint 1 (Python)')
    threading.Thread(target=diffuser_presence, daemon=True).start()
    threading.Thread(target=ecouter_multicast, daemon=True).start()
    threading.Thread(target=tcp_server, daemon=True).start()
    threading.Thread(target=_cleanup_stale_peers, daemon=True).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print('\nArret du noeud')
