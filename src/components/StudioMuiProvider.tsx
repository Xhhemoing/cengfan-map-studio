import type { ReactNode } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

/**
 * MUI theme bound to the studio's design tokens (see `--studio-*` in styles.css).
 * The palette maps straight onto CSS custom-property strings so the components
 * follow the editor's light/dark skins without a second source of truth.
 */
export const studioTheme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: {
      main: "var(--studio-accent)",
      light: "var(--studio-accent)",
      dark: "var(--studio-accent)",
      contrastText: "var(--studio-surface)",
    },
    secondary: {
      main: "var(--studio-ink-muted)",
      light: "var(--studio-ink-muted)",
      dark: "var(--studio-ink-muted)",
      contrastText: "var(--studio-surface)",
    },
    error: {
      main: "var(--studio-danger)",
      light: "var(--studio-danger)",
      dark: "var(--studio-danger)",
      contrastText: "var(--studio-surface)",
    },
    background: {
      default: "var(--studio-bg)",
      paper: "var(--studio-surface)",
    },
    text: {
      primary: "var(--studio-ink)",
      secondary: "var(--studio-ink-muted)",
    },
    divider: "var(--studio-line)",
    action: {
      hover: "var(--studio-surface-muted)",
      selected: "var(--studio-accent-soft)",
      focus: "var(--studio-focus)",
    },
  },
});

export function StudioMuiProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={studioTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
