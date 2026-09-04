import { createFileRoute } from "@tanstack/react-router";
import { AuthPending, AuthScreen } from "@/components/auth-screen";
import { Workbench } from "@/components/workbench";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/app")({ component: App });

function App() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <AuthPending />;
  if (!user) return <AuthScreen initialMode="login" />;
  return <Workbench />;
}
