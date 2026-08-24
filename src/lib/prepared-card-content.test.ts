import { describe, expect, it } from "vitest";
import { buildLayoutGroups } from "./layout";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import type { Student } from "./project-data";
import {
  buildPreparedCardContents,
  cardFieldFontSize,
  computePreparedCardMetrics,
  destinationCardHeight,
  resolveCardAnchor,
  type PreparedCardContentOptions,
} from "./prepared-card-content";

const students: Student[] = [
  { id: "s1", name: "林舟", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
  { id: "s2", name: "陈宁", university: "清华大学", city: "北京市", province: "北京市", visibility: true },
  { id: "s3", name: "苏禾", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
];

function options(overrides: Partial<PreparedCardContentOptions> = {}): PreparedCardContentOptions {
  return {
    groups: buildLayoutGroups(students, "province"),
    grouping: "province",
    visibleFields: ["university", "name"],
    citySubgroups: true,
    expressionTemplates: DEFAULT_CARD_EXPRESSION_TEMPLATES,
    fontSize: 13,
    compactLayout: false,
    maxWidth: 220,
    horizontalPadding: 12,
    bottomPadding: 12,
    showProvinceTexture: false,
    lineHeightMultiplier: 1,
    canvasWidth: 1200,
    safeMargin: 40,
    ...overrides,
  };
}

function textOf(lines: Array<Array<{ text: string }>>): string[] {
  return lines.map((line) => line.map((fragment) => fragment.text).join(""));
}

/** The row step `cardStyle` carries to the renderer, spelled out rather than solved. */
function canvasRowHeight(options: PreparedCardContentOptions): number {
  return Math.max(
    options.compactLayout ? 18 : 20,
    Math.max(
      ...options.visibleFields.map((field) => options.fieldTypography?.[field]?.fontSize ?? options.fontSize),
      options.fieldTypography?.city?.fontSize ?? Math.max(9, options.fontSize - 1),
    ) + 6,
  ) * options.lineHeightMultiplier;
}

describe("prepared card metrics", () => {
  it("falls back to the card font size, one step smaller for city rows", () => {
    expect(cardFieldFontSize("name", 13)).toBe(13);
    expect(cardFieldFontSize("city", 13)).toBe(12);
    expect(cardFieldFontSize("city", 9)).toBe(9);
    expect(cardFieldFontSize("title", 13, { title: { fontSize: 22 } })).toBe(22);
  });

  it("caps the card width at the canvas safe area and reserves the title header", () => {
    const wide = computePreparedCardMetrics(options());
    expect(wide.cardWidth).toBe(220);
    expect(wide.contentWidth).toBe(196);

    const narrow = computePreparedCardMetrics(options({ canvasWidth: 200, safeMargin: 40 }));
    expect(narrow.cardWidth).toBe(120);

    const withTexture = computePreparedCardMetrics(options({ showProvinceTexture: true }));
    expect(withTexture.titleWidth).toBe(wide.titleWidth - 36);
  });

  it("takes the preset header offset out of the title width but leaves the body width whole", () => {
    const plain = computePreparedCardMetrics(options());
    const photo = computePreparedCardMetrics(options({ headerOffset: 32 }));

    // The title starts after the avatar, so only it pays; body rows still wrap against the
    // full padding box (see `destinationCardHeaderOffset`).
    expect(photo.titleWidth).toBe(plain.titleWidth - 32);
    expect(photo.contentWidth).toBe(plain.contentWidth);

    const both = computePreparedCardMetrics(options({ headerOffset: 32, showProvinceTexture: true }));
    expect(both.titleWidth).toBe(plain.titleWidth - 68);

    // A card too narrow for either never wraps the title below one glyph.
    const cramped = computePreparedCardMetrics(options({ headerOffset: 32, maxWidth: 90 }));
    expect(cramped.titleWidth).toBe(cramped.titleFontSize);
  });

  it("wraps the title earlier once the header offset shrinks its box", () => {
    const long = { ...DEFAULT_CARD_EXPRESSION_TEMPLATES, title: "毕业去向相聚在{group}的同学们一共{count}位同学" };
    const plain = buildPreparedCardContents(options({ expressionTemplates: long }))[0]!;
    const photo = buildPreparedCardContents(options({ expressionTemplates: long, headerOffset: 32 }))[0]!;

    expect(photo.titleLines.length).toBeGreaterThan(plain.titleLines.length);
    expect(photo.headerExtra).toBeGreaterThan(plain.headerExtra);
    expect(photo.height).toBe(plain.height + (photo.headerExtra - plain.headerExtra));
  });

  it("scales row and title line heights with the line-height multiplier", () => {
    const single = computePreparedCardMetrics(options());
    const loose = computePreparedCardMetrics(options({ lineHeightMultiplier: 1.5 }));
    expect(loose.rowHeight).toBeCloseTo(single.rowHeight * 1.5);
    expect(loose.titleLineHeight).toBeCloseTo(single.titleLineHeight * 1.5);
  });

  it("solves the row step the cards are painted with", () => {
    const configurations: Array<Partial<PreparedCardContentOptions>> = [
      {},
      { visibleFields: ["city"], fontSize: 16 },
      { visibleFields: ["city"], fontSize: 16, fieldTypography: { city: { fontSize: 11 } } },
      { visibleFields: ["city", "university", "name"], fontSize: 16, fieldTypography: { university: { fontSize: 10 } } },
      { visibleFields: ["name"], fontSize: 13, fieldTypography: { name: { fontSize: 22 } }, compactLayout: true },
      { visibleFields: ["university", "name"], fontSize: 9, compactLayout: true },
      { lineHeightMultiplier: 1.5 },
    ];

    for (const configuration of configurations) {
      const configured = options(configuration);
      expect(computePreparedCardMetrics(configured).rowHeight).toBeCloseTo(canvasRowHeight(configured));
    }
  });

  it("steps a city-only card at the size its rows paint, not at the heading size", () => {
    // Only the city *heading* shrinks one step; a `city` row field keeps the card font size,
    // so a 16px city-only card steps at 16 + 6 instead of 15 + 6.
    const cityOnly = options({ visibleFields: ["city"], fontSize: 16 });
    const metrics = computePreparedCardMetrics(cityOnly);

    expect(metrics.rowFontSize).toBe(16);
    expect(metrics.rowHeight).toBe(22);

    // One city heading line above the two (now field-less) school rows: 44 + 22 + 12.
    const [beijing] = buildPreparedCardContents(cityOnly);
    expect(beijing!.rows.flatMap((row) => row.lines)).toHaveLength(1);
    expect(beijing!.height).toBe(78);
  });

  it("sums the header, wrapped title overflow, body rows and bottom padding", () => {
    expect(destinationCardHeight(3, 20, 12, 0)).toBe(44 + 60 + 12);
    expect(destinationCardHeight(3, 20, 12, 18)).toBe(44 + 18 + 60 + 12);
  });
});

describe("buildPreparedCardContents", () => {
  it("wraps every row and sizes the card from the wrapped line count", () => {
    const [beijing] = buildPreparedCardContents(options());
    const metrics = computePreparedCardMetrics(options());

    expect(beijing!.group.key).toBe("北京市");
    expect(beijing!.province).toBe("北京市");
    expect(beijing!.isInternational).toBe(false);
    expect(beijing!.width).toBe(metrics.cardWidth);
    const lineCount = beijing!.rows.reduce((total, row) => total + row.lines.length, 0);
    expect(lineCount).toBeGreaterThan(0);
    expect(beijing!.height).toBe(destinationCardHeight(lineCount, metrics.rowHeight, 12, beijing!.headerExtra));
  });

  it("wraps a long title onto extra lines and charges the overflow to the header", () => {
    const contents = buildPreparedCardContents(options({
      expressionTemplates: {
        ...DEFAULT_CARD_EXPRESSION_TEMPLATES,
        title: "毕业去向相聚在{group}的同学们一共{count}位",
      },
    }));
    const metrics = computePreparedCardMetrics(options());

    expect(contents[0]!.titleLines.length).toBeGreaterThan(1);
    expect(contents[0]!.headerExtra).toBeCloseTo((contents[0]!.titleLines.length - 1) * metrics.titleLineHeight);
  });

  it("keeps a no-wrap field whole instead of splitting it across two lines", () => {
    // 96px of content width fits "北京大学 · 林舟" but not the third name glyph.
    const narrow = options({
      groups: buildLayoutGroups(
        [{ id: "s1", name: "林舟远", university: "北京大学", city: "北京市", province: "北京市", visibility: true }],
        "province",
      ),
      maxWidth: 120,
      citySubgroups: false,
    });
    const nameLines = (contents: ReturnType<typeof buildPreparedCardContents>) =>
      contents[0]!.rows.flatMap((row) => row.lines)
        .filter((line) => line.some((fragment) => fragment.field === "name")).length;

    expect(nameLines(buildPreparedCardContents(narrow))).toBe(2);
    expect(nameLines(buildPreparedCardContents({ ...narrow, noWrapFields: new Set(["name" as const]) }))).toBe(1);
  });

  it("emits a city heading row for province groups with city subgroups on", () => {
    const withCity = buildPreparedCardContents(options({ visibleFields: ["city", "university", "name"] }));
    expect(withCity[0]!.rows.some((row) => row.cityHeading === "北京市")).toBe(true);

    const withoutCity = buildPreparedCardContents(options({
      visibleFields: ["city", "university", "name"],
      citySubgroups: false,
    }));
    expect(withoutCity[0]!.rows.some((row) => row.cityHeading)).toBe(false);
  });

  it("applies the name format and the row expression template", () => {
    const contents = buildPreparedCardContents(options({
      citySubgroups: false,
      nameFormat: "{name}同学",
      expressionTemplates: { ...DEFAULT_CARD_EXPRESSION_TEMPLATES, row: "{names}→{university}" },
    }));
    const text = textOf(contents[0]!.rows.flatMap((row) => row.lines)).join("");
    expect(text).toContain("同学→");
  });

  it("marks an all-international group and leaves its province empty", () => {
    const contents = buildPreparedCardContents(options({
      groups: buildLayoutGroups([
        ...students,
        { id: "s4", name: "何遥", university: "东京大学", city: "东京", locationScope: "international", visibility: true },
      ], "province"),
    }));
    const overseas = contents.find((content) => content.group.key === "海外")!;

    expect(overseas.isInternational).toBe(true);
    expect(overseas.province).toBe("");
  });
});

describe("resolveCardAnchor", () => {
  const map = { x: 0, y: 0, width: 800, height: 600, scale: 1 };

  it("returns the projected point unchanged for an untransformed map", () => {
    expect(resolveCardAnchor([120, 240], map)).toEqual({ anchorX: 120, anchorY: 240 });
  });

  it("pans and zooms around the map center", () => {
    const panned = resolveCardAnchor([120, 240], { ...map, x: 50, y: -20 });
    expect(panned).toEqual({ anchorX: 170, anchorY: 220 });

    // 0.5x around the (400, 300) center: 120 → 400 + (120 - 400) * 0.5.
    expect(resolveCardAnchor([120, 240], { ...map, scale: 0.5 })).toEqual({ anchorX: 260, anchorY: 270 });
  });

  it("falls back to the map center when a coordinate is missing or non-finite", () => {
    expect(resolveCardAnchor(null, map)).toEqual({ anchorX: 400, anchorY: 300 });
    expect(resolveCardAnchor([Number.NaN, 240], { ...map, x: 10, y: 10 }))
      .toEqual({ anchorX: 410, anchorY: 250 });
  });
});
