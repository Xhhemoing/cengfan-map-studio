import type { EdgeStyle } from "./edge-styles";
import type { HeatScale } from "./heat-scale";
import type { CardGrouping, CardPreset, VisibleField } from "./template-document";
import type { CardExpressionTemplates } from "./card-expression";
import type { DisplayFrameDefinition } from "./display-frame";

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
  /**
   * 印刷出血尺寸（毫米），默认 0 = 不出血。按 96dpi 换算成画布像素，
   * 导出时扩展 viewBox 并在成品框外绘制裁切标记，见 `lib/print-bleed`。
   */
  printBleedMm?: number;
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
  /** Multi-color poster palette for provinces with destination data. */
  dataPalette?: "single" | "playful" | "pastel" | "muted";
  /** Adds a soft lifted-paper shadow behind the vector map. */
  shadow?: boolean;
  /** Count range and endpoint colors used for heat-map province fills. */
  heatScale?: HeatScale;
  emptyProvinceFill?: "land-color" | "transparent";
  renderSource?: MapRenderSource;
  provinceStyles?: Record<string, ProvinceStyle>;
  /** Optional shared map-local width/height for every active province texture. */
  provinceTextureUniformSize?: ProvinceTextureUniformSize;
  /** Extra clearance (canvas pixels) around the map content that cards and display-frame items should avoid. Default 16. */
  mapBoundaryMargin?: number;
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
export type CardPresentation = "standard" | "color-pill" | "emblem-list" | "city-label" | "glass-stat";

export interface TextStyleOverride {
  fontSize?: number;
  color?: string;
}

export const CARD_LAYOUT_MODES = ["quadrant", "radial", "right-stack", "grid"] as const;
export type CardLayoutModeValue = (typeof CARD_LAYOUT_MODES)[number];

export interface CardSettings {
  preset: CardPreset;
  /** Semantic renderer used by data-driven reference poster styles. */
  presentation?: CardPresentation;
  /** 最近一次应用的展示框模板 id（src/lib/card-templates.ts），用于选择器回显。 */
  templateId?: string;
  /** @deprecated legacy fixed/flow definition */
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
