# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (from repo root, uses `uv`):
```bash
uv run run.py              # runs the web app (:8000)
uv run pytest tests/ -v    # all backend tests
uv run pytest tests/test_auth_api.py -v          # single file
uv run pytest tests/test_auth_api.py::test_name -v  # single test
```

Frontend (from `frontend/`):
```bash
npm install
npm run dev        # :5173, proxies /api to :8000
npm run build       # tsc -b && vite build — typecheck + production build
npm run lint         # oxlint
npx vitest run       # skdown parser tests etc.
```

For local full-stack dev, run the backend and `npm run dev` in separate terminals, then
open `http://localhost:5173/register` to create an account.

## Architecture

This is a username/password login system with a content wiki bolted on. One FastAPI
process (`run.py`) serves everything, backed by a single SQLite DB:

- `app/main.py` — the FastAPI JSON API: auth (`/api/register`, `/api/login`,
  `/api/logout`, `/api/me`), profiles, files, revisions, collaborators, suggestions.
  Routes are plain `def`, not `async def`, so Starlette runs them in a threadpool —
  deliberate, since `app/db.py` uses stdlib `sqlite3` (one connection per thread, WAL
  mode) rather than `aiosqlite`.
- `app/security.py` — password hashing (PBKDF2-HMAC-SHA256, stdlib only, no external
  crypto dependency).
- `frontend/` — a React SPA (Vite, TypeScript, react-router). Talks to the API via
  `frontend/src/lib/api.ts`, which reads the CSRF cookie and echoes it as a header.
  When the SPA notices it's being framed (`frontend/src/lib/embed.ts`) it swaps in a
  separate, chrome-free route tree rendering `EmbedPage` — so the shared `/files/:id`
  URL doubles as the embed URL. Nothing server-side backs this: `SameSite=Lax` makes a
  cross-site frame anonymous, so the ordinary public/private check already limits
  embeds to public files (see README "Embedding a file on another site").
  The light/dark palette (`frontend/src/lib/theme.ts`, toggled on `/settings`) is
  browser-local for the same reason it has to be: a framed file can't read this
  origin's `localStorage`, so an embed resolves its theme from `?theme=` > a
  `skdoctool:theme` postMessage from the host > the stored toggle > `prefers-color-
  scheme`. Themes are CSS custom properties keyed off `data-theme` on `<html>`, which
  `frontend/index.html` stamps inline pre-paint — add new colours as tokens in both
  blocks at the top of `index.css`, not as literals. See README "Dark mode".

Identity is a username + password, nothing else — no email, no account-recovery flow.
`/api/register` validates the username (3-20 chars: letters/digits/underscore) and
password (min 8 chars), hashes the password, creates the account, and sets a full
session cookie in one step. `/api/login` verifies an existing account's password the
same way. Every state-changing endpoint that acts on an *existing* session requires an
`X-CSRF-Token` header that's an `HMAC(SECRET, cookie_value)` of the request's own
session cookie (`app/csrf.py`) — no server-side token table, and the token is
inherently scoped to the session it came from. `/api/register` and `/api/login`
themselves are exempt from this check since there's no prior session cookie to bind a
token to. Rate limiting is an in-memory sliding-window limiter (`app/ratelimit.py`),
process-local by design (see README "Rate limiting" for exact per-endpoint limits and
the note on swapping in Redis if this ever runs multi-process).

### Content model

Every file's content is one format regardless of its `kind` (`doc` | `decision-tree` |
`quiz`), documented in `CONTENT_FORMAT.md`: markdown frontmatter for `kind`, plus
`:::type key="val" ... :::` directive blocks whose bodies are themselves plain markdown.
This is why diffing, storage, and the API layer never need to know a file's kind — they
just handle text — and why adding a new content kind is purely a frontend change:
1. `frontend/src/lib/skdown.ts` parses frontmatter + directive blocks generically.
2. `frontend/src/components/rendererRegistry.tsx` maps `kind` -> renderer component.
3. A new renderer lives in `frontend/src/components/renderers/` and consumes the same
   parsed node/question list as `DocRenderer`/`DecisionTreeRenderer`/`QuizRenderer`.

Revisions are full-content snapshots, not stored patches — `app/diffing.py` computes diffs
on demand between any two revision ids via `difflib.SequenceMatcher`. Owners/editors write
revisions directly with optimistic-concurrency checks (`parent_revision_id` must match
the current head, or `409`). Everyone else who can *view* a file can only submit a
`suggestion` (a full-content diff against a specific revision) for an editor to
accept/reject — closer to a PR review than a wiki, so contributions never land unreviewed.

### Config

All runtime config is env-driven through `app/config.py` (`SSHAUTH_SECRET`,
`SSHAUTH_DB_PATH`, `SSHAUTH_SESSION_TTL`, `SSHAUTH_FRONTEND_ORIGIN`, etc.) — check
there before adding a hardcoded value that should be configurable.

### Production note

The frontend is meant to be built and served from the same origin as the FastAPI app (or a
proxy in front of both) so cookies are same-site with no CORS involved — the Vite dev
proxy is dev-only. `docker-compose.yml` + `nginx/` + `init-letsencrypt.sh` implement this:
app + nginx (TLS, static frontend, `/api` proxy) + a certbot renewal sidecar. The nginx
config is also where the clickjacking policy lives: framing is denied on every route
except `/files/<id>`, the one an embed points at. See README
"Deploying" for the run commands. `cloudflare-ufw.sh` is an optional VPS-hardening step,
unrelated to the app itself. See README "Design notes" for the full list of deliberate
scope boundaries (no account recovery, etc.) before treating any of those as bugs to fix.
