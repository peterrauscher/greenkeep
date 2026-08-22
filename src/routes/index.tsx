import { createFileRoute } from "@tanstack/react-router";
import { Workbench } from "@/components/workbench";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Workbench />;
}
