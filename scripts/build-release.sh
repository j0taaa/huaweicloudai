#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

cd "$ROOT_DIR"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun install
bun run build

# Compile TS launcher executable with bun compile + minification
bun build --compile --minify scripts/ts-server-entry.ts --outfile "$DIST_DIR/ts-server"

# Copy Next runtime assets needed by `next start`
cp -r .next "$DIST_DIR/.next"
cp -r public "$DIST_DIR/public"
cp package.json "$DIST_DIR/package.json"
cp -r node_modules "$DIST_DIR/node_modules"
cp -r chrome-extension "$DIST_DIR/chrome-extension"
cp -r rag_cache "$DIST_DIR/rag_cache"

# Bun-compiled executables cannot resolve bare package specifiers via dynamic
# import in Turbopack runtime. Rewrite it to use our runtime resolver hook.
TURBOPACK_RUNTIME="$DIST_DIR/.next/server/chunks/[turbopack]_runtime.js"
if [ -f "$TURBOPACK_RUNTIME" ]; then
  bun -e '
const fs = require("fs");
const runtimePath = process.argv[1];
const needle = "raw = await import(id);";
const replacement = "raw = await import(globalThis.__HCAI_RESOLVE_EXTERNAL_ID__ ? globalThis.__HCAI_RESOLVE_EXTERNAL_ID__(id) : id);";
const source = fs.readFileSync(runtimePath, "utf8");
if (!source.includes(needle)) {
  throw new Error("Could not patch Turbopack runtime import path");
}
fs.writeFileSync(runtimePath, source.replace(needle, replacement));
' "$TURBOPACK_RUNTIME"
fi

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
bun -e '
const fs = require("fs");

const stub = fs.readFileSync("monolith/build/huaweicloudai-monolith");
const payload = fs.readFileSync(process.env.PAYLOAD_TAR);
const footer = Buffer.alloc(16);
footer.writeBigUInt64LE(BigInt(payload.length), 0);
footer.write("HCAIMONO", 8, "ascii");

const out = Buffer.concat([stub, payload, footer]);
fs.writeFileSync("dist/huaweicloudai-single", out);
'
rm -f "$PAYLOAD_TAR"

chmod +x "$DIST_DIR/ts-server" "$DIST_DIR/rag-cpp-server" "$DIST_DIR/huaweicloudai" "$DIST_DIR/huaweicloudai-single"

echo "Release artifacts ready in $DIST_DIR"
