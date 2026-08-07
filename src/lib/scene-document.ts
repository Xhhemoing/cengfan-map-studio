import type { EdgeStyle } from "./edge-styles";
import { normalizeEdgeStyle } from "./edge-styles";
import { DEFAULT_HEAT_SCALE, normalizeHeatScale, type HeatScale } from "./heat-scale";
import type { MapTemplateId } from "./project-data";
import { createSystemTemplate, type CardGrouping, type CardPreset, type VisibleField } from "./template-document";
import { normalizeCardExpressionTemplates, type CardExpressionTemplates } from "./card-expression";
import { DEFAULT_NAME_FORMAT, normalizeNameFormat } from "./name-format";
import { normalizeDisplayFrame, type DisplayFrameDefinition } from "./display-frame";

export type CanvasTextRole =
  | "eyebrow"
  | "title"
  | "subtitle"
  | "stats"
  | "watermark"
  | "note"
  | "custom";

export type TextAlign = "left" | "center" | "right";

export interface CanvasSettings {
  width: number;
  height: number;
  safeMargin: number;
  backgroundColor: string;
  backgroundImageSrc?: string;
  backgroundFit: "cover" | "contain" | "stretch";
  backgroundOpacity: number;
  /** Global line-height multiplier for every multi-line text role. Default 1. */
  lineHeight?: number;
}

export interface ProvinceTextureUniformSize {
  enabled: boolean;
  /** Shared texture box width in map-local pixels. */
  width: number;
  /** Shared texture box height in map-local pixels. */
  height: number;
}

export const DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE: ProvinceTextureUniformSize = {
  enabled: false,
  width: 100,
  height: 80,
};

export type { HeatScale } from "./heat-scale";

/** 画布顶层块的默认层级（SVG 绘制顺序 = z 顺序，数值越大越靠上）。
 *  map/cards 可由用户调整（见 MapInspector/CardsInspector 的层级控件）；
 *  guests/decorations/texts 为固定锚点，作为“置顶/置底”的参照。 */
export const CANVAS_LAYER_Z = {
  map: 0,
  cards: 10,
  guests: 20,
  decorations: 30,
  texts: 40,
} as const;

/** 层级数值允许范围（置顶/置底按钮使用其边界）。 */
export const CANVAS_LAYER_Z_RANGE = { min: -100, max: 100 } as const;

export interface MapSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  /** 画布内层级（SVG 绘制顺序 = z 顺序，数值越大越靠上）。默认 CANVAS_LAYER_Z.map。 */
  zIndex?: number;
  /** Overall map visual opacity, from transparent (0) to opaque (1). */
  opacity?: number;
  landColor: string;
  activeColor: string;
  edgeColor: string;
  edgeStyle?: EdgeStyle;
  edgeWidth?: number;
  showProvinceLabels: boolean;
  /** Default font for every province label. A province style may override it. */
  provinceLabelFontId?: string;
  /** Default size/color for every province label. */
  provinceLabelTypography?: TextStyleOverride;
  /** Fold South China Sea islands into a bottom-right inset frame to free map area. */
  collapseSouthChinaSea?: boolean;
  fillMode?: "heat" | "manual";
  /** Count range and endpoint colors used for heat-map province fills. */
  heatScale?: HeatScale;
  emptyProvinceFill?: "land-color" | "transparent";
  renderSource?: MapRenderSource;
  provinceStyles?: Record<string, ProvinceStyle>;
  /** Optional shared map-local width/height for every active province texture. */
  provinceTextureUniformSize?: ProvinceTextureUniformSize;
}

export type MapImageComposition = "replace" | "overlay";

/** Placement of uploaded map image content inside map-local pixel space. */
export interface MapImageAlignment {
  sourceWidth: number;
  sourceHeight: number;
  /** Effective map content inside the source image (normalized 0..1). */
  sourceBounds: { x: number; y: number; width: number; height: number };
  /** Where the content bounds land in map-local space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, around content center. */
  rotation: number;
}

