import { describe, expect, it } from "vitest";
import { buildLayoutGroups } from "./layout";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import { buildPreparedCardContents, type PreparedCardContentOptions } from "./prepared-card-content";

function options(overrides: Partial<PreparedCardContentOptions> = {}): PreparedCardContentOptions {
  return {
    groups: buildLayoutGroups([
      { id: "short", name: "林舟", university: "A校", city: "北京市", visibility: true },
      { id: "long", name: "欧阳星河", university: "浙江大学医学院附属未来技术学院", city: "杭州市", visibility: true },
    ], "province"),
    grouping: "province", visibleFields: ["name", "university"], citySubgroups: false,
    expressionTemplates: DEFAULT_CARD_EXPRESSION_TEMPLATES, fontSize: 12, compactLayout: false,
    maxWidth: 240, horizontalPadding: 12, bottomPadding: 12, showProvinceTexture: false,
    lineHeightMultiplier: 1, canvasWidth: 1000, safeMargin: 20,
    ...overrides,
  };
}

describe("content-sized cards and spacing", () => {
  it("keeps fixed cards at the existing width", () => {
    expect(buildPreparedCardContents(options()).map((card) => card.width)).toEqual([240, 240]);
  });
  it("fits each group independently within its width range", () => {
    const cards = buildPreparedCardContents(options({ widthMode: "content", minWidth: 120 }));
    expect(cards[0]!.width).toBeGreaterThanOrEqual(120);
    expect(cards[0]!.width).toBeLessThan(cards[1]!.width);
    expect(cards.every((card) => card.width <= 240)).toBe(true);
    expect(cards[1]!.rows.flatMap((row) => row.lines).flat().map((part) => part.text).join("")).toContain("浙江大学医学院附属未来技术学院");
  });
  it("uses the current font measurements and explicit field size to choose width", () => {
    const measured = buildPreparedCardContents(options({ widthMode: "content", minWidth: 80,
      measureText: (text, style) => text.length * style.fontSize * 0.5 }));
    const larger = buildPreparedCardContents(options({ widthMode: "content", minWidth: 80,
      fieldTypography: { university: { fontSize: 36 } }, measureText: (text, style) => text.length * style.fontSize * 0.5 }));
    expect(larger[0]!.width).toBeGreaterThan(measured[0]!.width);
    expect(larger[1]!.width).toBe(240);
  });
  it.each(["standard", "color-pill", "emblem-list", "city-label", "glass-stat"] as const)("reserves increased top whitespace in %s height", (presentation) => {
    const base = buildPreparedCardContents(options({ presentation, topPadding: 12 }))[0]!;
    const padded = buildPreparedCardContents(options({ presentation, topPadding: 32 }))[0]!;
    expect(padded.height - base.height).toBeCloseTo(20);
    if (padded.referenceMetrics && base.referenceMetrics) {
      expect(padded.referenceMetrics.bodyBaseline - base.referenceMetrics.bodyBaseline).toBeCloseTo(20);
      expect(padded.referenceMetrics.titleBaseline - base.referenceMetrics.titleBaseline).toBeCloseTo(20);
    } else {
      expect(padded.topInset).toBe(20);
    }
  });
  it("does not silently shrink fonts to satisfy a minimum size preference", () => {
    const plain = buildPreparedCardContents(options({ widthMode: "content" }));
    const constrained = buildPreparedCardContents(options({ widthMode: "content", minFontSize: 24 }));
    expect(constrained).toEqual(plain);
  });
});
