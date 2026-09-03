# Greenkeep agent notes

TanStack Start + React + Vite. Runtime Bun. Lockfile `bun.lock`. No npm.

## Dev

```bash
bun install
bun run dev
```

App listens port 8080. DB fallback PGLite without `DATABASE_URL`. Real DB PostgreSQL.

## Quality

Pre-push hook runs `bun run quality` = format check + lint. Also run:

```bash
bun run typecheck
bun run test
```

Format all code with Prettier before commit. Untracked research dirs (`competitor-profiles/`, `.agents/`) excluded from scope, never commit those.

## Commits

Conventional Commits. `feat`/`fix`/`chore`/`ci`/`docs`. Imperative, lowercase, no period.

## Deploy

`main` protected. All changes via PR, no direct push. No approval needed, merge when LGTM. Quality check must pass on PR. Merge to `main` auto-deploys. Workflow `.github/workflows/deploy.yml`:

1. Runner joins Tailscale (`tag:ci`)
2. SSH to HTPC (`100.103.20.24`), reset `/home/htpc/greenkeep` to `origin/main`
3. `docker compose --env-file .env.production up -d --build`
4. Healthcheck app + cloudflared, then public HTTPS check

Secrets on repo: `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_SECRET`, `DEPLOY_SSH_KEY`.

## Production topology

Compose services: `app`, `worker`, `postgres`, `cloudflared`. Cloudflare Tunnel only public ingress. No host ports. No host nginx. `.env.production` gitignored, lives only on HTPC mode `0600`.

Migrations run at container start (`bun scripts/migrate.mjs`). Schema source `migrations/*.sql`.

## SSH

HTPC SSH Tailscale-only. UFW allow TCP/22 on `tailscale0`, deny elsewhere.
