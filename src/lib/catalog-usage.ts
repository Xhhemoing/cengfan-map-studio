import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import type { DataViewId } from "./project-data";
import { groupingForDataView, type ProjectDocument } from "./project-document";
import type { CardSettings, ProvinceAppearance } from "./scene-document";

export interface AssetUsage {
  provinces: string[];
  instances: Array<{ id: string; label: string }>;
  background: boolean;
}

export interface FontUsage {
  texts: Array<{ id: string; content: string }>;
  cardFields: Array<keyof NonNullable<CardSettings["fieldFonts"]>>;
  provinceLabels: string[];
  guestTexts: string[];
}

function appearanceUsesAsset(appearance: ProvinceAppearance | undefined, assetId: string): boolean {
  return Boolean(
    appearance
    && (appearance.kind === "feature" || appearance.kind === "texture")
    && appearance.assetId === assetId,
  );
}

/** Find where a catalog asset is referenced by the current project. */
export function findAssetUsage(project: ProjectDocument, assetId: string): AssetUsage {
  const provinces = Object.entries(project.map.provinceStyles ?? {})
    .filter(([, style]) => appearanceUsesAsset(style?.appearance, assetId))
    .map(([province]) => province)
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

  const instances = project.assetElements
    .filter((element) => element.assetId === assetId)
    .map((element) => ({ id: element.id, label: element.label }));

  const background = project.canvas.backgroundImageSrc
    ? project.assetElements.some((element) => element.assetId === assetId && element.src === project.canvas.backgroundImageSrc)
    : false;

  // Background can also be applied directly from catalog src without an instance.
  const backgroundFromSrc = Boolean(
    project.canvas.backgroundImageSrc
    && !background
    && project.assetElements.every((element) => element.assetId !== assetId),
  );

  return {
    provinces,
    instances,
    background: background || backgroundFromSrc,
  };
}

/** True when any province appearance or instance still references the asset. */
export function isAssetInUse(project: ProjectDocument, assetId: string, asset?: UserAsset): boolean {
  const usage = findAssetUsage(project, assetId);
  if (usage.provinces.length > 0 || usage.instances.length > 0) return true;
  if (asset && project.canvas.backgroundImageSrc && asset.src === project.canvas.backgroundImageSrc) return true;
  return false;
}

export function removeUserAsset(
  assets: UserAsset[],
  assetId: string,
): UserAsset[] {
  return assets.filter((asset) => asset.id !== assetId);
}

export function findFontUsage(project: ProjectDocument, fontId: string): FontUsage {
  const texts = project.textElements
    .filter((text) => text.fontId === fontId)
    .map((text) => ({ id: text.id, content: text.content.slice(0, 24) }));

  const cardFields = (Object.entries(project.cards.fieldFonts ?? {}) as Array<
    [keyof NonNullable<CardSettings["fieldFonts"]>, string | undefined]
  >)
    .filter(([, id]) => id === fontId)
    .map(([field]) => field);

  const provinceLabels = [
    ...(project.map.provinceLabelFontId === fontId ? ["全部省份"] : []),
    ...Object.entries(project.map.provinceStyles ?? {})
      .filter(([, style]) => style.labelFontId === fontId)
      .map(([province]) => province),
  ];
  const guestTexts = [
    ...(project.guests.titleFontId === fontId ? ["嘉宾标题"] : []),
    ...(project.guests.peopleFontId === fontId ? ["全部嘉宾"] : []),
    ...project.guests.people.filter((person) => person.fontId === fontId).map((person) => person.name),
  ];

  return { texts, cardFields, provinceLabels, guestTexts };
}

export function isFontInUse(project: ProjectDocument, fontId: string): boolean {
  const usage = findFontUsage(project, fontId);
  return usage.texts.length > 0
    || usage.cardFields.length > 0
    || usage.provinceLabels.length > 0
    || usage.guestTexts.length > 0;
}

export function removeUserFont(fonts: UserFont[], fontId: string): UserFont[] {
  return fonts.filter((font) => font.id !== fontId);
}

/**
 * Switch data presentation and keep cards / map fill settings coherent.
 * - city/university/province → matching card grouping, heat fill only for heat view
 * - pins → cards still grouped by province but canvas hides cards for pins
 * - heat → province grouping + heat fill mode
 */
export function applyDataViewChange(
  project: ProjectDocument,
  dataView: DataViewId,
): ProjectDocument {
  const grouping = groupingForDataView(dataView);
  const fillMode = dataView === "heat" ? "heat" : "manual";
  return {
    ...project,
    dataView,
    map: {
      ...project.map,
      fillMode,
    },
    cards: {
      ...project.cards,
      grouping,
      positions: project.cards.positions,
    },
  };
}

export type StyleLayerTarget =
  | { type: "text"; id: string; label: string }
  | { type: "map"; label: string }
  | { type: "cards"; label: string }
  | { type: "guests"; label: string }
  | { type: "canvas"; label: string };

export const STYLE_LAYER_TARGETS: StyleLayerTarget[] = [
  { type: "canvas", label: "画布背景" },
  { type: "text", id: "text-title", label: "主标题" },
  { type: "text", id: "text-subtitle", label: "副标题" },
  { type: "map", label: "中国地图" },
  { type: "cards", label: "数据卡片" },
  { type: "guests", label: "特邀嘉宾" },
];
