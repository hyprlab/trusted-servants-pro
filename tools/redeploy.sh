#!/usr/bin/env bash
# Rebuild the local container from the working tree and restart it, so a
# change can be tried in the running app. docker-compose.yml has no bind-mount
# for app/, so an edit is invisible on :8090 until this runs. It publishes
# nothing.
#
#   tools/redeploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --build
port=$(docker compose port tsp 8000 | cut -d: -f2)
for _ in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/tspro/auth/login" || true)
    if [ "$code" = 200 ] || [ "$code" = 302 ]; then
        version=$(docker compose exec -T tsp python -c 'from app.version import __version__; print(__version__)' 2>/dev/null || echo "?")
        echo "Up: http://localhost:$port (version $version)"
        exit 0
    fi
    sleep 1
done
echo "The container did not come up. Logs:" >&2
docker compose logs --tail 40 >&2
exit 1
