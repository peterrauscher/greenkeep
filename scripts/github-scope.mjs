// @ts-check
/**
 * GitHub OAuth scope checks used by the write path. Kept as a pure module so
 * the fail-closed `repo` rule can be unit-tested without the auth server.
 */

/**
 * Split a GitHub scope grant into individual scopes.
 * GitHub uses spaces; Better Auth stores the same list comma-separated.
 * @param {string | string[] | null | undefined} scope
 * @returns {string[]}
 */
export function parseGithubScopes(scope) {
  if (!scope) return [];
  const parts = Array.isArray(scope) ? scope : String(scope).split(/[,\s]+/);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * True only when the grant includes classic `repo` (private repo create/write).
 * `public_repo` is not enough — the mirror is private.
 * @param {string | string[] | null | undefined} scope
 */
export function hasRepoScope(scope) {
  return parseGithubScopes(scope).includes("repo");
}
