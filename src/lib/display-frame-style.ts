import type { TextAlign } from "./scene-document";
import type {
  DisplayFrameField,
  DisplayFrameFixedItem,
  DisplayFrameFlowBlock,
  DisplayFrameFontWeight,
  DisplayFrameItemKind,
  DisplayFrameItemStyle,
  DisplayFrameStyle,
} from "./display-frame";

export type DisplayFrameTextAnchor = "start" | "middle" | "end";

export const DISPLAY_FRAME_DEFAULT_BORDER_WIDTH = 1;
export const DISPLAY_FRAME_DEFAULT_BORDER_RADIUS = 6;
export const DISPLAY_FRAME_DEFAULT_DECORATION_FILL = "transparent";
export const DISPLAY_FRAME_CITY_MIN_FONT_SIZE = 9;
const FONT_WEIGHT_VALUES: Record<DisplayFrameFontWeight, number> = { normal: 400, medium: 500, bold: 700 };

/** Paint properties of the frame surface itself, with every optional field already defaulted. */
export interface ResolvedDisplayFrameSurface {
  background: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  margin: number;
  color: string;
  fontSize: number;
  align: TextAlign;
  fontId?: string;
}

/** Paint properties of one frame item. `fill` fills the glyphs for text, the shape for decorations. */
export interface ResolvedDisplayFramePaint {
  kind: DisplayFrameItemKind;
  color: string;
  fill: string;
  strokeWidth: number;
  fontSize: number;
  fontWeight: number;
  opacity: number;
  align: TextAlign;
  textAnchor: DisplayFrameTextAnchor;
  fontId?: string;
}

export function displayFrameFontWeightValue(weight: DisplayFrameFontWeight | undefined, fallback: number): number {
  return weight ? FONT_WEIGHT_VALUES[weight] : fallback;
}

export function displayFrameTextAnchor(align: TextAlign): DisplayFrameTextAnchor {
  if (align === "center") return "middle";
  if (align === "right") return "end";
  return "start";
}

export function resolveDisplayFrameSurface(style: DisplayFrameStyle): ResolvedDisplayFrameSurface {
  return {
    background: style.background,
    opacity: style.opacity,
    borderColor: style.borderColor ?? style.color,
    borderWidth: style.borderWidth ?? DISPLAY_FRAME_DEFAULT_BORDER_WIDTH,
    borderRadius: style.borderRadius ?? DISPLAY_FRAME_DEFAULT_BORDER_RADIUS,
    padding: style.padding,
    margin: style.margin,
    color: style.color,
    fontSize: style.fontSize,
    align: style.align,
    ...(style.fontId ? { fontId: style.fontId } : {}),
  };
}

/** Cards render the city line one step smaller than the base size; frame items follow the same rhythm. */
export function resolveDisplayFrameFieldFontSize(field: DisplayFrameField | undefined, baseFontSize: number): number {
  return field === "city" ? Math.max(DISPLAY_FRAME_CITY_MIN_FONT_SIZE, baseFontSize - 1) : baseFontSize;
}

function resolvePaint(
  kind: DisplayFrameItemKind,
  field: DisplayFrameField | undefined,
  style: DisplayFrameItemStyle | undefined,
  surface: ResolvedDisplayFrameSurface,
): ResolvedDisplayFramePaint {
  const color = style?.color ?? surface.color;
  const fontSize = style?.fontSize ?? resolveDisplayFrameFieldFontSize(kind === "field" ? field : undefined, surface.fontSize);
  const align = style?.align ?? surface.align;
  return {
    kind,
    color,
    fill: kind === "decoration" ? style?.fill ?? DISPLAY_FRAME_DEFAULT_DECORATION_FILL : color,
    strokeWidth: style?.strokeWidth ?? DISPLAY_FRAME_DEFAULT_BORDER_WIDTH,
    fontSize,
    fontWeight: displayFrameFontWeightValue(style?.fontWeight, kind === "field" && field === "title" ? 700 : 400),
    opacity: style?.opacity ?? 1,
    align,
    textAnchor: displayFrameTextAnchor(align),
    ...(style?.fontId ?? surface.fontId ? { fontId: style?.fontId ?? surface.fontId } : {}),
  };
}

export function resolveDisplayFrameItemPaint(
  item: DisplayFrameFixedItem,
  surface: ResolvedDisplayFrameSurface,
): ResolvedDisplayFramePaint {
  return resolvePaint(item.kind, item.field, item.style, surface);
}

export function resolveDisplayFrameBlockPaint(
  block: DisplayFrameFlowBlock,
  surface: ResolvedDisplayFrameSurface,
): ResolvedDisplayFramePaint {
  return resolvePaint(block.kind, block.field, block.style, surface);
}

/** Horizontal anchor point matching `textAnchor`, so alignment never shifts the item box. */
export function displayFrameTextX(item: DisplayFrameFixedItem, paint: ResolvedDisplayFramePaint): number {
  if (paint.textAnchor === "middle") return item.x + item.width / 2;
  if (paint.textAnchor === "end") return item.x + item.width;
  return item.x;
}

/** Alphabetic baseline used by the canvas: one line down from the box top, clipped to the box height. */
export function displayFrameTextBaseline(item: DisplayFrameFixedItem, paint: ResolvedDisplayFramePaint): number {
  return item.y + Math.min(item.height, paint.fontSize);
}
