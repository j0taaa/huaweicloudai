#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

cd "$ROOT_DIR"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun install
bun run build

# Compile TS launcher executable with bun compile
bun build --compile scripts/ts-server-entry.ts --outfile "$DIST_DIR/ts-server"

# Copy Next runtime assets needed by `next start`
cp -r .next "$DIST_DIR/.next"
cp -r public "$DIST_DIR/public"
cp package.json "$DIST_DIR/package.json"
cp -r node_modules "$DIST_DIR/node_modules"
cp -r app "$DIST_DIR/app"
cp -r chrome-extension "$DIST_DIR/chrome-extension"
cp -r rag_cache "$DIST_DIR/rag_cache"

cmake -S rag-cpp-server -B rag-cpp-server/build
cmake --build rag-cpp-server/build -j
cp rag-cpp-server/build/rag-cpp-server "$DIST_DIR/rag-cpp-server"

cmake -S launcher -B launcher/build
cmake --build launcher/build -j
cp launcher/build/huaweicloudai "$DIST_DIR/huaweicloudai"

# Build monolith stub and append compressed dist payload
cmake -S monolith -B monolith/build
cmake --build monolith/build -j

export PAYLOAD_TAR="$(mktemp /tmp/huaweicloudai-payload-XXXXXX.tar.gz)"
tar -C "$DIST_DIR" -czf "$PAYLOAD_TAR" .
python - <<'PY'
from pathlib import Path
import struct
import os

stub = Path('monolith/build/huaweicloudai-monolith').read_bytes()
payload = Path(os.environ['PAYLOAD_TAR']).read_bytes()
footer = struct.pack('<Q8s', len(payload), b'HCAIMONO')
out = Path('dist/huaweicloudai-single')
out.write_bytes(stub + payload + footer)
PY
rm -f "$PAYLOAD_TAR"

chmod +x "$DIST_DIR/ts-server" "$DIST_DIR/rag-cpp-server" "$DIST_DIR/huaweicloudai" "$DIST_DIR/huaweicloudai-single"

echo "Release artifacts ready in $DIST_DIR"
