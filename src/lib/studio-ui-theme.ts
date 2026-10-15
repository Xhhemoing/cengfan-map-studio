import { createContext, useContext } from "react";
import type { ResolvedTheme, StudioSkin } from "./theme";

export interface StudioUiTheme {
  theme: ResolvedTheme;
  skin: StudioSkin;
}

/** React context follows portals, unlike CSS ancestry or persisted preferences. */
export const StudioUiThemeContext = createContext<StudioUiTheme>({ theme: "light", skin: "atelier" });

export function useStudioUiThemeScope() {
  const { theme, skin } = useContext(StudioUiThemeContext);
  return { "data-editor-theme": theme, "data-editor-skin": skin };
}
