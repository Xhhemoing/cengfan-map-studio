import { describe, expect, it, vi } from "vitest";
import { wrapStyledCardText } from "./styled-card-text";

const textOf = (lines: ReturnType<typeof wrapStyledCardText>) => lines.map((line) => line.map((fragment) => fragment.text).join(""));
describe("styled card text wrapping", () => {
  it("measures mixed-size fields separately and preserves field bindings", () => {
    const lines = wrapStyledCardText([{ text: "学校", field: "university" }, { text: "林舟", field: "name" }], 60, {
      fontSize: 10, fieldTypography: { name: { fontSize: 30 } },
    });
    expect(textOf(lines)).toEqual(["学校林", "舟"]);
    expect(lines[0]).toEqual([{ text: "学校", field: "university" }, { text: "林", field: "name" }]);
  });

  it("uses injected font measurements, including kerning, for each line", () => {
    const measureText = vi.fn((text: string) => text === "AV" ? 15 : text.length * 10);
    const lines = wrapStyledCardText([{ text: "AVA", field: "name" }], 16, {
      fontSize: 12, fieldFonts: { name: "probe" }, fontWeight: 600,
      userFonts: [{ id: "probe", label: "Probe", family: "ProbeFont", source: "user", src: "data:font/woff2;base64,AA==", format: "woff2" }],
      measureText,
    });
    expect(textOf(lines)).toEqual(["AV", "A"]);
    expect(measureText).toHaveBeenCalledWith("AV", { fontFamily: '"ProbeFont"', fontSize: 12, fontWeight: 600 });
  });

  it("wraps literal row expressions without a field binding", () => {
    expect(textOf(wrapStyledCardText([{ text: "毕业快乐" }], 20, { fontSize: 10 }))).toEqual(["毕业", "快乐"]);
  });

  it("preserves no-wrap field policy and all content", () => {
    const lines = wrapStyledCardText([{ text: "学校", field: "university" }, { text: "欧阳星河", field: "name" }], 40, {
      fontSize: 12, preserveFields: new Set(["name"]),
    });
    expect(textOf(lines)).toEqual(["学校", "欧阳星河"]);
  });

  it("falls back to deterministic estimates when measurements are invalid", () => {
    expect(textOf(wrapStyledCardText([{ text: "甲乙丙", field: "name" }], 20, { fontSize: 10, measureText: () => NaN })))
      .toEqual(["甲乙", "丙"]);
  });
});
