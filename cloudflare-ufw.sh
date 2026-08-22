#!/usr/bin/env bash
#
# Restricts inbound 80/443 to Cloudflare's published IP ranges, so the VPS
# origin can't be reached by hitting its public IP directly (bypassing
# Cloudflare's proxy/CDN/DDoS protection). Meant to run on the VPS itself,
# after the base firewall setup from the deployment runbook (ssh + a plain
# `ufw allow 80/tcp` / `ufw allow 443/tcp`).
#
# Safe to re-run: every rule this script adds is tagged with the comment
# 'cloudflare-fw', and each run removes only its own previously-tagged
# rules before re-adding fresh ones from Cloudflare's current IP list — so
# reruns pick up range changes without piling up duplicates. It never
# touches ufw's default policy, SSH, or any other rule, and never disables
# or resets ufw, so there's no window where you could get locked out.
#
# Usage: sudo ./cloudflare-ufw.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo ./cloudflare-ufw.sh) — ufw needs it." >&2
  exit 1
fi

TAG="cloudflare-fw"

echo "### Fetching current Cloudflare IP ranges ###"
v4_ranges=$(curl -fsS https://www.cloudflare.com/ips-v4)
v6_ranges=$(curl -fsS https://www.cloudflare.com/ips-v6)

if [ -z "$v4_ranges" ] || [ -z "$v6_ranges" ]; then
  echo "Got an empty IP list from Cloudflare — aborting without touching the firewall." >&2
  exit 1
fi

echo "### Removing the old wide-open 80/443 rules, if present ###"
ufw --force delete allow 80/tcp >/dev/null 2>&1 || true
ufw --force delete allow 443/tcp >/dev/null 2>&1 || true

echo "### Removing this script's own rules from any previous run ###"
while true; do
  line=$(ufw status numbered | grep -F "$TAG" | tail -n1 || true)
  [ -z "$line" ] && break
  num=$(printf '%s\n' "$line" | sed -n 's/^\[[[:space:]]*\([0-9]\+\)\].*/\1/p')
  [ -z "$num" ] && break
  ufw --force delete "$num" >/dev/null
done

echo "### Allowing 80/443 from Cloudflare's ranges only ###"
while IFS= read -r cidr; do
  [ -z "$cidr" ] && continue
  ufw allow from "$cidr" to any port 80,443 proto tcp comment "$TAG" >/dev/null
done <<< "$v4_ranges
$v6_ranges"

echo "### Done. Current rules: ###"
ufw status verbose
