import type { CanvasPosition } from "./asset-elements";
import type { StudioAsset, UserAsset } from "./assets";
import type { CanvasText } from "./canvas-data";
import { createId } from "./ids";
import { deleteAsset, deleteText } from "./inspector-operations";
import type { ProjectTransaction } from "./project-document";
import type { MapTemplateId } from "./project-data";
import { createDefaultScene, type AssetElement } from "./scene-document";
import { applyCustomTemplateToProject, type CustomTemplateRecord } from "./template-store";
import { createSystemTemplate } from "./template-document";
import { applyTypographyFont, type TypographyTarget } from "./typography";

/** 画布编辑面板发出的事务:全部是纯构造,不碰 React 状态,便于单独回归。 */

export function addTextElementTransaction(element: CanvasText): ProjectTransaction {
  return {
    id: createId("tx-text"),
    label: "添加文本框",
    source: "manual",
    apply: (current) => ({ ...current, textElements: [...current.textElements, element] }),
  };
}

export function addNoteElementTransaction(element: CanvasText): ProjectTransaction {
  return {
    id: createId("tx-note"),
    label: "添加特别备注",
    source: "manual",
    apply: (current) => ({ ...current, textElements: [...current.textElements, element] }),
  };
}

export function deleteTextElementTransaction(id: string): ProjectTransaction {
  return {
    id: `tx-text-delete-${id}`,
    label: "删除文本",
    source: "manual",
    apply: (current) => deleteText(current, id),
  };
}

export function deleteAssetElementTransaction(id: string): ProjectTransaction {
  return {
    id: `tx-asset-delete-${id}`,
    label: "删除素材实例",
    source: "manual",
    apply: (current) => deleteAsset(current, id),
  };
}

export function duplicateAssetElementTransaction(id: string, copy: AssetElement): ProjectTransaction {
  return {
    id: `tx-asset-duplicate-${id}`,
    label: "复制素材实例",
    source: "manual",
    apply: (current) => ({ ...current, assetElements: [...current.assetElements, copy] }),
  };
}

/** 地标与装饰共用同一条落盘路径,只有事务前缀和文案不同。 */
export function addAssetElementTransaction(
  idSeed: string,
  label: string,
  element: AssetElement,
): ProjectTransaction {
  return {
    id: createId(idSeed),
    label,
    source: "manual",
    apply: (current) => ({ ...current, assetElements: [...current.assetElements, element] }),
  };
}

/**
 * 背景要同时写进画布与样式两处:只改画布的话,模板重算会把背景刷回样式里的旧值。
 */
export function applyBackgroundAssetTransaction(asset: StudioAsset): ProjectTransaction {
  return {
    id: createId("tx-bg"),
    label: `应用背景：${asset.label}`,
    source: "manual",
    apply: (current) => ({
      ...current,
      canvas: { ...current.canvas, backgroundImageSrc: asset.src },
      style: { ...current.style, backgroundImageSrc: asset.src },
    }),
  };
}

/** 素材库里换了图,画布上引用它的实例要跟着换,否则画布还挂着旧图。 */
export function replaceAssetElementSourceTransaction(
  assetId: string,
  replacement: UserAsset,
): ProjectTransaction {
  return {
    id: createId(`tx-asset-replace-${assetId}`),
    label: `更新素材：${replacement.label}`,
    source: "manual",
    apply: (current) => ({
      ...current,
      assetElements: current.assetElements.map((element) =>
        element.assetId === assetId ? { ...element, src: replacement.src, label: replacement.label } : element,
      ),
    }),
  };
}

export function applySystemTemplateTransaction(templateId: MapTemplateId): ProjectTransaction {
  const scene = createDefaultScene(templateId);
  return {
    id: createId(`tx-template-${templateId}`),
    label: `应用内置模板：${createSystemTemplate(templateId).name}`,
    source: "manual",
    apply: (current) => ({
      ...current,
      templateId,
      canvas: scene.canvas,
      map: scene.map,
      cards: scene.cards,
      textElements: scene.textElements,
      assetElements: scene.assetElements,
      style: {
        ...current.style,
        cardPreset: scene.cards.preset,
        mapScale: scene.map.scale,
        backgroundColor: scene.canvas.backgroundColor,
        visibleFields: [...scene.cards.visibleFields],
      },
    }),
  };
}

export function applyCustomTemplateTransaction(record: CustomTemplateRecord): ProjectTransaction {
  return {
    id: `tx-custom-${record.id}`,
    label: `应用自定义模板：${record.name}`,
    source: "manual",
    apply: (current) => applyCustomTemplateToProject(current, record),
  };
}

export function applyFontTransaction(
  target: TypographyTarget,
  fontId: string,
  applyToAll: boolean,
): ProjectTransaction {
  return {
    id: createId("tx-typography"),
    label: applyToAll ? "应用字体到全部同类文本" : "修改字体",
    source: "manual",
    apply: (current) => applyTypographyFont(current, target, fontId, applyToAll),
  };
}

export function moveCardTransaction(id: string, position: CanvasPosition): ProjectTransaction {
  return {
    id: createId(`tx-card-position-${id}`),
    label: "调整数据框位置",
    source: "manual",
    apply: (current) => ({
      ...current,
      cards: { ...current.cards, positions: { ...current.cards.positions, [id]: position } },
    }),
  };
}

/**
 * 清空手工位置即可让展示框回到自动布局:保留旧位置的话,刷新按钮只是换个说法的空操作。
 */
export function refreshDisplayFramePositionsTransaction(): ProjectTransaction {
  return {
    id: createId("tx-display-frame-position-refresh"),
    label: "刷新展示框位置",
    source: "manual",
    apply: (current) => ({ ...current, cards: { ...current.cards, positions: {} } }),
  };
}

/** 「恢复默认」按钮要落到哪些字段,由模板的默认场景决定。 */
export function sceneResetPatch(
  templateId: MapTemplateId,
  target: "canvas" | "map" | "cards",
): Record<string, unknown> {
  const defaults = createDefaultScene(templateId);
  const patch = target === "canvas" ? defaults.canvas : target === "map" ? defaults.map : defaults.cards;
  return { ...patch } as Record<string, unknown>;
}
