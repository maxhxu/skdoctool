"""
JSON API for the React frontend.

Auth model: plain username/password. /api/register creates an account and
logs in; /api/login authenticates an existing one. Both set the same
session cookie /api/logout clears. Everything here is JSON in/out, since
the UI lives in the React app.

CSRF: every state-changing endpoint that acts on an existing session
requires an `X-CSRF-Token` header whose value is HMAC(SECRET_KEY, <the
session cookie's value>). The frontend gets that value from a parallel
*non*-httponly cookie the server sets whenever it sets the httponly one
(see app/csrf.py) — it never has to know the secret, just echo back what
it was given. /api/register and /api/login are exempt: there's no prior
session cookie to bind a token to, and same-site=lax cookies already rule
out the cross-site form-post case that matters here.
"""

import sqlite3
from contextlib import asynccontextmanager

from fastapi import Cookie, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import config, db
from .csrf import csrf_token_for, set_csrf_cookie, verify_csrf
from .diffing import diff_lines
from .models import (
    CollaboratorAdd,
    FileCreate,
    FileMetaUpdate,
    LoginRequest,
    ProfileUpdate,
    RegisterRequest,
    RevisionCreate,
    SocialLinksUpdate,
    SuggestionCreate,
)
from .ratelimit import (
    file_create_per_user,
    file_write_per_user,
    login_per_ip,
    register_per_ip,
    suggestion_per_user,
)
from .security import hash_password, verify_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="skdoctool", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _too_many_requests():
    raise HTTPException(429, "Too many requests, try again in a minute.")


def _current_user(session_id: str | None):
    if not session_id:
        return None
    return db.get_session_user(session_id)


def _require_user(session_id: str | None):
    user = _current_user(session_id)
    if not user:
        raise HTTPException(401, "Not logged in")
    return user


def _require_csrf(cookie_value: str | None, header_value: str | None):
    if not verify_csrf(cookie_value, header_value):
        raise HTTPException(403, "Missing or invalid CSRF token")


def _user_out(user: sqlite3.Row) -> dict:
    return {"id": user["id"], "username": user["username"]}


def _file_out(file_row: sqlite3.Row, **extra) -> dict:
    return {
        "id": file_row["id"],
        "owner_id": file_row["owner_id"],
        "owner_username": file_row["owner_username"] if "owner_username" in file_row.keys() else None,
        "title": file_row["title"],
        "kind": file_row["kind"],
        "visibility": file_row["visibility"],
        "head_revision_id": file_row["head_revision_id"],
        "created_at": file_row["created_at"],
        "updated_at": file_row["updated_at"],
        **extra,
    }


def _can_view(file_row: sqlite3.Row, user) -> bool:
    if file_row["visibility"] == "public":
        return True
    if user and file_row["owner_id"] == user["id"]:
        return True
    if user and db.is_collaborator(file_row["id"], user["id"]):
        return True
    return False


def _can_edit(file_row: sqlite3.Row, user) -> bool:
    if not user:
        return False
    return file_row["owner_id"] == user["id"] or db.is_collaborator(file_row["id"], user["id"])


def _get_viewable_file_or_404(file_id: int, user):
    file_row = db.get_file(file_id)
    if not file_row or not _can_view(file_row, user):
        raise HTTPException(404, "File not found")
    return file_row


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------

@app.get("/api/me")
def me(sshauth_session: str | None = Cookie(default=None)):
    user = _current_user(sshauth_session)
    if not user:
        return {"user": None}
    return {"user": _user_out(user)}


@app.post("/api/register")
def register(request: Request, payload: RegisterRequest):
    if not register_per_ip.allow(_client_ip(request)):
        _too_many_requests()

    if db.get_user_by_username(payload.username) is not None:
        raise HTTPException(409, "Username taken")

    user = db.create_user(payload.username, hash_password(payload.password))
    session_id = db.create_session(user["id"])

    response = _json_response({"user": _user_out(user)})
    response.set_cookie(
        config.SESSION_COOKIE_NAME, session_id,
        max_age=config.SESSION_TTL_SECONDS, httponly=True, samesite="lax",
    )
    set_csrf_cookie(response, config.SESSION_CSRF_COOKIE_NAME, session_id, config.SESSION_TTL_SECONDS)
    return response


@app.post("/api/login")
def login(request: Request, payload: LoginRequest):
    if not login_per_ip.allow(_client_ip(request)):
        _too_many_requests()

    user = db.get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")

    session_id = db.create_session(user["id"])
    response = _json_response({"user": _user_out(user)})
    response.set_cookie(
        config.SESSION_COOKIE_NAME, session_id,
        max_age=config.SESSION_TTL_SECONDS, httponly=True, samesite="lax",
    )
    set_csrf_cookie(response, config.SESSION_CSRF_COOKIE_NAME, session_id, config.SESSION_TTL_SECONDS)
    return response


