import { useMemo, type ReactNode } from "react";
import { StudioUiThemeContext, type StudioUiTheme } from "../lib/studio-ui-theme";

/** Share the current UI palette with docked tools and their portalled drawers. */
export function StudioUiThemeProvider({ theme, skin, children }: {
  theme: string;
  skin: string;
  children: ReactNode;
}) {
  const value = useMemo<StudioUiTheme>(() => ({
    theme: theme === "dark" ? "dark" : "light",
    skin: skin === "classic" ? "classic" : "atelier",
  }), [theme, skin]);
  return <StudioUiThemeContext.Provider value={value}>{children}</StudioUiThemeContext.Provider>;
}
