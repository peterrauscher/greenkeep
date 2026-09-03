FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_REVENUECAT_WEB_API_KEY
ENV VITE_REVENUECAT_WEB_API_KEY=${VITE_REVENUECAT_WEB_API_KEY}

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps && npm cache clean --force

COPY --from=build /app/.output ./.output
COPY migrations ./migrations
COPY scripts/migrate.mjs scripts/migration-plan.mjs scripts/sync-worker.mjs ./scripts/

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node .output/server/index.mjs"]
