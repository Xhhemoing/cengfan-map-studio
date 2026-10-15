import type { CardGrouping, CardPreset, VisibleField } from "./template-document";
import type { CardExpressionTemplates } from "./card-expression";
import type { DisplayFrameDefinition } from "./display-frame";
import type { EdgeStyle } from "./edge-styles";

export type CardFontField = "title" | VisibleField;
export type CardPresentation = "standard" | "color-pill" | "emblem-list" | "city-label" | "glass-stat";

export interface TextStyleOverride {
  fontSize?: number;
  color?: string;
}

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
  /** Fixed width is the legacy behavior; content fits between minWidth and maxWidth. */
  widthMode?: "fixed" | "content";
  minWidth?: number;
  /** Readability constraint for diagnostics and proposals; never silently changes text. */
  minFontSize?: number;
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
  /** Keys include grouping, e.g. province:北京市, to avoid rebinding to another grouping. */
  styleOverrides?: Record<string, CardStyleOverride>;
  positionPolicies?: Record<string, CardPositionPolicy>;
  positionSources?: Record<string, CardPositionSource>;
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

export type CardPositionPolicy = "locked" | "preserve" | "auto";
export type CardPositionSource = "manual" | "frozen" | "auto";

/** Per-card styling excludes grouping, placement, connector and whole-layer controls. */
export type CardStyleOverride = Partial<Pick<CardSettings,
  | "preset" | "presentation" | "templateId" | "compactLayout" | "maxWidth" | "widthMode" | "minWidth" | "minFontSize"
  | "padding" | "horizontalPadding" | "bottomPadding" | "background" | "opacity"
  | "textColor" | "fontSize" | "fieldFonts" | "fieldTypography" | "visibleFields"
  | "noWrapFields" | "citySubgroups" | "expressionTemplates" | "nameFormat"
  | "showProvinceTexture" | "showCount"
>>;