export type MapRenderSource =
  | { kind: "vector" }
  | {
      kind: "image";
      assetId: string;
      src: string;
      /** Legacy full-frame fit used when alignment is absent. */
      fit: "cover" | "contain" | "stretch";
      opacity: number;
      /** replace = hide vector fills; overlay = keep SVG fills under the image. Default replace. */
      composition?: MapImageComposition;
      /** Clip the image to the union of province paths. Default false. */
      clipToMap?: boolean;
      /** Precise placement; when present, overrides fit for geometry. */
      alignment?: MapImageAlignment;
      /**
       * Layer order within the map layer. Base plane: vector fills 0, borders 50, labels 100.
       * Default 25 (under borders), clamped to [-1000, 1000].
       */
      zIndex?: number;
    };

export type ProvinceAppearance =
  | {
      kind: "feature" | "texture";
      assetId: string;
      src: string;
      /** contain = show full image; cover = fill province (may crop). */
      fit: "cover" | "contain";
      /** Manual zoom multiplier on top of smart fit. Default 1. */
      scale?: number;
      /** Texture opacity, from transparent (0) to opaque (1). Default 1. */
      opacity?: number;
      /** When true, texture may draw outside the province boundary. Default false. */
      overflow?: boolean;
      /**
       * How the texture's width/height is derived.
       * - "province": match the province bounding box aspect ratio (default).
       * - "natural": keep the uploaded image's natural aspect ratio.
       * - "custom": use explicit customWidth/customHeight pixels.
       */
      sizingMode?: "province" | "natural" | "custom";
      /** Natural pixel size of the uploaded image, recorded for "natural" sizing. */
      naturalWidth?: number;
      naturalHeight?: number;
      /** Explicit pixel dimensions when sizingMode === "custom". */
      customWidth?: number;
      customHeight?: number;
      /** Manual displacement from the province geometry centroid, in map-local pixels. */
      offsetX?: number;
      offsetY?: number;
    }
  | { kind: "manual-color"; color: string };

export interface ProvinceStyle {
  /** Legacy fields remain readable while older saved projects are migrated. */
  fill?: string;
  textureSrc?: string;
  visible?: boolean;
  /** Optional font override for this province label. */
  labelFontId?: string;
  appearance?: ProvinceAppearance;
}

export type CardFontField = "title" | VisibleField;

export interface TextStyleOverride {
  fontSize?: number;
  color?: string;
}

export interface CardSettings {
  preset: CardPreset;
  /** Local display-frame definition; final card placement remains in positions. */
  displayFrame?: DisplayFrameDefinition;
  /** Reduce card row spacing without changing its visual preset. */
  compactLayout?: boolean;
  grouping: CardGrouping;
  x: number;
  y: number;
  maxWidth: number;
  padding: number;
  /** 画布内层级（SVG 绘制顺序 = z 顺序，数值越大越靠上）。默认 CANVAS_LAYER_Z.cards。 */
  zIndex?: number;
  /** Left/right whitespace inside destination cards. Defaults to padding. */
  horizontalPadding?: number;
  /** Empty space below the final destination-card row. Defaults to padding. */
  bottomPadding?: number;
  gap: number;
  columns: number | "auto";
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  /** Per-field font ids (see lib/fonts). Missing/empty entry = inherit default font. */
  fieldFonts?: Partial<Record<CardFontField, string>>;
  /** Per-field size/color overrides. Missing values inherit the legacy card style. */
  fieldTypography?: Partial<Record<CardFontField, TextStyleOverride>>;
  connectorStyle: "straight" | "elbow" | "curve";
  connectorColor: string;
  connectorWidth: number;
  /**
   * Connector line texture. Shares the same palette as province border textures
   * (solid / dashed / dotted / double / soft-glow / stitch / rail / wave / ornament / ink).
   * Legacy values solid|dashed|dotted remain valid.
   */
  connectorDash: EdgeStyle;
  visibleFields: VisibleField[];
  /**
   * Fields whose card content must never be split across lines
   * (e.g. a person name stays on one line). Default [].
   */
  noWrapFields?: VisibleField[];
  /** Show city headings inside province-grouped cards. Default true. */
  citySubgroups?: boolean;
  /** Restricted placeholder templates for card titles, city headings, and rows. */
  expressionTemplates?: CardExpressionTemplates;
  /** Pseudo-code template controlling how student names appear in card rows. Default "{name}". */
  nameFormat?: string;
  positions?: Record<string, { x: number; y: number }>;
  /** Auto-layout algorithm. Default "quadrant" (four-sided isotonic packing). */
  layoutMode?: "quadrant" | "radial" | "right-stack" | "grid";
  /** Optimize the left/right split to balance column heights (quadrant only). */
  autoBalance?: boolean;
  /** Permit destination cards to overlap map geometry. Default false. */
  allowMapOverlap?: boolean;
  /** Show the matching province texture as a thumbnail inside destination cards. */
  showProvinceTexture?: boolean;
  /** Show the "N 人" count in the card header. Default true. */
  showCount?: boolean;
}

