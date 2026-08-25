import { DEFAULT_HEAT_SCALE } from "./heat-scale";
import type { MapTemplateId } from "./project-data";
import { createSystemTemplate } from "./template-document";
import { normalizeCardExpressionTemplates } from "./card-expression";
import { DEFAULT_NAME_FORMAT } from "./name-format";
import {
  CANVAS_LAYER_Z,
  DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE,
  type CanvasText,
  type GuestPanelSettings,
  type SceneDocument,
} from "./scene-document-types";

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
      printBleedMm: 0,
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
      dataPalette: "single",
      shadow: false,
      heatScale: { ...DEFAULT_HEAT_SCALE },
      emptyProvinceFill: "land-color",
      renderSource: { kind: "vector" },
      provinceStyles: { ...template.map.provinceStyles },
      provinceTextureUniformSize: { ...DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE },
    },
    cards: {
      preset: template.cards.preset,
      presentation: "standard",
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
