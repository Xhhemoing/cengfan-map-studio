import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Style contract guard for the editor shell grid. The Atelier skin override
 * for `.studio-stage-shell` must NOT redeclare grid-template-columns: it used
 * to force a 2-column grid that pushed the right rail into an implicit second
 * row and collapsed the 1fr canvas row (map clipped, stepper hidden).
 */
describe("editor shell layout contract", () => {
  const css = readFileSync("src/styles.css", "utf-8");

  function ruleBody(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}", "s"));
    expect(match, `rule not found: ${selector}`).not.toBeNull();
    return match![1] ?? "";
  }

  it("keeps the atelier skin from overriding the shell columns", () => {
    const body = ruleBody('.app-shell[data-editor-skin="atelier"] .studio-stage-shell');
    expect(body).not.toMatch(/grid-template-columns/);
  });

  it("keeps the right rail as a third grid column when present", () => {
    const body = ruleBody('.studio-editor-shell[data-has-right-rail="true"]');
    expect(body).toMatch(/var\(--studio-right-width/);
  });

  it("keeps the shell grid on a single full-height row", () => {
    const body = ruleBody(".studio-editor-shell");
    expect(body).toMatch(/grid-template-rows:\s*minmax\(0\s*,\s*1fr\)/);
  });
});
