import type { CardFontField, CardSettings } from "./scene-document";
import type { PreparedCardContentOptions } from "./prepared-card-content";
import { DESTINATION_CARD_TEXTURE_HEADER_WIDTH, destinationCardFixedRowHeight, destinationCardRowFontSize, destinationCardTitleLineHeight } from "./destination-card-metrics";

/** Shared vertical/horizontal metrics every card in a document uses. */
export interface PreparedCardMetrics {
  /** Largest size a body line can paint; body text wraps and steps against it. */
  rowFontSize: number;
  /** Fixed-mode step between body lines, the one the card renderer walks rows with. */
  rowHeight: number;
  titleFontSize: number;
  titleLineHeight: number;
  cardWidth: number;
  contentWidth: number;
  /** Available width for the title once the count badge and thumbnail are reserved. */
  titleWidth: number;
}

/** Effective font size of one card field, falling back to the card font size
 *  (city rows sit one step smaller unless overridden). */
export function cardFieldFontSize(
  field: CardFontField,
  fontSize: number,
  fieldTypography?: CardSettings["fieldTypography"],
): number {
  return fieldTypography?.[field]?.fontSize
    ?? (field === "city" ? Math.max(9, fontSize - 1) : fontSize);
}

export function computePreparedCardMetrics(options: PreparedCardContentOptions): PreparedCardMetrics {
  const fieldFontSize = (field: CardFontField) => cardFieldFontSize(field, options.fontSize, options.fieldTypography);
  const rowFontSize = destinationCardRowFontSize({
    // A row field keeps the card font size even when it is `city`: only the city *heading*
    // shrinks one step, and it joins the step separately below.
    visibleFieldFontSizes: options.visibleFields.map((field) => options.fieldTypography?.[field]?.fontSize ?? options.fontSize),
    cityHeadingFontSize: fieldFontSize("city"),
  });
  const titleFontSize = fieldFontSize("title");
  const cardWidth = Math.min(options.maxWidth, Math.max(80, options.canvasWidth - options.safeMargin * 2));
  const contentWidth = Math.max(rowFontSize, cardWidth - options.horizontalPadding * 2);
  const textureHeaderWidth = options.showProvinceTexture ? DESTINATION_CARD_TEXTURE_HEADER_WIDTH : 0;
  const headerOffset = options.headerOffset ?? 0;
  return {
    rowFontSize,
    rowHeight: destinationCardFixedRowHeight({
      rowFontSize,
      compactLayout: options.compactLayout,
      lineHeightMultiplier: options.lineHeightMultiplier,
    }),
    titleFontSize,
    titleLineHeight: destinationCardTitleLineHeight(titleFontSize, options.lineHeightMultiplier),
    cardWidth,
    contentWidth,
    titleWidth: Math.max(
      titleFontSize,
      contentWidth - Math.max(42, titleFontSize * 3) - textureHeaderWidth - headerOffset,
    ),
  };
}
