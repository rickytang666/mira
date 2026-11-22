#!/usr/bin/env bash
# Opens HTTPS tunnels to the client (3002) and server (3003) so phones can use the mic, and saves their URLs to .tunnel-urls.
# Keep it running in its own terminal: a restart gives new URLs and breaks printed QR codes. Then run `npm run dev:tunnel`.
set -euo pipefail
cd "$(dirname "$0")/.."
LOG_DIR="${TMPDIR:-/tmp}/fieldwork-tunnels"
mkdir -p "$LOG_DIR"

start_tunnel() { cloudflared tunnel --no-autoupdate --url "http://localhost:$1" > "$LOG_DIR/$1.log" 2>&1 & }
tunnel_url() {
  for _ in $(seq 1 60); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_DIR/$1.log" | head -1 || true)
    if [ -n "$url" ]; then echo "$url"; return; fi
    sleep 1
  done
  echo "no tunnel URL for port $1, see $LOG_DIR/$1.log" >&2
  exit 1
}

start_tunnel 3002
start_tunnel 3003
CLIENT_URL=$(tunnel_url 3002)
SERVER_URL=$(tunnel_url 3003)
printf 'CLIENT_URL=%s\nSERVER_URL=%s\n' "$CLIENT_URL" "$SERVER_URL" > .tunnel-urls
echo "client: $CLIENT_URL"
echo "server: $SERVER_URL"
echo "now run npm run dev:tunnel in another terminal and open the client URL"
wait
