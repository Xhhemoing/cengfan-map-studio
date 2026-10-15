import { describe, expect, it } from "vitest";
import { referenceCardMetrics, type ReferencePresentation } from "./reference-card-metrics";
import { buildPreparedCardContents } from "./prepared-card-content";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";

const presentations: ReferencePresentation[] = ["color-pill", "emblem-list", "city-label", "glass-stat"];

describe("reference card measurement", () => {
  it.each(presentations)("measures %s large fields and multiline titles before placing the card", (presentation) => {
    const cards = buildPreparedCardContents({
      groups: [{ key: "group", title: "一个非常长的自定义院校分组名称", count: 1, students: [{ id: "student", name: "欧阳星河", university: "北京大学", city: "北京市", visibility: true }] }],
      grouping: "university", presentation, showCount: true,
      visibleFields: ["name", "university"], citySubgroups: false,
      expressionTemplates: DEFAULT_CARD_EXPRESSION_TEMPLATES,
      fontSize: 12, fieldTypography: { title: { fontSize: 30 }, name: { fontSize: 26 }, university: { fontSize: 18 } },
      compactLayout: true, maxWidth: 180, horizontalPadding: 12, bottomPadding: 8,
      showProvinceTexture: false, lineHeightMultiplier: 0.8, canvasWidth: 900, safeMargin: 20,
    });
    const card = cards[0]!;
    const metrics = card.referenceMetrics!;
    expect(card.titleLines.length).toBeGreaterThan(1);
    expect(metrics.titleFontSize).toBe(30);
    expect(metrics.rowFontSize).toBe(26);
    expect(metrics.rowHeight).toBeGreaterThanOrEqual(28);
    expect(metrics.titleLineHeight).toBeGreaterThan(30);
    const lastTitleBaseline = metrics.titleBaseline + (card.titleLines.length - 1) * metrics.titleLineHeight;
    expect(metrics.bodyBaseline - metrics.rowFontSize).toBeGreaterThan(lastTitleBaseline);
    const lineCount = card.rows.reduce((count, row) => count + row.lines.length, 0);
    expect(metrics.bodyBaseline + (lineCount - 1) * metrics.rowHeight + 6).toBeLessThan(card.height);
    expect(metrics.height).toBe(card.height);
  });

  it("moves a large count below a narrow title and reserves all its wrapped lines", () => {
    const metrics = referenceCardMetrics({ presentation: "glass-stat", width: 100, fontSize: 40,
      horizontalPadding: 8, lineHeightMultiplier: 1, showCount: true, count: 120, titleLineCount: 2, bodyLineCount: 1 });
    expect(metrics.countLines.length).toBeGreaterThan(1);
    expect(metrics.countLines.join("")).toBe("120 人");
    expect(metrics.countBaseline).toBeGreaterThan(metrics.titleBaseline + metrics.titleLineHeight);
    expect(metrics.bodyBaseline - metrics.rowFontSize).toBeGreaterThan(metrics.countBaseline + (metrics.countLines.length - 1) * metrics.countLineHeight);
  });

  it("reserves count space only when the user chooses to show it", () => {
    const input = { presentation: "glass-stat" as const, width: 240, fontSize: 12, horizontalPadding: 10, lineHeightMultiplier: 1 };
    expect(referenceCardMetrics({ ...input, showCount: false }).titleWidth)
      .toBeGreaterThan(referenceCardMetrics({ ...input, showCount: true, count: 120 }).titleWidth);
  });
});
