import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export type AuthMode = "login" | "signup";

export function AuthForm({
  mode,
  onToggle,
}: {
  mode: AuthMode;
  onToggle: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const isSignup = mode === "signup";

  return (
    <div className="flex flex-col gap-4">
      {authEnabled ? (
        <div className="flex flex-col gap-2">
          {GROK_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              disabled={pending !== null}
              onClick={() => {
                setPending(p.providerId);
                void signIn(p.providerId, { callbackURL: "/" }).catch(
                  (err: unknown) => {
                    setPending(null);
                    toast.error(
                      err instanceof Error ? err.message : "Sign-in failed",
                    );
                  },
                );
              }}
            >
              {pending === p.providerId ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ProviderMark idp={p.idp} />
              )}
              Continue with {p.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {isSignup ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="text-foreground underline-offset-4 hover:underline"
          onClick={onToggle}
        >
          {isSignup ? "Log in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}

export function AuthDialog({
  mode,
  onModeChange,
}: {
  mode: AuthMode | null;
  onModeChange: (mode: AuthMode | null) => void;
}) {
  const isSignup = mode === "signup";
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(open) => {
        if (!open) onModeChange(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isSignup ? "Create an account" : "Log in"}</DialogTitle>
          <DialogDescription>
            {isSignup
              ? "Sign up to write mirrored commits to a private GitHub repo."
              : "Welcome back. Continue with a provider to pick up where you left off."}
          </DialogDescription>
        </DialogHeader>
        <AuthForm
          mode={mode ?? "login"}
          onToggle={() => onModeChange(isSignup ? "login" : "signup")}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AuthBar({
  onLogin,
  onSignup,
}: {
  onLogin: () => void;
  onSignup: () => void;
}) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div
        className="h-10 w-40 animate-pulse rounded-md bg-muted"
        aria-hidden="true"
      />
    );
  }
  if (user) {
    return (
      <div className="flex min-h-10 max-w-xs items-center rounded-md border border-border bg-card px-2">
        <UserButton />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-10"
        onClick={onLogin}
      >
        Log In
      </Button>
      <Button type="button" size="sm" className="min-h-10" onClick={onSignup}>
        Sign Up
      </Button>
    </div>
  );
}

function ProviderMark({ idp }: { idp: string }) {
  if (idp === "google") {
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
        />
        <path
          fill="currentColor"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
          opacity="0.85"
        />
        <path
          fill="currentColor"
          d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.72.12-1.43.36-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84Z"
          opacity="0.7"
        />
        <path
          fill="currentColor"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
          opacity="0.55"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.56l-5.14-6.71L5.5 22H2.24l8.02-9.16L1.5 2h6.72l4.64 6.15L18.244 2Zm-1.15 18h1.81L7.01 3.89H5.07L17.094 20Z"
      />
    </svg>
  );
}
