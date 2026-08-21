# skdoctool

A username/password login system with a content wiki bolted on. Once you're in, files
are plain markdown tagged with a `kind` and rendered as a doc, decision tree, or quiz
(see `CONTENT_FORMAT.md`).

## Flow

1. `/register` — pick a username (3-20 chars: letters, digits, underscore) and a
   password (min 8 chars). Creates the account and logs you in immediately.
2. `/login` — username + password for a returning user.

Both set a session cookie; there's no email step and no password-reset flow.

## Run it

```bash
uv run run.py
```

This starts the web app on `:8000`. Config is via env vars (see `app/config.py`):
`SSHAUTH_SECRET`, `SSHAUTH_DB_PATH`, `SSHAUTH_SESSION_TTL`, `SSHAUTH_FRONTEND_ORIGIN`.

## Run the tests

```bash
uv run pytest -v
```

The suite drives the FastAPI app directly with `TestClient` through registration,
duplicate-username, invalid-username/short-password, login (correct/incorrect
password, unknown user), logout, and rate-limit paths, plus the existing
files/permissions/diff/suggestions coverage.

## Rate limiting

In-memory sliding-window limits (`app/ratelimit.py`), process-local since this runs
as a single process (see `run.py`):

| Guard | Limit |
|---|---|
| `POST /api/register`, per IP | 10 / 60s |
| `POST /api/login`, per IP | 10 / 60s |
| file/revision writes, per user | 30 / 60s |
| suggestions, per user | 10 / 60s |
| file creation, per user | 10 / 5min |

Exceeding a limit gets you a `429`. Rejected attempts aren't themselves counted, so a
client just has to wait out the window, not "cool down" separately. If this ever runs
as multiple worker processes, swap `RateLimiter`'s dict for a shared store (e.g. Redis)
— the call sites don't change.

## CSRF protection

Every state-changing endpoint that acts on an existing session requires an
`X-CSRF-Token` header computed as `HMAC(SECRET_KEY, <the session cookie's value>)`
(`app/csrf.py`). The server sets a second, *non*-httponly cookie alongside the
httponly session cookie, holding that same HMAC value — the frontend reads it via
`document.cookie` (`frontend/src/lib/api.ts`) and echoes it back as a header. It's
still useless to a cross-site attacker: producing a valid token requires reading the
paired httponly cookie's value, which same-origin policy blocks.

`/api/register` and `/api/login` are the exception — there's no session cookie yet
for a token to be bound to when you're not logged in. Same-site=lax cookies already
rule out the cross-site form-post case that CSRF protection exists for.

## Project layout

```
app/
  config.py       # env-driven settings (rate limits, CSRF cookie names, frontend origin)
  models.py       # Pydantic request models — auth, files, profiles, revisions, suggestions
  db.py           # sqlite3: users, sessions, profiles, files, revisions, collaborators, suggestions
  diffing.py      # structured line-diff (difflib.SequenceMatcher -> UI-ready rows)
  security.py     # PBKDF2-HMAC-SHA256 password hashing (stdlib only)
  csrf.py         # HMAC-derived double-submit CSRF tokens (+ SPA cookie helper)
  ratelimit.py    # in-memory sliding-window rate limiter
  main.py         # FastAPI JSON API: auth, profiles, files, revisions, collaborators, suggestions
run.py            # runs the web app for local/dev use
tests/            # pytest — auth/CSRF/rate-limit + files/permissions/diff/suggestions
frontend/
  src/lib/skdown.ts               # frontmatter + directive-block parser (the extension point)
  src/lib/api.ts                  # typed fetch client, handles CSRF header
  src/components/rendererRegistry.tsx  # kind -> renderer component map
  src/components/renderers/       # DocRenderer, DecisionTreeRenderer, QuizRenderer
  src/components/{Layout,MarkdownEditor,DiffView}.tsx
  src/context/AuthContext.tsx
  src/pages/                      # Home, Login, Register, Profile, file list/view
CONTENT_FORMAT.md  # the markdown-derivative format renderers read
```

## Running it locally

Backend:

```bash
uv run run.py   # :8000
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev     # :5173, proxies /api to :8000
```

Then open `http://localhost:5173/register` to create an account.

## Tests

```bash
uv run pytest tests/ -v                 # backend
cd frontend && npx vitest run           # frontend: skdown parser, 11 tests
cd frontend && npm run build            # typecheck + production build
```

## Design notes / assumptions made

- **Plain username/password, on purpose.** No email, no password reset, no
  multi-factor. This is intentionally the simplest login model that still gives each
  account a durable, memorable identity — see "Not addressed" below for what that
  trades away.
- **Passwords are hashed with PBKDF2-HMAC-SHA256** (`app/security.py`), stdlib-only
  (260k iterations, random 16-byte salt per password, self-describing stored format
  so the iteration count can be bumped later without invalidating existing hashes).
- **Content is always plain text.** Every file kind — doc, decision-tree, quiz —
  stores the *same* markdown-with-directive-blocks format (`CONTENT_FORMAT.md`).
  Diffing, storage, and the suggestion/contribution flow never need to know what
  kind a file is; only the frontend's renderer registry cares. Adding a fourth kind
  is a new React component plus one registry entry, not a schema or API change.
- **Revisions are full snapshots, not stored patches.** At this scale, storing
  incremental diffs would add real complexity (reconstructing any given revision
  means walking a patch chain) for no real benefit — text compresses fine, and every
  revision needs to be independently diffable/readable anyway. Diffs are computed on
  demand (`app/diffing.py`) between any two revision ids.
- **Two ways to change a file, by design.** Owners/invited editors write revisions
  directly, with optimistic-concurrency checks (`parent_revision_id` must match
  current head, or `409`). Everyone else who can *view* a file (i.e. it's public, or
  they were invited) can only propose a `suggestion` — a full-content diff against a
  specific revision that an editor reviews and accepts/rejects. This is deliberately
  closer to a PR review than a wiki: contributions never land without a look at the
  diff.
- **CSRF tokens are HMAC-derived from the cookie they protect**, not randomly
  generated and stored server-side — no extra table, and a token is automatically
  scoped to exactly the session it came from.
- **The frontend never talks to a different origin in production.** Vite's dev proxy
  exists only for local dev; ship it by building the frontend and serving the static
  files from the same FastAPI process (or a proxy in front of both) so cookies are
  same-site with no CORS involved at all.
- **SQLite via stdlib `sqlite3`**, one connection per thread + WAL mode. FastAPI
  routes are defined as plain `def` (not `async def`) so Starlette runs them in a
  threadpool automatically — this is a deliberate simpler alternative to
  `aiosqlite`, appropriate for this traffic pattern (short read/write bursts, not
  long-held connections).
- Not addressed (flag if you want these next): account recovery for a forgotten
  password (no email on file to reset one through), pagination on file/revision
  lists, real-time collaboration (this is diff-and-review, not simultaneous
  editing), search across files/profiles, and image/asset uploads for use inside
  markdown.
