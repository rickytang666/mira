#!/usr/bin/env bash
# Starts the app on the tunnel URLs saved by scripts/tunnels.sh, so CORS and the client's server URL match what phones use.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .tunnel-urls ]; then echo "run npm run tunnels first" >&2; exit 1; fi
source .tunnel-urls
exec wasp start --client-port 3002 --server-port 3003 --client-url "$CLIENT_URL" --server-url "$SERVER_URL"
