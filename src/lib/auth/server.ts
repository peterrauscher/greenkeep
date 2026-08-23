/**
 * Self-hosted Better Auth for this app (server-only).
 *
 * Sign-in is GitHub OAuth only (`repo` + `user:email`). The GitHub access
 * token is stored on the Better Auth account (encrypted at rest) and used
 * server-side to write the private repo.
 *
 * NEVER import this from client code. The client uses `@/lib/auth/client`;
 * server functions get a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth, type AuthContext } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { dropGithubAccessToken } from "./github-grant.server";
import { GITHUB_PROVIDER_ID } from "./providers";
import { pgliteDialect } from "./pglite-dialect";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __greenkeepAuthSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__greenkeepAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__greenkeepAuthSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const githubClientId = env("GITHUB_CLIENT_ID");
const githubClientSecret = env("GITHUB_CLIENT_SECRET");

/** True when GitHub sign-in is active. */
export const authConfigured =
  !authDisabled && Boolean(githubClientId && githubClientSecret);

const explicitBaseURL = env("BETTER_AUTH_URL");
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? "http://localhost:8080";

const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : [...LOCAL_DEV_ORIGINS];

const databaseUrl = env("DATABASE_URL");

const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "greenkeep.session_token";

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
            scope: ["repo", "user:email"],
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

  databaseHooks: {
    session: {
      delete: {
        after: async (session) => {
          const userId = session.userId;
          if (typeof userId !== "string" || !userId) return;
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
      session_data: { name: "greenkeep.session_data" },
      account_data: { name: "greenkeep.account_data" },
      dont_remember: { name: "greenkeep.dont_remember" },
    },
  },

  plugins: [bearer(), tanstackStartCookies()],
});

