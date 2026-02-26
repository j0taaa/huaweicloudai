# HuaweiCloudAI License Server

Standalone authority service for subserver licensing.

- Admin UI: `GET /`
- License register endpoint: `POST /api/license/register`
- License heartbeat endpoint: `POST /api/license/heartbeat`
- Health check: `GET /health`

## Run locally

```bash
cd license-server
bun run dev
```

## Required environment

- `LICENSE_SIGNING_PRIVATE_KEY_PEM` or `LICENSE_SIGNING_PRIVATE_KEY_PATH`

## Optional environment

- `PORT` (default `80`)
- `HOST` (default `0.0.0.0`)
- `LICENSE_DB_PATH` (default `./license.db`)
- `LICENSE_ADMIN_PASSWORD` (default `admin123`)
- `LICENSE_SHARED_SECRET`
- `LICENSE_TOKEN_TTL_MS` (default `7200000`)

## Docker

```bash
cd license-server
docker build -t hwc-license-server .
docker run --rm -p 8080:80 \
  -e LICENSE_ADMIN_PASSWORD='change-me' \
  -e LICENSE_SIGNING_PRIVATE_KEY_PEM='-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----' \
  hwc-license-server
```
