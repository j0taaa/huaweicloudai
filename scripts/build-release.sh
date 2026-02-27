#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

VARIANT="${HCAI_RELEASE_VARIANT:-no-license}"
OUTPUT_SUBDIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --variant)
      if [ $# -lt 2 ]; then
        echo "Missing value for --variant" >&2
        exit 1
      fi
      VARIANT="$2"
      shift 2
      ;;
    --variant=*)
      VARIANT="${1#*=}"
      shift
      ;;
    --out-subdir)
      if [ $# -lt 2 ]; then
        echo "Missing value for --out-subdir" >&2
        exit 1
      fi
      OUTPUT_SUBDIR="$2"
      shift 2
      ;;
    --out-subdir=*)
      OUTPUT_SUBDIR="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$VARIANT" in
  no-license|licensed)
    ;;
  *)
    echo "Unsupported variant: $VARIANT (expected: no-license, licensed)" >&2
    exit 1
    ;;
esac

if [ -n "$OUTPUT_SUBDIR" ]; then
  DIST_DIR="$ROOT_DIR/dist/$OUTPUT_SUBDIR"
else
  DIST_DIR="$ROOT_DIR/dist"
fi

if [ "$VARIANT" = "licensed" ]; then
  TS_ENTRY="scripts/ts-server-entry-licensed.ts"
else
  TS_ENTRY="scripts/ts-server-entry-unlicensed.ts"
fi

cd "$ROOT_DIR"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

bun install
bun run build

# Compile TS launcher executable with bun compile + minification
bun build --compile --minify "$TS_ENTRY" --outfile "$DIST_DIR/ts-server"

# Copy Next runtime assets needed by `next start`
cp -r .next "$DIST_DIR/.next"
cp -r public "$DIST_DIR/public"
cp package.json "$DIST_DIR/package.json"
cp -r node_modules "$DIST_DIR/node_modules"
cp -r chrome-extension "$DIST_DIR/chrome-extension"
cp -r rag_cache "$DIST_DIR/rag_cache"
rm -rf "$DIST_DIR/.next/dev" "$DIST_DIR/.next/build" "$DIST_DIR/.next/cache" "$DIST_DIR/.next/standalone"

# Prune common non-runtime sources from vendored modules.
find "$DIST_DIR/node_modules" -type d \
  \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name doc -o -name example -o -name examples -o -name benchmark -o -name benchmarks -o -name .github \) \
  -prune -exec rm -rf {} +
find "$DIST_DIR/node_modules" -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.map' -o -name '*.md' \) \
  -delete

# Remove source maps and sourceMappingURL comments to reduce source leakage.
find "$DIST_DIR/.next" -type f -name '*.map' -delete
bun -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const stack = [root];

while (stack.length) {
  const current = stack.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      stack.push(fullPath);
      continue;
    }
    if (!/\.(c?m?js)$/.test(entry.name)) continue;
    const original = fs.readFileSync(fullPath, "utf8");
    const stripped = original
      .replace(/\/\/[#@]\s*sourceMappingURL=.*$/gm, "")
      .replace(/\/\*# sourceMappingURL=.*?\*\//g, "");
    if (stripped !== original) {
      fs.writeFileSync(fullPath, stripped);
    }
  }
}
' "$DIST_DIR/.next"

# Bun-compiled executables cannot resolve bare package specifiers via dynamic
# import in Turbopack runtime. Rewrite it to use our runtime resolver hook.
TURBOPACK_RUNTIME="$DIST_DIR/.next/server/chunks/[turbopack]_runtime.js"
if [ -f "$TURBOPACK_RUNTIME" ]; then
  bun -e '
const fs = require("fs");
const runtimePath = process.argv[1];
const source = fs.readFileSync(runtimePath, "utf8");

const replacements = [
  [
    "raw = await import(id);",
    "raw = await import(globalThis.__HCAI_RESOLVE_EXTERNAL_ID__ ? globalThis.__HCAI_RESOLVE_EXTERNAL_ID__(id) : id);",
  ],
  [
    "t=await import(e)",
    "t=await import(globalThis.__HCAI_RESOLVE_EXTERNAL_ID__?globalThis.__HCAI_RESOLVE_EXTERNAL_ID__(e):e)",
  ],
];

let patched = source;
let changed = false;
for (const [needle, replacement] of replacements) {
  if (patched.includes(needle)) {
    patched = patched.replace(needle, replacement);
    changed = true;
  }
}

if (!changed) {
  throw new Error("Could not patch Turbopack runtime import path");
}

fs.writeFileSync(runtimePath, patched);
' "$TURBOPACK_RUNTIME"
fi

# Minify shipped JS payload files before sealing monolithic artifact.
# Set HCAI_SKIP_JS_MINIFY=1 to skip this step when prioritizing build speed
# or when debugging runtime issues potentially introduced by minification.
if [ "${HCAI_SKIP_JS_MINIFY:-0}" != "1" ]; then
bun -e '
const fs = require("fs");
const path = require("path");
const { minify } = require("next/dist/compiled/terser");

const distRoot = process.argv[1];
const roots = [
  path.join(distRoot, ".next"),
  path.join(distRoot, "node_modules"),
  path.join(distRoot, "chrome-extension"),
];
const exts = new Set([".js", ".cjs", ".mjs"]);
const minifiedSuffixes = [".min.js", ".min.cjs", ".min.mjs"];
const skipDirNames = new Set([
  "test",
  "tests",
  "__tests__",
  "docs",
  "doc",
  "example",
  "examples",
  "benchmark",
  "benchmarks",
]);

function walkFiles(rootDir, out) {
  if (!fs.existsSync(rootDir)) return;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirNames.has(entry.name)) continue;
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
}

