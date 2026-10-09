.DEFAULT_GOAL := dev
SHELL := /bin/bash

.PHONY: setup dev check

setup:
	uv sync --locked
	npm --prefix frontend ci

dev: setup
	@set -m; \
	uv run --no-sync run.py & backend=$$!; \
	npm --prefix frontend run dev & frontend=$$!; \
	trap 'kill -- -$$backend -$$frontend 2>/dev/null || true; wait' EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	wait -n $$backend $$frontend

check: setup
	uv run --no-sync pytest tests/ -v
	cd frontend && npx --no-install vitest run
	npm --prefix frontend run lint
	npm --prefix frontend run build
