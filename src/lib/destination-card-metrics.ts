import type { DisplayFrameMode } from "./display-frame";
import type { ResolvedDisplayFrameSurface } from "./display-frame-style";
import type { CardPreset } from "./template-document";

/**
 * Chrome geometry of the standard destination card: the header band (title, count, divider),
 * the preset ornaments and the first body baseline. The card solver in `PosterCanvas` reserves
 * space for this band, so every number here is part of the rendered layout contract rather than
 * a free styling choice — changing one moves text inside a card whose height was already solved.
 */

/**
 * Height the card solver reserves above the body rows: the divider at
 * {@link DESTINATION_CARD_DIVIDER_Y} plus room for the first row baseline at
 * {@link DESTINATION_CARD_FIXED_BODY_TOP}.
 */
export const DESTINATION_CARD_HEADER_HEIGHT = 44;

/** Top of the title box, matching the default `title` fixed item and the flow cursor origin. */
export const DESTINATION_CARD_TITLE_TOP = 12;

/** Baseline of the "N 人" counter, sitting one text line under the card top. */
export const DESTINATION_CARD_COUNT_BASELINE = 22;

/** Divider between header and body, drawn across the padding box for every bordered preset. */
export const DESTINATION_CARD_DIVIDER_Y = 30;

/** First body baseline in fixed mode when the frame supplies no body item of its own. */
export const DESTINATION_CARD_FIXED_BODY_TOP = 42;

/** Gap between the flow title block and the first body row in flow mode. */
export const DESTINATION_CARD_FLOW_BODY_GAP = 8;

/** Floor and leading of one title line; the solver counts title lines at the same step. */
export const DESTINATION_CARD_TITLE_LINE_MIN_HEIGHT = 16;
export const DESTINATION_CARD_TITLE_LINE_LEADING = 4;

/** Floor of one flow body line. Fixed mode floors at {@link DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT}. */
export const DESTINATION_CARD_ROW_LINE_MIN_HEIGHT = 16;

/** Leading of one body line, shared by the solved fixed step and the per-block flow step. */
export const DESTINATION_CARD_ROW_LINE_LEADING = 6;

/** Floor of one fixed-mode body row; the compact layout tightens it. */
export const DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT = 20;
export const DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT = 18;

/** Leading a flow block falls back to when it declares none. */
export const DESTINATION_CARD_FLOW_LINE_HEIGHT = 1.2;

/**
 * Horizontal room the province thumbnail takes out of the header. The card solver subtracts the
 * same width from the title wrap width, so the title never runs under the thumbnail.
 */
export const DESTINATION_CARD_TEXTURE_HEADER_WIDTH = 36;
export const DESTINATION_CARD_TEXTURE_SIZE = 30;
export const DESTINATION_CARD_TEXTURE_TOP = 3;

/** Opacity shared by the tinted preset ornaments (ticket punch, photo avatar disc). */
export const DESTINATION_CARD_ORNAMENT_OPACITY = 0.2;

/** Photo preset: the avatar disc and its initial, drawn at the start of the header. */
export const DESTINATION_CARD_PHOTO_HEADER_OFFSET = 32;
export const DESTINATION_CARD_PHOTO_AVATAR_RADIUS = 13;
export const DESTINATION_CARD_PHOTO_AVATAR_CENTER_Y = 21;
export const DESTINATION_CARD_PHOTO_INITIAL_BASELINE = 25;
export const DESTINATION_CARD_PHOTO_INITIAL_FONT_SIZE = 11;
export const DESTINATION_CARD_PHOTO_INITIAL_FONT_WEIGHT = 700;

/** Ticket preset: the full-height stub on the left and the punch hole on the right. */
export const DESTINATION_CARD_TICKET_BORDER_RADIUS = 12;
export const DESTINATION_CARD_TICKET_ACCENT_WIDTH = 8;
export const DESTINATION_CARD_TICKET_ACCENT_RADIUS = 4;
export const DESTINATION_CARD_TICKET_PUNCH_INSET = 18;
export const DESTINATION_CARD_TICKET_PUNCH_RADIUS = 7;

/** How one preset overrides the frame surface. Absent keys leave the frame token untouched. */
export interface DestinationCardPresetOverlay {
  /** Corner radius replacing the frame's own `borderRadius`. */
  borderRadius?: number;
  /** The preset paints no border, so the surface stroke and the header divider both drop out. */
  borderless?: boolean;
  /** Horizontal room reserved at the start of the header for a preset ornament. */
  headerOffset?: number;
}

