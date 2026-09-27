import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("application header ownership", () => {
  for (const path of ["StudioLayoutTemplate.tsx", "editor/LegacyEditorTopbar.tsx", "editor/GlobalSettingsShell.tsx"]) {
    it(`${path} delegates the header to StudioTopbar`, () => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("<StudioTopbar");
      expect(source).not.toMatch(/<header\s+className="topbar/);
      expect(source).not.toContain('className="brand"');
    });
  }

  it("does not stack the settings toolbar under the shared header", () => {
    const shell = readFileSync(new URL("editor/GlobalSettingsShell.tsx", import.meta.url), "utf8");
    const screen = readFileSync(new URL("GlobalSettingsScreen.tsx", import.meta.url), "utf8");
    expect(shell).toMatch(/<GlobalSettingsScreen\s+embeddedHeader/);
    expect(screen).toContain("{!embeddedHeader && <header");
  });
});
