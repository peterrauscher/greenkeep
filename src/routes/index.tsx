import { createFileRoute } from "@tanstack/react-router";
import { AuthPending, AuthScreen } from "@/components/auth-screen";
import { Workbench } from "@/components/workbench";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <AuthPending />;
  if (!user) return <AuthScreen />;
  return <Workbench />;
}
