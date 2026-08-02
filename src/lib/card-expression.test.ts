import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARD_EXPRESSION_TEMPLATES,
  formatCardExpression,
  normalizeCardExpressionTemplates,
} from "./card-expression";

describe("card expression templates", () => {
  it("replaces supported placeholders and preserves intentional punctuation", () => {
    expect(formatCardExpression("{university}｜{names}（{city}）", {
      university: "浙江大学",
      names: "苏禾、林舟",
      city: "杭州市",
    }, "fallback")).toBe("浙江大学｜苏禾、林舟（杭州市）");
  });

  it("falls back when a template is empty or contains unknown placeholders", () => {
    expect(formatCardExpression("", { names: "苏禾" }, "默认行")).toBe("默认行");
    expect(formatCardExpression("{school}：{names}", { names: "苏禾" }, "默认行")).toBe("默认行");
  });

  it("normalizes persisted templates independently", () => {
    expect(normalizeCardExpressionTemplates({
      title: "  {group} / {count}  ",
      city: "",
      row: 42,
    })).toEqual({
      title: "{group} / {count}",
      city: DEFAULT_CARD_EXPRESSION_TEMPLATES.city,
      row: DEFAULT_CARD_EXPRESSION_TEMPLATES.row,
    });
  });
});
