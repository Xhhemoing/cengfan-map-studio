import type { StudioAsset } from "./assets";
import {
  createDecorationElement,
  createLandmarkElement,
  duplicateAssetElement,
} from "./asset-elements";
import { createNoteElement, createTextElement } from "./canvas-data";
import {
  addAssetElementTransaction,
  addNoteElementTransaction,
  addTextElementTransaction,
  applyBackgroundAssetTransaction,
  applyCustomTemplateTransaction,
  applyFontTransaction,
  applySystemTemplateTransaction,
  deleteAssetElementTransaction,
  deleteTextElementTransaction,
  duplicateAssetElementTransaction,
  moveCardTransaction,
  refreshDisplayFramePositionsTransaction,
  sceneResetPatch,
} from "./canvas-edit-transactions";
import { cardLayoutModeLabel } from "./card-layout-modes";
import type { ImageThemeResult } from "./image-color";
import { createProvinceThemeTransaction, createSceneTransaction } from "./inspector-operations";
import type { MapTemplateId } from "./project-data";
import { applyTransaction, type ProjectDocument, type ProjectTransaction } from "./project-document";
import type { CardLayoutModeValue, SceneSelection } from "./scene-document";
import type { CustomTemplateRecord } from "./template-store";
import type { TypographyTarget } from "./typography";

/**
 * 画布与场景的编辑动作:全部落到工程事务上,事务 id/标签由 `canvas-edit-transactions`
 * 与 `inspector-operations` 决定,这里只负责接线(选中谁、提示什么、要不要钉住卡片)。
 */

export type CardPositions = Record<string, { x: number; y: number }>;

export interface EditorCanvasActionDeps {
  project: ProjectDocument;
  /** 当前选区:只有添加地标要用它决定落在哪个省。 */
  selection: SceneSelection;
  /**
   * 画布最近一次算出的卡片位置,只在提交事务时读。地图一变,卡片的默认位置就会跟着跳,
   * 所以地图类改动要先把这份位置钉进工程里。
   */
  readCardPositions(): CardPositions | null;
  /** 丢掉已解析的卡片位置,让下一帧按新地图重算。 */
  clearCardPositions(): void;
  commitProject(next: ProjectDocument): void;
  commitTransaction(transaction: ProjectTransaction): void;
  setSelection(selection: SceneSelection): void;
  setStatusMessage(message: string): void;
  /** 拖拽落点的取整/吸附,由 App 按当前网格设置提供。 */
  snap(x: number, y: number): { x: number; y: number };
}

