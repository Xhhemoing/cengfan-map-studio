import { createId } from "./ids";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { updateSceneTarget, type AssetElement, type CanvasSettings, type CanvasText, type CardSettings, type GuestPanelSettings, type MapSettings, type SceneSelection } from "./scene-document";

type ScenePatch = Record<string, unknown>;

function updateProjectTarget(
  project: ProjectDocument,
  target: SceneSelection,
  patch: ScenePatch,
): ProjectDocument {
  if (
    (target.type === "text" && !project.textElements.some((element) => element.id === target.id)) ||
    (target.type === "asset" && !project.assetElements.some((element) => element.id === target.id))
  ) {
    return project;
  }

  const scene = updateSceneTarget(project, target, patch);
  return {
    ...project,
    canvas: scene.canvas,
    map: scene.map,
    cards: scene.cards,
    guests: scene.guests,
    textElements: scene.textElements,
    assetElements: scene.assetElements,
    style: {
      ...project.style,
      cardPreset: scene.cards.preset,
      mapScale: scene.map.scale,
      backgroundColor: scene.canvas.backgroundColor,
      backgroundImageSrc: scene.canvas.backgroundImageSrc,
      visibleFields: [...scene.cards.visibleFields],
    },
  };
}

export function updateCanvas(project: ProjectDocument, patch: Partial<CanvasSettings>): ProjectDocument {
  return updateProjectTarget(project, { type: "canvas" }, patch);
}

export function updateMap(project: ProjectDocument, patch: Partial<MapSettings>): ProjectDocument {
  return updateProjectTarget(project, { type: "map" }, patch);
}

export function updateCards(project: ProjectDocument, patch: Partial<CardSettings>): ProjectDocument {
  return updateProjectTarget(project, { type: "cards" }, patch);
}

export function updateGuests(project: ProjectDocument, patch: Partial<GuestPanelSettings>): ProjectDocument {
  return updateProjectTarget(project, { type: "guests" }, patch);
}

export function updateText(project: ProjectDocument, id: string, patch: Partial<CanvasText>): ProjectDocument {
  return updateProjectTarget(project, { type: "text", id }, patch);
}

export function updateAsset(project: ProjectDocument, id: string, patch: Partial<AssetElement>): ProjectDocument {
  return updateProjectTarget(project, { type: "asset", id }, patch);
}

export function deleteText(project: ProjectDocument, id: string): ProjectDocument {
  if (!project.textElements.some((element) => element.id === id)) return project;
  return { ...project, textElements: project.textElements.filter((element) => element.id !== id) };
}

export function deleteAsset(project: ProjectDocument, id: string): ProjectDocument {
  if (!project.assetElements.some((element) => element.id === id)) return project;
  return { ...project, assetElements: project.assetElements.filter((element) => element.id !== id) };
}

const targetLabels: Record<SceneSelection["type"], string> = {
  canvas: "画布",
  map: "地图",
  province: "省份",
  cards: "卡片",
  guests: "特邀嘉宾",
  text: "文本",
  asset: "素材",
};

export function createSceneTransaction(target: SceneSelection, patch: ScenePatch): ProjectTransaction {
  const targetKey = target.type === "province"
    ? `${target.type}:${target.province}`
    : target.type === "text" || target.type === "asset"
      ? `${target.type}:${target.id}`
      : target.type;
  const patchKey = Object.keys(patch).sort().join(",");
  return {
    id: createId(`scene-${target.type}`),
    label: `更新${targetLabels[target.type]}`,
    source: "manual",
    historyGroup: `${targetKey}:${patchKey}`,
    apply: (project) => updateProjectTarget(project, target, patch),
  };
}

export function createProvinceThemeTransaction(
  themes: Record<string, { backgroundColor: string }>,
): ProjectTransaction {
  const entries = Object.entries(themes);
  return {
    id: createId("tx-province-themes"),
    label: entries.length === 1
      ? `智能匹配省份底色：${entries[0]?.[0]}`
      : `一键匹配 ${entries.length} 个省份底色`,
    source: "manual",
    apply: (current) => ({
      ...current,
      map: {
        ...current.map,
        provinceStyles: entries.reduce((styles, [province, theme]) => {
          const existing = styles[province] ?? {};
          if (existing.appearance?.kind === "manual-color") return styles;
          return {
            ...styles,
            [province]: { ...existing, fill: theme.backgroundColor },
          };
        }, { ...(current.map.provinceStyles ?? {}) }),
      },
    }),
  };
}
