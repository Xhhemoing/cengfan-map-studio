import type { CardFontField, CardSettings, TextAlign, TextStyleOverride } from "./scene-document";

export type DisplayFrameMode = "fixed" | "flow";
export type DisplayFrameField = CardFontField;
export type DisplayFrameItemKind = "field" | "text" | "decoration";
export type DisplayFrameDecoration = "line" | "rectangle";
export type DisplayFrameFontWeight = "normal" | "medium" | "bold";

export interface DisplayFrameStyle {
  fontId?: string;
  fontSize: number;
  color: string;
  background: string;
  opacity: number;
  padding: number;
  margin: number;
  align: TextAlign;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
}

export interface DisplayFrameItemStyle {
  fontId?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: DisplayFrameFontWeight;
  align?: TextAlign;
  fill?: string;
  strokeWidth?: number;
}

export interface DisplayFrameFixedItem {
  id: string;
  kind: DisplayFrameItemKind;
  field?: DisplayFrameField;
  content?: string;
  decoration?: DisplayFrameDecoration;
  style?: DisplayFrameItemStyle;
  fontId?: string;
  fontSize?: number;
  color?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DisplayFrameFlowBlock {
  id: string;
  kind: Exclude<DisplayFrameItemKind, "decoration">;
  field?: DisplayFrameField;
  content?: string;
  style?: DisplayFrameItemStyle;
  fontId?: string;
  fontSize?: number;
  color?: string;
  order: number;
  spacing: number;
  lineHeight: number;
}

export interface DisplayFrameDefinition {
  mode: DisplayFrameMode;
  style: DisplayFrameStyle;
  fieldOrder: DisplayFrameField[];
  fixed: { items: DisplayFrameFixedItem[] };
  flow: { blocks: DisplayFrameFlowBlock[] };
}

const DISPLAY_FIELDS: readonly DisplayFrameField[] = ["title", "name", "university", "city"];
const DISPLAY_KINDS: readonly DisplayFrameItemKind[] = ["field", "text", "decoration"];
const DEFAULT_STYLE: DisplayFrameStyle = {
  fontSize: 12,
  color: "#1c3154",
  background: "#ffffff",
  opacity: 1,
  padding: 12,
  margin: 0,
  align: "left",
  borderColor: "#1c3154",
  borderWidth: 1,
  borderRadius: 6,
};

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return Math.min(maximum, Math.max(minimum, finite(value, fallback)));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function validField(value: unknown): value is DisplayFrameField {
  return typeof value === "string" && DISPLAY_FIELDS.includes(value as DisplayFrameField);
}

function validKind(value: unknown): value is DisplayFrameItemKind {
  return typeof value === "string" && DISPLAY_KINDS.includes(value as DisplayFrameItemKind);
}

function normalizeItemStyle(value: unknown, fallback: DisplayFrameItemStyle | undefined): DisplayFrameItemStyle | undefined {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fontId = optionalText(source.fontId) ?? fallback?.fontId;
  const fontSize = source.fontSize !== undefined ? clamp(source.fontSize, 8, 240, fallback?.fontSize ?? 12) : fallback?.fontSize;
  const color = optionalText(source.color) ?? fallback?.color;
  const fontWeight = source.fontWeight === "medium" || source.fontWeight === "bold" || source.fontWeight === "normal"
    ? source.fontWeight
    : fallback?.fontWeight;
  const align = source.align === "center" || source.align === "right" || source.align === "left"
    ? source.align
    : fallback?.align;
  const fill = optionalText(source.fill) ?? fallback?.fill;
  const strokeWidth = source.strokeWidth !== undefined ? clamp(source.strokeWidth, 0, 24, fallback?.strokeWidth ?? 1) : fallback?.strokeWidth;
  if (!fontId && fontSize === undefined && !color && !fontWeight && !align && !fill && strokeWidth === undefined) return undefined;
  return {
    ...(fontId ? { fontId } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(color ? { color } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(align ? { align } : {}),
    ...(fill ? { fill } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
  };
}

function normalizeFieldOrder(value: unknown, fallback: DisplayFrameField[]): DisplayFrameField[] {
  if (!Array.isArray(value)) return [...fallback];
  const fields = value.filter(validField).filter((field, index, all) => all.indexOf(field) === index);
  return fields.length > 0 ? fields : [...fallback];
}

function normalizeStyle(value: unknown, fallback = DEFAULT_STYLE): DisplayFrameStyle {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: DisplayFrameStyle = {
    fontSize: clamp(source.fontSize, 8, 240, fallback.fontSize),
    color: text(source.color, fallback.color),
    background: text(source.background, fallback.background),
    opacity: clamp(source.opacity, 0, 1, fallback.opacity),
    padding: clamp(source.padding, 0, 120, fallback.padding),
    margin: clamp(source.margin, 0, 120, fallback.margin),
    align: source.align === "center" || source.align === "right" ? source.align : fallback.align,
    borderColor: text(source.borderColor, fallback.borderColor ?? fallback.color),
    borderWidth: clamp(source.borderWidth, 0, 24, fallback.borderWidth ?? 1),
    borderRadius: clamp(source.borderRadius, 0, 120, fallback.borderRadius ?? 6),
  };
  const fontId = optionalText(source.fontId);
  if (fontId) result.fontId = fontId;
  return result;
}

function itemStyleFromCard(cards: CardSettings, field: DisplayFrameField): DisplayFrameItemStyle | undefined {
  const typography: TextStyleOverride | undefined = field === "title"
    ? cards.fieldTypography?.title
    : cards.fieldTypography?.[field];
  const fontId = cards.fieldFonts?.[field];
  if (!fontId && typography?.fontSize === undefined && !typography?.color) return undefined;
  return {
    ...(fontId ? { fontId } : {}),
    ...(typography?.fontSize !== undefined ? { fontSize: typography.fontSize } : {}),
    ...(typography?.color ? { color: typography.color } : {}),
  };
}

function styleToLegacyFields(style: DisplayFrameItemStyle | undefined): Pick<DisplayFrameFixedItem, "fontId" | "fontSize" | "color"> {
  return {
    ...(style?.fontId ? { fontId: style.fontId } : {}),
    ...(style?.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style?.color ? { color: style.color } : {}),
  };
}

export function createDefaultDisplayFrame(): DisplayFrameDefinition {
  const fields: DisplayFrameField[] = ["title", "name", "university", "city"];
  return {
    mode: "fixed",
    style: { ...DEFAULT_STYLE },
    fieldOrder: fields,
    fixed: {
      items: fields.map((field, index) => ({
        id: field,
        kind: "field" as const,
        field,
        x: 12,
        y: field === "title" ? 12 : 42 + (index - 1) * 20,
        width: field === "title" ? 180 : 196,
        height: field === "title" ? 24 : 18,
        zIndex: index,
      })),
    },
    flow: {
      blocks: fields.map((field, order) => ({
        id: field,
        kind: "field" as const,
        field,
        order,
        spacing: order === 0 ? 0 : 6,
        lineHeight: 1.2,
      })),
    },
  };
}

export function deriveFixedDisplayFrameFromCardSettings(cards: CardSettings): DisplayFrameDefinition {
  const frame = createDefaultDisplayFrame();
  const fieldOrder = normalizeFieldOrder(["title", ...cards.visibleFields], ["title", "name", "university", "city"]);
  frame.fieldOrder = fieldOrder;
  frame.style = {
    ...frame.style,
    fontSize: clamp(cards.fontSize, 8, 240, frame.style.fontSize),
    color: text(cards.textColor, frame.style.color),
    background: text(cards.background, frame.style.background),
    opacity: clamp(cards.opacity, 0, 1, frame.style.opacity),
    padding: clamp(cards.padding, 0, 120, frame.style.padding),
    margin: clamp(cards.gap, 0, 120, frame.style.margin),
  };
  frame.fixed.items = fieldOrder.map((field, index) => {
    const style = itemStyleFromCard(cards, field);
    return {
      id: field,
      kind: "field" as const,
      field,
      x: 12,
      y: field === "title" ? 12 : 42 + (index - 1) * 20,
      width: field === "title" ? Math.max(80, cards.maxWidth - 48) : Math.max(80, cards.maxWidth - 24),
      height: field === "title" ? 24 : 18,
      zIndex: index,
      ...(style ? { style, ...styleToLegacyFields(style) } : {}),
    };
  });
  frame.flow.blocks = fieldOrder.map((field, order) => {
    const style = itemStyleFromCard(cards, field);
    return {
      id: field,
      kind: "field" as const,
      field,
      order,
      spacing: order === 0 ? 0 : cards.gap,
      lineHeight: 1.2,
      ...(style ? { style, ...styleToLegacyFields(style) } : {}),
    };
  });
  return frame;
}

function validDecoration(value: unknown): value is DisplayFrameDecoration {
  return value === "line" || value === "rectangle";
}

export function clampDisplayFrameItem(item: DisplayFrameFixedItem): DisplayFrameFixedItem {
  return {
    ...item,
    x: clamp(item.x, 0, 6000, 0),
    y: clamp(item.y, 0, 6000, 0),
    width: clamp(item.width, 1, 6000, 1),
    height: clamp(item.height, 1, 6000, 1),
    zIndex: Math.round(clamp(item.zIndex, -1000, 1000, 0)),
  };
}

function normalizeFixedItem(value: unknown, fallback: DisplayFrameFixedItem): DisplayFrameFixedItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const kind = validKind(source.kind) ? source.kind : fallback.kind;
  const style = normalizeItemStyle(source.style, fallback.style);
  return clampDisplayFrameItem({
    id: text(source.id, fallback.id),
    kind,
    ...(validField(source.field) ? { field: source.field } : kind === "field" && fallback.field ? { field: fallback.field } : {}),
    ...(typeof source.content === "string" ? { content: source.content } : kind === "text" && fallback.content ? { content: fallback.content } : {}),
    ...(validDecoration(source.decoration) ? { decoration: source.decoration } : kind === "decoration" && fallback.decoration ? { decoration: fallback.decoration } : {}),
    ...(style ? { style, ...styleToLegacyFields(style) } : {}),
    x: finite(source.x, fallback.x),
    y: finite(source.y, fallback.y),
    width: finite(source.width, fallback.width),
    height: finite(source.height, fallback.height),
    zIndex: finite(source.zIndex, fallback.zIndex),
  });
}

function normalizeFlowBlock(value: unknown, fallback: DisplayFrameFlowBlock): DisplayFrameFlowBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const style = normalizeItemStyle(source.style, fallback.style);
  return {
    id: text(source.id, fallback.id),
    kind: source.kind === "text" ? "text" : "field",
    ...(validField(source.field) ? { field: source.field } : fallback.field ? { field: fallback.field } : {}),
    ...(typeof source.content === "string" ? { content: source.content } : fallback.content ? { content: fallback.content } : {}),
    ...(style ? { style, ...styleToLegacyFields(style) } : {}),
    order: Math.round(clamp(source.order, 0, 1000, fallback.order)),
    spacing: clamp(source.spacing, 0, 120, fallback.spacing),
    lineHeight: clamp(source.lineHeight, 0.8, 2.5, fallback.lineHeight),
  };
}

export function normalizeDisplayFrame(value: unknown, fallback?: DisplayFrameDefinition): DisplayFrameDefinition {
  const base = fallback ?? createDefaultDisplayFrame();
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(base);
  const source = value as Record<string, unknown>;
  const fixedSource = source.fixed && typeof source.fixed === "object" && !Array.isArray(source.fixed) ? source.fixed as Record<string, unknown> : {};
  const flowSource = source.flow && typeof source.flow === "object" && !Array.isArray(source.flow) ? source.flow as Record<string, unknown> : {};
  const fixedItems = Array.isArray(fixedSource.items)
    ? fixedSource.items.flatMap((item, index) => {
      const fallbackItem = base.fixed.items[index] ?? base.fixed.items[0];
      const normalized = fallbackItem ? normalizeFixedItem(item, fallbackItem) : null;
      return normalized ? [normalized] : [];
    })
    : [];
  const flowBlocks = Array.isArray(flowSource.blocks)
    ? flowSource.blocks.flatMap((block, index) => {
      const fallbackBlock = base.flow.blocks[index] ?? base.flow.blocks[0];
      const normalized = fallbackBlock ? normalizeFlowBlock(block, fallbackBlock) : null;
      return normalized ? [normalized] : [];
    })
    : [];
  return {
    mode: source.mode === "flow" ? "flow" : "fixed",
    style: normalizeStyle(source.style, base.style),
    fieldOrder: normalizeFieldOrder(source.fieldOrder, base.fieldOrder),
    fixed: { items: fixedItems.length > 0 ? fixedItems : structuredClone(base.fixed.items) },
    flow: { blocks: flowBlocks.length > 0 ? flowBlocks : structuredClone(base.flow.blocks) },
  };
}

function nextItemId(frame: DisplayFrameDefinition, prefix: string): string {
  const ids = new Set(frame.fixed.items.map((item) => item.id));
  let index = 1;
  while (ids.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function nextZIndex(frame: DisplayFrameDefinition): number {
  return Math.max(-1, ...frame.fixed.items.map((item) => item.zIndex)) + 1;
}

export function createDisplayFrameTextItem(frame: DisplayFrameDefinition, content = "自定义文字"): DisplayFrameFixedItem {
  return {
    id: nextItemId(frame, "text"),
    kind: "text",
    content,
    x: 18,
    y: 18,
    width: 140,
    height: 28,
    zIndex: nextZIndex(frame),
  };
}

export function createDisplayFrameDecorationItem(frame: DisplayFrameDefinition, decoration: DisplayFrameDecoration): DisplayFrameFixedItem {
  return {
    id: nextItemId(frame, "decoration"),
    kind: "decoration",
    decoration,
    x: 18,
    y: decoration === "line" ? 64 : 18,
    width: decoration === "line" ? 140 : 80,
    height: decoration === "line" ? 1 : 40,
    zIndex: nextZIndex(frame),
    style: decoration === "rectangle" ? { fill: "#ffffff", strokeWidth: 1 } : { strokeWidth: 1 },
  };
}

export function switchDisplayFrameMode(frame: DisplayFrameDefinition, mode: DisplayFrameMode): DisplayFrameDefinition {
  return { ...normalizeDisplayFrame(frame), mode };
}

export function restoreDisplayFrameVariant(frame: DisplayFrameDefinition, mode: DisplayFrameMode): DisplayFrameDefinition {
  return switchDisplayFrameMode(frame, mode);
}
