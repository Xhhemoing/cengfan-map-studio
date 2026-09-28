import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Static new URL(..., import.meta.url) is rewritten as a browser asset by Vite.
// These architecture checks read source files, not bundled asset URLs.
function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), "src/components", path), "utf8");
}

describe("application header ownership", () => {
  for (const path of ["StudioLayoutTemplate.tsx", "editor/LegacyEditorTopbar.tsx", "editor/GlobalSettingsShell.tsx"]) {
    it(`${path} delegates the header to StudioTopbar`, () => {
      const source = readSource(path);
      expect(source).toContain("<StudioTopbar");
      expect(source).not.toMatch(/<header\s+className="topbar/);
      expect(source).not.toContain('className="brand"');
    });
  }

  it("does not stack the settings toolbar under the shared header", () => {
    const shell = readSource("editor/GlobalSettingsShell.tsx");
    const screen = readSource("GlobalSettingsScreen.tsx");
    expect(shell).toMatch(/<GlobalSettingsScreen\s+embeddedHeader/);
    expect(screen).toContain("{!embeddedHeader && <header");
  });
});