export interface GuestPerson {
  id: string;
  name: string;
  /** Optional role / affiliation label, e.g. 班主任 / 特邀嘉宾. */
  title?: string;
  /** Optional free-form custom text (祝福语 / 寄语 / 备注), rendered under the name. */
  note?: string;
  /** Optional avatar image (URL or data URL), rendered as a round avatar. */
  avatarSrc?: string;
  /** Optional font override for this guest row. */
  fontId?: string;
  visibility: boolean;
}

export interface GuestPanelSettings {
  title: string;
  x: number;
  y: number;
  width: number;
  padding: number;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  titleFontId?: string;
  peopleFontId?: string;
  titleTypography?: TextStyleOverride;
  peopleTypography?: TextStyleOverride;
  /** Display mode: "list" renders one text row per guest, "cards" renders avatar cards in a grid. */
  displayMode?: "list" | "cards";
  /** Free-form custom text rendered inside the panel above the people list. */
  customText?: string;
  visibility: boolean;
  people: GuestPerson[];
}

export interface CanvasText {
  id: string;
  role: CanvasTextRole;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  /** Font id (see lib/fonts). Empty/undefined = inherit default font. */
  fontId?: string;
  textAlign: TextAlign;
  maxWidth: number;
  visibility: boolean;
}

export interface AssetElement {
  id: string;
  assetId: string;
  label: string;
  src: string;
  kind: "province-texture" | "landmark" | "decoration";
  province?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visibility: boolean;
}

export interface SceneDocument {
  canvas: CanvasSettings;
  map: MapSettings;
  cards: CardSettings;
  guests: GuestPanelSettings;
  textElements: CanvasText[];
  assetElements: AssetElement[];
}

export type SceneSelection =
  | { type: "canvas" }
  | { type: "map" }
  | { type: "province"; province: string }
  | { type: "cards" }
  | { type: "guests" }
  | { type: "text"; id: string }
  | { type: "asset"; id: string };

export function createDefaultGuestPanel(canvasHeight = 1000): GuestPanelSettings {
  return {
    title: "特邀嘉宾 · 老师名单",
    x: 48,
    y: Math.max(120, canvasHeight - 220),
    width: 280,
    padding: 14,
    background: "#ffffff",
    opacity: 0.92,
    textColor: "#1c3154",
    fontSize: 13,
    displayMode: "list",
    visibility: true,
    people: [],
  };
}