async function minifyFile(filePath) {
  const ext = path.extname(filePath);
  if (!exts.has(ext)) return false;
  if (minifiedSuffixes.some((suffix) => filePath.endsWith(suffix))) return false;
  // Avoid touching Next server runtime artifacts. Over-minification here can
  // break Turbopack chunk loading in the compiled launcher.
  if (filePath.includes("/.next/server/")) return false;

  const original = fs.readFileSync(filePath, "utf8");
  if (!original.trim()) return false;

  let shebang = "";
  let source = original;
  if (source.startsWith("#!")) {
    const newline = source.indexOf("\n");
    if (newline === -1) return false;
    shebang = source.slice(0, newline + 1);
    source = source.slice(newline + 1);
    if (!source.trim()) return false;
  }

  const parseModes = ext === ".mjs" ? [true] : [false, true];
  let lastError;
  for (const moduleMode of parseModes) {
    try {
      const result = await minify(source, {
        compress: true,
        mangle: true,
        module: moduleMode,
        ecma: 2020,
        format: { comments: false },
      });
      if (typeof result.code !== "string") {
        throw new Error("No code emitted");
      }
      fs.writeFileSync(filePath, `${shebang}${result.code}`);
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Minification failed");
}

(async () => {
  const files = [];
  for (const root of roots) walkFiles(root, files);

  let minifiedCount = 0;
  let skippedCount = 0;
  for (const file of files) {
    try {
      if (await minifyFile(file)) minifiedCount += 1;
    } catch (error) {
      skippedCount += 1;
    }
  }

  console.log(`Minified ${minifiedCount} JS payload files (skipped ${skippedCount})`);
})();
' "$DIST_DIR"
else
  echo "Skipping JS payload minification (HCAI_SKIP_JS_MINIFY=1)"
fi

# Work around Bun compiled-runtime ESM resolver failing to locate bare
# third-party imports from @xenova/transformers internals.
XENOVA_ROOT="$DIST_DIR/node_modules/@xenova/transformers"
NODE_MODULES_ROOT="$DIST_DIR/node_modules"
if [ -d "$XENOVA_ROOT" ] && [ -d "$NODE_MODULES_ROOT" ]; then
  bun - "$XENOVA_ROOT" "$NODE_MODULES_ROOT" <<'BUN'
const fs = require("fs");
const path = require("path");

const xenovaRoot = process.argv[2];
const nodeModulesRoot = process.argv[3];
const files = [];
const stack = [xenovaRoot];
const packageJsonCache = new Map();
const dependencySpecifiers = [
  "@huggingface/jinja",
  "sharp",
  "onnxruntime-web",
  "onnxruntime-node",
];

function splitPackageSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name, ...rest] = specifier.split("/");
    return { packageName: `${scope}/${name ?? ""}`, subpath: rest.join("/") };
  }
  const [name, ...rest] = specifier.split("/");
  return { packageName: name ?? "", subpath: rest.join("/") };
}

