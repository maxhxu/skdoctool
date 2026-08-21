"""Password hashing: PBKDF2-HMAC-SHA256, stdlib only (no extra dependency).

Stored format is self-describing (`algo$iterations$salt_hex$hash_hex`) so the
iteration count can be bumped later without invalidating existing hashes.
"""

import hashlib
import hmac
import secrets

_ALGO = "pbkdf2_sha256"
_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations_s, salt, hash_hex = stored.split("$")
    except ValueError:
        return False
    if algo != _ALGO:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations_s))
    return hmac.compare_digest(digest.hex(), hash_hex)
