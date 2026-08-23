/**
 * The upstream identity providers this app offers for sign-in.
 *
 * Source of truth for BOTH the server (`server.ts`) and the client
 * (`client.ts` / sign-in buttons). Kept in its own dependency-free module so
 * the client can import it without pulling the server-only Better Auth
 * instance (and `pg`) into the browser bundle.
 *
 * GitHub is the only method: the write path needs a GitHub access token with
 * `repo` + `user:email`, which Better Auth stores on the linked account.
 */
export type GrokProvider = {
  /** This app's local provider id; also the social provider id. */
  providerId: string;
  /** Upstream Better Auth social id. */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
};

export const GITHUB_PROVIDER_ID = "github";

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: GITHUB_PROVIDER_ID, idp: "github", label: "GitHub" },
];
