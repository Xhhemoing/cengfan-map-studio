import { describe, expect, it } from "vitest";
import { studioTheme } from "./studio-theme";

describe("studioTheme", () => {
  it("keeps the palette on the studio CSS custom properties", () => {
    expect(studioTheme.palette.mode).toBe("light");
    expect(studioTheme.palette.primary.main).toBe("var(--studio-accent)");
    expect(studioTheme.palette.background.paper).toBe("var(--studio-surface)");
    expect(studioTheme.palette.divider).toBe("var(--studio-line)");
  });

  it("builds with CSS variables enabled so the skins stay a single source of truth", () => {
    expect(studioTheme.cssVariables).not.toBe(false);
    expect(studioTheme.vars).toBeTruthy();
  });

  it("shares the native UI font and does not uppercase control labels", () => {
    expect(studioTheme.typography.fontFamily).toContain("--studio-font");
    expect(studioTheme.typography.button.textTransform).toBe("none");
    expect(studioTheme.typography.body2.fontSize).toBe("0.8125rem");
  });

  it("uses explicit contrast tokens rather than the changing surface color", () => {
    expect(studioTheme.palette.primary.contrastText).toBe("var(--studio-on-accent)");
    expect(studioTheme.palette.error.contrastText).toBe("var(--studio-on-danger)");
  });

  it("derives interaction colors without trying to parse CSS variables in JS", () => {
    expect(() => studioTheme.alpha("var(--studio-accent)", 0.12)).not.toThrow();
    expect(studioTheme.alpha("var(--studio-accent)", 0.12)).toContain("--studio-accent");
  });

  it("keeps MUI and native controls on the same density and radius tokens", () => {
    expect(studioTheme.components?.MuiButton?.defaultProps).toMatchObject({ size: "small", disableElevation: true });
    expect(studioTheme.components?.MuiButton?.styleOverrides?.root).toMatchObject({
      minHeight: "var(--studio-control-height)", borderRadius: "var(--studio-radius-sm)",
    });
    expect(studioTheme.components?.MuiOutlinedInput?.styleOverrides?.root).toMatchObject({
      minHeight: "var(--studio-control-height)", borderRadius: "var(--studio-radius-sm)",
    });
    expect(studioTheme.components?.MuiPaper?.styleOverrides?.root).toMatchObject({ backgroundImage: "none" });
  });
});
