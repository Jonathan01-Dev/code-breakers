#!/usr/bin/env python3
"""
Mission 1: generate Ed25519 keypair + unique machine id.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import socket
import uuid
from pathlib import Path

from nacl.encoding import Base64Encoder, HexEncoder
from nacl.signing import SigningKey


def machine_unique_id() -> str:
    """Build a stable machine identifier as 0x... from hostname + MAC."""
    hostname = socket.gethostname().strip().lower()
    mac_int = uuid.getnode()
    mac_hex = f"{mac_int:012x}"
    raw = f"{hostname}:{mac_hex}".encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return "0x" + digest[:16]


def build_output(signing_key: SigningKey) -> dict[str, str]:
    verify_key = signing_key.verify_key
    return {
        "machine_id": machine_unique_id(),
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "private_key_hex": signing_key.encode(encoder=HexEncoder).decode("ascii"),
        "public_key_hex": verify_key.encode(encoder=HexEncoder).decode("ascii"),
        "private_key_b64": signing_key.encode(encoder=Base64Encoder).decode("ascii"),
        "public_key_b64": verify_key.encode(encoder=Base64Encoder).decode("ascii"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Mission 1 - Ed25519 key generation")
    parser.add_argument("--out", type=Path, default=Path("keys_ed25519.json"), help="Output JSON path")
    args = parser.parse_args()

    signing_key = SigningKey.generate()
    payload = build_output(signing_key)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Keys generated: {args.out}")
    print(f"Machine ID: {payload['machine_id']}")
    print(f"Public key (Ed25519 hex): {payload['public_key_hex']}")


if __name__ == "__main__":
    main()
