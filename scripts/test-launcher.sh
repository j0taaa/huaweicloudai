#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

bun run build:release >/dev/null

cleanup() {
  set +e
  pkill -f "$ROOT_DIR/dist/huaweicloudai|$ROOT_DIR/dist/rag-cpp-server|$ROOT_DIR/dist/ts-server|/tmp/huaweicloudai-single|next start" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cp "$ROOT_DIR/dist/huaweicloudai-single" /tmp/huaweicloudai-single
chmod +x /tmp/huaweicloudai-single

PORT=3011 RAG_SERVER_PORT=8093 /tmp/huaweicloudai-single > /tmp/huaweicloudai-single.log 2>&1 &

for _ in {1..120}; do
  if curl -sf "http://127.0.0.1:3011/api/search-rag?action=schema" >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf "http://127.0.0.1:3011/api/search-rag?action=schema" | jq '.name' | grep 'rag_search' >/dev/null
curl -sf -X POST "http://127.0.0.1:3011/api/search-rag" -H 'content-type: application/json' -d '{"query":"where are EVS snapshots stored","top_k":3}' | jq '.results[0].product' | grep 'EVS' >/dev/null

echo "single-file monolith launcher smoke test passed"
