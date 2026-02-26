#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  set +e
  [[ -n "${TS_PID:-}" ]] && kill "$TS_PID" >/dev/null 2>&1
  [[ -n "${RAG_PID:-}" ]] && kill "$RAG_PID" >/dev/null 2>&1
}
trap cleanup EXIT

cmake -S rag-cpp-server -B rag-cpp-server/build >/dev/null
cmake --build rag-cpp-server/build -j >/dev/null

RAG_SERVER_PORT=8088 RAG_CACHE_DIR="$ROOT_DIR/rag_cache" ./rag-cpp-server/build/rag-cpp-server > /tmp/rag.log 2>&1 &
RAG_PID=$!

for _ in {1..30}; do
  if curl -sf "http://127.0.0.1:8088/health" >/dev/null; then
    break
  fi
  sleep 1
done

bun run build >/dev/null
RAG_SERVER_URL="http://127.0.0.1:8088" PORT=3000 bun run start > /tmp/ts.log 2>&1 &
TS_PID=$!

for _ in {1..30}; do
  if curl -sf "http://127.0.0.1:3000/api/search-rag" >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf "http://127.0.0.1:8088/health" | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (payload?.ready !== true) process.exit(1);
'
curl -sf "http://127.0.0.1:8088/schema" | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (payload?.name !== "rag_search") process.exit(1);
'
curl -sf -X POST "http://127.0.0.1:8088/search" -H 'content-type: application/json' -d '{"query":"ECS instance","top_k":2}' | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (!Array.isArray(payload?.results)) process.exit(1);
'
curl -sf -X POST "http://127.0.0.1:3000/api/search-rag" -H 'content-type: application/json' -d '{"query":"ECS instance","top_k":2}' | bun -e '
const payload = JSON.parse(await Bun.stdin.text());
if (!Array.isArray(payload?.results)) process.exit(1);
'

echo "e2e checks passed"
