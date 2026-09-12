from app import config
from conftest import csrf_headers, new_logged_in_client


def create_file(c, headers, **overrides):
    payload = {
        "title": "My Doc",
        "kind": "doc",
        "visibility": "private",
        "content": "# Hello\n\nWorld.\n",
    }
    payload.update(overrides)
    resp = c.post("/api/files", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_private_file_visibility():
    owner, _ = new_logged_in_client("own")
    other, _ = new_logged_in_client("oth")
    headers = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers, visibility="private")

    # owner can read
    resp = owner.get(f"/api/files/{f['id']}")
    assert resp.status_code == 200
    assert resp.json()["can_edit"] is True

    # a stranger cannot
    resp = other.get(f"/api/files/{f['id']}")
    assert resp.status_code == 404

    # logged-out visitor cannot either
    from starlette.testclient import TestClient
    from app.main import app
    anon = TestClient(app)
    resp = anon.get(f"/api/files/{f['id']}")
    assert resp.status_code == 404


def test_public_file_visible_to_everyone():
    owner, _ = new_logged_in_client("pub")
    other, _ = new_logged_in_client("vwr")
    headers = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers, visibility="public")

    resp = other.get(f"/api/files/{f['id']}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["can_edit"] is False  # viewer, not editor


def test_revision_editing_and_optimistic_concurrency():
    owner, _ = new_logged_in_client("ed1")
    headers = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    f = create_file(owner, headers)

    state = owner.get(f"/api/files/{f['id']}").json()
    head = state["file"]["head_revision_id"]

    resp = owner.post(
        f"/api/files/{f['id']}/revisions",
        json={"content": "# Hello\n\nEdited world.\n", "message": "edit", "parent_revision_id": head},
        headers=headers,
    )
    assert resp.status_code == 200
    new_head = resp.json()["id"]
    assert new_head != head

    # stale parent_revision_id is rejected (someone else moved head)
    resp = owner.post(
        f"/api/files/{f['id']}/revisions",
        json={"content": "conflicting", "message": "stale", "parent_revision_id": head},
        headers=headers,
    )
    assert resp.status_code == 409

    revs = owner.get(f"/api/files/{f['id']}/revisions").json()["revisions"]
    assert len(revs) == 2

    diff = owner.get(
        f"/api/files/{f['id']}/diff", params={"from_revision": head, "to_revision": new_head}
    ).json()["diff"]
    kinds = {row["type"] for row in diff}
    assert "add" in kinds and "remove" in kinds


def test_non_editor_cannot_write_revision():
    owner, _ = new_logged_in_client("wo1")
    stranger, _ = new_logged_in_client("st1")
    headers_owner = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    headers_stranger = csrf_headers(stranger, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers_owner, visibility="public")
    head = owner.get(f"/api/files/{f['id']}").json()["file"]["head_revision_id"]

    resp = stranger.post(
        f"/api/files/{f['id']}/revisions",
        json={"content": "sneaky edit", "message": "x", "parent_revision_id": head},
        headers=headers_stranger,
    )
    assert resp.status_code == 403


def test_collaborator_invite_grants_edit():
    owner, _ = new_logged_in_client("ow2")
    friend, _ = new_logged_in_client("fr2")
    headers_owner = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    headers_friend = csrf_headers(friend, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers_owner, visibility="private")

    # not yet invited -> can't even view
    assert friend.get(f"/api/files/{f['id']}").status_code == 404

    resp = owner.post(
        f"/api/files/{f['id']}/collaborators", json={"username": "fr2"}, headers=headers_owner
    )
    assert resp.status_code == 200

    state = friend.get(f"/api/files/{f['id']}")
    assert state.status_code == 200
    assert state.json()["can_edit"] is True

    head = state.json()["file"]["head_revision_id"]
    resp = friend.post(
        f"/api/files/{f['id']}/revisions",
        json={"content": "friend edit", "message": "x", "parent_revision_id": head},
        headers=headers_friend,
    )
    assert resp.status_code == 200

    # only the owner can manage collaborators
    resp = friend.post(
        f"/api/files/{f['id']}/collaborators", json={"username": "ow2"}, headers=headers_friend
    )
    assert resp.status_code == 404  # friend isn't the owner, file "not found" from their POV of that action


def test_suggestion_lifecycle_accept():
    owner, _ = new_logged_in_client("ow3")
    contributor, _ = new_logged_in_client("co3")
    headers_owner = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    headers_contrib = csrf_headers(contributor, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers_owner, visibility="public", content="line one\nline two\n")
    head = owner.get(f"/api/files/{f['id']}").json()["file"]["head_revision_id"]

    # a non-editor viewer proposes a change instead of writing directly
    resp = contributor.post(
        f"/api/files/{f['id']}/suggestions",
        json={"content": "line one\nline two changed\nline three\n", "message": "improve", "base_revision_id": head},
        headers=headers_contrib,
    )
    assert resp.status_code == 200
    suggestion = resp.json()

    # contributor cannot write a revision directly
    resp = contributor.post(
        f"/api/files/{f['id']}/revisions",
        json={"content": "direct edit", "message": "x", "parent_revision_id": head},
        headers=headers_contrib,
    )
    assert resp.status_code == 403

    # owner sees it and can diff it against the base
    listed = owner.get(f"/api/files/{f['id']}/suggestions").json()["suggestions"]
    assert len(listed) == 1

    diff = owner.get(f"/api/files/{f['id']}/suggestions/{suggestion['id']}/diff").json()["diff"]
    assert any(row["type"] == "add" for row in diff)

    # accepting creates a new revision and closes the suggestion
    resp = owner.post(f"/api/files/{f['id']}/suggestions/{suggestion['id']}/accept", headers=headers_owner)
    assert resp.status_code == 200
    new_head = resp.json()["id"]

    file_state = owner.get(f"/api/files/{f['id']}")
    assert file_state.json()["content"] == "line one\nline two changed\nline three\n"
    assert file_state.json()["file"]["head_revision_id"] == new_head

    # can't accept/reject twice
    resp = owner.post(f"/api/files/{f['id']}/suggestions/{suggestion['id']}/accept", headers=headers_owner)
    assert resp.status_code == 409


def test_accept_suggestion_conflict_returns_409_on_stale_base():
    owner, _ = new_logged_in_client("ow5")
    contributor, _ = new_logged_in_client("co5")
    headers_owner = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    headers_contrib = csrf_headers(contributor, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers_owner, visibility="public", content="line one\nline two\n")
    head = owner.get(f"/api/files/{f['id']}").json()["file"]["head_revision_id"]

    resp = contributor.post(
        f"/api/files/{f['id']}/suggestions",
        json={"content": "line one\nline two changed\n", "message": "improve", "base_revision_id": head},
        headers=headers_contrib,
    )
    assert resp.status_code == 200
    suggestion = resp.json()

    # owner moves the head independently before the suggestion is reviewed
    resp = owner.post(
        f"/api/files/{f['id']}/revisions",
        json={
            "content": "line one\nline two\nline three from owner\n",
            "message": "owner edit",
            "parent_revision_id": head,
        },
        headers=headers_owner,
    )
    assert resp.status_code == 200
    new_head = resp.json()["id"]
    assert new_head != head

    # the suggestion is now stale relative to head -> accept is rejected
    resp = owner.post(f"/api/files/{f['id']}/suggestions/{suggestion['id']}/accept", headers=headers_owner)
    assert resp.status_code == 409

    # the suggestion itself is untouched (still pending, not silently resolved)
    listed = owner.get(f"/api/files/{f['id']}/suggestions").json()["suggestions"]
    assert next(s for s in listed if s["id"] == suggestion["id"])["status"] == "pending"

    # and the owner's newer content was not clobbered
    file_state = owner.get(f"/api/files/{f['id']}").json()
    assert file_state["file"]["head_revision_id"] == new_head
    assert file_state["content"] == "line one\nline two\nline three from owner\n"


def test_suggestion_reject():
    owner, _ = new_logged_in_client("ow4")
    contributor, _ = new_logged_in_client("co4")
    headers_owner = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)
    headers_contrib = csrf_headers(contributor, config.SESSION_CSRF_COOKIE_NAME)

    f = create_file(owner, headers_owner, visibility="public")
    head = owner.get(f"/api/files/{f['id']}").json()["file"]["head_revision_id"]

    resp = contributor.post(
        f"/api/files/{f['id']}/suggestions",
        json={"content": "nah", "message": "x", "base_revision_id": head},
        headers=headers_contrib,
    )
    suggestion_id = resp.json()["id"]

    # a random third party can't reject it
    stranger, _ = new_logged_in_client("st2")
    headers_stranger = csrf_headers(stranger, config.SESSION_CSRF_COOKIE_NAME)
    resp = stranger.post(f"/api/files/{f['id']}/suggestions/{suggestion_id}/reject", headers=headers_stranger)
    assert resp.status_code == 403

    resp = owner.post(f"/api/files/{f['id']}/suggestions/{suggestion_id}/reject", headers=headers_owner)
    assert resp.status_code == 200

    file_state = owner.get(f"/api/files/{f['id']}")
    assert file_state.json()["content"] != "nah"  # untouched


def test_file_kind_and_visibility_validation():
    owner, _ = new_logged_in_client("val")
    headers = csrf_headers(owner, config.SESSION_CSRF_COOKIE_NAME)

    resp = owner.post(
        "/api/files",
        json={"title": "x", "kind": "bogus-kind", "visibility": "private", "content": ""},
        headers=headers,
    )
    assert resp.status_code == 422

    resp = owner.post(
        "/api/files",
        json={"title": "x", "kind": "quiz", "visibility": "private", "content": ""},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["kind"] == "quiz"
