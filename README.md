# skdoctool

A markdown wiki with accounts, revision history, decision trees, and quizzes.

## Quick start

Requires Make, Bash 4.3+, uv, and Node.js 22 (22.22.2+) or 24 (24.15+).

```sh
make
```

Installs dependencies and starts the API and frontend. Open
[localhost:5173/register](http://localhost:5173/register) to create an account.
Press Ctrl+C to stop both servers.

- `make setup` — install dependencies only.
- `make dev` — same as `make`.
- `make check` — run tests, lint, and the production build.

See [CONTENT_FORMAT.md](CONTENT_FORMAT.md) for content syntax and
[app/config.py](app/config.py) for environment settings.

## Deploy

Requires Docker Compose and a domain pointing to the server (ports 80/443 open).

```sh
export DOMAIN=example.com EMAIL=you@example.com SSHAUTH_SECRET='replace-with-a-stable-random-secret'
./init-letsencrypt.sh
docker compose up -d --build
```

Bootstrap the certificate once; Compose handles renewal and persistent storage.
