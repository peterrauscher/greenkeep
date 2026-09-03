import type { AuthContext } from "better-auth";
import { decryptOAuthToken } from "better-auth/oauth2";
import { getRequest } from "@tanstack/react-start/server";
import { hasRepoScope, parseGithubScopes } from "../../../scripts/github-scope.mjs";
import { GITHUB_PROVIDER_ID } from "./providers";
import { auth } from "./server";

const MISSING_GRANT =
  "GitHub authorization is missing the repo scope. Sign out and sign in again, granting repository access.";
const MISSING_SIGN_IN = "Sign in with GitHub to continue";

/**
 * Decrypt the stored GitHub access token for the signed-in Better Auth user.
 * Never accepts a client-supplied PAT. Fails closed when the grant lacks `repo`.
 */
export async function getGithubAccessToken(opts?: {
  bearerToken?: string;
}): Promise<{ accessToken: string; scopes: string[] }> {
  const request = getRequest();
  const headers = new Headers(request?.headers);
  if (opts?.bearerToken) {
    headers.set("Authorization", `Bearer ${opts.bearerToken}`);
  }

  let tokens: { accessToken?: string | null; scopes?: string[] };
  try {
    tokens = await auth.api.getAccessToken({
      body: { providerId: GITHUB_PROVIDER_ID },
      headers,
    });
  } catch {
    throw new Error(MISSING_SIGN_IN);
  }
  const accessToken = tokens.accessToken?.trim();
  if (!accessToken) throw new Error(MISSING_SIGN_IN);
  const scopes = tokens.scopes ?? [];
  if (!hasRepoScope(scopes)) {
    throw new Error(MISSING_GRANT);
  }
  return { accessToken, scopes };
}

/** Read the encrypted GitHub grant for a user claimed by the internal sync worker. */
export async function getStoredGithubAccessToken(
  userId: string,
): Promise<{ accessToken: string; scopes: string[] }> {
  const authContextValue = await auth.$context;
  // Better Auth's public context type omits the internal adapter exposed at runtime.
  const context = authContextValue as unknown as AuthContext;
  const accounts = await context.internalAdapter.findAccounts(userId);
  const github = accounts.find((account) => account.providerId === GITHUB_PROVIDER_ID);
  const accessToken = github?.accessToken
    ? (await decryptOAuthToken(github.accessToken, context)).trim()
    : "";
  if (!accessToken) throw new Error(MISSING_SIGN_IN);
  const scopes = parseGithubScopes(github?.scope);
  if (!hasRepoScope(scopes)) throw new Error(MISSING_GRANT);
  return { accessToken, scopes };
}