export function normalizeGuestPanel(value: GuestPanelSettings | undefined, canvasWidth: number, canvasHeight: number): GuestPanelSettings {
  const fallback = createDefaultGuestPanel(canvasHeight);
  const source = value ?? fallback;
  const people = Array.isArray(source.people)
    ? source.people.flatMap((person) => {
      if (!person || typeof person !== "object") return [];
      const name = typeof person.name === "string" ? person.name.trim() : "";
      if (!name) return [];
      return [{
        id: typeof person.id === "string" && person.id ? person.id : `guest-${name}`,
        name,
        title: typeof person.title === "string" && person.title.trim() ? person.title.trim() : undefined,
        note: typeof person.note === "string" && person.note.trim() ? person.note.trim() : undefined,
        avatarSrc: typeof person.avatarSrc === "string" && person.avatarSrc ? person.avatarSrc : undefined,
        fontId: typeof person.fontId === "string" && person.fontId ? person.fontId : undefined,
        visibility: person.visibility !== false,
      }];
    })
    : [];
  return {
    title: typeof source.title === "string" && source.title.trim() ? source.title.trim() : fallback.title,
    x: clamp(source.x, 0, canvasWidth, fallback.x),
    y: clamp(source.y, 0, canvasHeight, fallback.y),
    width: clamp(source.width, 120, canvasWidth, fallback.width),
    padding: clamp(source.padding, 4, 48, fallback.padding),
    background: typeof source.background === "string" && source.background ? source.background : fallback.background,
    opacity: clamp(source.opacity, 0, 1, fallback.opacity),
    textColor: typeof source.textColor === "string" && source.textColor ? source.textColor : fallback.textColor,
    fontSize: clamp(source.fontSize, 8, 36, fallback.fontSize),
    titleFontId: typeof source.titleFontId === "string" && source.titleFontId ? source.titleFontId : undefined,
    peopleFontId: typeof source.peopleFontId === "string" && source.peopleFontId ? source.peopleFontId : undefined,
    titleTypography: normalizeTextStyleOverride(source.titleTypography),
    peopleTypography: normalizeTextStyleOverride(source.peopleTypography),
    displayMode: source.displayMode === "cards" ? "cards" : "list",
    customText: typeof source.customText === "string" && source.customText.trim() ? source.customText.trim() : undefined,
    visibility: source.visibility !== false,
    people,
  };
}

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};

const DEFAULT_TEXTS: CanvasText[] = [
  { id: "text-eyebrow", role: "eyebrow", content: "毕业去向图", x: 72, y: 72, fontSize: 18, color: "#1c3154", fontWeight: 600, textAlign: "left", maxWidth: 360, visibility: true },
  { id: "text-title", role: "title", content: "我们的毕业去向", x: 72, y: 126, fontSize: 42, color: "#1c3154", fontWeight: 700, textAlign: "left", maxWidth: 640, visibility: true },
  { id: "text-subtitle", role: "subtitle", content: "山高水长，来日再聚", x: 72, y: 164, fontSize: 18, color: "#7b8ba5", fontWeight: 400, textAlign: "left", maxWidth: 640, visibility: true },
  { id: "text-stats", role: "stats", content: "", x: 72, y: 204, fontSize: 16, color: "#1c3154", fontWeight: 500, textAlign: "left", maxWidth: 480, visibility: true },
  { id: "text-watermark", role: "watermark", content: "CENGFAN MAP STUDIO", x: 1432, y: 955, fontSize: 12, color: "#7b8ba5", fontWeight: 500, textAlign: "right", maxWidth: 360, visibility: true },
  { id: "text-note", role: "note", content: "", x: 745, y: 905, fontSize: 20, color: "#c85d4b", fontWeight: 500, textAlign: "center", maxWidth: 640, visibility: true },
];

function cloneTexts(textElements: CanvasText[]): CanvasText[] {
  return textElements.map((element) => ({ ...element }));
}

