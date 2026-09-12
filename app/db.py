import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager

from . import config

_local = threading.local()
_init_lock = threading.Lock()
_initialized = False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_conn() -> sqlite3.Connection:
    # one connection per thread (FastAPI sync routes run in a threadpool)
    if not hasattr(_local, "conn"):
        _local.conn = _connect()
    return _local.conn


@contextmanager
def tx():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def init_db() -> None:
    global _initialized
    with _init_lock:
        if _initialized:
            return
        conn = get_conn()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );

            -- ---- profiles ---------------------------------------------

            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                bio_markdown TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS social_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                label TEXT NOT NULL,
                url TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0
            );

            -- ---- files (sharable, versioned documents) -----------------

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL REFERENCES users(id),
                title TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'doc',
                visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
                head_revision_id INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- Full-text snapshots, not incremental patches: at this scale
            -- "store the diff" buys nothing but complexity, and every
            -- revision needs to be independently readable/diffable anyway.
            CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL REFERENCES files(id),
                parent_id INTEGER REFERENCES revisions(id),
                author_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS collaborators (
                file_id INTEGER NOT NULL REFERENCES files(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor')),
                added_at INTEGER NOT NULL,
                PRIMARY KEY (file_id, user_id)
            );

            -- A proposed full-content replacement from anyone who can view
            -- the file, sitting alongside the revision it was proposed
            -- against. Accepting one creates a normal new revision;
            -- rejecting one just marks it closed. This is the "handle
            -- other users' contributions" path for people who aren't
            -- editors.
            CREATE TABLE IF NOT EXISTS suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL REFERENCES files(id),
                base_revision_id INTEGER NOT NULL REFERENCES revisions(id),
                author_id INTEGER NOT NULL REFERENCES users(id),
                content TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
                created_at INTEGER NOT NULL,
                resolved_at INTEGER,
                resolved_revision_id INTEGER REFERENCES revisions(id)
            );
            """
        )
        conn.commit()
        _initialized = True


# ---- users --------------------------------------------------------------

def get_user_by_username(username: str) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def create_user(username: str, password_hash: str) -> sqlite3.Row:
    now = int(time.time())
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, now),
        )
        user_id = cur.lastrowid
    return get_user_by_id(user_id)


# ---- sessions -------------------------------------------------------------

def create_session(user_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    now = int(time.time())
    with tx() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, user_id, created_at, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (session_id, user_id, now, now + config.SESSION_TTL_SECONDS),
        )
    return session_id


def get_session_user(session_id: str) -> sqlite3.Row | None:
    now = int(time.time())
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ? AND expires_at > ?",
        (session_id, now),
    ).fetchone()
    if not row:
        return None
    return get_user_by_id(row["user_id"])


def delete_session(session_id: str) -> None:
    with tx() as conn:
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))


# ---- profiles ---------------------------------------------------------

def get_profile(user_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute(
        "SELECT * FROM profiles WHERE user_id = ?", (user_id,)
    ).fetchone()


def upsert_profile_bio(user_id: int, bio_markdown: str) -> None:
    now = int(time.time())
    with tx() as conn:
        conn.execute(
            "INSERT INTO profiles (user_id, bio_markdown, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET bio_markdown = excluded.bio_markdown, "
            "updated_at = excluded.updated_at",
            (user_id, bio_markdown, now),
        )


def list_social_links(user_id: int) -> list[sqlite3.Row]:
    conn = get_conn()
    return conn.execute(
        "SELECT id, label, url FROM social_links WHERE user_id = ? ORDER BY position, id",
        (user_id,),
    ).fetchall()


def replace_social_links(user_id: int, links: list[tuple[str, str]]) -> None:
    """links: list of (label, url), in display order. Full replace is
    simpler and plenty fast for a handful of links per profile."""
    with tx() as conn:
        conn.execute("DELETE FROM social_links WHERE user_id = ?", (user_id,))
        conn.executemany(
            "INSERT INTO social_links (user_id, label, url, position) VALUES (?, ?, ?, ?)",
            [(user_id, label, url, i) for i, (label, url) in enumerate(links)],
        )


# ---- files --------------------------------------------------------------

def create_file(owner_id: int, title: str, kind: str, visibility: str, content: str) -> sqlite3.Row:
    now = int(time.time())
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO files (owner_id, title, kind, visibility, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (owner_id, title, kind, visibility, now, now),
        )
        file_id = cur.lastrowid
        rev_cur = conn.execute(
            "INSERT INTO revisions (file_id, parent_id, author_id, content, message, created_at) "
            "VALUES (?, NULL, ?, ?, ?, ?)",
            (file_id, owner_id, content, "Initial version", now),
        )
        conn.execute(
            "UPDATE files SET head_revision_id = ? WHERE id = ?",
            (rev_cur.lastrowid, file_id),
        )
    return get_file(file_id)


def get_file(file_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()


def update_file_meta(file_id: int, title: str, kind: str, visibility: str) -> None:
    now = int(time.time())
    with tx() as conn:
        conn.execute(
            "UPDATE files SET title = ?, kind = ?, visibility = ?, updated_at = ? WHERE id = ?",
            (title, kind, visibility, now, file_id),
        )


def list_files_for_user(user_id: int) -> list[sqlite3.Row]:
    """Owned files + files this user is an invited editor on."""
    conn = get_conn()
    return conn.execute(
        """
        SELECT DISTINCT files.*, users.username AS owner_username
        FROM files
        JOIN users ON users.id = files.owner_id
        LEFT JOIN collaborators ON collaborators.file_id = files.id
        WHERE files.owner_id = ? OR collaborators.user_id = ?
        ORDER BY files.updated_at DESC
        """,
        (user_id, user_id),
    ).fetchall()


def list_files_owned_by_username(username: str) -> list[sqlite3.Row]:
    """Public files owned by a given user, for their profile page."""
    conn = get_conn()
    return conn.execute(
        """
        SELECT files.* FROM files
        JOIN users ON users.id = files.owner_id
        WHERE users.username = ? AND files.visibility = 'public'
        ORDER BY files.updated_at DESC
        """,
        (username,),
    ).fetchall()


# ---- revisions ------------------------------------------------------------

def create_revision(file_id: int, parent_id: int | None, author_id: int, content: str, message: str) -> sqlite3.Row:
    now = int(time.time())
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO revisions (file_id, parent_id, author_id, content, message, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (file_id, parent_id, author_id, content, message, now),
        )
        rev_id = cur.lastrowid
        conn.execute(
            "UPDATE files SET head_revision_id = ?, updated_at = ? WHERE id = ?",
            (rev_id, now, file_id),
        )
    conn = get_conn()
    return conn.execute("SELECT * FROM revisions WHERE id = ?", (rev_id,)).fetchone()


def get_revision(revision_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute("SELECT * FROM revisions WHERE id = ?", (revision_id,)).fetchone()


def list_revisions(file_id: int) -> list[sqlite3.Row]:
    conn = get_conn()
    return conn.execute(
        """
        SELECT revisions.id, revisions.parent_id, revisions.message, revisions.created_at,
               users.username AS author_username
        FROM revisions JOIN users ON users.id = revisions.author_id
        WHERE revisions.file_id = ?
        ORDER BY revisions.id DESC
        """,
        (file_id,),
    ).fetchall()


def get_head_revision(file_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute(
        """
        SELECT revisions.* FROM revisions JOIN files ON files.head_revision_id = revisions.id
        WHERE files.id = ?
        """,
        (file_id,),
    ).fetchone()


# ---- collaborators (invited editors) --------------------------------------

def add_collaborator(file_id: int, user_id: int) -> None:
    now = int(time.time())
    with tx() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO collaborators (file_id, user_id, role, added_at) "
            "VALUES (?, ?, 'editor', ?)",
            (file_id, user_id, now),
        )


def remove_collaborator(file_id: int, user_id: int) -> None:
    with tx() as conn:
        conn.execute(
            "DELETE FROM collaborators WHERE file_id = ? AND user_id = ?",
            (file_id, user_id),
        )


def list_collaborators(file_id: int) -> list[sqlite3.Row]:
    conn = get_conn()
    return conn.execute(
        """
        SELECT users.id AS user_id, users.username, collaborators.added_at
        FROM collaborators JOIN users ON users.id = collaborators.user_id
        WHERE collaborators.file_id = ?
        ORDER BY collaborators.added_at
        """,
        (file_id,),
    ).fetchall()


def is_collaborator(file_id: int, user_id: int) -> bool:
    conn = get_conn()
    row = conn.execute(
        "SELECT 1 FROM collaborators WHERE file_id = ? AND user_id = ?",
        (file_id, user_id),
    ).fetchone()
    return row is not None


# ---- suggestions (contributions from non-editors) --------------------------

def create_suggestion(file_id: int, base_revision_id: int, author_id: int, content: str, message: str) -> sqlite3.Row:
    now = int(time.time())
    with tx() as conn:
        cur = conn.execute(
            "INSERT INTO suggestions (file_id, base_revision_id, author_id, content, message, "
            "status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
            (file_id, base_revision_id, author_id, content, message, now),
        )
        sid = cur.lastrowid
    conn = get_conn()
    return conn.execute("SELECT * FROM suggestions WHERE id = ?", (sid,)).fetchone()


def get_suggestion(suggestion_id: int) -> sqlite3.Row | None:
    conn = get_conn()
    return conn.execute(
        "SELECT * FROM suggestions WHERE id = ?", (suggestion_id,)
    ).fetchone()


def list_suggestions(file_id: int) -> list[sqlite3.Row]:
    conn = get_conn()
    return conn.execute(
        """
        SELECT suggestions.*, users.username AS author_username
        FROM suggestions JOIN users ON users.id = suggestions.author_id
        WHERE suggestions.file_id = ?
        ORDER BY suggestions.created_at DESC
        """,
        (file_id,),
    ).fetchall()


def resolve_suggestion(suggestion_id: int, status: str, resolved_revision_id: int | None) -> None:
    now = int(time.time())
    with tx() as conn:
        conn.execute(
            "UPDATE suggestions SET status = ?, resolved_at = ?, resolved_revision_id = ? "
            "WHERE id = ?",
            (status, now, resolved_revision_id, suggestion_id),
        )
