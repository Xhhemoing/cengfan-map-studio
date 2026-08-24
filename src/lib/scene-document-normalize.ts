import { normalizeEdgeStyle } from "./edge-styles";
import { normalizeHeatScale } from "./heat-scale";
import type { VisibleField } from "./template-document";
import { normalizeCardExpressionTemplates } from "./card-expression";
import { normalizeNameFormat } from "./name-format";
import { normalizeDisplayFrame } from "./display-frame";
import { createDefaultGuestPanel, createDefaultScene } from "./scene-document-factories";
import {
  CANVAS_LAYER_Z,
  CANVAS_LAYER_Z_RANGE,
  CARD_LAYOUT_MODES,
  DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE,
  type CanvasText,
  type CardFontField,
  type CardLayoutModeValue,
  type CardPresentation,
  type GuestPanelSettings,
  type MapImageAlignment,
  type MapImageComposition,
  type MapRenderSource,
  type ProvinceTextureUniformSize,
  type SceneDocument,
  type TextStyleOverride,
} from "./scene-document-types";

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback;
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

export function normalizeLayoutMode(value: unknown): CardLayoutModeValue {
  return (CARD_LAYOUT_MODES as readonly string[]).includes(value as string) ? (value as CardLayoutModeValue) : "quadrant";
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

function normalizeCardPresentation(value: CardPresentation | undefined): CardPresentation {
  return value === "color-pill" || value === "emblem-list" || value === "city-label" || value === "glass-stat"
    ? value
    : "standard";
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
      dataPalette: scene.map.dataPalette === "playful" || scene.map.dataPalette === "pastel" || scene.map.dataPalette === "muted" ? scene.map.dataPalette : "single",
      shadow: scene.map.shadow === true,
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
      presentation: normalizeCardPresentation(scene.cards.presentation),
      // 老项目 preset: "compact" 在此被归一化为 standard + compactLayout，
      // 保留模板回显 id，让模板选择器仍显示「超紧凑名单」。
      templateId: scene.cards.templateId ?? (scene.cards.preset === "compact" ? "compact" : undefined),
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
