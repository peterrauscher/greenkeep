import { useState } from "react";
import { AuthForm, type AuthMode } from "@/components/auth-dialog";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthScreen({ initialMode = "login" }: { initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const isSignup = mode === "signup";

  return (
    <main className="relative grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl bg-card p-6 ring-1 ring-border">
        <p className="font-brand text-2xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          GREENKEEP
        </p>
        <h1 className="mt-2 text-xl font-medium tracking-tight">
          {isSignup ? "Create an account" : "Log in"}
        </h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          {isSignup
            ? "Use the personal GitHub that should keep the history."
            : "Continue with the personal GitHub you want to write to."}
        </p>
        <AuthForm
          mode={mode}
          onToggle={() => setMode(isSignup ? "login" : "signup")}
        />
      </div>
    </main>
  );
}

export function AuthPending() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div
        className="h-10 w-40 animate-pulse rounded-md bg-muted"
        aria-hidden="true"
      />
      <span className="sr-only">Checking session</span>
    </main>
  );
}
