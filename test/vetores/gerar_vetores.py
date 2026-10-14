"""Gera test/vetores/vetores.json com implementação independente do JS.

Uso:
    python test/vetores/gerar_vetores.py              # (re)escreve vetores.json
    python test/vetores/gerar_vetores.py --verificar  # regera em memória e compara; exit 1 se divergir

Dependências: argon2-cffi, cryptography (veja README.md deste diretório).
Entradas fixas e fictícias; nada aqui é segredo real.
"""

import base64
import hashlib
import json
import sys
import unicodedata
from pathlib import Path

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

ARQ = Path(__file__).with_name("vetores.json")
P = "cofre-emp/v1"


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def fixo(rotulo: str, n: int) -> bytes:
    """Bytes determinísticos para entradas de teste."""
    return hashlib.sha256(f"vetor:{rotulo}".encode()).digest()[:n]


def hkdf(ikm: bytes, info: str, salt: bytes = b"") -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=info.encode()).derive(ikm)


def v1(chave: bytes, iv: bytes, pt: bytes, aad: str) -> str:
    return f"v1.{b64u(iv)}.{b64u(AESGCM(chave).encrypt(iv, pt, aad.encode()))}"


def pkcs8(priv: X25519PrivateKey) -> bytes:
    return priv.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())


def raw_pub(priv: X25519PrivateKey) -> bytes:
    return priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def gerar() -> dict:
    usuario = "3f1c9a2e-5b7d-4e8f-9a01-23456789abcd"
    org = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    colecao = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e"

    # Argon2id + HKDF. A senha tem ligadura "ﬁ" e "é" decomposto para exercitar o NFKC.
    senha = "Cofre de téste ﬁxo 2026"
    kdf = {"tipo": "argon2id", "m": 65536, "t": 3, "p": 1}
    sal = fixo("sal", 16)
    master = hash_secret_raw(
        unicodedata.normalize("NFKC", senha).encode(), sal,
        time_cost=kdf["t"], memory_cost=kdf["m"], parallelism=kdf["p"], hash_len=32, type=Type.ID,
    )
    auth_hash = hkdf(master, f"{P}/auth")
    kek = hkdf(master, f"{P}/kek")

    # userKey sob kek (v1 com AAD de userkey)
    user_key = fixo("userkey", 32)
    iv_uk = fixo("iv-userkey", 12)
    aad_uk = f"{P}|userkey|{usuario}"

    # Recovery Key
    recovery = fixo("recovery", 32)
    recup_kek = hkdf(recovery, f"{P}/recup-kek")
    iv_rk = fixo("iv-recup", 12)
    aad_rk = f"{P}|userkey-recup|{usuario}"
    recovery_fmt = "-".join(
        base64.b32encode(recovery).decode().rstrip("=")[i : i + 4] for i in range(0, 52, 4)
    )

    # x1: envelope da collectionKey para o destinatário
    dest = X25519PrivateKey.from_private_bytes(fixo("dest-priv", 32))
    eph = X25519PrivateKey.from_private_bytes(fixo("eph-priv", 32))
    dest_pub, eph_pub = raw_pub(dest), raw_pub(eph)
    shared = eph.exchange(dest.public_key())
    k_env = hkdf(shared, f"{P}/env-colecao", salt=eph_pub + dest_pub)
    colecao_key = fixo("collectionkey", 32)
    iv_x1 = fixo("iv-x1", 12)
    aad_x1 = f"{P}|env-colecao|{org}|{colecao}|{usuario}|1"
    x1 = f"x1.{b64u(eph_pub)}.{b64u(iv_x1)}.{b64u(AESGCM(k_env).encrypt(iv_x1, colecao_key, aad_x1.encode()))}"

    fp_hex = hashlib.sha256(dest_pub).digest()[:16].hex().upper()

    return {
        "_gerado_por": "test/vetores/gerar_vetores.py (argon2-cffi + cryptography)",
        "ids": {"usuario": usuario, "org": org, "colecao": colecao},
        "kdf": {
            "senha": senha, "kdf": kdf, "sal": b64u(sal),
            "master_key": b64u(master), "auth_hash": b64u(auth_hash),
            # kek não é exportável no JS: confere-se pelo v1 que ela produz
            "kek_v1": {"pt": b64u(user_key), "iv": b64u(iv_uk), "aad": aad_uk, "env": v1(kek, iv_uk, user_key, aad_uk)},
        },
        "v1": {"chave": b64u(user_key), "iv": b64u(fixo("iv-v1", 12)), "pt_texto": "segredo de teste ✓",
               "aad": f"{P}|privkey|{usuario}",
               "env": v1(user_key, fixo("iv-v1", 12), "segredo de teste ✓".encode(), f"{P}|privkey|{usuario}")},
        "recovery": {
            "bytes": b64u(recovery), "formatada": recovery_fmt,
            "recup_auth": b64u(hkdf(recovery, f"{P}/recup-auth")),
            "recup_kek_v1": {"pt": b64u(user_key), "iv": b64u(iv_rk), "aad": aad_rk, "env": v1(recup_kek, iv_rk, user_key, aad_rk)},
        },
        "x1": {
            "dest_priv_pkcs8": b64u(pkcs8(dest)), "dest_pub": b64u(dest_pub),
            "eph_priv_pkcs8": b64u(pkcs8(eph)), "eph_pub": b64u(eph_pub),
            "collection_key": b64u(colecao_key), "iv": b64u(iv_x1), "aad": aad_x1, "env": x1,
        },
        "fingerprint": {"pub": b64u(dest_pub), "fp": " ".join(fp_hex[i : i + 4] for i in range(0, 32, 4))},
    }


def main() -> int:
    texto = json.dumps(gerar(), ensure_ascii=False, indent=2) + "\n"
    if "--verificar" in sys.argv:
        if ARQ.read_text(encoding="utf-8") != texto:
            print("vetores.json DIVERGE do gerado pelo Python", file=sys.stderr)
            return 1
        print("vetores.json confere")
        return 0
    ARQ.write_text(texto, encoding="utf-8", newline="\n")
    print(f"escrito {ARQ}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
