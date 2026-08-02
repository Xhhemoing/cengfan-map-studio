// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

describe("data workspace responsive controls", () => {
  it("keeps import controls available on narrow screens", () => {
    expect(styles).not.toMatch(/\.data-workspace \.import-box,\s*\.data-workspace \.import-review \{ display: none; \}/);
  });

  it("keeps collaboration reachable and lets the canvas toolbar wrap on mobile", () => {
    expect(styles).toMatch(/\.topbar-actions \.collaboration-button \{[^}]*display: inline-flex;/);
    expect(styles).toMatch(/\.collaboration-popover \{[^}]*position: fixed;[^}]*max-width: calc\(100vw - 16px\);/);
    expect(styles).toMatch(/\.brand-label__full \{ display: none; \}\.brand-label__compact \{ display: inline; \}/);
    expect(styles).toMatch(/\.brand \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap;/);
    expect(styles).toMatch(/\.brand > svg \{ display: none; \}/);
    expect(styles).toMatch(/\.editor-toolbar \{[^}]*height: auto;[^}]*flex-wrap: wrap;/);
    expect(styles).toMatch(/\.editor-toolbar-actions \{[^}]*width: 100%;[^}]*overflow-x: auto;/);
  });
});