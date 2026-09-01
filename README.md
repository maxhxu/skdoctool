# skdoctool

A username/password login system with a content wiki bolted on. Once you're in, files
are plain markdown tagged with a `kind` and rendered as a doc, decision tree, or quiz
(see `CONTENT_FORMAT.md`).

## Run it locally

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

Open `http://localhost:5173/register` to create an account (3-20 char username,
8+ char password — no email, no password-reset flow).

Config is via env vars, see `app/config.py` (`SSHAUTH_SECRET`, `SSHAUTH_DB_PATH`,
`SSHAUTH_SESSION_TTL`, `SSHAUTH_FRONTEND_ORIGIN`, ...).

## Tests

```bash
uv run pytest tests/ -v                 # backend
cd frontend && npx vitest run           # frontend: skdown parser
cd frontend && npm run build            # typecheck + production build
cd frontend && npm run lint             # oxlint
```

`.github/workflows/ci.yml` runs all of that on every push to `main` and every PR,
plus an `nginx -t` on the rendered proxy config — a syntax error there wouldn't fail
a build, it'd take the site down on the next `docker compose up`. The frontend is
built on Node 20 (what `nginx/Dockerfile` uses in production) but tested on Node 22
(what jsdom requires); those two jobs are deliberately separate. CI gates, it doesn't
deploy — deployment stays manual.

## Deploying

`docker-compose.yml` runs three containers: the app, an nginx reverse proxy that
serves the built frontend and terminates TLS, and a certbot sidecar that renews the
Let's Encrypt cert. One-time setup:

```bash
DOMAIN=example.com EMAIL=you@example.com ./init-letsencrypt.sh   # bootstrap the first cert
DOMAIN=example.com SSHAUTH_SECRET=... docker compose up -d
```

`cloudflare-ufw.sh` is an optional VPS hardening step — run it (as root, after basic
`ufw` setup) if the domain sits behind Cloudflare, to restrict inbound 80/443 to
Cloudflare's IP ranges so the origin can't be reached directly.

## Rate limiting

In-memory sliding-window limits (`app/ratelimit.py`), process-local since this runs
as a single process:

| Guard | Limit |
|---|---|
| `POST /api/register`, per IP | 10 / 60s |
| `POST /api/login`, per IP | 10 / 60s |
| file/revision writes, per user | 30 / 60s |
| suggestions, per user | 10 / 60s |
| file creation, per user | 10 / 5min |

Exceeding a limit gets a `429`; rejected attempts aren't themselves counted, so a
client just waits out the window. If this ever runs as multiple worker processes,
swap `RateLimiter`'s dict for a shared store (e.g. Redis) — call sites don't change.

## CSRF protection

Every state-changing endpoint that acts on an existing session requires an
`X-CSRF-Token` header computed as `HMAC(SECRET_KEY, <session cookie value>)`
(`app/csrf.py`). The server sets a second, non-httponly cookie holding that same HMAC
value; the frontend reads it via `document.cookie` (`frontend/src/lib/api.ts`) and
echoes it back as a header. It's still useless to a cross-site attacker: producing a
valid token requires reading the paired httponly cookie, which same-origin policy
blocks. `/api/register` and `/api/login` are exempt — there's no session cookie yet
to bind a token to.

## Dark mode

`/settings` has one preference so far: a dark-mode toggle. It's browser-local —
no API call, no column on the account — so it works logged out, and the whole
palette is CSS custom properties on `:root`, which makes a theme one attribute
on `<html>`: `data-theme="light" | "dark"`. `frontend/index.html` stamps that
attribute in an inline script before first paint, so a reload never flashes the
light palette on its way to the dark one.

Untouched, the toggle follows `prefers-color-scheme` — the OS setting — and keeps
following it as that changes. Flipping it pins a choice in `localStorage`
(`skdoctool:theme`), which syncs across tabs and can be handed back with "Match
my system instead". `frontend/src/lib/theme.ts` is the whole implementation.

**Embedded files are themed too**, which needs more than `localStorage`: browsers
partition storage by top-level site (Safari blocks it outright in a third-party
frame), so a frame on someone else's page can't read the preference set here.
So, highest priority first, an embed picks its palette from:

1. **`?theme=dark`** (or `light`, or `system`) on the iframe URL — a host pinning
   a palette to match its own page.
2. **A `skdoctool:theme` message** from the host, for a host whose own dark-mode
   switch should move the frame with it:

   ```js
   frame.contentWindow.postMessage({ type: 'skdoctool:theme', theme: 'dark' }, '*')
   ```

   Neither of these is stored — they're the *embedding page's* choice, and
   shouldn't overwrite a reader's own toggle on `/settings`.
3. **`prefers-color-scheme`.** This one does reach into a third-party frame, so
   with no cooperation from the host at all an embed still follows the reader's
   own system dark mode. It's why the default is "system" rather than "light".

## Embedding a file on another site

Any **public** file can be dropped onto another site as an iframe, using the same
URL you'd share with a person:

```html
<iframe src="https://skdoctool.example/files/3" width="100%" height="400"></iframe>
```

Framed, the app skips its own chrome — no nav, no tabs, no edit controls — and
renders just the file's title and content, with a small badge in the bottom-right
corner linking back to the full page. There's no separate embed URL to keep in
sync; `frontend/src/lib/embed.ts` notices the page is framed and picks the
content-only route tree. Append `?embed=1` to preview that view in a normal tab.
(`?embed=0` forces the full app inside a frame — a dev escape hatch; the bundled
nginx config refuses that combination at the edge, see below.)

