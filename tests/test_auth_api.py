from app import config
from conftest import DEFAULT_PASSWORD, csrf_headers, new_logged_in_client, register


def test_new_user_registration_flow(client):
    resp = client.post("/api/register", json={"username": "Ab1defg", "password": DEFAULT_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["user"]["username"] == "ab1defg"
    assert config.SESSION_COOKIE_NAME in resp.cookies
    assert config.SESSION_CSRF_COOKIE_NAME in resp.cookies

    me = client.get("/api/me")
    assert me.json()["user"]["username"] == "ab1defg"


def test_duplicate_username_rejected(client):
    register(client, "dup")
    client.cookies.clear()

    resp = client.post("/api/register", json={"username": "dup", "password": DEFAULT_PASSWORD})
    assert resp.status_code == 409


def test_invalid_username_and_short_password_rejected(client):
    resp = client.post("/api/register", json={"username": "a", "password": DEFAULT_PASSWORD})
    assert resp.status_code == 422

    resp = client.post("/api/register", json={"username": "validname", "password": "short"})
    assert resp.status_code == 422


def test_login_with_correct_and_incorrect_password(client):
    register(client, "bob")
    client.cookies.clear()

    resp = client.post("/api/login", json={"username": "bob", "password": "wrong password"})
    assert resp.status_code == 401
    assert client.get("/api/me").json()["user"] is None

    resp = client.post("/api/login", json={"username": "bob", "password": DEFAULT_PASSWORD})
    assert resp.status_code == 200
    assert config.SESSION_COOKIE_NAME in resp.cookies
    assert client.get("/api/me").json()["user"]["username"] == "bob"


def test_login_unknown_username(client):
    resp = client.post("/api/login", json={"username": "nosuchuser", "password": DEFAULT_PASSWORD})
    assert resp.status_code == 401


def test_logout_requires_csrf(client):
    register(client, "car")

    resp = client.post("/api/logout", headers={config.CSRF_HEADER_NAME: "nope"})
    assert resp.status_code == 403
    assert client.get("/api/me").json()["user"] is not None

    headers = csrf_headers(client, config.SESSION_CSRF_COOKIE_NAME)
    resp = client.post("/api/logout", headers=headers)
    assert resp.status_code == 200
    assert client.get("/api/me").json()["user"] is None


def test_http_register_rate_limit(client):
    max_requests, _ = config.RATE_LIMIT_REGISTER_PER_IP

    last_status = None
    for i in range(max_requests + 2):
        resp = client.post(
            "/api/register", json={"username": f"reg{i:02d}", "password": DEFAULT_PASSWORD}
        )
        last_status = resp.status_code
    assert last_status == 429


def test_http_login_rate_limit(client):
    register(client, "ratelim")
    client.cookies.clear()
    max_requests, _ = config.RATE_LIMIT_LOGIN_PER_IP

    last_status = None
    for _ in range(max_requests + 2):
        resp = client.post("/api/login", json={"username": "ratelim", "password": "wrong password"})
        last_status = resp.status_code
    assert last_status == 429


def test_profile_read_and_update():
    c, user = new_logged_in_client("pro")
    headers = csrf_headers(c, config.SESSION_CSRF_COOKIE_NAME)

    resp = c.put("/api/profile", json={"bio_markdown": "# Hi\nI build things."}, headers=headers)
    assert resp.status_code == 200

    resp = c.put(
        "/api/profile/links",
        json={"links": [{"label": "GitHub", "url": "https://github.com/pro"}]},
        headers=headers,
    )
    assert resp.status_code == 200

    public = c.get("/api/users/pro")
    assert public.status_code == 200
    body = public.json()
    assert "I build things" in body["bio_markdown"]
    assert body["social_links"] == [{"label": "GitHub", "url": "https://github.com/pro"}]

    # bad url rejected
    resp = c.put(
        "/api/profile/links",
        json={"links": [{"label": "bad", "url": "javascript:alert(1)"}]},
        headers=headers,
    )
    assert resp.status_code == 422
