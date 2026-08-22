import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Where sqlite lives
DB_PATH = os.environ.get("SSHAUTH_DB_PATH", str(BASE_DIR / "sshauth.db"))

# Secret used to derive CSRF tokens from session cookies.
# In production set SSHAUTH_SECRET explicitly and keep it stable across restarts.
SECRET_KEY = os.environ.get("SSHAUTH_SECRET", "dev-secret-change-me")

SESSION_TTL_SECONDS = int(os.environ.get("SSHAUTH_SESSION_TTL", str(30 * 24 * 60 * 60)))  # 30 days

SESSION_COOKIE_NAME = "sshauth_session"

# Set the Secure attribute on session/CSRF cookies (requires HTTPS). Defaults
# on; only disable for local HTTP dev if not testing via localhost (which
# browsers treat as a secure context even over plain http).
COOKIE_SECURE = os.environ.get("SSHAUTH_COOKIE_SECURE", "true").lower() not in ("false", "0")

# SPA CSRF cookie: readable by JS (NOT httponly), value = HMAC(SECRET_KEY,
# <the session cookie's value>). The frontend reads this and echoes it back
# as a header on mutating requests; see app/csrf.py.
SESSION_CSRF_COOKIE_NAME = "sshauth_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"

# Where the React app is served from, for CORS during local dev (Vite on
# its own port). In production the API and the built frontend are expected
# to share an origin, making this moot.
FRONTEND_ORIGIN = os.environ.get("SSHAUTH_FRONTEND_ORIGIN", "http://localhost:5173")

# ---- rate limits: (max_requests, window_seconds) --------------------------
RATE_LIMIT_LOGIN_PER_IP = (10, 60)
RATE_LIMIT_REGISTER_PER_IP = (10, 60)
RATE_LIMIT_FILE_WRITE_PER_USER = (30, 60)   # revisions + file/meta writes
RATE_LIMIT_SUGGESTION_PER_USER = (10, 60)
RATE_LIMIT_FILE_CREATE_PER_USER = (10, 300)
