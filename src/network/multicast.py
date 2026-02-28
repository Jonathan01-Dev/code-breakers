import errno
import json
import hashlib
import os
import socket
import struct
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from crypto.chiffrement import SessionKeys, derive_session_keys, load_identity
from crypto.handshake import (
    AUTH,
    AUTH_OK,
    ENCRYPTED_MESSAGE,
    HELLO,
    HELLO_REPLY,
    build_auth,
    build_auth_ok,
    build_hello,
    build_hello_reply,
    create_ephemeral_pair,
    decode_public_key,
    decrypt_encrypted_message,
    handshake_signature_material,
    verify_auth,
    verify_signature,
)

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

DEFAULT_TCP_PORT = int(os.getenv('TCP_PORT', '7777'))
TCP_PORT = DEFAULT_TCP_PORT

def set_tcp_port(port: int) -> None:
    global TCP_PORT
    TCP_PORT = port

TLV_PEER_LIST = 0x02
TLV_KEEPALIVE_PING = 0x09
TLV_KEEPALIVE_PONG = 0x0A

identity = load_identity()
sessions: Dict[str, SessionKeys] = {}
handshake_contexts: Dict[str, dict] = {}

peer_table: Dict[str, dict] = {}
peer_lock = threading.Lock()


def _normalize_node_id(value: str) -> str:
    if not value:
        return '0x0000000000000000'
    clean = value.lower().replace('0x', '')
    clean = ''.join(c for c in clean if c in '0123456789abcdef')
    clean = (clean + ('0' * 16))[:16]
    return '0x' + clean


def current_tcp_port() -> int:
    return TCP_PORT


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

    # Avoid node-id collisions when multiple machines share one keys file.
    host_tag = (os.getenv('NODE_INSTANCE') or os.getenv('COMPUTERNAME') or socket.gethostname() or '').lower()
    raw = f"{_normalize_node_id(base_node_id)}:{TCP_PORT}:{host_tag}".encode('utf-8')
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
    _start_handshake(node_id, peer_table[node_id]['ip'], peer_table[node_id]['tcp_port'])


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


def _build_packet(msg_type: int, node_id: str, tcp_port: Optional[int] = None) -> bytes:
    node_hex = _normalize_node_id(node_id).replace('0x', '')
    node_bytes = bytes.fromhex(node_hex)

    port = int(tcp_port or TCP_PORT)
    if msg_type == TYPE_HELLO:
        timestamp = int(time.time() * 1000)
        return b'ARC' + bytes([0x01, TYPE_HELLO]) + node_bytes + struct.pack('>H', port) + struct.pack('>Q', timestamp)
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


def _encode_handshake_frame(msg_type: int, payload: dict) -> bytes:
    content = json.dumps(payload).encode('utf-8')
    return _encode_tlv(msg_type, content)


def _recv_frame(sock: socket.socket) -> tuple[int, bytes]:
    header = sock.recv(5)
    if len(header) < 5:
        raise ConnectionError("Trame incomplète")
    msg_type = header[0]
    length = int.from_bytes(header[1:5], byteorder='big')
    data = bytearray()
    while len(data) < length:
        chunk = sock.recv(length - len(data))
        if not chunk:
            raise ConnectionError("Fin de stream")
        data.extend(chunk)
    return msg_type, bytes(data)


