import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AuthPending, AuthScreen } from "@/components/auth-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <AuthPending />;
  if (user) return <Navigate to="/" />;
  return <AuthScreen />;
}
