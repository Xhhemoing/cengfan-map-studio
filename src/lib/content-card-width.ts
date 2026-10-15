import type { CardTextFragment } from "./card-text-layout";
import type { CardFontField } from "./scene-document";
import type { PreparedCardContentOptions } from "./prepared-card-content";
import type { PreparedCardMetrics } from "./prepared-card-metrics";
import { cardFieldFontSize } from "./prepared-card-metrics";
import { measureStyledCardText, type StyledCardTextOptions } from "./styled-card-text";

export function cardRowTextOptions(options: PreparedCardContentOptions, cityHeading: boolean): StyledCardTextOptions {
  const reference = options.presentation && options.presentation !== "standard";
  return {
    fontSize: cityHeading ? cardFieldFontSize("city", options.fontSize, options.fieldTypography) : options.fontSize,
    fontWeight: cityHeading ? reference ? 800 : 700 : reference ? options.presentation === "color-pill" || options.presentation === "city-label" ? 600 : 500 : 400,
    fieldTypography: options.fieldTypography, fieldFonts: options.fieldFonts, userFonts: options.userFonts,
    preserveFields: options.noWrapFields, measureText: options.measureText,
  };
}

/** Select a width before wrapping. Content remains intact when its natural width exceeds the cap. */
export function resolveContentCardWidth(
  options: PreparedCardContentOptions,
  metrics: PreparedCardMetrics,
  title: string,
  rows: Array<{ fragments: CardTextFragment<CardFontField>[]; row: { cityHeading?: string } }>,
): number {
  if (options.widthMode !== "content") return metrics.cardWidth;
  const minimum = Math.min(metrics.cardWidth, Math.max(80, options.minWidth ?? 80));
  const bodyChrome = metrics.cardWidth - metrics.contentWidth;
  const titleChrome = metrics.cardWidth - metrics.titleWidth;
  const widestRow = Math.max(0, ...rows.map(({ fragments, row }) =>
    measureStyledCardText(fragments, cardRowTextOptions(options, Boolean(row.cityHeading)))));
  const reference = options.presentation && options.presentation !== "standard";
  const titleWidth = measureStyledCardText([{ text: title, field: "title" }], {
    fontSize: metrics.titleFontSize, fontWeight: options.presentation === "city-label" ? 900 : reference ? 800 : 700,
    fieldFonts: options.fieldFonts, userFonts: options.userFonts, measureText: options.measureText,
  });
  return Math.min(metrics.cardWidth, Math.max(minimum, Math.ceil(Math.max(widestRow + bodyChrome, titleWidth + titleChrome))));
}