function normalizeText(element: CanvasText): CanvasText {
  return {
    ...element,
    x: clamp(element.x, 0, 6000, 0),
    y: clamp(element.y, 0, 6000, 0),
    fontSize: clamp(element.fontSize, 8, 240, 24),
    fontWeight: clamp(element.fontWeight, 100, 900, 500),
    fontId: typeof element.fontId === "string" && element.fontId ? element.fontId : undefined,
    maxWidth: clamp(element.maxWidth, 40, 6000, 320),
    visibility: element.visibility !== false,
  };
}

const CARD_FONT_FIELDS: CardFontField[] = ["title", "name", "university", "city"];
const VISIBLE_FIELDS: VisibleField[] = ["name", "university", "city"];

export function normalizeNoWrapFields(value: unknown): VisibleField[] {
  if (!Array.isArray(value)) return [];
  return VISIBLE_FIELDS.filter((field) => value.includes(field));
}

export function normalizeFieldFonts(value: unknown): Partial<Record<CardFontField, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: Partial<Record<CardFontField, string>> = {};
  for (const field of CARD_FONT_FIELDS) {
    const fontId = record[field];
    if (typeof fontId === "string" && fontId) result[field] = fontId;
  }
  return result;
}

function normalizeTextStyleOverride(value: unknown): TextStyleOverride | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as { fontSize?: unknown; color?: unknown };
  const fontSize = typeof source.fontSize === "number" && Number.isFinite(source.fontSize)
    ? clamp(source.fontSize, 8, 240, 12)
    : undefined;
  const color = typeof source.color === "string" && source.color ? source.color : undefined;
  return fontSize === undefined && color === undefined ? undefined : { ...(fontSize === undefined ? {} : { fontSize }), ...(color === undefined ? {} : { color }) };
}

function normalizeFieldTypography(value: unknown): Partial<Record<CardFontField, TextStyleOverride>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(CARD_FONT_FIELDS.flatMap((field) => {
    const style = normalizeTextStyleOverride(record[field]);
    return style ? [[field, style]] : [];
  }));
}

export const CARD_LAYOUT_MODES = ["quadrant", "radial", "right-stack", "grid"] as const;
export type CardLayoutModeValue = (typeof CARD_LAYOUT_MODES)[number];

export function normalizeLayoutMode(value: unknown): CardLayoutModeValue {
  return (CARD_LAYOUT_MODES as readonly string[]).includes(value as string) ? (value as CardLayoutModeValue) : "quadrant";
}

export function createDefaultScene(templateId: MapTemplateId): SceneDocument {
  const template = createSystemTemplate(templateId);
  return {
    canvas: {
      width: template.canvas.width,
      height: template.canvas.height,
      safeMargin: template.canvas.safeMargin,
      backgroundColor: template.background.color,
      backgroundFit: "cover",
      backgroundOpacity: 1,
    },
    map: {
      x: 350,
      y: 120,
      width: 800,
      height: 690,
      scale: template.map.scale,
      zIndex: CANVAS_LAYER_Z.map,
      opacity: 1,
      landColor: template.map.landColor,
      activeColor: template.map.activeColor,
      edgeColor: template.map.edgeColor,
      edgeStyle: template.map.edgeStyle,
      edgeWidth: template.map.edgeWidth,
      showProvinceLabels: template.map.showProvinceLabels,
      collapseSouthChinaSea: false,
      fillMode: "heat",
      heatScale: { ...DEFAULT_HEAT_SCALE },
      emptyProvinceFill: "land-color",
      renderSource: { kind: "vector" },
      provinceStyles: { ...template.map.provinceStyles },
      provinceTextureUniformSize: { ...DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE },
    },
    cards: {
      preset: template.cards.preset,
      compactLayout: false,
      grouping: template.cards.grouping,
      x: 1140,
      y: 160,
      maxWidth: template.cards.maxWidth,
      padding: template.cards.padding,
      zIndex: CANVAS_LAYER_Z.cards,
      horizontalPadding: template.cards.padding,
      bottomPadding: template.cards.padding,
      gap: 12,
      columns: "auto",
      background: template.cards.background,
      opacity: 1,
      textColor: template.cards.textColor,
      fontSize: 12,
      connectorStyle: "curve",
      connectorColor: template.map.activeColor,
      connectorWidth: 1.5,
      connectorDash: "dashed",
      visibleFields: [...template.visibleFields],
      citySubgroups: true,
      expressionTemplates: normalizeCardExpressionTemplates(undefined),
      nameFormat: DEFAULT_NAME_FORMAT,
      positions: {},
      layoutMode: "quadrant",
      autoBalance: true,
      allowMapOverlap: false,
      showProvinceTexture: false,
    },
    guests: createDefaultGuestPanel(template.canvas.height),
    textElements: cloneTexts(DEFAULT_TEXTS),
    assetElements: [],
  };
}

