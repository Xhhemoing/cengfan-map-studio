/**
 * 画布场景编辑动作：网格吸附、场景补丁（地图相关变更时冻结已解析的卡片位置）、
 * 字体应用、场景重置、省份智能底色、贴图/底图对齐，以及文本、素材、
 * 数据框、嘉宾面板的拖拽与缩放。全部经 commitProject / commitProjectTransaction
 * 落盘，App 只负责组合。自 App.tsx 提取（Round 3），行为保持一致。
 */
import { useRef } from "react";
import { createId } from "../lib/ids";
import type { ImageThemeResult } from "../lib/image-color";
import { createProvinceThemeTransaction, createSceneTransaction } from "../lib/inspector-operations";
import { applyTransaction, type ProjectDocument, type ProjectTransaction } from "../lib/project-document";
import { createDefaultScene, type SceneSelection } from "../lib/scene-document";
import { freezeCardPositions, snapCanvasPoint } from "../lib/studio-editor-helpers";
import { applyTypographyFont, type TypographyTarget } from "../lib/typography";

export interface UseSceneActionsOptions {
  project: ProjectDocument;
  showGrid: boolean;
  gridSize: number;
  commitProject: (next: ProjectDocument) => void;
  commitProjectTransaction: (transaction: ProjectTransaction) => void;
  setStatusMessage: (message: string) => void;
}

export function useSceneActions({
  project,
  showGrid,
  gridSize,
  commitProject,
  commitProjectTransaction,
  setStatusMessage,
}: UseSceneActionsOptions) {
  const maybeSnap = (x: number, y: number) => snapCanvasPoint(x, y, showGrid, gridSize);

  const resolvedCardPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const captureCardPositions = (positions: Record<string, { x: number; y: number }>) => {
    resolvedCardPositionsRef.current = positions;
  };
  const freezeCardPositionsForMapChange = (current: ProjectDocument) =>
    freezeCardPositions(current, resolvedCardPositionsRef.current);

  const refreshDisplayFramePositions = () => {
    if (typeof window !== "undefined" && Object.keys(project.cards.positions ?? {}).length > 0
      && !window.confirm("刷新展示框位置会重新按当前地图计算数据框位置，是否继续？")) return;
    resolvedCardPositionsRef.current = null;
    commitProjectTransaction({
      id: createId("tx-display-frame-position-refresh"),
      label: "刷新展示框位置",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: {} } }),
    });
    setStatusMessage("已刷新展示框位置");
  };

  const patchScene = (target: SceneSelection, patch: Record<string, unknown>) => {
    if (target.type !== "map" && target.type !== "province") {
      commitProjectTransaction(createSceneTransaction(target, patch));
      return;
    }
    const transaction = createSceneTransaction(target, patch);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => {
        const next = transaction.apply(current);
        return { ...next, cards: freezeCardPositionsForMapChange(current) };
      },
    });
  };

  const applyFont = (target: TypographyTarget, fontId: string, applyToAll: boolean) => {
    commitProjectTransaction({
      id: createId("tx-typography"),
      label: applyToAll ? "应用字体到全部同类文本" : "修改字体",
      source: "manual",
      apply: (current) => applyTypographyFont(current, target, fontId, applyToAll),
    });
  };

  const resetSceneTarget = (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => {
    const defaults = createDefaultScene(project.templateId);
    const patch = target.type === "canvas"
      ? defaults.canvas
      : target.type === "map"
        ? defaults.map
        : defaults.cards;
    patchScene(target, { ...patch } as Record<string, unknown>);
  };

  const applyProvinceThemes = (themes: Record<string, ImageThemeResult>) => {
    const entries = Object.entries(themes);
    if (entries.length === 0) return;
    const transaction = createProvinceThemeTransaction(themes);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
    });
    setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
  };

  const moveProvinceTexture = (province: string, offsetX: number, offsetY: number) => {
    const appearance = project.map.provinceStyles?.[province]?.appearance;
    if (!appearance || appearance.kind === "manual-color") return;
    patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
  };

  const resizeMapImage = (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => {
    const source = project.map.renderSource;
    if (source?.kind !== "image" || !source.alignment) return;
    patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
  };

  const moveTextElement = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, createSceneTransaction({ type: "text", id }, point)));
  };

  const moveAssetElement = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)));
  };

  const resizeAssetElement = (id: string, x: number, y: number, width: number, height: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })));
  };

  const moveCardPosition = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, {
      id: createId(`tx-card-position-${id}`),
      label: "调整数据框位置",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { ...current.cards.positions, [id]: point } } }),
    }));
  };

  const moveGuestsPanel = (x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, createSceneTransaction({ type: "guests" }, point)));
  };

  return {
    captureCardPositions,
    refreshDisplayFramePositions,
    patchScene,
    applyFont,
    resetSceneTarget,
    applyProvinceThemes,
    moveProvinceTexture,
    resizeMapImage,
    moveTextElement,
    moveAssetElement,
    resizeAssetElement,
    moveCardPosition,
    moveGuestsPanel,
  };
}
