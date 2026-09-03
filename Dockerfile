FROM oven/bun:1-slim AS build
WORKDIR /app
ARG VITE_REVENUECAT_WEB_API_KEY
ENV VITE_REVENUECAT_WEB_API_KEY=${VITE_REVENUECAT_WEB_API_KEY}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim AS production
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=build /app/.output ./.output
COPY migrations ./migrations
COPY scripts/migrate.mjs scripts/migration-plan.mjs scripts/sync-worker.mjs ./scripts/

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "bun scripts/migrate.mjs && exec bun .output/server/index.mjs"]
