import { createTheme } from "@mui/material/styles";

/** Shared with native controls via styles/studio-tokens.css. Keep this module
 * separate from StudioMuiProvider so component-only Fast Refresh stays intact. */
export const studioTheme = createTheme({
  // The palette aliases external CSS tokens; native color avoids JS attempting
  // to parse var(...) when MUI derives hover, focus and alpha colors.
  cssVariables: { nativeColor: true },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: 'var(--studio-font, "Noto Sans SC", system-ui, sans-serif)',
    fontSize: 13,
    h1: { fontSize: "1.625rem", fontWeight: 600, lineHeight: 1.35 },
    h2: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.4 },
    h3: { fontSize: "1rem", fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.6 },
    button: { fontSize: "0.8125rem", fontWeight: 500, textTransform: "none" },
    caption: { fontSize: "0.75rem", lineHeight: 1.5 },
  },
  palette: {
    mode: "light",
    primary: {
      main: "var(--studio-accent)",
      light: "var(--studio-accent)",
      dark: "var(--studio-accent)",
      contrastText: "var(--studio-on-accent)",
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
      contrastText: "var(--studio-on-danger)",
    },
    background: { default: "var(--studio-bg)", paper: "var(--studio-surface)" },
    text: { primary: "var(--studio-ink)", secondary: "var(--studio-ink-muted)" },
    divider: "var(--studio-line)",
    action: {
      hover: "var(--studio-surface-muted)",
      selected: "var(--studio-accent-soft)",
      focus: "var(--studio-focus)",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: "var(--studio-bg)", color: "var(--studio-ink)" } },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: { "&.Mui-focusVisible": { outline: "2px solid var(--studio-focus)", outlineOffset: 3 } },
      },
    },
    MuiButton: {
      defaultProps: { size: "small", disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: "var(--studio-control-height)",
          borderRadius: "var(--studio-radius-sm)",
          paddingInline: 12,
          boxShadow: "none",
        },
      },
    },
    MuiIconButton: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          width: "var(--studio-control-height)",
          height: "var(--studio-control-height)",
          color: "var(--studio-ink-muted)",
          borderRadius: "var(--studio-radius-sm)",
        },
      },
    },
    MuiTextField: { defaultProps: { size: "small", variant: "outlined" } },
    MuiFormControl: { defaultProps: { size: "small" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: "var(--studio-control-height)",
          backgroundColor: "var(--studio-surface)",
          borderRadius: "var(--studio-radius-sm)",
        },
        notchedOutline: { borderColor: "var(--studio-line)" },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: "1px solid var(--studio-line)",
          borderRadius: "var(--studio-radius-lg)",
          boxShadow: "var(--studio-shadow)",
        },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: "1rem", fontWeight: 600, padding: "20px 24px 12px" } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "12px 24px 20px", gap: 8 } } },
    MuiMenu: {
      styleOverrides: {
        paper: { border: "1px solid var(--studio-line)", borderRadius: "var(--studio-radius)", boxShadow: "var(--studio-shadow)" },
      },
    },
    MuiMenuItem: { styleOverrides: { root: { minHeight: "var(--studio-control-height)", fontSize: "0.8125rem" } } },
    MuiTab: { styleOverrides: { root: { minHeight: 40, textTransform: "none", fontWeight: 500 } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: "0.75rem", lineHeight: 1.5, borderRadius: "var(--studio-radius-sm)" } } },
  },
});
