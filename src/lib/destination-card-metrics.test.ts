import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT,
  DESTINATION_CARD_COUNT_BASELINE,
  DESTINATION_CARD_DIVIDER_Y,
  DESTINATION_CARD_FIXED_BODY_TOP,
  DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT,
  DESTINATION_CARD_HEADER_HEIGHT,
  DESTINATION_CARD_PHOTO_AVATAR_CENTER_Y,
  DESTINATION_CARD_PHOTO_AVATAR_RADIUS,
  DESTINATION_CARD_ROW_LINE_LEADING,
  DESTINATION_CARD_TITLE_TOP,
  destinationCardAvatar,
  destinationCardBodyBaseline,
  destinationCardBodyRowHeight,
  destinationCardBodyTop,
  destinationCardDividerY,
  destinationCardFixedRowHeight,
  destinationCardFlowRowHeight,
  destinationCardHeaderOffset,
  destinationCardRowFontSize,
  destinationCardSurfaceChrome,
  destinationCardTextureBox,
  destinationCardTicketOrnaments,
  destinationCardTitleBaseline,
  destinationCardTitleTop,
  destinationCardTitleX,
} from "./destination-card-metrics";
import type { ResolvedDisplayFrameSurface } from "./display-frame-style";

const surface: Pick<ResolvedDisplayFrameSurface, "borderColor" | "borderWidth" | "borderRadius"> = {
  borderColor: "#1c3154",
  borderWidth: 1,
  borderRadius: 6,
};

/** Every rendering canvas source, so the layout contract can be asserted against them. */
function canvasSources(): Array<[string, string]> {
  const canvasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "canvas");
  return readdirSync(canvasDir)
    .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
    .map((file): [string, string] => [file, readFileSync(join(canvasDir, file), "utf8")]);
}

