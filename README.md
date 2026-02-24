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

Run combined launcher (multi-file):

```bash
cd dist
./huaweicloudai
```

Run monolithic single-file binary from anywhere:

```bash
cp dist/huaweicloudai-single /tmp/huaweicloudai-single
chmod +x /tmp/huaweicloudai-single
PORT=3000 /tmp/huaweicloudai-single
```

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
