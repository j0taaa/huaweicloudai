#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${RAG_SERVER_PORT:-8091}"

cleanup() {
  set +e
  [[ -n "${RPID:-}" ]] && kill "$RPID" >/dev/null 2>&1
}
trap cleanup EXIT

cmake -S rag-cpp-server -B rag-cpp-server/build >/dev/null
cmake --build rag-cpp-server/build -j >/dev/null

RAG_SERVER_PORT="$PORT" RAG_CACHE_DIR="$ROOT_DIR/rag_cache" ./rag-cpp-server/build/rag-cpp-server >/tmp/rag-relevance.log 2>&1 &
RPID=$!

for _ in {1..120}; do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done

bun -e '
import { pipeline } from "@xenova/transformers";
const port = process.env.RAG_SERVER_PORT ?? "8091";
const cases = [
  ["how to create an ECS instance", "ECS"],
  ["how to upload files to OBS bucket", "OBS"],
  ["VPC peering connection bandwidth limits", "VPC"],
  ["RDS MySQL backup and restore", "RDS"],
  ["CreateServer API vpc parameters", "VPC"],
];
const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
let pass = 0;
for (const [query, expected] of cases) {
  const out = await pipe([query.slice(0, 2000)], { pooling: "mean", normalize: true });
  const embedding = Array.from(out[0].data);
  const res = await fetch(`http://127.0.0.1:${port}/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, top_k: 3, embedding }),
  });
  if (!res.ok) throw new Error(`search failed for ${query}: HTTP ${res.status}`);
  const payload = await res.json();
  const products = (payload.results ?? []).slice(0, 3).map((r) => String(r.product ?? ""));
  const ok = products.includes(expected);
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}\t${query}\t=>\t${products.join(",")}`);
}
console.log(`SUMMARY ${pass}/${cases.length}`);
if (pass !== cases.length) process.exit(1);
'