export function normalizeScene(scene: SceneDocument): SceneDocument {
  const canvasWidth = clamp(scene.canvas.width, 320, 6000, 320);
  const canvasHeight = clamp(scene.canvas.height, 320, 6000, 320);
  const fallback = createDefaultScene("original");
  return {
    canvas: {
      ...scene.canvas,
      width: canvasWidth,
      height: canvasHeight,
      safeMargin: clamp(scene.canvas.safeMargin, 0, Math.min(canvasWidth, canvasHeight) / 2, 36),
      backgroundOpacity: clamp(scene.canvas.backgroundOpacity, 0, 1, 1),
      lineHeight: clamp(scene.canvas.lineHeight, 0.8, 2.5, 1),
    },
    map: {
      ...scene.map,
      x: clamp(scene.map.x, 0, canvasWidth, fallback.map.x),
      y: clamp(scene.map.y, 0, canvasHeight, fallback.map.y),
      width: clamp(scene.map.width, 1, canvasWidth, fallback.map.width),
      height: clamp(scene.map.height, 1, canvasHeight, fallback.map.height),
      scale: clamp(scene.map.scale, 0.1, 3, 1),
      zIndex: clamp(scene.map.zIndex, CANVAS_LAYER_Z_RANGE.min, CANVAS_LAYER_Z_RANGE.max, CANVAS_LAYER_Z.map),
      opacity: clamp(scene.map.opacity, 0, 1, fallback.map.opacity ?? 1),
      edgeStyle: scene.map.edgeStyle ?? fallback.map.edgeStyle,
      edgeWidth: clamp(scene.map.edgeWidth, 0, 20, fallback.map.edgeWidth ?? 1),
      showProvinceLabels: scene.map.showProvinceLabels ?? fallback.map.showProvinceLabels,
      provinceLabelFontId: typeof scene.map.provinceLabelFontId === "string" && scene.map.provinceLabelFontId
        ? scene.map.provinceLabelFontId
        : undefined,
      provinceLabelTypography: normalizeTextStyleOverride(scene.map.provinceLabelTypography),
      collapseSouthChinaSea: scene.map.collapseSouthChinaSea === true,
      fillMode: scene.map.fillMode === "manual" ? "manual" : "heat",
      heatScale: normalizeHeatScale(scene.map.heatScale),
      emptyProvinceFill: scene.map.emptyProvinceFill === "transparent" ? "transparent" : "land-color",
      renderSource: normalizeMapRenderSource(scene.map.renderSource),
      provinceStyles: Object.fromEntries(Object.entries(scene.map.provinceStyles ?? {}).map(([province, style]) => {
        const appearance = style.appearance;
        const labelFontId = typeof style.labelFontId === "string" && style.labelFontId ? style.labelFontId : undefined;
        if (!appearance || appearance.kind === "manual-color") return [province, { ...style, labelFontId }];
        return [province, {
          ...style,
          labelFontId,
          appearance: {
            ...appearance,
            ...(appearance.offsetX !== undefined ? { offsetX: finiteOr(appearance.offsetX, 0) } : {}),
            ...(appearance.offsetY !== undefined ? { offsetY: finiteOr(appearance.offsetY, 0) } : {}),
          },
        }];
      })),
      provinceTextureUniformSize: normalizeProvinceTextureUniformSize(scene.map.provinceTextureUniformSize),
    },
    cards: {
      ...scene.cards,
      preset: scene.cards.preset === "compact" ? "standard" : scene.cards.preset,
      compactLayout: scene.cards.compactLayout === true || scene.cards.preset === "compact",
      x: clamp(scene.cards.x, 0, canvasWidth, fallback.cards.x),
      y: clamp(scene.cards.y, 0, canvasHeight, fallback.cards.y),
      maxWidth: clamp(scene.cards.maxWidth, 80, canvasWidth, fallback.cards.maxWidth),
      padding: clamp(scene.cards.padding, 0, 120, fallback.cards.padding),
      horizontalPadding: clamp(scene.cards.horizontalPadding, 0, 240, scene.cards.padding),
      bottomPadding: clamp(scene.cards.bottomPadding, 0, 240, scene.cards.padding),
      gap: clamp(scene.cards.gap, 0, 120, fallback.cards.gap),
      zIndex: clamp(scene.cards.zIndex, CANVAS_LAYER_Z_RANGE.min, CANVAS_LAYER_Z_RANGE.max, CANVAS_LAYER_Z.cards),
      opacity: clamp(scene.cards.opacity, 0, 1, fallback.cards.opacity),
      fontSize: clamp(scene.cards.fontSize, 8, 48, fallback.cards.fontSize),
      fieldFonts: normalizeFieldFonts(scene.cards.fieldFonts),
      fieldTypography: normalizeFieldTypography(scene.cards.fieldTypography),
      connectorStyle: scene.cards.connectorStyle === "straight" || scene.cards.connectorStyle === "elbow" ? scene.cards.connectorStyle : "curve",
      connectorColor: typeof scene.cards.connectorColor === "string" && scene.cards.connectorColor ? scene.cards.connectorColor : fallback.cards.connectorColor,
      connectorWidth: clamp(scene.cards.connectorWidth, 0.5, 8, fallback.cards.connectorWidth),
      connectorDash: normalizeEdgeStyle(scene.cards.connectorDash, "dashed"),
      visibleFields: [...scene.cards.visibleFields],
      noWrapFields: normalizeNoWrapFields(scene.cards.noWrapFields),
      citySubgroups: scene.cards.citySubgroups !== false,
      expressionTemplates: normalizeCardExpressionTemplates(scene.cards.expressionTemplates),
      nameFormat: normalizeNameFormat(scene.cards.nameFormat),
      positions: Object.fromEntries(
        Object.entries(scene.cards.positions ?? {}).flatMap(([id, position]) => {
          if (!position || typeof position !== "object") return [];
          const candidate = position as { x?: unknown; y?: unknown };
          return [[id, { x: clamp(candidate.x, 0, canvasWidth, 0), y: clamp(candidate.y, 0, canvasHeight, 0) }]];
        }),
      ),
      layoutMode: normalizeLayoutMode(scene.cards.layoutMode),
      autoBalance: scene.cards.autoBalance !== false,
      allowMapOverlap: scene.cards.allowMapOverlap === true,
      showProvinceTexture: scene.cards.showProvinceTexture === true,
      ...(scene.cards.displayFrame !== undefined
        ? { displayFrame: normalizeDisplayFrame(scene.cards.displayFrame, fallback.cards.displayFrame) }
        : {}),
    },
    guests: normalizeGuestPanel(scene.guests, canvasWidth, canvasHeight),
    textElements: scene.textElements.map(normalizeText),
    assetElements: scene.assetElements.map((asset) => ({
      ...asset,
      x: clamp(asset.x, 0, canvasWidth, 0),
      y: clamp(asset.y, 0, canvasHeight, 0),
      width: clamp(asset.width, 1, canvasWidth, 100),
      height: clamp(asset.height, 1, canvasHeight, 100),
      opacity: clamp(asset.opacity, 0, 1, 1),
      visibility: asset.visibility !== false,
    })),
  };
}