describe("destination card chrome metrics", () => {
  it("stacks the header band in the order the card paints it", () => {
    expect(DESTINATION_CARD_TITLE_TOP).toBeLessThan(DESTINATION_CARD_COUNT_BASELINE);
    expect(DESTINATION_CARD_COUNT_BASELINE).toBeLessThan(DESTINATION_CARD_DIVIDER_Y);
    expect(DESTINATION_CARD_DIVIDER_Y).toBeLessThan(DESTINATION_CARD_FIXED_BODY_TOP);
    expect(DESTINATION_CARD_FIXED_BODY_TOP).toBeLessThanOrEqual(DESTINATION_CARD_HEADER_HEIGHT);
  });

  it("owns the header height and the fixed row step instead of leaving them to canvas literals", () => {
    // Both numbers size the box a card's rows are painted into, so a canvas file re-deriving
    // either one can drift away from the solver without any test noticing.
    for (const [file, source] of canvasSources()) {
      expect(source, `${file} re-inlines the reserved header height`)
        .not.toMatch(/\d+\s*\+\s*headerExtra\s*\+\s*lineCount\s*\*\s*rowHeight/);
      expect(source, `${file} re-inlines the fixed row step floors`)
        .not.toMatch(/compactLayout \?\s*\d+\s*:\s*\d+/);
    }

    const [, posterCanvas] = canvasSources().find(([file]) => file === "PosterCanvas.tsx")!;
    expect(posterCanvas).toContain("destinationCardFixedRowHeight");
    expect(posterCanvas).toContain("destinationCardRowFontSize");
  });

  it("pushes the divider down by the extra title lines", () => {
    expect(destinationCardDividerY(0)).toBe(30);
    expect(destinationCardDividerY(18)).toBe(48);
  });

  it("resolves the title top from the fixed item box or the flow spacing", () => {
    expect(destinationCardTitleTop({ mode: "fixed", fixedItemY: 20 })).toBe(20);
    expect(destinationCardTitleTop({ mode: "fixed" })).toBe(DESTINATION_CARD_TITLE_TOP);
    expect(destinationCardTitleTop({ mode: "flow", fixedItemY: 20 })).toBe(DESTINATION_CARD_TITLE_TOP);
    expect(destinationCardTitleTop({ mode: "flow", flowSpacing: 6 })).toBe(18);
  });

  it("steps title baselines by the leaded line height with a floor", () => {
    expect(destinationCardTitleBaseline({ top: 12, index: 0, fontSize: 12, lineHeight: 1 })).toBe(28);
    expect(destinationCardTitleBaseline({ top: 12, index: 1, fontSize: 12, lineHeight: 1 })).toBe(44);
    // Below the floor the step stays 16, so tiny fonts never collide.
    expect(destinationCardTitleBaseline({ top: 0, index: 0, fontSize: 8, lineHeight: 1 })).toBe(16);
    expect(destinationCardTitleBaseline({ top: 0, index: 0, fontSize: 20, lineHeight: 1.5 })).toBe(36);
  });

  it("resolves the body top from the fixed item box or the flow header end", () => {
    expect(destinationCardBodyTop({ mode: "fixed", fixedItemY: 50, flowContentStart: 0, flowTitleFontSize: 12 })).toBe(50);
    expect(destinationCardBodyTop({ mode: "fixed", flowContentStart: 0, flowTitleFontSize: 12 })).toBe(DESTINATION_CARD_FIXED_BODY_TOP);
    expect(destinationCardBodyTop({ mode: "flow", flowContentStart: 40, flowTitleFontSize: 12 })).toBe(60);
  });

  it("steps body baselines from the body top after the header offset", () => {
    expect(destinationCardBodyBaseline({ top: 42, headerExtra: 0, lineIndex: 0, rowHeight: 20 })).toBe(42);
    expect(destinationCardBodyBaseline({ top: 42, headerExtra: 0, lineIndex: 2, rowHeight: 20 })).toBe(82);
    expect(destinationCardBodyBaseline({ top: 42, headerExtra: 16, lineIndex: 1, rowHeight: 20 })).toBe(78);
  });

  it("floors the flow row height at the minimum line box", () => {
    expect(destinationCardFlowRowHeight(12, 1.2)).toBeCloseTo(21.6, 5);
    expect(destinationCardFlowRowHeight(8, 1)).toBe(16);
  });

  it("measures the fixed row step from the largest field on the card", () => {
    expect(destinationCardRowFontSize({ visibleFieldFontSizes: [13, 13], cityHeadingFontSize: 12 })).toBe(13);
    // A city-only card still steps at the row size, not at the smaller heading size.
    expect(destinationCardRowFontSize({ visibleFieldFontSizes: [16], cityHeadingFontSize: 15 })).toBe(16);
    // No visible field at all leaves the city heading as the only body text.
    expect(destinationCardRowFontSize({ visibleFieldFontSizes: [], cityHeadingFontSize: 15 })).toBe(15);
  });

  it("floors the fixed row step and tightens it for the compact layout", () => {
    expect(destinationCardFixedRowHeight({ rowFontSize: 13, compactLayout: false, lineHeightMultiplier: 1 })).toBe(20);
    expect(destinationCardFixedRowHeight({ rowFontSize: 13, compactLayout: true, lineHeightMultiplier: 1 })).toBe(19);
    expect(destinationCardFixedRowHeight({ rowFontSize: 16, compactLayout: false, lineHeightMultiplier: 1 })).toBe(22);
    expect(destinationCardFixedRowHeight({ rowFontSize: 16, compactLayout: false, lineHeightMultiplier: 1.5 })).toBe(33);

    // The floors and the leading those numbers are built from.
    expect(destinationCardFixedRowHeight({ rowFontSize: 0, compactLayout: false, lineHeightMultiplier: 1 }))
      .toBe(DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT);
    expect(destinationCardFixedRowHeight({ rowFontSize: 0, compactLayout: true, lineHeightMultiplier: 1 }))
      .toBe(DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT);
    expect(destinationCardFixedRowHeight({ rowFontSize: 40, compactLayout: false, lineHeightMultiplier: 1 }))
      .toBe(40 + DESTINATION_CARD_ROW_LINE_LEADING);
  });

  it("walks body lines with the solved step in fixed mode and the block step in flow mode", () => {
    expect(destinationCardBodyRowHeight({ mode: "fixed", solvedRowHeight: 22, fontSize: 40, lineHeight: 3 })).toBe(22);
    expect(destinationCardBodyRowHeight({ mode: "flow", solvedRowHeight: 22, fontSize: 12, lineHeight: 1.2 }))
      .toBeCloseTo(21.6, 5);
    // A flow block without its own leading falls back to the default one.
    expect(destinationCardBodyRowHeight({ mode: "flow", solvedRowHeight: 22, fontSize: 12 })).toBeCloseTo(21.6, 5);
  });

  it("reserves header room for the photo avatar and the province thumbnail", () => {
    expect(destinationCardHeaderOffset("photo")).toBe(32);
    expect(destinationCardHeaderOffset("standard")).toBe(0);
    expect(destinationCardHeaderOffset("ticket")).toBe(0);

    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 0, hasTexture: false })).toBe(12);
    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 32, hasTexture: false })).toBe(44);
    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 32, hasTexture: true })).toBe(80);
  });

  it("keeps the photo avatar above the body band so body rows need no header offset", () => {
    // Body rows wrap against the full padding box, so they may not be indented by the header
    // offset. That only holds while the avatar stops short of the first body baseline.
    expect(DESTINATION_CARD_PHOTO_AVATAR_CENTER_Y + DESTINATION_CARD_PHOTO_AVATAR_RADIUS)
      .toBeLessThanOrEqual(DESTINATION_CARD_FIXED_BODY_TOP);
  });

  it("places the thumbnail, avatar and ticket ornaments off the card box", () => {
    expect(destinationCardTextureBox(12, 0)).toEqual({ x: 12, y: 3, width: 30, height: 30 });
    expect(destinationCardTextureBox(12, 32)).toMatchObject({ x: 44 });

    expect(destinationCardAvatar(12)).toEqual({
      cx: 25,
      cy: 21,
      r: 13,
      initialBaseline: 25,
      fontSize: 11,
      opacity: 0.2,
    });

    expect(destinationCardTicketOrnaments(220, 110)).toEqual({
      accent: { width: 8, height: 110, rx: 4 },
      punch: { cx: 202, cy: 18, r: 7, opacity: 0.2 },
    });
  });

  it("keeps the frame surface untouched for presets without an overlay", () => {
    for (const preset of ["standard", "compact", "photo"] as const) {
      expect(destinationCardSurfaceChrome(preset, surface)).toEqual({
        borderRadius: 6,
        stroke: "#1c3154",
        strokeWidth: 1,
        showDivider: true,
      });
    }
  });

  it("rounds the ticket preset and strips the border of the borderless preset", () => {
    expect(destinationCardSurfaceChrome("ticket", surface)).toEqual({
      borderRadius: 12,
      stroke: "#1c3154",
      strokeWidth: 1,
      showDivider: true,
    });

    expect(destinationCardSurfaceChrome("borderless", surface)).toEqual({
      borderRadius: 0,
      stroke: "none",
      strokeWidth: undefined,
      showDivider: false,
    });
  });
});