/**
 * Declarative preset overlay table. Presets missing from it — `standard` and `compact` — render
 * the frame surface exactly as the display-frame layer resolved it.
 */
export const DESTINATION_CARD_PRESET_OVERLAYS: Partial<Record<CardPreset, DestinationCardPresetOverlay>> = {
  ticket: { borderRadius: DESTINATION_CARD_TICKET_BORDER_RADIUS },
  borderless: { borderRadius: 0, borderless: true },
  photo: { headerOffset: DESTINATION_CARD_PHOTO_HEADER_OFFSET },
};

/** Surface paint after the preset overlay, ready to spread onto the card background rect. */
export interface DestinationCardSurfaceChrome {
  borderRadius: number;
  stroke: string;
  /** `undefined` for borderless cards so SVG keeps its own default rather than a 0-width stroke. */
  strokeWidth: number | undefined;
  /** The header divider is part of the card border, so it follows the same overlay. */
  showDivider: boolean;
}

export function destinationCardPresetOverlay(preset: CardPreset): DestinationCardPresetOverlay | undefined {
  return DESTINATION_CARD_PRESET_OVERLAYS[preset];
}

export function destinationCardSurfaceChrome(
  preset: CardPreset,
  surface: Pick<ResolvedDisplayFrameSurface, "borderColor" | "borderWidth" | "borderRadius">,
): DestinationCardSurfaceChrome {
  const overlay = destinationCardPresetOverlay(preset);
  return {
    borderRadius: overlay?.borderRadius ?? surface.borderRadius,
    stroke: overlay?.borderless ? "none" : surface.borderColor,
    strokeWidth: overlay?.borderless ? undefined : surface.borderWidth,
    showDivider: !overlay?.borderless,
  };
}

/**
 * Horizontal room a preset ornament takes at the start of the header (photo avatar today).
 *
 * Header-only on purpose. The avatar disc ends at {@link DESTINATION_CARD_PHOTO_AVATAR_CENTER_Y}
 * plus {@link DESTINATION_CARD_PHOTO_AVATAR_RADIUS}, above {@link DESTINATION_CARD_FIXED_BODY_TOP},
 * so body rows have nothing to clear — while their wrap width is solved from the full padding box
 * (`contentWidth` in `prepared-card-content`) without the offset. Indenting the body by it would
 * push the last glyph of every wrapped line past the card's right padding instead. The title does
 * start after the offset, so `titleWidth` alone pays for it. The metrics test guards the avatar
 * against growing down into the body band.
 */
export function destinationCardHeaderOffset(preset: CardPreset): number {
  return destinationCardPresetOverlay(preset)?.headerOffset ?? 0;
}

/** Title start, pushed right by whatever the preset and the province thumbnail already occupy. */
export function destinationCardTitleX(input: { anchorX: number; headerOffset: number; hasTexture: boolean }): number {
  return input.anchorX + input.headerOffset + (input.hasTexture ? DESTINATION_CARD_TEXTURE_HEADER_WIDTH : 0);
}

/** Top of the title box: the fixed item's own box, or the flow cursor plus the block spacing. */
export function destinationCardTitleTop(input: { mode: DisplayFrameMode; fixedItemY?: number; flowSpacing?: number }): number {
  if (input.mode === "fixed") return input.fixedItemY ?? DESTINATION_CARD_TITLE_TOP;
  return DESTINATION_CARD_TITLE_TOP + (input.flowSpacing ?? 0);
}

export function destinationCardTitleLineHeight(fontSize: number, lineHeight: number): number {
  return Math.max(DESTINATION_CARD_TITLE_LINE_MIN_HEIGHT, fontSize + DESTINATION_CARD_TITLE_LINE_LEADING) * lineHeight;
}

/** Baseline of title line `index`, counted from the title top one line height at a time. */
export function destinationCardTitleBaseline(input: { top: number; index: number; fontSize: number; lineHeight: number }): number {
  return input.top + (input.index + 1) * destinationCardTitleLineHeight(input.fontSize, input.lineHeight);
}

/** Divider baseline; extra title lines push the whole body band down by the same amount. */
export function destinationCardDividerY(headerExtra: number): number {
  return DESTINATION_CARD_DIVIDER_Y + headerExtra;
}

/** First body baseline before `headerExtra`: the fixed body box, or the end of the flow header. */
export function destinationCardBodyTop(input: {
  mode: DisplayFrameMode;
  fixedItemY?: number;
  flowContentStart: number;
  flowTitleFontSize: number;
}): number {
  if (input.mode === "fixed") return input.fixedItemY ?? DESTINATION_CARD_FIXED_BODY_TOP;
  return input.flowContentStart + input.flowTitleFontSize + DESTINATION_CARD_FLOW_BODY_GAP;
}

