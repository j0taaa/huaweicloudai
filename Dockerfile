# syntax=docker/dockerfile:1
FROM debian:bookworm-slim AS runner
WORKDIR /app
ARG DIST_PATH=dist

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libstdc++6 \
    tar \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=80

COPY ${DIST_PATH}/huaweicloudai-single ./huaweicloudai-single
RUN chmod 0755 ./huaweicloudai-single

EXPOSE 80
CMD ["./huaweicloudai-single"]
