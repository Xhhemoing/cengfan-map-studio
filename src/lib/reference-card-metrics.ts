import type { CardPresentation, CardSettings } from "./scene-document";
import { resolveFontFamily, type UserFont } from "./fonts";
import { DEFAULT_CARD_FONT_FAMILY, wrapStyledCardText, type CardTextMeasure } from "./styled-card-text";

export type ReferencePresentation = Exclude<CardPresentation, "standard">;

/** Shared by text preparation and SVG paint: every baseline is measured in poster units. */
export interface ReferenceCardMetrics {
  titleFontSize: number;
  titleLineHeight: number;
  titleBaseline: number;
  titleX: number;
  titleWidth: number;
  countLines: string[];
  countBaseline: number;
  countLineHeight: number;
  headerBottom: number;
  rowFontSize: number;
  rowHeight: number;
  bodyBaseline: number;
  bodyX: number;
  contentWidth: number;
  horizontalPadding: number;
  height: number;
}

export interface ReferenceCardMetricsInput {
  presentation: ReferencePresentation;
  width: number;
  fontSize: number;
  fieldTypography?: CardSettings["fieldTypography"];
  fieldFonts?: CardSettings["fieldFonts"];
  userFonts?: UserFont[];
  measureText?: CardTextMeasure;
  visibleFields?: CardSettings["visibleFields"];
  horizontalPadding: number;
  bottomPadding?: number;
  topPadding?: number;
  lineHeightMultiplier: number;
  compactLayout?: boolean;
  showCount: boolean;
  count?: number;
  titleLineCount?: number;
  bodyLineCount?: number;
}

const TITLE_SIZE_OFFSET: Record<ReferencePresentation, number> = {
  "color-pill": 5,
  "emblem-list": 5,
  "city-label": 8,
  "glass-stat": 2,
};
const TITLE_TOP: Record<ReferencePresentation, number> = {
  "color-pill": 2,
  "emblem-list": 3,
  "city-label": 0,
  "glass-stat": 6,
};
const DEFAULT_TOP_PADDING: Record<ReferencePresentation, number> = { "color-pill": 12, "emblem-list": 12, "city-label": 12, "glass-stat": 12 };
const BODY_GAP: Record<ReferencePresentation, number> = {
  "color-pill": 5,
  "emblem-list": 8,
  "city-label": 7,
  "glass-stat": 14,
};

export function referenceCardMetrics(input: ReferenceCardMetricsInput): ReferenceCardMetrics {
  const { presentation, fieldTypography, fontSize, width, showCount } = input;
  const padding = Math.max(0, input.horizontalPadding);
  const titleFontSize = fieldTypography?.title?.fontSize ?? fontSize + TITLE_SIZE_OFFSET[presentation];
  const rowFontSize = Math.max(fontSize, ...(input.visibleFields ?? ["name", "university", "city"])
    .map((field) => fieldTypography?.[field]?.fontSize ?? fontSize));
  // A small line-height preference cannot make two large glyph boxes overlap.
  const titleLineHeight = Math.max(titleFontSize + 2, (titleFontSize + 4) * input.lineHeightMultiplier);
  const rowHeight = Math.max(rowFontSize + 2,
    Math.max(presentation === "emblem-list" ? 22 : 17, rowFontSize + (input.compactLayout ? 4 : 5)) * input.lineHeightMultiplier);
  const titleInset = presentation === "emblem-list" ? 16 : presentation === "glass-stat" ? 21 : 0;
  const bodyInset = presentation === "emblem-list" || presentation === "city-label" ? 22 : 0;
  const countText = `${input.count ?? 0} 人`;
  const measuredCountWidth = input.measureText?.(countText, {
    fontFamily: resolveFontFamily(input.fieldFonts?.title, input.userFonts ?? []) ?? DEFAULT_CARD_FONT_FAMILY,
    fontSize, fontWeight: 800,
  });
  const countWidth = showCount ? Math.max(38,
    (measuredCountWidth !== undefined && Number.isFinite(measuredCountWidth) && measuredCountWidth >= 0
      ? measuredCountWidth : (String(input.count ?? 0).length + 2) * fontSize) + 8) : 0;
  const separateCount = showCount && width - padding * 2 - titleInset - countWidth < titleFontSize;
  const titleWidth = Math.max(titleFontSize, width - padding * 2 - titleInset - (separateCount ? 0 : countWidth));
  const topDelta = input.topPadding === undefined ? 0 : input.topPadding - DEFAULT_TOP_PADDING[presentation];
  const titleBaseline = Math.max(0, TITLE_TOP[presentation] + topDelta) + titleFontSize;
  const titleBottom = titleBaseline + (Math.max(1, input.titleLineCount ?? 1) - 1) * titleLineHeight;
  const countLines = !showCount ? [] : separateCount
    ? wrapStyledCardText([{ text: countText, field: "title" }], Math.max(fontSize, width - padding * 2), {
      fontSize, fontWeight: 800, fieldFonts: input.fieldFonts, userFonts: input.userFonts, measureText: input.measureText,
    }).map((line) => line.map((fragment) => fragment.text).join(""))
    : [countText];
  const countLineHeight = Math.max(fontSize + 2, (fontSize + 4) * input.lineHeightMultiplier);
  const countBaseline = separateCount ? titleBottom + fontSize + 5 : Math.max(titleBaseline, fontSize + 2 + topDelta);
  const headerBottom = showCount ? Math.max(titleBottom, countBaseline + (countLines.length - 1) * countLineHeight) : titleBottom;
  const bodyBaseline = headerBottom + BODY_GAP[presentation] + rowFontSize;
  const lineCount = input.bodyLineCount ?? 0;
  const bottom = lineCount > 0
    ? bodyBaseline + (lineCount - 1) * rowHeight + Math.max(3, rowFontSize * 0.25)
    : headerBottom + 4;
  return {
    titleFontSize, titleLineHeight, titleBaseline,
    titleX: presentation === "color-pill" ? padding + titleWidth / 2 : padding + titleInset,
    titleWidth, countLines, countBaseline, countLineHeight, headerBottom, rowFontSize, rowHeight, bodyBaseline,
    bodyX: padding + bodyInset,
    contentWidth: Math.max(rowFontSize, width - padding * 2 - bodyInset),
    horizontalPadding: padding,
    height: bottom + (input.bottomPadding ?? padding),
  };
}
