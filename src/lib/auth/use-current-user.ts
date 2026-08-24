import { useMemo } from "react";
import { authClient, authEnabled } from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used ONLY when auth is disabled
 * (`VITE_AUTH_ENABLED=false`, the shipped default). With auth on, the sandbox
 * live preview does real sign-in via the baked preview client. Its id is
 * `"dev-user"` — the SAME id `verify.server.ts` returns server-side — so per-user
 * rows written in that mode belong to one consistent owner.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state.
 * Auth enabled: real signed-in user; `user` is null while the session
 * resolves (`isPending`) and when signed out.
 * Auth disabled: `DEV_USER`, never pending.
 *
 * Wait out `isPending` before treating `user: null` as signed out.
 */
function useAuthenticatedCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const sessionUser = data?.user;
  const user = useMemo<AppUser | null>(() => {
    if (!sessionUser) return null;
    return {
      id: sessionUser.id,
      displayName: sessionUser.name ?? null,
      primaryEmail: sessionUser.email ?? null,
      profileImageUrl: sessionUser.image ?? null,
      isDevFallback: false,
    };
  }, [sessionUser]);
  return { user, isPending };
}

const DEV_CURRENT_USER_STATE: CurrentUserState = {
  user: DEV_USER,
  isPending: false,
};

function useDevCurrentUserState(): CurrentUserState {
  return DEV_CURRENT_USER_STATE;
}

const useConfiguredCurrentUserState = authEnabled
  ? useAuthenticatedCurrentUserState
  : useDevCurrentUserState;

export function useCurrentUserState(): CurrentUserState {
  return useConfiguredCurrentUserState();
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
