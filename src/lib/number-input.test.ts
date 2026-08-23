import { describe, expect, it } from "vitest";
import { clampNumberDraft } from "./number-input";

describe("clampNumberDraft", () => {
  it("透传范围内数值", () => {
    expect(clampNumberDraft("42", 8, 240)).toBe(42);
    expect(clampNumberDraft("8", 8, 240)).toBe(8);
    expect(clampNumberDraft("240", 8, 240)).toBe(240);
  });

  it("越界钳制到边界而非忽略", () => {
    expect(clampNumberDraft("99999", 8, 240)).toBe(240);
    expect(clampNumberDraft("1", 8, 240)).toBe(8);
    expect(clampNumberDraft("1000", 100, 900)).toBe(900);
    expect(clampNumberDraft("-5", 0, 6000)).toBe(0);
  });

  it("空串与非法输入返回 null", () => {
    expect(clampNumberDraft("", 0, 100)).toBeNull();
    expect(clampNumberDraft("   ", 0, 100)).toBeNull();
    expect(clampNumberDraft("abc", 0, 100)).toBeNull();
    expect(clampNumberDraft("NaN", 0, 100)).toBeNull();
    expect(clampNumberDraft("Infinity", 0, 100)).toBeNull();
  });

  it("支持小数", () => {
    expect(clampNumberDraft("0.5", 0.1, 3)).toBe(0.5);
    expect(clampNumberDraft("9.9", 0.1, 3)).toBe(3);
  });
});
