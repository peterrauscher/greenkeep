import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, cycleTheme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={cycleTheme}
      aria-label={`${LABEL[theme]}. Switch theme`}
      title={LABEL[theme]}
    >
      <Icon />
    </Button>
  );
}
