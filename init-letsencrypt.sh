#!/usr/bin/env bash
#
# One-time bootstrap to get the *first* Let's Encrypt cert for $DOMAIN.
#
# Why this exists: nginx's 443 server block (nginx/templates/default.conf.template)
# points at /etc/letsencrypt/live/$DOMAIN/{fullchain,privkey}.pem, so nginx
# refuses to start at all if those files don't exist yet — but Let's Encrypt's
# HTTP-01 challenge needs nginx running (on port 80) to serve the challenge
# file in the first place. This script breaks that chicken-and-egg problem by
# writing a throwaway self-signed cert at that path first so nginx can boot,
# then swapping it for a real one.
#
# After this runs once, the `certbot` service in docker-compose.yml keeps the
# real cert renewed on its own — you don't need to run this again unless the
# certbot-etc volume is wiped.
#
# Usage:
#   DOMAIN=example.com EMAIL=you@example.com ./init-letsencrypt.sh
#   DOMAIN=example.com EMAIL=you@example.com STAGING=1 ./init-letsencrypt.sh   # test run first

set -euo pipefail

: "${DOMAIN:?set DOMAIN=your.public.hostname}"
: "${EMAIL:?set EMAIL=you@example.com (used for expiry notices)}"
STAGING="${STAGING:-0}"

echo "### Writing a dummy cert for $DOMAIN so nginx can start ###"
docker compose run --rm --entrypoint sh certbot -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out    /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=$DOMAIN'
"

echo "### Starting nginx ###"
docker compose up -d nginx

echo "### Deleting the dummy cert ###"
docker compose run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"

staging_flag=""
[ "$STAGING" != "0" ] && staging_flag="--staging"

echo "### Requesting a real cert from Let's Encrypt for $DOMAIN ###"
docker compose run --rm --entrypoint certbot certbot \
  certonly --webroot -w /var/www/certbot \
  $staging_flag \
  --email "$EMAIL" -d "$DOMAIN" \
  --rsa-key-size 2048 --agree-tos --non-interactive

echo "### Reloading nginx with the real cert ###"
docker compose exec nginx nginx -s reload

echo "Done. The certbot service will keep this renewed automatically from here on."
