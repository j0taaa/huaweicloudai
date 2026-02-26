#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
SINGLE_FILE="$(mktemp /tmp/huaweicloudai-single-XXXXXX)"
LOG_FILE="/tmp/huaweicloudai-single.log"

bun run build:release >/dev/null

cleanup() {
  set +e
  pkill -f "$ROOT_DIR/dist/huaweicloudai|$ROOT_DIR/dist/rag-cpp-server|$ROOT_DIR/dist/ts-server|$SINGLE_FILE|next start" >/dev/null 2>&1 || true
  rm -f "$SINGLE_FILE" "$LOG_FILE"
  rm -rf /tmp/huaweicloudai-monolith-*
}
trap cleanup EXIT

cp "$ROOT_DIR/dist/huaweicloudai-single" "$SINGLE_FILE"
chmod +x "$SINGLE_FILE"

# Simulate a target host without Bun/Node installed in PATH.
PATH=/usr/bin:/bin PORT=3011 RAG_SERVER_PORT=8093 "$SINGLE_FILE" > "$LOG_FILE" 2>&1 &

for _ in {1..120}; do
  if curl -sf "http://127.0.0.1:3011/api/search-rag?action=schema" >/dev/null; then
    break
  fi
  sleep 1
done

# Regression check: compiled monolith must not require host `node`.
if rg -q "/usr/bin/env: .*node" "$LOG_FILE"; then
  echo "monolith attempted to execute host node runtime" >&2
  exit 1
fi

curl -sf "http://127.0.0.1:3011/api/search-rag?action=schema" | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (payload?.name !== "rag_search") process.exit(1);
'
curl -sf -X POST "http://127.0.0.1:3011/api/search-rag" -H 'content-type: application/json' -d '{"query":"where are EVS snapshots stored","top_k":3}' | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (payload?.error) process.exit(1);
if (!Array.isArray(payload?.results)) process.exit(1);
if (payload?.embeddingFallback === "embedding_unavailable") process.exit(1);
'

echo "single-file monolith launcher smoke test passed"
