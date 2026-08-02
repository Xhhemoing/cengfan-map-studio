import { describe, expect, it } from "vitest";
import { wrapCardText } from "./card-text-layout";

describe("wrapCardText", () => {
  it("wraps CJK content at the available width without losing characters", () => {
    const lines = wrapCardText([{ text: "一二三四五六七八九十", field: "name" }], 36, 12);

    expect(lines).toHaveLength(4);
    expect(lines.flatMap((line) => line.map((fragment) => fragment.text)).join("")).toBe("一二三四五六七八九十");
  });

  it("keeps field metadata when a line contains multiple styled fragments", () => {
    const lines = wrapCardText([
      { text: "张三", field: "name" },
      { text: " · " },
      { text: "北京大学", field: "university" },
    ], 300, 12);

    expect(lines).toEqual([[
      { text: "张三", field: "name" },
      { text: " · ", field: undefined },
      { text: "北京大学", field: "university" },
    ]]);
  });

  it("moves preserved fields to the next line as a whole instead of splitting characters", () => {
    const fragments = [
      { text: "张三", field: "name" as const },
      { text: " · " },
      { text: "北京大学", field: "university" as const },
    ];
    // 5em available: "张三 · " (~3.28em) fits, then "北京大学" (4em) overflows the current line
    // but still fits on its own line.
    const universitySegments = (lines: ReturnType<typeof wrapCardText>) =>
      lines.flatMap((line) => line.filter((f) => f.field === "university").map((f) => f.text));

    const split = wrapCardText(fragments, 60, 12);
    expect(split.flatMap((line) => line.map((f) => f.text)).join("")).toBe("张三 · 北京大学");
    expect(universitySegments(split).length).toBeGreaterThan(1);

    const preserved = wrapCardText(fragments, 60, 12, { preserveFields: new Set(["university"]) });
    expect(preserved.flatMap((line) => line.map((f) => f.text)).join("")).toBe("张三 · 北京大学");
    expect(universitySegments(preserved)).toEqual(["北京大学"]);
  });

  it("keeps a preserved field on one line even when it exceeds the card width", () => {
    const fragments = [{ text: "一所名称特别特别长的大学", field: "university" as const }];
    const lines = wrapCardText(fragments, 24, 12, { preserveFields: new Set(["university"]) });
    expect(lines).toEqual([[{ text: "一所名称特别特别长的大学", field: "university" }]]);
  });
});
