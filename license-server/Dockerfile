FROM oven/bun:1.2.22
WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80
CMD ["bun", "run", "src/server.mjs"]
