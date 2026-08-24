import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("App PNG export busy state", () => {
  it("disables every PNG export button for any active poster export", () => {
    const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const pngExportButtons = Array.from(source.matchAll(/<button\b[\s\S]*?<\/button>/g))
      .map(([button]) => button)
      .filter((button) => button.includes("<ImageDown") && button.includes("导出 PNG"));

    expect(pngExportButtons.length).toBeGreaterThanOrEqual(2);
    for (const button of pngExportButtons) {
      expect(button).toMatch(
        /disabled\s*=\s*\{\s*posterExport\.exportState\s*===\s*["']exporting["']\s*\}/,
      );
    }
  });
});