@app.post("/api/logout")
def logout(
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    if sshauth_session:
        _require_csrf(sshauth_session, csrf_header)
        db.delete_session(sshauth_session)
    response = _json_response({"ok": True})
    response.delete_cookie(config.SESSION_COOKIE_NAME)
    response.delete_cookie(config.SESSION_CSRF_COOKIE_NAME)
    return response


# ---------------------------------------------------------------------------
# profiles
# ---------------------------------------------------------------------------

@app.get("/api/users/{username}")
def get_profile(username: str):
    user = db.get_user_by_username(username)
    if not user:
        raise HTTPException(404, "User not found")
    profile = db.get_profile(user["id"])
    links = db.list_social_links(user["id"])
    files = db.list_files_owned_by_username(username)
    return {
        "user": _user_out(user),
        "bio_markdown": profile["bio_markdown"] if profile else "",
        "social_links": [{"label": l["label"], "url": l["url"]} for l in links],
        "public_files": [_file_out(f) for f in files],
    }


@app.put("/api/profile")
def update_profile(
    payload: ProfileUpdate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    db.upsert_profile_bio(user["id"], payload.bio_markdown)
    return {"ok": True}


@app.put("/api/profile/links")
def update_links(
    payload: SocialLinksUpdate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    db.replace_social_links(user["id"], [(l.label, l.url) for l in payload.links])
    return {"ok": True}


# ---------------------------------------------------------------------------
# files
# ---------------------------------------------------------------------------

@app.get("/api/files")
def list_my_files(sshauth_session: str | None = Cookie(default=None)):
    user = _require_user(sshauth_session)
    return {"files": [_file_out(f) for f in db.list_files_for_user(user["id"])]}


@app.get("/api/files/public")
def list_public_files():
    return {"files": [_file_out(f) for f in db.list_public_files()]}


@app.post("/api/files")
def create_file(
    payload: FileCreate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    if not file_create_per_user.allow(str(user["id"])):
        _too_many_requests()

    file_row = db.create_file(user["id"], payload.title, payload.kind, payload.visibility, payload.content)
    return _file_out(file_row, owner_username=user["username"])


@app.get("/api/files/{file_id}")
def get_file(file_id: int, sshauth_session: str | None = Cookie(default=None)):
    user = _current_user(sshauth_session)
    file_row = _get_viewable_file_or_404(file_id, user)
    head = db.get_head_revision(file_id)
    return {
        "file": _file_out(file_row),
        "content": head["content"] if head else "",
        "can_edit": _can_edit(file_row, user),
        "is_owner": bool(user and file_row["owner_id"] == user["id"]),
    }


@app.put("/api/files/{file_id}")
def update_file_meta(
    file_id: int,
    payload: FileMetaUpdate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    if not file_row:
        raise HTTPException(404, "File not found")
    if file_row["owner_id"] != user["id"]:
        raise HTTPException(403, "Only the owner can change file settings")
    db.update_file_meta(file_id, payload.title, payload.kind, payload.visibility)
    return _file_out(db.get_file(file_id))


@app.get("/api/files/{file_id}/revisions")
def list_revisions(file_id: int, sshauth_session: str | None = Cookie(default=None)):
    user = _current_user(sshauth_session)
    _get_viewable_file_or_404(file_id, user)
    return {"revisions": [dict(r) for r in db.list_revisions(file_id)]}


@app.post("/api/files/{file_id}/revisions")
def create_revision(
    file_id: int,
    payload: RevisionCreate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    if not file_row:
        raise HTTPException(404, "File not found")
    if not _can_edit(file_row, user):
        raise HTTPException(403, "You don't have edit access to this file")
    if not file_write_per_user.allow(str(user["id"])):
        _too_many_requests()

    if payload.parent_revision_id != file_row["head_revision_id"]:
        raise HTTPException(
            409, "This file changed since you loaded it — refresh and reapply your edit."
        )

    revision = db.create_revision(file_id, payload.parent_revision_id, user["id"], payload.content, payload.message)
    return dict(revision)


@app.get("/api/files/{file_id}/diff")
def diff_revisions(
    file_id: int,
    from_revision: int,
    to_revision: int,
    sshauth_session: str | None = Cookie(default=None),
):
    user = _current_user(sshauth_session)
    _get_viewable_file_or_404(file_id, user)
    old = db.get_revision(from_revision)
    new = db.get_revision(to_revision)
    if not old or not new or old["file_id"] != file_id or new["file_id"] != file_id:
        raise HTTPException(404, "Revision not found")
    return {"diff": diff_lines(old["content"], new["content"])}


# ---- collaborators ----------------------------------------------------

@app.get("/api/files/{file_id}/collaborators")
def list_collaborators(file_id: int, sshauth_session: str | None = Cookie(default=None)):
    user = _require_user(sshauth_session)
    file_row = db.get_file(file_id)
    if not file_row or file_row["owner_id"] != user["id"]:
        raise HTTPException(404, "File not found")
    return {"collaborators": [dict(c) for c in db.list_collaborators(file_id)]}


@app.post("/api/files/{file_id}/collaborators")
def add_collaborator(
    file_id: int,
    payload: CollaboratorAdd,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    if not file_row or file_row["owner_id"] != user["id"]:
        raise HTTPException(404, "File not found")

    invitee = db.get_user_by_username(payload.username)
    if not invitee:
        raise HTTPException(404, "No such user")
    if invitee["id"] == user["id"]:
        raise HTTPException(400, "You already own this file")

    db.add_collaborator(file_id, invitee["id"])
    return {"collaborators": [dict(c) for c in db.list_collaborators(file_id)]}


@app.delete("/api/files/{file_id}/collaborators/{user_id}")
def remove_collaborator(
    file_id: int,
    user_id: int,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    if not file_row or file_row["owner_id"] != user["id"]:
        raise HTTPException(404, "File not found")
    db.remove_collaborator(file_id, user_id)
    return {"ok": True}


# ---- suggestions (contributions from viewers who aren't editors) -----------

@app.post("/api/files/{file_id}/suggestions")
def create_suggestion(
    file_id: int,
    payload: SuggestionCreate,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    if not suggestion_per_user.allow(str(user["id"])):
        _too_many_requests()

    file_row = _get_viewable_file_or_404(file_id, user)
    base = db.get_revision(payload.base_revision_id)
    if not base or base["file_id"] != file_id:
        raise HTTPException(404, "Base revision not found")

    suggestion = db.create_suggestion(file_id, payload.base_revision_id, user["id"], payload.content, payload.message)
    return dict(suggestion)


@app.get("/api/files/{file_id}/suggestions")
def list_suggestions(file_id: int, sshauth_session: str | None = Cookie(default=None)):
    user = _require_user(sshauth_session)
    file_row = db.get_file(file_id)
    if not file_row or not _can_view(file_row, user):
        raise HTTPException(404, "File not found")

    all_suggestions = db.list_suggestions(file_id)
    if _can_edit(file_row, user):
        visible = all_suggestions
    else:
        visible = [s for s in all_suggestions if s["author_id"] == user["id"]]
    return {"suggestions": [dict(s) for s in visible]}


@app.get("/api/files/{file_id}/suggestions/{suggestion_id}/diff")
def diff_suggestion(
    file_id: int, suggestion_id: int, sshauth_session: str | None = Cookie(default=None)
):
    user = _require_user(sshauth_session)
    file_row = db.get_file(file_id)
    suggestion = db.get_suggestion(suggestion_id)
    if not file_row or not suggestion or suggestion["file_id"] != file_id:
        raise HTTPException(404, "Not found")
    if not _can_edit(file_row, user) and suggestion["author_id"] != user["id"]:
        raise HTTPException(403, "Not allowed")

    base = db.get_revision(suggestion["base_revision_id"])
    return {"diff": diff_lines(base["content"], suggestion["content"])}


@app.post("/api/files/{file_id}/suggestions/{suggestion_id}/accept")
def accept_suggestion(
    file_id: int,
    suggestion_id: int,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    suggestion = db.get_suggestion(suggestion_id)
    if not file_row or not suggestion or suggestion["file_id"] != file_id:
        raise HTTPException(404, "Not found")
    if not _can_edit(file_row, user):
        raise HTTPException(403, "Only the owner or an editor can accept contributions")
    if suggestion["status"] != "pending":
        raise HTTPException(409, "Suggestion already resolved")
    if suggestion["base_revision_id"] != file_row["head_revision_id"]:
        raise HTTPException(
            409, "This file changed since the suggestion was proposed — refresh and re-review it."
        )

    revision = db.create_revision(
        file_id, file_row["head_revision_id"], user["id"], suggestion["content"],
        f"Accepted suggestion from {suggestion['author_id']}: {suggestion['message']}".strip(),
    )
    db.resolve_suggestion(suggestion_id, "accepted", revision["id"])
    return dict(revision)


@app.post("/api/files/{file_id}/suggestions/{suggestion_id}/reject")
def reject_suggestion(
    file_id: int,
    suggestion_id: int,
    sshauth_session: str | None = Cookie(default=None),
    csrf_header: str | None = Header(default=None, alias=config.CSRF_HEADER_NAME),
):
    user = _require_user(sshauth_session)
    _require_csrf(sshauth_session, csrf_header)
    file_row = db.get_file(file_id)
    suggestion = db.get_suggestion(suggestion_id)
    if not file_row or not suggestion or suggestion["file_id"] != file_id:
        raise HTTPException(404, "Not found")
    if not _can_edit(file_row, user):
        raise HTTPException(403, "Only the owner or an editor can reject contributions")
    if suggestion["status"] != "pending":
        raise HTTPException(409, "Suggestion already resolved")

    db.resolve_suggestion(suggestion_id, "rejected", None)
    return {"ok": True}


# ---------------------------------------------------------------------------
# small helper: FastAPI can't easily return a plain dict AND set cookies on
# it, so mutating-cookie endpoints build a JSONResponse explicitly.
# ---------------------------------------------------------------------------

def _json_response(payload: dict) -> JSONResponse:
    return JSONResponse(payload)
