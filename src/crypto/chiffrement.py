import base64
import hmac as stdlib_hmac
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives import hmac as crypto_hmac
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from nacl.encoding import HexEncoder
from nacl.signing import SigningKey, VerifyKey


@dataclass
class Identity:
    machine_id: str
    signing_key: SigningKey
    verify_key: VerifyKey
    public_key_hex: str

    def sign(self, data: bytes) -> bytes:
        return self.signing_key.sign(data).signature

    def verify(self, data: bytes, signature: bytes, pub_hex: Optional[str] = None) -> bool:
        verify_key = VerifyKey(bytes.fromhex(pub_hex or self.public_key_hex))
        try:
            verify_key.verify(data, signature)
            return True
        except Exception:
            return False


@dataclass
class SessionKeys:
    session_key: bytes
    hmac_key: bytes
    shared_secret: bytes


def load_identity(path: Optional[Path] = None) -> Identity:
    src = Path(path or Path('keys_ed25519.json'))
    if src.exists():
        payload = json.loads(src.read_text(encoding='utf-8'))
        private_hex = payload.get('private_key_hex') or ''
        seed = bytes.fromhex(private_hex)
        signing_key = SigningKey(seed)
        verify_key = signing_key.verify_key
        return Identity(
            machine_id=payload.get('machine_id', ''),
            signing_key=signing_key,
            verify_key=verify_key,
            public_key_hex=verify_key.encode(encoder=HexEncoder).decode('ascii')
        )
    raise FileNotFoundError(f'Identity file missing: {src}')


def derive_session_keys(shared_secret: bytes) -> SessionKeys:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=64,
        salt=b'archipel-v1',
        info=b'archipel-session',
    )
    material = hkdf.derive(shared_secret)
    return SessionKeys(
        session_key=material[:32],
        hmac_key=material[32:64],
        shared_secret=shared_secret
    )


def compute_hmac(key: bytes, *chunks: bytes) -> bytes:
    h = crypto_hmac.HMAC(key, hashes.SHA256())
    for segment in chunks:
        h.update(segment)
    return h.finalize()


def encrypt_payload(session: SessionKeys, plaintext: bytes) -> dict:
    aesgcm = AESGCM(session.session_key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    tag = ciphertext[-16:]
    body = ciphertext[:-16]
    hmac_tag = compute_hmac(session.hmac_key, nonce, body, tag)
    return {
        'nonce': base64.b64encode(nonce).decode('ascii'),
        'ciphertext': base64.b64encode(body).decode('ascii'),
        'tag': base64.b64encode(tag).decode('ascii'),
        'hmac': base64.b64encode(hmac_tag).decode('ascii')
    }


def decrypt_payload(session: SessionKeys, payload: dict) -> bytes:
    nonce = base64.b64decode(payload['nonce'])
    ciphertext = base64.b64decode(payload['ciphertext'])
    tag = base64.b64decode(payload['tag'])
    hmac_tag = base64.b64decode(payload['hmac'])
    expected = compute_hmac(session.hmac_key, nonce, ciphertext, tag)
    if not stdlib_hmac.compare_digest(expected, hmac_tag):
        raise ValueError('HMAC mismatch')
    aesgcm = AESGCM(session.session_key)
    return aesgcm.decrypt(nonce, ciphertext + tag, None)
