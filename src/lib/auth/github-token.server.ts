import { getRequest } from "@tanstack/react-start/server";
import { hasRepoScope } from "../../../scripts/github-scope.mjs";
import { GITHUB_PROVIDER_ID } from "./providers";
import { auth } from "./server";

const MISSING_GRANT =
  "GitHub authorization is missing the repo scope. Sign out and sign in again, granting repository access.";
const MISSING_SIGN_IN = "Sign in with GitHub to continue";

/**
 * Decrypt the stored GitHub access token for the signed-in Better Auth user.
 * Never accepts a client-supplied PAT. Fails closed when the grant lacks `repo`
 * unless `requireRepo` is false (optional GraphQL calendar reads).
 */
export async function getGithubAccessToken(opts?: {
  bearerToken?: string;
  requireRepo?: boolean;
}): Promise<{ accessToken: string; scopes: string[] }> {
  const requireRepo = opts?.requireRepo !== false;
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
  if (requireRepo && !hasRepoScope(scopes)) {
    throw new Error(MISSING_GRANT);
  }
  return { accessToken, scopes };
}

