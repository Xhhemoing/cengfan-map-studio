// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 「导出 PNG」在编辑器里有多个入口(顶栏、旧版右栏),它们必须对同一个导出状态一起变灰:
 * 只看 `exportingPng` 会让 SVG / 工程包导出期间的 PNG 按钮仍然可点,导出互相打断。
 *
 * 按钮已经从 App.tsx 拆进 `src/components/editor/`,所以这里扫全部源文件而不是单个文件——
 * 下一次拆分不该让这条约束悄悄失守。
 */
describe("App PNG export busy state", () => {
  it("disables every PNG export button for any active poster export", () => {
    const sources = execFileSync("git", ["ls-files", "-z", "--", "src/*.tsx", "src/**/*.tsx"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })
      .split("\0")
      .filter((path) => path.length > 0 && !path.includes(".test."));

    const pngExportButtons = sources
      .flatMap((path) => Array.from(readFileSync(resolve(process.cwd(), path), "utf8")
        .matchAll(/<button\b[\s\S]*?<\/button>/g))
        .map(([button]) => button))
      .filter((button) => button.includes("<ImageDown") && button.includes("导出 PNG"));

    expect(pngExportButtons.length).toBeGreaterThanOrEqual(2);
    for (const button of pngExportButtons) {
      expect(button).toMatch(
        /disabled\s*=\s*\{\s*posterExport\.exportState\s*===\s*["']exporting["']\s*\}/,
      );
    }
  });
});
