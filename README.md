# Greenkeep

![Greenkeep](banner.jpg)

Bring a work GitHub contribution graph onto your personal account.

Work stays on the company org. Greenkeep reads that public calendar, then writes empty, backdated commits to a private repo on the account you sign in with. GitHub paints the squares there.

Use it for accounts you own.

## Stack

- TanStack Start + React + Vite
- Better Auth (`/api/auth/*`) with Sign in with GitHub (`repo` + `user:email`)
- GitHub REST API for graphs, repo create, and git commits
- RevenueCat Web Billing for one-time and monthly access
- PostgreSQL-backed daily sync worker

## Auth today

Header **Log In** / **Sign Up** both open the same dialog. The only button is **Continue with GitHub**. After sign-in the GitHub access token is stored on the Better Auth account and used server-side to create the private repo. There is no client PAT field.

## Run

```bash
npm install
npm run dev
```

App listens on port 8080.

## Write path

Server functions in `src/lib/github-fn.ts` fetch contribution calendars and call the reusable GitHub operations in `src/lib/github-api.server.ts` to create/reuse a private repo and append empty commits. Destination identity comes from the signed-in GitHub user (`/user` + `/user/emails`). Writes fail closed if the grant lacks `repo`. Sign-out normally revokes the stored GitHub grant; an enabled Premium sync retains the encrypted grant so it can continue after sign-out. Pausing sync restores the normal revoke-on-sign-out behavior.

## Paywall

Reading and merging contribution history stays free. Manual GitHub writes and the local script
require either the one-time RevenueCat entitlement `pro` or the monthly entitlement `premium`.
Automatic sync requires `premium`.

Premium stores the selected work accounts, start date, intensity, repository, and verified commit
email in PostgreSQL. A small Compose worker calls a secret-protected internal route every minute.
The server claims one due configuration, rechecks `premium`, decrypts that user's stored GitHub
grant, reconciles existing Greenkeep commits after interrupted runs, adds only missing per-day
commits, then schedules the next run for 24 hours later. Failures retry after one hour. No hosted
queue, webhook, or additional paid service is required.

RevenueCat setup:

1. Add a Web Billing app and connect Stripe.
2. Create entitlements `pro` and `premium`.
3. Create `greenkeep_lifetime` at $5 USD one-time and attach it to `pro`.
4. Create `greenkeep_premium_monthly` at $4.99 USD/month and attach it to `premium`.
5. Put both products in the current offering as its lifetime and monthly packages.
6. Set `VITE_REVENUECAT_WEB_API_KEY` to the public Web Billing key and
   `REVENUECAT_SECRET_API_KEY` to a server-side secret key.

The public key is compiled into the browser bundle. Compose passes it as a Docker build argument;
the RevenueCat and worker secrets are read only by the server-side containers.

## Production

The production stack is intentionally small: the app, daily sync worker, PostgreSQL, and
`cloudflared` run in Docker Compose. Cloudflare Tunnel is the only public ingress. The app has no
host port, PostgreSQL stays on the private Compose network, and the HTPC needs no inbound web port
or public-IP DNS record.

### Configure

```bash
cp .env.example .env.production
openssl rand -hex 32 # POSTGRES_PASSWORD
openssl rand -hex 32 # BETTER_AUTH_SECRET
openssl rand -hex 32 # SYNC_WORKER_SECRET
```

Set the GitHub OAuth credentials in `.env.production`. The OAuth app must use:

- Homepage URL: `https://greenkeep.xyz`
- Authorization callback URL: `https://greenkeep.xyz/api/auth/callback/github`

Add `greenkeep.xyz` to the existing Cloudflare account, then replace Porkbun's
nameservers with the two assigned by Cloudflare. In **Networking → Tunnels**:

1. Create a remotely managed tunnel named `greenkeep`.
2. Add public hostnames `greenkeep.xyz` and `www.greenkeep.xyz`.
3. Point both hostnames to the service `http://app:3000`.
4. Put the tunnel's `eyJ...` token in `.env.production` as
   `CLOUDFLARE_TUNNEL_TOKEN`.

### Deploy

Merges to `main` run `.github/workflows/deploy.yml`. The runner joins Tailscale
(`tag:ci`), SSHs to the HTPC, resets `/home/htpc/greenkeep` to `origin/main`,
and runs `docker compose --env-file .env.production up -d --build`.
`.env.production` is gitignored and survives the reset.

Repo secrets (same names as autohired):

- `TAILSCALE_OAUTH_CLIENT_ID`
- `TAILSCALE_OAUTH_SECRET`
- `DEPLOY_SSH_KEY`

Manual fallback on the HTPC:

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

No host nginx or Certbot configuration is required. Cloudflare owns the public
DNS and TLS certificate; `cloudflared` makes an outbound-only connection from
the private Compose network to Cloudflare. Compose waits for PostgreSQL, the app
applies pending migrations, and the worker waits for the app healthcheck before
processing due syncs. The named `postgres_data` volume keeps sync configuration,
the per-day idempotency ledger, and auth data across rebuilds and container
replacement.
