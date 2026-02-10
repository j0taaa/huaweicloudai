# syntax=docker/dockerfile:1
FROM node:20 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20 AS runner
WORKDIR /app

# Install Python and pip for scripts that require Python dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY scraper/scripts/requirements.txt ./scraper/scripts/
RUN pip3 install --break-system-packages -r scraper/scripts/requirements.txt || pip3 install -r scraper/scripts/requirements.txt

ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/chrome-extension ./chrome-extension
COPY --from=builder /app/app ./app
COPY --from=builder /app/rag_cache ./rag_cache
COPY --from=builder /app/scraper ./scraper
COPY --from=builder /app/scripts ./scripts
EXPOSE 3000
CMD ["npm", "start"]