export function createEditorCanvasActions(deps: EditorCanvasActionDeps) {
  const { project, commitProject, commitTransaction, setSelection, setStatusMessage, snap } = deps;

  /** 只钉住工程里还没有自定义位置的那些卡片:用户手动摆过的位置优先。 */
  const freezeCardPositionsForMapChange = (current: ProjectDocument) => {
    const positions = deps.readCardPositions();
    if (!positions || Object.keys(positions).length === 0) return current.cards;
    return { ...current.cards, positions: { ...positions, ...current.cards.positions } };
  };

  const patchScene = (target: SceneSelection, patch: Record<string, unknown>) => {
    if (target.type !== "map" && target.type !== "province") {
      commitTransaction(createSceneTransaction(target, patch));
      return;
    }
    const transaction = createSceneTransaction(target, patch);
    commitTransaction({
      ...transaction,
      apply: (current) => {
        const next = transaction.apply(current);
        return { ...next, cards: freezeCardPositionsForMapChange(current) };
      },
    });
  };

  const resetSceneTarget = (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => {
    patchScene(target, sceneResetPatch(project.templateId, target.type));
  };

  return {
    patchScene,
    resetSceneTarget,

    applyFont: (target: TypographyTarget, fontId: string, applyToAll: boolean) => {
      commitTransaction(applyFontTransaction(target, fontId, applyToAll));
    },

    /** 手动摆过卡片的工程要先问一句:刷新会把手摆的位置一起算掉。选算法时同一事务切模式并重算。 */
    refreshDisplayFramePositions: (layoutMode?: CardLayoutModeValue) => {
      if (typeof window !== "undefined" && Object.keys(project.cards.positions ?? {}).length > 0
        && !window.confirm("刷新展示框位置会重新按当前地图计算数据框位置，是否继续？")) return;
      deps.clearCardPositions();
      commitTransaction(refreshDisplayFramePositionsTransaction(layoutMode));
      setStatusMessage(layoutMode
        ? `已按${cardLayoutModeLabel(layoutMode)}重算展示框位置`
        : "已刷新展示框位置");
    },

    addText: () => {
      const element = createTextElement("给未来的一封信", 720, 870);
      commitProject(applyTransaction(project, addTextElementTransaction(element)));
      setSelection({ type: "text", id: element.id });
    },

    addNote: () => {
      const element = createNoteElement("山高水长，来日再聚", 745, 905);
      commitProject(applyTransaction(project, addNoteElementTransaction(element)));
      setSelection({ type: "text", id: element.id });
    },

    removeText: (id: string) => {
      commitProject(applyTransaction(project, deleteTextElementTransaction(id)));
      setSelection({ type: "canvas" });
    },

    removeAsset: (id: string) => {
      commitProject(applyTransaction(project, deleteAssetElementTransaction(id)));
      setSelection({ type: "canvas" });
    },

    duplicateAsset: (id: string) => {
      const source = project.assetElements.find((asset) => asset.id === id);
      if (!source) return;
      const copy = duplicateAssetElement(source);
      commitProject(applyTransaction(project, duplicateAssetElementTransaction(id, copy)));
      setSelection({ type: "asset", id: copy.id });
    },

    changeAssetLayer: (id: string, delta: -1 | 1) => {
      const asset = project.assetElements.find((item) => item.id === id);
      if (!asset) return;
      patchScene({ type: "asset", id }, { zIndex: asset.zIndex + delta });
    },

    applySystemTemplate: (templateId: MapTemplateId) => {
      commitProject(applyTransaction(project, applySystemTemplateTransaction(templateId)));
    },

    applyCustomTemplateRecord: (record: CustomTemplateRecord) => {
      commitProject(applyTransaction(project, applyCustomTemplateTransaction(record)));
    },

    createDecoration: (asset: StudioAsset) => {
      const element = createDecorationElement(asset, {
        x: project.canvas.width - 180,
        y: project.canvas.height - 180,
      });
      commitProject(applyTransaction(project, addAssetElementTransaction("tx-decoration", `添加装饰：${asset.label}`, element)));
      setSelection({ type: "asset", id: element.id });
    },

    createLandmark: (asset: StudioAsset) => {
      const selectedProvince = deps.selection.type === "province" ? deps.selection.province : "";
      const element = createLandmarkElement(asset, selectedProvince || "全国", {
        x: project.map.x + project.map.width / 2 - 60,
        y: project.map.y + project.map.height / 2 - 60,
      });
      commitProject(applyTransaction(project, addAssetElementTransaction("tx-landmark", `添加地标：${asset.label}`, element)));
      setSelection({ type: "asset", id: element.id });
    },

    applyBackgroundAsset: (asset: StudioAsset) => {
      commitProject(applyTransaction(project, applyBackgroundAssetTransaction(asset)));
    },

    applyProvinceThemes: (themes: Record<string, ImageThemeResult>) => {
      const entries = Object.entries(themes);
      if (entries.length === 0) return;
      const transaction = createProvinceThemeTransaction(themes);
      commitTransaction({
        ...transaction,
        apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
      });
      setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
    },

    moveCard: (id: string, x: number, y: number) => {
      commitProject(applyTransaction(project, moveCardTransaction(id, snap(x, y))));
    },

    moveText: (id: string, x: number, y: number) => {
      commitProject(applyTransaction(project, createSceneTransaction({ type: "text", id }, snap(x, y))));
    },

    moveGuests: (x: number, y: number) => {
      commitProject(applyTransaction(project, createSceneTransaction({ type: "guests" }, snap(x, y))));
    },

    /** 没动到就不提交:拖拽会连发很多次同坐标的落点,每次都记一步会把撤销栈刷满。 */
    moveAsset: (id: string, x: number, y: number) => {
      const point = snap(x, y);
      const current = project.assetElements.find((asset) => asset.id === id);
      if (!current || (current.x === point.x && current.y === point.y)) return;
      commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)));
    },

    resizeAsset: (id: string, x: number, y: number, width: number, height: number) => {
      const point = snap(x, y);
      const current = project.assetElements.find((asset) => asset.id === id);
      if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
      commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })));
    },

    moveProvinceTexture: (province: string, offsetX: number, offsetY: number) => {
      const appearance = project.map.provinceStyles?.[province]?.appearance;
      if (!appearance || appearance.kind === "manual-color") return;
      patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
    },

    resizeMapImage: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => {
      const source = project.map.renderSource;
      if (source?.kind !== "image" || !source.alignment) return;
      patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
    },
  };
}