/** Flow-mode step between body lines: each block carries its own size and leading. */
export function destinationCardFlowRowHeight(fontSize: number, lineHeight: number): number {
  return Math.max(DESTINATION_CARD_ROW_LINE_MIN_HEIGHT, fontSize + DESTINATION_CARD_ROW_LINE_LEADING) * lineHeight;
}

/**
 * Font size the fixed-mode row step is measured from. Every body line of a document steps by
 * the same height, so it follows the largest text a line can hold: each visible field at the
 * size its row paints it with, plus the city heading, which province cards draw even when
 * `city` is not a row field of its own.
 *
 * A visible `city` field counts at the plain card font size rather than the one-step-smaller
 * heading size: inside a normal row the city is a `tspan` that inherits the row's own size
 * unless `fieldTypography.city` overrides it. Measuring it with `cardFieldFontSize` instead
 * would under-reserve the step and drop the last line past the card's bottom padding.
 */
export function destinationCardRowFontSize(input: {
  visibleFieldFontSizes: readonly number[];
  cityHeadingFontSize: number;
}): number {
  return Math.max(...input.visibleFieldFontSizes, input.cityHeadingFontSize);
}

/** Fixed-mode step between body lines, solved once per document and reused by every card. */
export function destinationCardFixedRowHeight(input: {
  rowFontSize: number;
  compactLayout: boolean;
  lineHeightMultiplier: number;
}): number {
  return Math.max(
    input.compactLayout ? DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT : DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT,
    input.rowFontSize + DESTINATION_CARD_ROW_LINE_LEADING,
  ) * input.lineHeightMultiplier;
}

/**
 * The step a card walks its body lines with: the solved document-wide step in fixed mode,
 * where the card height was reserved from it, or the block's own step in flow mode.
 */
export function destinationCardBodyRowHeight(input: {
  mode: DisplayFrameMode;
  solvedRowHeight: number;
  fontSize: number;
  lineHeight?: number;
}): number {
  if (input.mode === "fixed") return input.solvedRowHeight;
  return destinationCardFlowRowHeight(input.fontSize, input.lineHeight ?? DESTINATION_CARD_FLOW_LINE_HEIGHT);
}

export function destinationCardBodyBaseline(input: {
  top: number;
  headerExtra: number;
  lineIndex: number;
  rowHeight: number;
}): number {
  return input.top + input.headerExtra + input.lineIndex * input.rowHeight;
}

/** Province thumbnail box, sharing the header offset with the preset ornament next to it. */
export function destinationCardTextureBox(horizontalPadding: number, headerOffset: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: horizontalPadding + headerOffset,
    y: DESTINATION_CARD_TEXTURE_TOP,
    width: DESTINATION_CARD_TEXTURE_SIZE,
    height: DESTINATION_CARD_TEXTURE_SIZE,
  };
}

/** Photo preset avatar disc and the baseline of the initial centred inside it. */
export function destinationCardAvatar(horizontalPadding: number): {
  cx: number;
  cy: number;
  r: number;
  initialBaseline: number;
  fontSize: number;
  opacity: number;
} {
  return {
    cx: horizontalPadding + DESTINATION_CARD_PHOTO_AVATAR_RADIUS,
    cy: DESTINATION_CARD_PHOTO_AVATAR_CENTER_Y,
    r: DESTINATION_CARD_PHOTO_AVATAR_RADIUS,
    initialBaseline: DESTINATION_CARD_PHOTO_INITIAL_BASELINE,
    fontSize: DESTINATION_CARD_PHOTO_INITIAL_FONT_SIZE,
    opacity: DESTINATION_CARD_ORNAMENT_OPACITY,
  };
}

/** Ticket preset stub and punch hole, both measured from the solved card box. */
export function destinationCardTicketOrnaments(width: number, height: number): {
  accent: { width: number; height: number; rx: number };
  punch: { cx: number; cy: number; r: number; opacity: number };
} {
  return {
    accent: { width: DESTINATION_CARD_TICKET_ACCENT_WIDTH, height, rx: DESTINATION_CARD_TICKET_ACCENT_RADIUS },
    punch: {
      cx: width - DESTINATION_CARD_TICKET_PUNCH_INSET,
      cy: DESTINATION_CARD_TICKET_PUNCH_INSET,
      r: DESTINATION_CARD_TICKET_PUNCH_RADIUS,
      opacity: DESTINATION_CARD_ORNAMENT_OPACITY,
    },
  };
}