function normalizeProvinceTextureUniformSize(
  value: ProvinceTextureUniformSize | undefined,
): ProvinceTextureUniformSize {
  return {
    enabled: value?.enabled === true,
    width: clamp(value?.width, 1, 2000, DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE.width),
    height: clamp(value?.height, 1, 2000, DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE.height),
  };
}

function normalizeMapRenderSource(source: MapRenderSource | undefined): MapRenderSource {
  if (source?.kind !== "image" || !source.assetId || !source.src) return { kind: "vector" };
  const composition: MapImageComposition = source.composition === "overlay" ? "overlay" : "replace";
  const alignment = normalizeMapImageAlignment(source.alignment);
  return {
    kind: "image",
    assetId: source.assetId,
    src: source.src,
    fit: source.fit === "contain" || source.fit === "stretch" ? source.fit : "cover",
    opacity: clamp(source.opacity, 0, 1, 1),
    composition,
    clipToMap: source.clipToMap === true,
    zIndex: clamp(source.zIndex, -1000, 1000, 25),
    ...(alignment ? { alignment } : {}),
  };
}

function normalizeMapImageAlignment(value: MapImageAlignment | undefined): MapImageAlignment | undefined {
  if (!value) return undefined;
  const sourceWidth = Math.max(1, finiteOr(value.sourceWidth, 1));
  const sourceHeight = Math.max(1, finiteOr(value.sourceHeight, 1));
  const boundsWidth = clamp(value.sourceBounds?.width, 0.001, 1, 1);
  const boundsHeight = clamp(value.sourceBounds?.height, 0.001, 1, 1);
  const boundsX = clamp(value.sourceBounds?.x, 0, 1, 0);
  const boundsY = clamp(value.sourceBounds?.y, 0, 1, 0);
  let rotation = finiteOr(value.rotation, 0);
  // Keep rotation in (-180, 180]
  rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
  if (rotation === -180) rotation = 180;
  return {
    sourceWidth,
    sourceHeight,
    sourceBounds: {
      x: Math.min(boundsX, 1 - boundsWidth),
      y: Math.min(boundsY, 1 - boundsHeight),
      width: boundsWidth,
      height: boundsHeight,
    },
    x: finiteOr(value.x, 0),
    y: finiteOr(value.y, 0),
    width: Math.max(0.001, finiteOr(value.width, 1)),
    height: Math.max(0.001, finiteOr(value.height, 1)),
    rotation,
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function updateSceneTarget(
  scene: SceneDocument,
  target: SceneSelection,
  patch: Record<string, unknown>,
): SceneDocument {
  switch (target.type) {
    case "canvas":
      return normalizeScene({ ...scene, canvas: { ...scene.canvas, ...patch } });
    case "map":
      return normalizeScene({ ...scene, map: { ...scene.map, ...patch } });
    case "province":
      return normalizeScene({
        ...scene,
        map: {
          ...scene.map,
          provinceStyles: {
            ...scene.map.provinceStyles,
            [target.province]: { ...scene.map.provinceStyles?.[target.province], ...patch },
          },
        },
      });
    case "cards":
      return normalizeScene({ ...scene, cards: { ...scene.cards, ...patch } });
    case "guests":
      return normalizeScene({ ...scene, guests: { ...scene.guests, ...patch } as typeof scene.guests });
    case "text":
      return normalizeScene({
        ...scene,
        textElements: scene.textElements.map((element) =>
          element.id === target.id ? { ...element, ...patch } : element,
        ),
      });
    case "asset":
      return normalizeScene({
        ...scene,
        assetElements: scene.assetElements.map((element) =>
          element.id === target.id ? { ...element, ...patch } : element,
        ),
      });
  }
}