def _send_peer_list_unicast(target_ip: str, target_port: int, my_id: str) -> None:
    with peer_lock:
        peers = list(peer_table.values())

    payload = {
        'from': my_id,
        'tcp_port': current_tcp_port(),
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


def _cleanup_handshake(node_id: str) -> None:
    context = handshake_contexts.pop(node_id, None)
    if context and context.get('socket'):
        try:
            context['socket'].close()
        except OSError:
            pass


def _start_handshake(node_id: str, ip: str, tcp_port: int) -> None:
    if not node_id or node_id in sessions or node_id in handshake_contexts:
        return
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((ip, tcp_port))
    except OSError as exc:
        print(f"[HANDSHAKE] Impossible de joindre {node_id}@{ip}:{tcp_port} ({exc})")
        return

    ephemeral = create_ephemeral_pair()
    payload = build_hello(identity, ephemeral, current_tcp_port())
    try:
        sock.sendall(_encode_handshake_frame(HELLO, payload))
        handshake_contexts[node_id] = {
            'node_id': node_id,
            'socket': sock,
            'ephemeral': ephemeral,
            'state': 'hello_sent',
            'remote_pub': payload['permanent_pub'],
            'remote_node': payload['node_id']
        }
        threading.Thread(target=_run_initiator_handshake, args=(node_id, ip, tcp_port), daemon=True).start()
    except OSError:
        sock.close()
        print(f"[HANDSHAKE] Envoi HELLO vers {node_id} échoué")


def _run_initiator_handshake(node_id: str, ip: str, tcp_port: int) -> None:
    context = handshake_contexts.get(node_id)
    if not context:
        return
    sock = context['socket']
    try:
        while True:
            msg_type, payload_bytes = _recv_frame(sock)
            payload = json.loads(payload_bytes.decode('utf-8'))

            if msg_type == HELLO_REPLY:
                _handle_hello_reply(node_id, sock, payload, context)
            elif msg_type == AUTH_OK:
                _handle_auth_ok(node_id, payload, context)
                break
            elif msg_type == ENCRYPTED_MESSAGE and context.get('session'):
                _handle_encrypted_payload(payload)
    except (ConnectionError, OSError, socket.timeout):
        pass
    finally:
        _cleanup_handshake(node_id)


def _handle_hello_reply(node_id: str, sock: socket.socket, payload: dict, context: dict) -> None:
    try:
        remote_eph = decode_public_key(payload.get('eph_pub', ''))
    except Exception as err:
        print(f"[HANDSHAKE] HELLO_REPLY eph invalide pour {node_id}: {err}")
        return
    local_bytes = bytes(context['ephemeral'].public_key)
    hello_ts = payload.get('hello_timestamp', payload.get('timestamp', int(time.time() * 1000)))
    material = handshake_signature_material(
        initiator_node_id=context.get('remote_node', identity.machine_id),
        responder_node_id=payload.get('node_id', ''),
        initiator_eph=local_bytes,
        responder_eph=bytes(remote_eph),
        hello_timestamp=hello_ts
    )
    if not verify_signature(payload.get('signature', ''), material, payload.get('permanent_pub', '')):
        print(f"[HANDSHAKE] Signature HELLO_REPLY invalide pour {node_id}")
        return
    shared_secret = context['ephemeral'].exchange(remote_eph)
    session = derive_session_keys(shared_secret)
    sessions[payload.get('node_id', node_id)] = session
    context['session'] = session
    sock.sendall(_encode_handshake_frame(AUTH, build_auth(identity, shared_secret)))


def _handle_auth_ok(node_id: str, payload: dict, context: dict) -> None:
    print(f"[HANDSHAKE] Session établie avec {node_id}")


def _handle_encrypted_payload(frame: dict) -> None:
    session = sessions.get(frame.get('from'))
    if not session:
        return
    try:
        plaintext = decrypt_encrypted_message(session, frame)
        print(f"[MSG] Reçu {plaintext.decode('utf-8')}")
    except Exception as err:
        print(f"[MSG] Déchiffrement échoué: {err}")


def _handle_server_hello(conn: socket.socket, payload: Dict, ctx: dict) -> None:
    remote_node = payload.get('node_id')
    remote_pub = payload.get('permanent_pub')
    try:
        remote_eph = decode_public_key(payload.get('eph_pub', ''))
    except Exception as err:
        print(f"[HANDSHAKE] HELLO entrant eph invalide ({remote_node}): {err}")
        return
    ctx['remote_node'] = remote_node
    ctx['remote_pub'] = remote_pub
    ctx['remote_eph'] = remote_eph
    timestamp = payload.get('timestamp', int(time.time() * 1000))
    reply = build_hello_reply(identity, remote_node, remote_eph, ctx['ephemeral'], current_tcp_port(), timestamp)
    conn.sendall(_encode_handshake_frame(HELLO_REPLY, reply))


def _handle_server_auth(conn: socket.socket, payload: Dict, ctx: dict) -> None:
    if not ctx.get('remote_node') or not ctx.get('remote_pub') or not ctx.get('remote_eph'):
        return
    shared_secret = ctx['ephemeral'].exchange(ctx['remote_eph'])
    if not verify_auth(payload.get('signature', ''), shared_secret, ctx['remote_pub']):
        print(f"[HANDSHAKE] Auth signature invalide de {ctx['remote_node']}")
        return
    session = derive_session_keys(shared_secret)
    sessions[ctx['remote_node']] = session
    conn.sendall(_encode_handshake_frame(AUTH_OK, build_auth_ok(identity)))
    print(f"[HANDSHAKE] Session serveur prête avec {ctx['remote_node']}")


def _handle_server_encrypted(payload: Dict, ctx: dict) -> None:
    node_id = payload.get('from')
    session = sessions.get(node_id)
    if not session:
        return
    try:
        plaintext = decrypt_encrypted_message(session, payload)
        print(f"[MSG] Serveur: {node_id} -> {plaintext.decode('utf-8')}")
    except Exception as err:
        print(f"[MSG] Serveur déchiffrement échoué: {err}")


def diffuser_presence():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 0)

    node_id = load_node_id()
    try:
        while True:
            payload = _build_packet(TYPE_HELLO, node_id, current_tcp_port())
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
    selected_port = DEFAULT_TCP_PORT
    try:
        srv.bind(('0.0.0.0', DEFAULT_TCP_PORT))
    except PermissionError as exc:
        print(f"[TCP] Port {DEFAULT_TCP_PORT} interdit ({exc}); fallback vers un port aléatoire")
        srv.bind(('0.0.0.0', 0))
        selected_port = srv.getsockname()[1]
    except OSError as exc:
        if exc.errno in (errno.EADDRINUSE, errno.EACCES):
            print(f"[TCP] Port {DEFAULT_TCP_PORT} indisponible ({exc}); fallback vers un port aléatoire")
            srv.bind(('0.0.0.0', 0))
            selected_port = srv.getsockname()[1]
        else:
            raise
    set_tcp_port(selected_port)
    srv.listen(10)
    print(f"[TCP] Serveur en ecoute sur 0.0.0.0:{TCP_PORT}")

    def handle_client(conn: socket.socket, remote: str):
        conn.settimeout(None)
        buffer = b''
        stop_event = threading.Event()

        handshake_ctx = {
            'ephemeral': create_ephemeral_pair(),
            'remote_node': None,
            'remote_pub': None,
            'remote_eph': None
        }

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
                    elif msg_type in {HELLO, AUTH, ENCRYPTED_MESSAGE}:
                        try:
                            frame = json.loads(payload.decode('utf-8'))
                        except (ValueError, UnicodeDecodeError):
                            continue
                        if msg_type == HELLO:
                            _handle_server_hello(conn, frame, handshake_ctx)
                        elif msg_type == AUTH:
                            _handle_server_auth(conn, frame, handshake_ctx)
                        elif msg_type == ENCRYPTED_MESSAGE:
                            _handle_server_encrypted(frame, handshake_ctx)
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