Every file kind embeds, since an embed is just the same renderer without the
chrome — a `quiz` stays answerable and a `decision-tree` stays clickable inside
the frame. Links in the content open in a new tab rather than navigating the
frame out from under the host page.

**Only public files embed.** The session cookie is `SameSite=Lax`, so a cross-site
frame is an anonymous request and the API only ever serves it files whose
visibility is `public` — a private file embeds as "This file isn't public",
the same response a nonexistent one gets. The embed view is also view-only
unconditionally, which matters for the *same-site* case (one subdomain framing
another), where the cookie *is* sent: an authenticated frame still renders no
buttons that could be clickjacked.

**Only a file page may be framed at all.** `nginx/templates/default.conf.template`
sends `X-Frame-Options: DENY` + `frame-ancestors 'none'` on every route *except*
`/files/<id>`, so the file list, `/files/new`, login, and profiles can't be framed
by anyone — embedding is opt-in per route rather than a property of the whole app.
`/files/<id>?embed=0` is denied too, since that renders the full app with its edit
controls. Serving the SPA behind something other than the bundled nginx means
reproducing that rule; without it the app is framable everywhere, as it was before
embeds existed.

**Theming.** An embed follows the reader's own system dark mode, and a host can
pin or live-update the palette instead — see "Dark mode" above.

**Sizing.** An iframe can't size itself, so a fixed `height` scrolls internally.
Hosts that want auto-resize can listen for the height the embed posts on every
content resize:

```html
<iframe id="doc" src="https://skdoctool.example/files/3" height="200"></iframe>
<script>
  addEventListener('message', (e) => {
    if (e.data?.type === 'skdoctool:height') document.getElementById('doc').height = e.data.height
  })
</script>
```

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
  src/lib/embed.ts                # embed-mode detection + host height messaging
  src/lib/theme.ts                # light/dark palette resolution (incl. inside an embed)
  src/components/rendererRegistry.tsx  # kind -> renderer component map
  src/components/renderers/       # DocRenderer, DecisionTreeRenderer, QuizRenderer
  src/components/{Layout,MarkdownEditor,DiffView}.tsx
  src/context/AuthContext.tsx
  src/pages/                      # Home, Login, Register, Profile, Settings, file list/view
  src/pages/EmbedPage.tsx         # the content-only view a framed file renders as
CONTENT_FORMAT.md  # the markdown-derivative format renderers read
nginx/, docker-compose.yml, init-letsencrypt.sh, cloudflare-ufw.sh   # production deploy
.github/workflows/ci.yml  # backend tests, frontend lint/build/test, nginx config check
```

## Design notes / assumptions made

- **Plain username/password, on purpose.** No email, no password reset, no
  multi-factor — the simplest login model that still gives each account a durable,
  memorable identity.
- **Passwords are hashed with PBKDF2-HMAC-SHA256** (`app/security.py`), stdlib-only
  (260k iterations, random 16-byte salt, self-describing stored format so the
  iteration count can be bumped later without invalidating existing hashes).
- **Content is always plain text.** Every file kind — doc, decision-tree, quiz —
  stores the *same* markdown-with-directive-blocks format (`CONTENT_FORMAT.md`).
  Diffing, storage, and the suggestion flow never need to know a file's kind; only
  the frontend's renderer registry cares. Adding a fourth kind is a new React
  component plus one registry entry, not a schema or API change.
- **Revisions are full snapshots, not stored patches.** Text compresses fine, every
  revision needs to be independently diffable/readable anyway, and reconstructing a
  revision from a patch chain would add complexity for no real benefit at this
  scale. Diffs are computed on demand (`app/diffing.py`).
- **Two ways to change a file, by design.** Owners/invited editors write revisions
  directly, with optimistic-concurrency checks (`parent_revision_id` must match
  current head, or `409`). Everyone else who can *view* a file can only propose a
  `suggestion` — a full-content diff against a specific revision — for an editor to
  accept/reject. Deliberately closer to a PR review than a wiki.
- **Embedding is a frontend-only feature.** A framed file renders a content-only
  view (see "Embedding a file on another site"), but nothing about permissions
  changes for it: `SameSite=Lax` makes a cross-site frame anonymous, so the
  existing public/private check is the whole story. No embed tokens, no per-site
  allowlist, no new endpoint.
- **Theme preference is browser-local, not account state.** Which palette you read
  in isn't something the server needs to know, and tying it to an account would
  mean an embed couldn't be themed at all — a framed file is an anonymous request
  (see "Dark mode").
- **CSRF tokens are HMAC-derived from the cookie they protect**, not randomly
  generated and stored server-side — no extra table, and a token is automatically
  scoped to exactly the session it came from.
- **SQLite via stdlib `sqlite3`**, one connection per thread + WAL mode. FastAPI
  routes are plain `def` (not `async def`) so Starlette runs them in a threadpool
  automatically — a deliberate alternative to `aiosqlite`, fine for this traffic
  pattern (short read/write bursts, not long-held connections).
- Not addressed (flag if you want these next): account recovery for a forgotten
  password (no email on file), pagination on file/revision lists, real-time
  collaboration (this is diff-and-review, not simultaneous editing), search across
  files/profiles, and image/asset uploads for use inside markdown.
