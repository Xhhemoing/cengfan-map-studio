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
});
