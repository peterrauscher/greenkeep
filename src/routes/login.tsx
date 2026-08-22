import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthForm, type AuthMode } from "@/components/auth-dialog";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<AuthMode>("login");
  const isSignup = mode === "signup";

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
        <p className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
          Graph Copier
        </p>
        <h1 className="mt-2 text-xl font-medium tracking-tight">
          {isSignup ? "Create an account" : "Log in"}
        </h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          {isSignup
            ? "Sign up to write mirrored commits to a private GitHub repo."
            : "Welcome back. Continue with a provider to pick up where you left off."}
        </p>
        <AuthForm
          mode={mode}
          onToggle={() => setMode(isSignup ? "login" : "signup")}
        />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline-offset-4 hover:text-foreground hover:underline">
            Back to the workbench
          </Link>
        </p>
      </div>
    </main>
  );
}
