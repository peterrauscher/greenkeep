import type { AuthContext } from "better-auth";
import { decryptOAuthToken } from "better-auth/oauth2";
import { GITHUB_PROVIDER_ID } from "./providers";

/**
 * Revoke the GitHub grant (best effort) and wipe the stored access token.
 * Called from the Better Auth session-delete hook so sign-out drops the token.
 */
export async function dropGithubAccessToken(
  ctx: AuthContext,
  userId: string,
): Promise<void> {
  if (!userId) return;
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const github = accounts.find(
    (account) => account.providerId === GITHUB_PROVIDER_ID,
  );
  if (!github) return;

  const raw = github.accessToken
    ? await decryptOAuthToken(github.accessToken, ctx)
    : null;
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  if (raw && clientId && clientSecret) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    await fetch(
      `https://api.github.com/applications/${encodeURIComponent(clientId)}/token`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/json",
          "User-Agent": "Greenkeep/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ access_token: raw }),
      },
    ).catch(() => {
      /* still wipe the stored grant */
    });
  }

  await ctx.internalAdapter.updateAccount(github.id, {
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scope: null,
  });
}
