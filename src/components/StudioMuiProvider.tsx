import type { ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { studioTheme } from "../lib/studio-theme";

export function StudioMuiProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={studioTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
