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
import { GITHUB_PROVIDER_ID, authEnabled, signIn } from "@/lib/auth/client";
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
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={pending !== null}
          onClick={() => {
            setPending(GITHUB_PROVIDER_ID);
            void signIn(GITHUB_PROVIDER_ID, { callbackURL: "/" }).catch(
              (err: unknown) => {
                setPending(null);
                toast.error(
                  err instanceof Error ? err.message : "Sign-in failed",
                );
              },
            );
          }}
        >
          {pending === GITHUB_PROVIDER_ID ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <ProviderMark />
          )}
          Continue with GitHub
        </Button>
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
              ? "Use the personal GitHub that should keep the history."
              : "Continue with the personal GitHub you want to write to."}
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
      <div className="flex min-h-10 items-center rounded-md border border-border bg-card px-2">
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

function ProviderMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.67.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.58 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.04 10.04 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}
