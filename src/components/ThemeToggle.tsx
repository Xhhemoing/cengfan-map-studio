import { Moon, Sun } from "lucide-react";
import type { ResolvedTheme, ThemeMode } from "../lib/theme";

export function ThemeToggle({ mode, resolvedTheme, onChange }: {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onChange: (mode: ThemeMode) => void;
}) {
  const nextMode = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label={resolvedTheme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
      aria-pressed={resolvedTheme === "dark"}
      data-theme-mode={mode}
      onClick={() => onChange(nextMode)}
    >
      {resolvedTheme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
