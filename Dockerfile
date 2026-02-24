# syntax=docker/dockerfile:1
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json package-lock.json* bun.lock* ./
RUN bun install

FROM deps AS builder
WORKDIR /app
COPY . .
RUN bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/chrome-extension ./chrome-extension
COPY --from=builder /app/app ./app
COPY --from=builder /app/rag_cache ./rag_cache
EXPOSE 3000
CMD ["bun", "run", "start"]
