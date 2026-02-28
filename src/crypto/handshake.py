import base64
import time
from typing import Dict

from nacl.exceptions import BadSignatureError
from nacl.public import PrivateKey, PublicKey
from nacl.signing import VerifyKey
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import x25519

from .chiffrement import Identity, SessionKeys, encrypt_payload, decrypt_payload


HELLO = 0x10
HELLO_REPLY = 0x11
AUTH = 0x12
AUTH_OK = 0x13
ENCRYPTED_MESSAGE = 0x20


def encode_public_key(pubkey: PublicKey) -> str:
    return base64.b64encode(bytes(pubkey)).decode('ascii')


def create_ephemeral_pair() -> PrivateKey:
    return PrivateKey.generate()


def decode_public_key(blob: str) -> PublicKey:
    raw = base64.b64decode(blob or '')
    if len(raw) == 32:
        return PublicKey(raw)

    # Node.js may send X25519 key as DER/SPKI.
    pub = serialization.load_der_public_key(raw)
    if not isinstance(pub, x25519.X25519PublicKey):
        raise ValueError('Unsupported eph key type')
    raw32 = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    return PublicKey(raw32)


def handshake_signature_material(
    initiator_node_id: str,
    responder_node_id: str,
    initiator_eph: bytes,
    responder_eph: bytes,
    hello_timestamp: int
) -> bytes:
    ts_bytes = int(hello_timestamp or time.time() * 1000).to_bytes(8, byteorder='big', signed=False)
    return b''.join([
        str(initiator_node_id or '').encode('utf-8'),
        str(responder_node_id or '').encode('utf-8'),
        initiator_eph,
        responder_eph,
        ts_bytes
    ])


def auth_signature_material(shared_secret: bytes) -> bytes:
    return b'archipel-auth' + shared_secret


def build_hello(identity: Identity, ephemeral: PrivateKey, tcp_port: int) -> Dict:
    return {
        'node_id': identity.machine_id,
        'permanent_pub': identity.public_key_hex,
        'eph_pub': encode_public_key(ephemeral.public_key),
        'tcp_port': tcp_port,
        'timestamp': int(time.time() * 1000)
    }


def build_hello_reply(identity: Identity, remote_node_id: str, remote_eph: PublicKey, ephemeral: PrivateKey, tcp_port: int, timestamp: int) -> Dict:
    material = handshake_signature_material(
        initiator_node_id=remote_node_id,
        responder_node_id=identity.machine_id,
        initiator_eph=bytes(remote_eph),
        responder_eph=bytes(ephemeral.public_key),
        hello_timestamp=timestamp
    )
    return {
        'node_id': identity.machine_id,
        'permanent_pub': identity.public_key_hex,
        'eph_pub': encode_public_key(ephemeral.public_key),
        'tcp_port': tcp_port,
        'hello_timestamp': timestamp,
        'timestamp': int(time.time() * 1000),
        'signature': base64.b64encode(identity.sign(material)).decode('ascii')
    }


def build_auth(identity: Identity, shared_secret: bytes) -> Dict:
    return {
        'node_id': identity.machine_id,
        'signature': base64.b64encode(identity.sign(auth_signature_material(shared_secret))).decode('ascii'),
        'timestamp': int(time.time() * 1000)
    }


def build_auth_ok(identity: Identity) -> Dict:
    return {
        'node_id': identity.machine_id,
        'timestamp': int(time.time() * 1000)
    }


def verify_signature(signature_b64: str, material: bytes, remote_pub_hex: str) -> bool:
    try:
        verify_key = VerifyKey(bytes.fromhex(remote_pub_hex))
        verify_key.verify(material, base64.b64decode(signature_b64))
        return True
    except (BadSignatureError, ValueError):
        return False


def verify_auth(signature: str, shared_secret: bytes, remote_pub_hex: str) -> bool:
    return verify_signature(signature, auth_signature_material(shared_secret), remote_pub_hex)


def build_encrypted_message(from_id: str, to_id: str, session: SessionKeys, plaintext: bytes) -> Dict:
    encrypted = encrypt_payload(session, plaintext)
    return {
        'from': from_id,
        'to': to_id,
        'payload': encrypted,
        'timestamp': int(time.time() * 1000)
    }


def decrypt_encrypted_message(session: SessionKeys, frame: Dict) -> bytes:
    return decrypt_payload(session, frame['payload'])
