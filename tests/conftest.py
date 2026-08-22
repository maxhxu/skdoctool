import os

import pytest
from starlette.testclient import TestClient

os.environ.setdefault("SSHAUTH_DB_PATH", "/tmp/sshauth_test.db")
# TestClient talks over plain http://testserver, so Secure cookies would
# never round-trip back to the client.
os.environ.setdefault("SSHAUTH_COOKIE_SECURE", "false")

if os.path.exists(os.environ["SSHAUTH_DB_PATH"]):
    os.remove(os.environ["SSHAUTH_DB_PATH"])

from app import config, db, ratelimit  # noqa: E402
from app.main import app  # noqa: E402

DEFAULT_PASSWORD = "correct horse battery staple"

db.init_db()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    for limiter in vars(ratelimit).values():
        if isinstance(limiter, ratelimit.RateLimiter):
            limiter.reset()
    yield


@pytest.fixture
def client():
    return TestClient(app)


def csrf_headers(client: TestClient, cookie_name: str) -> dict:
    token = client.cookies.get(cookie_name)
    assert token, f"{cookie_name} cookie not set on client"
    return {config.CSRF_HEADER_NAME: token}


def register(client: TestClient, username: str, password: str = DEFAULT_PASSWORD) -> dict:
    """Register a new account via the JSON API. Leaves `client` logged in."""
    resp = client.post("/api/register", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["user"]


def new_logged_in_client(username: str, password: str = DEFAULT_PASSWORD):
    c = TestClient(app)
    user = register(c, username, password)
    return c, user
