import { Moon, Sun } from "lucide-react";
import type { ResolvedTheme, ThemeMode } from "../lib/theme";

/**
 * Canonical toggle button (APG / WCAG 2.2): the accessible name stays fixed
 * on the thing being toggled（暗色模式）and only `aria-pressed` flips, so
 * assistive tech never hears a name and a state that contradict each other
 * (the old dynamic「切换到亮色/暗色模式」label + aria-pressed combo did).
 */
export function ThemeToggle({ mode, resolvedTheme, onChange }: {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onChange: (mode: ThemeMode) => void;
}) {
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      aria-label="暗色模式"
      title="暗色模式"
      aria-pressed={isDark}
      data-theme-mode={mode}
      onClick={() => onChange(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
