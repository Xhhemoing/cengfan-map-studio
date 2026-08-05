// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
const workspaceStyles = readFileSync(fileURLToPath(new URL("../src/components/workflow-workspaces.css", import.meta.url)), "utf8");

function extractRule(css: string, selector: string, mediaMaxWidth?: number): string {
  const source = mediaMaxWidth === undefined ? css : (css.split(`@media (max-width: ${mediaMaxWidth}px)`)[1] ?? "");
  const start = source.indexOf(`${selector} {`);
  if (start < 0) return "";
  const end = source.indexOf("}", start);
  return end < 0 ? "" : source.slice(start + selector.length + 2, end);
}

describe("workflow workspace responsive contract", () => {
  it("defines tokenized template and delivery surfaces", () => {
    expect(extractRule(workspaceStyles, ".template-workspace")).toContain("background: var(--editor-bg)");
    expect(extractRule(workspaceStyles, ".delivery-workspace")).toContain("background: var(--editor-bg)");
  });

  it("defines desktop delivery columns and workspace overflow contracts", () => {
    expect(extractRule(workspaceStyles, ".delivery-workspace__actions")).toContain("grid-template-columns: 1fr 1fr 1fr");
    expect(extractRule(workspaceStyles, ".template-workspace__catalog")).toContain("min-width: 0");
    expect(extractRule(workspaceStyles, ".template-workspace__catalog")).toContain("overflow: auto");
    expect(extractRule(workspaceStyles, ".template-workspace__detail")).toContain("min-width: 0");
    expect(extractRule(workspaceStyles, ".template-workspace__detail")).toContain("overflow: auto");
    expect(workspaceStyles).toContain(".delivery-workspace__check, .delivery-workspace__controls, .delivery-workspace__error");
    expect(workspaceStyles).toContain("background: var(--editor-surface)");
    expect(extractRule(workspaceStyles, ".delivery-workspace__preview")).toContain("var(--editor-surface-muted)");
  });

  it("keeps the poster fitted inside workspace canvases while maximizing space", () => {
    expect(extractRule(styles, ".map-style-workspace__canvas .poster")).toContain("max-height: 100%");
    expect(extractRule(styles, ".map-style-workspace__canvas .poster")).toContain("min-width: 0");
    expect(extractRule(styles, ".map-style-workspace__canvas .poster")).toContain("width: auto");
    expect(extractRule(styles, ".content-layout-workspace__canvas .poster")).toContain("max-height: 100%");
    expect(extractRule(styles, ".content-layout-workspace__canvas .poster")).toContain("min-width: 0");
    expect(extractRule(workspaceStyles, ".delivery-workspace__canvas .poster")).toContain("max-height: 100%");
    expect(extractRule(workspaceStyles, ".delivery-workspace__canvas .poster")).toContain("min-width: 0");
  });

  it("lays out province edge sub-configs with labels left and controls right", () => {
    expect(extractRule(styles, ".map-edge-styles .map-edge-style-control"))
      .toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(extractRule(styles, ".map-edge-styles .map-edge-style-control__label")).toContain("font-size: 13px");
    expect(extractRule(styles, ".map-edge-styles .map-edge-style-control__label")).toContain("font-weight: 600");
  });

  it("gives expanded advanced settings a visible content title", () => {
    expect(styles).toContain(".property-panel__advanced-title");
  });

  it("contains poster scrolling and provides mobile-sized primary actions", () => {
    expect(extractRule(workspaceStyles, ".delivery-workspace__canvas")).toContain("overflow: auto");
    expect(extractRule(workspaceStyles, ".delivery-workspace__actions", 760)).toContain("grid-template-columns: 1fr");
    expect(extractRule(workspaceStyles, ".delivery-workspace__actions button", 760)).toContain("min-height: 44px");
    expect(extractRule(workspaceStyles, ".template-workspace__footer .primary-button", 760)).toContain("min-height: 44px");
  });

  it("provides narrow single-column layouts at both workspace breakpoints", () => {
    expect(extractRule(workspaceStyles, ".template-workspace__layout", 900)).toContain("grid-template-columns: 1fr");
    expect(extractRule(workspaceStyles, ".delivery-workspace__body", 900)).toContain("grid-template-columns: 1fr");
    expect(extractRule(workspaceStyles, ".delivery-workspace__actions", 760)).toContain("grid-template-columns: 1fr");
  });
});

describe("data workspace responsive controls", () => {
  it("keeps import controls available on narrow screens", () => {
    expect(styles).not.toMatch(/\.data-workspace \.import-box,\s*\.data-workspace \.import-review \{ display: none; \}/);
  });

  it("gives the global data workbench a full-height layout with an internal content scroller", () => {
    expect(styles).toMatch(/\.global-data-screen\s*\{[^}]*min-height:\s*100dvh;/);
    expect(styles).toMatch(/\.global-data-layout\s*\{[^}]*display:\s*grid;/);
    expect(styles).toMatch(/\.global-data-content\s*\{[^}]*overflow-y:\s*auto;/);
  });

  it("switches the global data workbench to a single column on narrow screens", () => {
    expect(styles).toMatch(/@media[^{}]*max-width:\s*620px[\s\S]*\.global-data-layout\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(styles).toMatch(/@media[^{}]*max-width:\s*620px[\s\S]*\.global-data-nav\s*\{[^}]*overflow-x:\s*auto;/);
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
