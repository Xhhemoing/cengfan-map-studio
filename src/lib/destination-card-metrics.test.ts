import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DESTINATION_CARD_COUNT_BASELINE,
  DESTINATION_CARD_DIVIDER_Y,
  DESTINATION_CARD_FIXED_BODY_TOP,
  DESTINATION_CARD_HEADER_HEIGHT,
  DESTINATION_CARD_TITLE_TOP,
  destinationCardAvatar,
  destinationCardBodyBaseline,
  destinationCardBodyTop,
  destinationCardDividerY,
  destinationCardFlowRowHeight,
  destinationCardHeaderOffset,
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

describe("destination card chrome metrics", () => {
  it("stacks the header band in the order the card paints it", () => {
    expect(DESTINATION_CARD_TITLE_TOP).toBeLessThan(DESTINATION_CARD_COUNT_BASELINE);
    expect(DESTINATION_CARD_COUNT_BASELINE).toBeLessThan(DESTINATION_CARD_DIVIDER_Y);
    expect(DESTINATION_CARD_DIVIDER_Y).toBeLessThan(DESTINATION_CARD_FIXED_BODY_TOP);
    expect(DESTINATION_CARD_FIXED_BODY_TOP).toBeLessThanOrEqual(DESTINATION_CARD_HEADER_HEIGHT);
  });

  it("keeps the reserved header height in sync with the card height solver", () => {
    // The solver still inlines the literal. Only assert when the expression is found, so moving
    // it to another canvas file (or importing the token) does not fail this test spuriously.
    const canvasDir = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "canvas");
    const sources = readdirSync(canvasDir)
      .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
      .map((file) => readFileSync(join(canvasDir, file), "utf8"));
    const literals = sources.flatMap((source) => [
      ...source.matchAll(/(\d+)\s*\+\s*headerExtra\s*\+\s*lineCount\s*\*\s*rowHeight/g),
    ].map((match) => Number(match[1])));
    for (const literal of literals) expect(literal).toBe(DESTINATION_CARD_HEADER_HEIGHT);
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

  it("reserves header room for the photo avatar and the province thumbnail", () => {
    expect(destinationCardHeaderOffset("photo")).toBe(32);
    expect(destinationCardHeaderOffset("standard")).toBe(0);
    expect(destinationCardHeaderOffset("ticket")).toBe(0);

    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 0, hasTexture: false })).toBe(12);
    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 32, hasTexture: false })).toBe(44);
    expect(destinationCardTitleX({ anchorX: 12, headerOffset: 32, hasTexture: true })).toBe(80);
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