function readPackageJson(packageDir) {
  const cached = packageJsonCache.get(packageDir);
  if (cached !== undefined) return cached;

  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    packageJsonCache.set(packageDir, null);
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    packageJsonCache.set(packageDir, parsed);
    return parsed;
  } catch {
    packageJsonCache.set(packageDir, null);
    return null;
  }
}

function selectConditionalExportTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  for (const key of ["import", "default", "module", "require", "node", "bun"]) {
    const selected = selectConditionalExportTarget(value[key]);
    if (selected) return selected;
  }

  for (const nested of Object.values(value)) {
    const selected = selectConditionalExportTarget(nested);
    if (selected) return selected;
  }

  return undefined;
}

function resolveFileOrDirectory(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) return basePath;

  for (const ext of [".js", ".mjs", ".cjs", ".json"]) {
    const candidate = `${basePath}${ext}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) return undefined;

  const pkg = readPackageJson(basePath);
  if (pkg?.exports) {
    const target = selectConditionalExportTarget(pkg.exports["."] ?? pkg.exports);
    if (target && target.startsWith(".")) {
      const resolved = resolveFileOrDirectory(path.resolve(basePath, target));
      if (resolved) return resolved;
    }
  }

  if (typeof pkg?.module === "string") {
    const resolved = resolveFileOrDirectory(path.resolve(basePath, pkg.module));
    if (resolved) return resolved;
  }
  if (typeof pkg?.main === "string") {
    const resolved = resolveFileOrDirectory(path.resolve(basePath, pkg.main));
    if (resolved) return resolved;
  }

  for (const indexFile of ["index.js", "index.mjs", "index.cjs", "index.json"]) {
    const candidate = path.join(basePath, indexFile);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }

  return undefined;
}

function resolvePackageEntry(specifier) {
  const { packageName, subpath } = splitPackageSpecifier(specifier);
  if (!packageName) return null;

  const packageDir = path.join(nodeModulesRoot, packageName);
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) return null;

  const pkg = readPackageJson(packageDir);
  const subpathKey = subpath ? `./${subpath}` : ".";
  const targetFromExports =
    pkg?.exports && typeof pkg.exports === "object"
      ? selectConditionalExportTarget(pkg.exports[subpathKey])
      : !subpath
        ? selectConditionalExportTarget(pkg?.exports)
        : undefined;

  if (targetFromExports && targetFromExports.startsWith(".")) {
    const resolved = resolveFileOrDirectory(path.resolve(packageDir, targetFromExports));
    if (resolved) return resolved;
  }

  if (subpath) {
    return resolveFileOrDirectory(path.join(packageDir, subpath)) ?? null;
  }

  return resolveFileOrDirectory(packageDir) ?? null;
}

const resolvedSpecifiers = new Map();
for (const specifier of dependencySpecifiers) {
  const entry = resolvePackageEntry(specifier);
  if (entry) resolvedSpecifiers.set(specifier, entry);
}

if (resolvedSpecifiers.size === 0) {
  throw new Error("Could not resolve any dependency entrypoints for @xenova/transformers rewrite");
}

while (stack.length) {
  const current = stack.pop();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      stack.push(fullPath);
      continue;
    }
    if (!entry.isFile() || !/\.(c?m?js)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
}

let rewritten = 0;
for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  let next = source;

  for (const [specifier, entryPath] of resolvedSpecifiers.entries()) {
    if (!next.includes(specifier)) continue;
    const relPath = path
      .relative(path.dirname(filePath), entryPath)
      .split(path.sep)
      .join("/");
    next = next
      .replaceAll(`"${specifier}"`, `"${relPath}"`)
      .replaceAll(`'${specifier}'`, `'${relPath}'`);
  }

  if (next !== source) {
    rewritten += 1;
    fs.writeFileSync(filePath, next);
  }
}

if (rewritten === 0) {
  throw new Error("Could not rewrite @xenova/transformers bare dependency imports");
}
BUN
fi

cmake -S rag-cpp-server -B rag-cpp-server/build -DCMAKE_BUILD_TYPE=Release
cmake --build rag-cpp-server/build -j
cp rag-cpp-server/build/rag-cpp-server "$DIST_DIR/rag-cpp-server"

cmake -S launcher -B launcher/build -DCMAKE_BUILD_TYPE=Release
cmake --build launcher/build -j
cp launcher/build/huaweicloudai "$DIST_DIR/huaweicloudai"

# Build monolith stub and append compressed dist payload
cmake -S monolith -B monolith/build -DCMAKE_BUILD_TYPE=Release
cmake --build monolith/build -j

if command -v strip >/dev/null 2>&1; then
  strip --strip-unneeded "$DIST_DIR/rag-cpp-server" "$DIST_DIR/huaweicloudai" monolith/build/huaweicloudai-monolith || true
fi

export PAYLOAD_TAR="$(mktemp /tmp/huaweicloudai-payload-XXXXXX.tar.gz)"
export HCAI_DIST_DIR="$DIST_DIR"
tar -C "$DIST_DIR" -czf "$PAYLOAD_TAR" .
bun -e '
const fs = require("fs");
const crypto = require("crypto");

const MAGIC = Buffer.from([0x6a, 0xc1, 0x53, 0x8f, 0x2d, 0xb7, 0x44, 0xe9]);
const DEFAULT_KEY = Buffer.from([
  0x91, 0x2f, 0xd7, 0x4a, 0x83, 0xbc, 0x55, 0x19,
  0xe0, 0x6d, 0x33, 0xfa, 0x08, 0xc4, 0x72, 0xae,
]);
const MASK = 0xffffffffffffffffn;

function splitmix64(state) {
  state = (state + 0x9e3779b97f4a7c15n) & MASK;
  let z = state;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return [state, (z ^ (z >> 31n)) & MASK];
}

function resolveKey() {
  const keyHex = process.env.HCAI_MONOLITH_KEY || "";
  if (/^[0-9a-fA-F]{32}$/.test(keyHex)) {
    return Buffer.from(keyHex, "hex");
  }
  return DEFAULT_KEY;
}

function computeAuthTag(payload, nonce, key) {
  let a = 0x9f8b7c6d5e4f3021n;
  let b = 0x1023456789abcdefn;
  a = fnv1a64([key, nonce, Buffer.from("auth-v1"), payload], a);
  b = fnv1a64([key, nonce, Buffer.from("auth-v2"), payload], b);
  const out = Buffer.alloc(16);
  out.writeBigUInt64LE(a, 0);
  out.writeBigUInt64LE(b, 8);
  return out;
}

function fnv1a64(chunks, seed = 0xcbf29ce484222325n) {
  let hash = seed;
  for (const chunk of chunks) {
    for (const byte of chunk) {
      hash ^= BigInt(byte);
      hash = (hash * 0x100000001b3n) & MASK;
    }
  }
  return hash;
}

const stub = fs.readFileSync("monolith/build/huaweicloudai-monolith");
const payload = fs.readFileSync(process.env.PAYLOAD_TAR);
const nonce = crypto.randomBytes(16);
const key = resolveKey();
const encryptedPayload = Buffer.from(payload);

let state = fnv1a64([key, nonce, Buffer.from("v1")]);
let keystream = 0n;
let streamIndex = 8;
for (let i = 0; i < encryptedPayload.length; i += 1) {
  if (streamIndex === 8) {
    [state, keystream] = splitmix64(state);
    streamIndex = 0;
  }
  const maskByte = Number((keystream >> BigInt(streamIndex * 8)) & 0xffn);
  encryptedPayload[i] ^= maskByte;
  streamIndex += 1;
}

const authTag = computeAuthTag(encryptedPayload, nonce, key);
const footer = Buffer.alloc(48);
footer.writeBigUInt64LE(BigInt(encryptedPayload.length), 0);
nonce.copy(footer, 8);
authTag.copy(footer, 24);
MAGIC.copy(footer, 40);

const out = Buffer.concat([stub, encryptedPayload, footer]);
fs.writeFileSync(`${process.env.HCAI_DIST_DIR}/huaweicloudai-single`, out);
'
rm -f "$PAYLOAD_TAR"

chmod +x "$DIST_DIR/ts-server" "$DIST_DIR/rag-cpp-server" "$DIST_DIR/huaweicloudai" "$DIST_DIR/huaweicloudai-single"

echo "Release artifacts ready in $DIST_DIR"
