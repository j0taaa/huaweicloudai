This project is a Next.js app (TS server) plus a separate C++ RAG backend.

## Architecture

- TS server (Next.js) handles API/UI orchestration.
- C++ server handles RAG retrieval against `rag_cache/documents.json(.gz)`.
- `/api/search-rag` in TS proxies to C++ server via `RAG_SERVER_URL`.

## Local development

```bash
bun install
cmake -S rag-cpp-server -B rag-cpp-server/build
cmake --build rag-cpp-server/build -j
RAG_SERVER_PORT=8088 ./rag-cpp-server/build/rag-cpp-server
```

In another terminal:

```bash
RAG_SERVER_URL=http://127.0.0.1:8088 bun run dev
```

## Build executables

Build the TS executable (Bun compile path), C++ RAG executable, and launcher executable:

```bash
bun run build:release
```

Artifacts are written to `dist/`:

- `dist/ts-server`
- `dist/rag-cpp-server`
- `dist/huaweicloudai` (multi-file launcher that starts both)
- `dist/huaweicloudai-single` (monolithic single-file binary)

Build explicit variants:

```bash
# no license enforcement (for local testing)
bun run build:release:no-license

# license enforcement enabled by default
bun run build:release:licensed
```

Variant artifacts are written to:

- `dist/no-license/`
- `dist/licensed/`

Run combined launcher (multi-file):

```bash
cd dist
./huaweicloudai
```

Run monolithic single-file binary from anywhere:

```bash
cp dist/huaweicloudai-single /tmp/huaweicloudai-single
chmod +x /tmp/huaweicloudai-single
PORT=80 /tmp/huaweicloudai-single
```

## License system

The license authority is a standalone service in [`license-server/`](./license-server).

Run it locally:

```bash
bun run license-server:dev
```

When running in `client` mode with `LICENSE_ENFORCEMENT=required`, the server:

- Generates and persists a machine UUID.
- Registers itself with the hardcoded authority URL: `https://license.hwctools.site`.
- Sends heartbeat checks every hour.
- Keeps working for up to 72h without authority responses (`LICENSE_GRACE_PERIOD_MS` controls this).
- Requires a signed license token from authority (Ed25519 signature verified with pinned public key in client).

Subserver UUID/status page:

- `GET /license`

License authority endpoints (on the standalone `license-server`):

- `POST /api/license/register`
- `POST /api/license/heartbeat`

Optional shared secret between client and authority:

- `LICENSE_SHARED_SECRET` (sent via `x-license-secret` header)

Authority signing key configuration (required in `license-server`):

- `LICENSE_SIGNING_PRIVATE_KEY_PEM`
- or `LICENSE_SIGNING_PRIVATE_KEY_PATH`

Optional token TTL for signed responses:

- `LICENSE_TOKEN_TTL_MS` (default: 2 hours)

License server admin UI for approve/deny/rename:

- `GET /` on the standalone `license-server` container

## Docker image variant selection

Build from whichever artifacts you generated:

```bash
# default dist/
docker build -t huaweicloudai:default .

# license-enabled variant
docker build --build-arg DIST_PATH=dist/licensed -t huaweicloudai:licensed .
```

Default runtime port inside container is `80` (`EXPOSE 80`, `PORT=80`).

## Tests

End-to-end dual-service smoke test:

```bash
bun run test:e2e
```

RAG relevance check over representative Huawei Cloud queries:

```bash
bun run test:rag
```


Monolithic single-file executable smoke test:

```bash
bun run test:launcher
```
