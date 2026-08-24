import { describe, expect, it } from "vitest";
import {
  buildExportFileName,
  MAX_EXPORT_BASE_LENGTH,
  type ExportFileNameInput,
} from "./export-filename";

describe("buildExportFileName", () => {
  it.each([
    [{ projectName: "高三3班", kind: "png", scale: 1 }, "高三3班-1x.png"],
    [{ projectName: "高三3班", kind: "png", scale: 2 }, "高三3班-2x.png"],
    [{ projectName: "高三3班", kind: "png", scale: 3 }, "高三3班-3x.png"],
    [{ projectName: "高三3班", kind: "svg", scale: 2 }, "高三3班.svg"],
    [{ projectName: "", kind: "png", scale: 2 }, "我的毕业去向图-2x.png"],
    [{ projectName: null, kind: "svg" }, "我的毕业去向图.svg"],
    [{ projectName: "   ", kind: "png" }, "我的毕业去向图-1x.png"],
    [{ projectName: "2026/届  一班", kind: "png" }, "2026届 一班-1x.png"],
    [{ projectName: "a:b*c?d\"e<f>g|h\\i", kind: "svg" }, "abcdefghi.svg"],
    [{ projectName: ".隐藏名-", kind: "svg" }, "隐藏名.svg"],
    [{ projectName: "CON", kind: "png" }, "我的毕业去向图-1x.png"],
    [
      { projectName: "示例：2026届毕业去向", kind: "project", date: "2026-08-24" },
      "示例：2026届毕业去向-工程包-2026-08-24.json",
    ],
  ] satisfies Array<[ExportFileNameInput, string]>)("%o → %s", (input, expected) => {
    expect(buildExportFileName(input)).toBe(expected);
  });

  it("removes control characters and collapses whitespace", () => {
    expect(buildExportFileName({
      projectName: "高三\u0000\t3班",
      kind: "svg",
    })).toBe("高三3班.svg");
  });

  it("truncates by code point without splitting emoji", () => {
    const base = "🎓".repeat(MAX_EXPORT_BASE_LENGTH + 1);
    const output = buildExportFileName({ projectName: base, kind: "png", scale: 2 });
    expect(Array.from(output.replace("-2x.png", ""))).toHaveLength(MAX_EXPORT_BASE_LENGTH);
    expect(output).toBe(`${"🎓".repeat(MAX_EXPORT_BASE_LENGTH)}-2x.png`);
  });

  it("normalizes missing or invalid PNG scales to 1x", () => {
    for (const scale of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildExportFileName({ projectName: "甲", kind: "png", scale })).toBe("甲-1x.png");
    }
  });

  it("never emits path separators", () => {
    const output = buildExportFileName({ projectName: "../../etc\\passwd", kind: "png" });
    expect(output).not.toMatch(/[\\/]/);
  });
});
