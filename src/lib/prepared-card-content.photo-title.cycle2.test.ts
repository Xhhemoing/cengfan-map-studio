import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "./card-expression";
import {
  DESTINATION_CARD_PHOTO_HEADER_OFFSET,
  destinationCardHeaderOffset,
} from "./destination-card-metrics";
import {
  computePreparedCardMetrics,
  type PreparedCardContentOptions,
} from "./prepared-card-content";

function options(headerOffset: number): PreparedCardContentOptions {
  return {
    groups: [],
    grouping: "province",
    visibleFields: ["university", "name"],
    citySubgroups: true,
    expressionTemplates: DEFAULT_CARD_EXPRESSION_TEMPLATES,
    nameFormat: "{name}",
    fontSize: 13,
    compactLayout: false,
    maxWidth: 320,
    horizontalPadding: 12,
    bottomPadding: 12,
    showProvinceTexture: false,
    headerOffset,
    lineHeightMultiplier: 1,
    canvasWidth: 1200,
    safeMargin: 40,
  };
}

describe("prepared card photo-preset title metrics", () => {
  it("narrows the photo title wrap width by its header offset", () => {
    const standard = computePreparedCardMetrics(options(destinationCardHeaderOffset("standard")));
    const headerOffset = destinationCardHeaderOffset("photo");
    const photo = computePreparedCardMetrics(options(headerOffset));

    expect(headerOffset).toBe(DESTINATION_CARD_PHOTO_HEADER_OFFSET);
    expect(photo.cardWidth).toBe(standard.cardWidth);
    expect(photo.contentWidth).toBe(standard.contentWidth);
    expect(photo.titleWidth).toBe(standard.titleWidth - headerOffset);
  });
});
