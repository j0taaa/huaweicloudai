# syntax=docker/dockerfile:1
FROM debian:bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libstdc++6 \
    tar \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY dist/huaweicloudai-single ./huaweicloudai-single
RUN chmod 0755 ./huaweicloudai-single

EXPOSE 3000
CMD ["./huaweicloudai-single"]
