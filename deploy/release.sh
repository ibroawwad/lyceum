#!/usr/bin/env bash
# Deploy the Lyceum API to the droplet. Isolated: user `lyceum`, dir /srv/lyceum, container lyceum-api, its own nginx block.
# Usage: deploy/release.sh [host] [domain]   e.g. deploy/release.sh root@146.190.139.68 lyceum.example
set -euo pipefail
HOST="${1:-root@146.190.139.68}"; DOMAIN="${2:-}"
cd "$(dirname "$0")/.."
ssh "$HOST" 'id -u lyceum >/dev/null 2>&1 || useradd -r -m -d /srv/lyceum -s /usr/sbin/nologin lyceum; mkdir -p /srv/lyceum/app /srv/lyceum/app/data; chown -R lyceum:lyceum /srv/lyceum'
rsync -az --delete --exclude data --exclude .env server/ "$HOST:/srv/lyceum/app/"
ssh "$HOST" 'cd /srv/lyceum/app && [ -f .env ] || { cp .env.example .env; sed -i "s/^TOKEN_SECRET=.*/TOKEN_SECRET=$(openssl rand -hex 32)/" .env; echo "created /srv/lyceum/app/.env — fill OPENROUTER_API_KEY"; }; chown -R lyceum:lyceum /srv/lyceum; chown -R 1000:1000 /srv/lyceum/app/data; docker compose -f compose.yml up -d --build --remove-orphans && sleep 3 && curl -fsS http://127.0.0.1:4700/health'
if [ -n "$DOMAIN" ]; then
  sed "s/LYCEUM_DOMAIN/$DOMAIN/g" deploy/nginx-lyceum.conf | ssh "$HOST" 'cat > /etc/nginx/sites-available/lyceum && ln -sf /etc/nginx/sites-available/lyceum /etc/nginx/sites-enabled/lyceum && nginx -t && systemctl reload nginx'
  echo "nginx block installed for api.$DOMAIN and verify.$DOMAIN. When DNS points here, run:"
  echo "  ssh $HOST certbot --nginx -d api.$DOMAIN -d verify.$DOMAIN --redirect -m ibroawwad@gmail.com --agree-tos -n"
fi
