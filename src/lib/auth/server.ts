/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * Sign-in is GitHub OAuth only (`repo` + `user:email`). The GitHub access
 * token is stored on the Better Auth account (encrypted at rest) and used
 * server-side to create the private mirror. Google/X broker federation is
 * gone — those grants cannot write GitHub repos.
 *
 * Tri-mode:
 *   - Deployed: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` + `BETTER_AUTH_URL`
 *     + `DATABASE_URL`. Sessions persist in Postgres.
 *   - Sandbox live preview: same GitHub app, dynamic `*.grok-sandbox.com`
 *     origin. Sessions persist in embedded PGLite. Iframe clients use a
 *     bearer token (partitioned cookies) — see `client.ts`.
 *   - Off (`VITE_AUTH_ENABLED=false`, the shipped default): no providers;
 *     `requireUserId` resolves a dev user with no database configured, and
 *     throws fail-closed once `DATABASE_URL` is set (see `verify.server.ts`).
 *
 * NEVER import this from client code. The client uses `@/lib/auth/client`;
 * server functions get a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth, type AuthContext } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { dropGithubAccessToken } from "./github-grant.server";
import { GITHUB_PROVIDER_ID } from "./providers";
import { pgliteDialect } from "./pglite-dialect";
import { PREVIEW_ALLOWED_HOSTS } from "./preview";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const githubClientId = env("GITHUB_CLIENT_ID");
const githubClientSecret = env("GITHUB_CLIENT_SECRET");

/** True when GitHub sign-in is active (real auth is enforced). */
export const authConfigured =
  !authDisabled && Boolean(githubClientId && githubClientSecret);

const explicitBaseURL = env("BETTER_AUTH_URL");
const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS];
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? {
  allowedHosts: [...previewAllowedHosts, "localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : [
      ...previewAllowedHosts,
      ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
      ...LOCAL_DEV_ORIGINS,
    ];

const databaseUrl = env("DATABASE_URL");

const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name — also read by the live-preview popup completion page. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

export const auth = betterAuth({
  baseURL,
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,
  trustedOrigins,

  ...(authConfigured && githubClientId && githubClientSecret
    ? {
        socialProviders: {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            // Default GitHub scopes are `read:user` + `user:email`. `repo` is
            // required to create the private mirror.
            scope: ["repo", "user:email"],
            // Re-prompt so a prior identity-only grant cannot skip `repo`.
            prompt: "consent",
          },
        },
      }
    : {}),

  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: [GITHUB_PROVIDER_ID],
    },
  },

  session: { cookieCache: { enabled: true, maxAge: 300 } },

  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),

  databaseHooks: {
    session: {
      delete: {
        after: async (session) => {
          const userId = session.userId;
          if (typeof userId !== "string" || !userId) return;
          // Better Auth parameterizes $context by these options; decrypt
          // accepts the generic AuthContext. Same runtime object.
          const ctx = (await auth.$context) as unknown as AuthContext;
          await dropGithubAccessToken(ctx, userId);
        },
      },
    },
  },

  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    bearer(),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { GROK_PROVIDERS } from "./providers";
