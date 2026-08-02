import type { EdgeStyle } from "./edge-styles";
export type { EdgeStyle } from "./edge-styles";
import type { MapTemplateId } from "./project-data";

export type CardGrouping = "province" | "city" | "university";
export type CardPreset = "standard" | "compact" | "ticket" | "photo" | "borderless";
export type MarkerStyle = "pin" | "bubble" | "heat";
export type ConnectorStyle = "line" | "polyline" | "curve";
export type BackgroundType = "color" | "gradient" | "image";
export type RegionalAssetMode = "clip" | "overlay" | "card-thumb";
export type VisibleField = "name" | "university" | "city";

export interface TemplateCanvas {
  width: number;
  height: number;
  safeMargin: number;
}

export interface TemplateBackground {
  type: BackgroundType;
  color: string;
  secondaryColor?: string;
  imageSrc?: string;
  opacity: number;
  blur: number;
  layer: "behind-map" | "between-map-data" | "foreground";
}

export interface ProvinceStyle {
  fill?: string;
  textureSrc?: string;
  visible?: boolean;
}

export interface TemplateMapStyle {
  scale: number;
  offsetX: number;
  offsetY: number;
  landColor: string;
  activeColor: string;
  edgeColor: string;
  edgeStyle?: EdgeStyle;
  edgeWidth?: number;
  showProvinceLabels: boolean;
  fillMode?: "heat" | "manual";
  emptyProvinceFill?: "land-color" | "transparent";
  provinceStyles?: Record<string, ProvinceStyle>;
}

export interface TemplateCardStyle {
  grouping: CardGrouping;
  preset: CardPreset;
  maxWidth: number;
  padding: number;
  background: string;
  textColor: string;
}

export interface TemplateMarkerStyle {
  style: MarkerStyle;
  color: string;
  size: number;
}

export interface TemplateConnectorStyle {
  style: ConnectorStyle;
  color: string;
  width: number;
  dashed: boolean;
}

export interface RegionalAsset {
  id: string;
  label: string;
  src: string;
  mode: RegionalAssetMode;
  opacity: number;
  scale: number;
}

export interface TemplateTypography {
  titleSize: number;
  bodySize: number;
  nameWeight: number;
  universityWeight: number;
}

export interface TemplateDocument {
  id: MapTemplateId | string;
  name: string;
  canvas: TemplateCanvas;
  background: TemplateBackground;
  map: TemplateMapStyle;
  cards: TemplateCardStyle;
  markers: TemplateMarkerStyle;
  connectors: TemplateConnectorStyle;
  typography: TemplateTypography;
  visibleFields: VisibleField[];
  regionalAssets: Record<string, RegionalAsset[]>;
}

const THEME_PRESETS: Record<
  MapTemplateId,
  {
    name: string;
    background: string;
    land: string;
    active: string;
    edge: string;
    card: string;
    text: string;
    marker: string;
  }
> = {
  original: {
    name: "原始地图",
    background: "#f7f4ea",
    land: "#e6ebea",
    active: "#215d75",
    edge: "#c4cbd1",
    card: "#ffffff",
    text: "#1c3154",
    marker: "#d45d4b",
  },
  cartoon: {
    name: "卡通画风",
    background: "#fff4db",
    land: "#ffe0a3",
    active: "#e97955",
    edge: "#9f6b58",
    card: "#fffdf8",
    text: "#3f4b62",
    marker: "#3b9db0",
  },
  grain: {
    name: "颗粒画风",
    background: "#e9e5d9",
    land: "#d6d3c2",
    active: "#617b6b",
    edge: "#8e8b7a",
    card: "#f6f3e9",
    text: "#44493e",
    marker: "#b66d4d",
  },
  q: {
    name: "Q版",
    background: "#eff8ff",
    land: "#d8eef2",
    active: "#67b7b7",
    edge: "#b9daed",
    card: "#ffffff",
    text: "#16426a",
    marker: "#ff7c69",
  },
  scenery: {
    name: "风景插画版",
    background: "#edf3e9",
    land: "#dfead9",
    active: "#387563",
    edge: "#a9c4b2",
    card: "#f7fbf5",
    text: "#203b32",
    marker: "#d77b48",
  },
  regional: {
    name: "地域特色（旧版）",
    background: "#fbf2e6",
    land: "#f3e3cd",
    active: "#8b4f31",
    edge: "#d7bea0",
    card: "#fffaf2",
    text: "#4a3025",
    marker: "#c04835",
  },
};

export function createSystemTemplate(id: MapTemplateId): TemplateDocument {
  const theme = THEME_PRESETS[id];
  return {
    id,
    name: theme.name,
    canvas: {
      width: 1500,
      height: 1000,
      safeMargin: 48,
    },
    background: {
      type: "color" as const,
      color: theme.background,
      opacity: 1,
      blur: 0,
      layer: "behind-map" as const,
    },
    map: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      landColor: theme.land,
      activeColor: theme.active,
      edgeColor: theme.edge,
      edgeStyle: "solid",
      edgeWidth: 1,
      showProvinceLabels: true,
      provinceStyles: {},
    },
    cards: {
      grouping: "province",
      preset: "standard",
      maxWidth: 220,
      padding: 12,
      background: theme.card,
      textColor: theme.text,
    },
    markers: {
      style: "pin",
      color: theme.marker,
      size: 1,
    },
    connectors: {
      style: "polyline",
      color: theme.active,
      width: 1.5,
      dashed: true,
    },
    typography: {
      titleSize: 40,
      bodySize: 14,
      nameWeight: 700,
      universityWeight: 500,
    },
    visibleFields: ["name", "university", "city"],
    regionalAssets: {},
  };
}

export function mergeTemplateDocuments(
  base: TemplateDocument,
  override: Partial<TemplateDocument> = {},
): TemplateDocument {
  return {
    ...base,
    ...override,
    canvas: {
      ...base.canvas,
      ...(override.canvas ?? {}),
    },
    background: {
      ...base.background,
      ...(override.background ?? {}),
    },
    map: {
      ...base.map,
      ...(override.map ?? {}),
      provinceStyles: {
        ...base.map.provinceStyles,
        ...(override.map?.provinceStyles ?? {}),
      },
    },
    cards: {
      ...base.cards,
      ...(override.cards ?? {}),
    },
    markers: {
      ...base.markers,
      ...(override.markers ?? {}),
    },
    connectors: {
      ...base.connectors,
      ...(override.connectors ?? {}),
    },
    typography: {
      ...base.typography,
      ...(override.typography ?? {}),
    },
    visibleFields: override.visibleFields
      ? [...override.visibleFields]
      : [...base.visibleFields],
    regionalAssets: {
      ...base.regionalAssets,
      ...(override.regionalAssets ?? {}),
    },
  };
}
