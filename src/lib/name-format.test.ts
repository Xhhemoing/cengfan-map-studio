import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAME_FORMAT,
  formatStudentName,
  NAME_FORMAT_PRESETS,
  normalizeNameFormat,
  splitSurname,
} from "./name-format";

describe("name format templates", () => {
  it("keeps the full name by default", () => {
    expect(formatStudentName("王小明", DEFAULT_NAME_FORMAT)).toBe("王小明");
    expect(formatStudentName("王小明", "")).toBe("王小明");
    expect(formatStudentName("王小明", "   ")).toBe("王小明");
  });

  it("masks everything after the surname with literal characters", () => {
    expect(formatStudentName("王小明", "{surname}xx")).toBe("王xx");
    expect(formatStudentName("张三", "{surname}xx")).toBe("张xx");
  });

  it("masks the surname with a literal prefix", () => {
    expect(formatStudentName("王小明", "X{rest}")).toBe("X小明");
    expect(formatStudentName("张三", "X{rest}")).toBe("X三");
  });

  it("keeps surname and last character around a mask", () => {
    expect(formatStudentName("王小明", "{surname}*{last}")).toBe("王*明");
    expect(formatStudentName("张三", "{surname}*{last}")).toBe("张*三");
  });

  it("supports initial and last character placeholders", () => {
    expect(formatStudentName("王小明", "{initial}**")).toBe("王**");
    expect(formatStudentName("王小明", "**{last}")).toBe("**明");
    expect(formatStudentName("王小明", "{given}")).toBe("小明");
  });

  it("supports full-name initials and surname plus given-name initials", () => {
    expect(formatStudentName("Wang Xiao Ming", "{initials}")).toBe("WXM");
    expect(formatStudentName("王小明", "{initials}")).toBe("王小明");
    expect(formatStudentName("Wang Xiao Ming", "{surnameInitial}{givenInitials}")).toBe("WXM");
  });

  it("formats the requested Chinese name variants", () => {
    expect(formatStudentName("王小明", "initials-title")).toBe("Wxm");
    expect(formatStudentName("王小明", "initials-lower")).toBe("wxm");
    expect(formatStudentName("王小明", "initials-upper")).toBe("WXM");
    expect(formatStudentName("王小明", "surname-mask-last")).toBe("王*明");
    expect(formatStudentName("王小明", "surname-given-initials-lower")).toBe("王xm");
  });

  it("recognizes common compound surnames", () => {
    expect(splitSurname("欧阳娜娜")).toEqual({ surname: "欧阳", given: "娜娜" });
    expect(splitSurname("王小明")).toEqual({ surname: "王", given: "小明" });
    expect(formatStudentName("欧阳娜娜", "{surname}xx")).toBe("欧阳xx");
    expect(formatStudentName("欧阳娜娜", "{surname}*{last}")).toBe("欧阳*娜");
    expect(formatStudentName("司马光", "{surname}xx")).toBe("司马xx");
  });

  it("falls back to the full name for unknown placeholders", () => {
    expect(formatStudentName("王小明", "{school}xx")).toBe("王小明");
    expect(formatStudentName("王小明", "{名字}")).toBe("王小明");
  });

  it("supports literal-only templates (fixed mask text)", () => {
    expect(formatStudentName("王小明", "Xxx")).toBe("Xxx");
    expect(formatStudentName("欧阳娜娜", "Xxx")).toBe("Xxx");
  });

  it("trims surrounding whitespace from names and templates", () => {
    expect(formatStudentName(" 王小明 ", "{surname}xx")).toBe("王xx");
  });

  it("normalizes persisted formats", () => {
    expect(normalizeNameFormat(undefined)).toBe(DEFAULT_NAME_FORMAT);
    expect(normalizeNameFormat(null)).toBe(DEFAULT_NAME_FORMAT);
    expect(normalizeNameFormat("")).toBe(DEFAULT_NAME_FORMAT);
    expect(normalizeNameFormat("  {surname}xx  ")).toBe("{surname}xx");
    expect(normalizeNameFormat("{school}xx")).toBe(DEFAULT_NAME_FORMAT);
    expect(normalizeNameFormat("{name}")).toBe(DEFAULT_NAME_FORMAT);
  });

  it("exposes ready-to-use presets matching the documented examples", () => {
    expect(NAME_FORMAT_PRESETS.map((preset) => preset.value)).toEqual([
      "{name}",
      "{surname}xx",
      "X{rest}",
      "{surname}*{last}",
      "{initial}**",
      "initials-title",
      "initials-lower",
      "initials-upper",
      "surname-mask-last",
      "surname-given-initials-lower",
    ]);
    for (const preset of NAME_FORMAT_PRESETS) {
      expect(normalizeNameFormat(preset.value)).toBe(preset.value);
    }
  });
});
