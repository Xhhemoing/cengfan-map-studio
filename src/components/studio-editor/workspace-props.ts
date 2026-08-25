/**
 * 阶段上下文的纯组装函数（原 App.tsx 内联对象抽出，行为不变）：
 * 名单工作台 props、素材面板共享 props 与 StageSlotsContext 本体。
 * 仅做字段映射与少量选择闭包，不做计算或副作用；App 每次渲染重建一次。
 */
import { provinceNames } from "../../lib/app-constants";
import type { StudioAsset, UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import { CHINA_PROVINCE_ADJACENCY } from "../../lib/map-data";
import type { DataViewId, ProvinceSummary } from "../../lib/project-data";
import type { ProjectDocument, ProjectTransaction } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import {
  createAppendStudentsTransaction,
  createReplaceStudentsTransaction,
  createStudentDeleteTransaction,
  createStudentUpdateTransaction,
  createStudentVisibilityToggleTransaction,
  createStudentsVisibilityTransaction,
  type ProjectHistorySummary,
} from "../../lib/studio-editor-helpers";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { ProjectHealth } from "../../hooks/use-project-health";
import type { useResourceLibrary } from "../../hooks/use-resource-library";
import type { useSceneActions } from "../../hooks/use-scene-actions";
import type { DeliveryIssue } from "../workspaces/DeliveryWorkspace";
import type { StageSlotsContext, StudioDataWorkspaceProps } from "./stage-slots";

type SceneActions = ReturnType<typeof useSceneActions>;
type ResourceLibrary = ReturnType<typeof useResourceLibrary>;

export interface BuildDataWorkspacePropsOptions {
  project: ProjectDocument;
  selectedStudentId: string | null;
  onSelectStudent: (id: string | null) => void;
  onChangeDataView: (view: DataViewId) => void;
  commitTransaction: (transaction: ProjectTransaction) => void;
}

/** 名单工作台 props：学生数据的增删改与显隐一律封装为事务提交。 */
export function buildDataWorkspaceProps({
  project,
  selectedStudentId,
  onSelectStudent,
  onChangeDataView,
  commitTransaction,
}: BuildDataWorkspacePropsOptions): StudioDataWorkspaceProps {
  return {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView,
    onAppendStudents: (records) => commitTransaction(createAppendStudentsTransaction(records)),
    onReplaceStudents: (records) => commitTransaction(createReplaceStudentsTransaction(records)),
    onUpdateStudent: (id, patch) => commitTransaction(createStudentUpdateTransaction(id, patch)),
    onToggleVisibility: (id) => commitTransaction(createStudentVisibilityToggleTransaction(id)),
    onDeleteStudent: (id) => commitTransaction(createStudentDeleteTransaction(id)),
    onSetStudentsVisibility: (visibility) => commitTransaction(createStudentsVisibilityTransaction(visibility)),
    selectedStudentId,
    onSelectStudent,
  };
}

export interface BuildAssetPanelPropsOptions {
  project: ProjectDocument;
  summary: ProvinceSummary[];
  userAssets: UserAsset[];
  resources: ResourceLibrary;
  scene: SceneActions;
  setSelection: (next: SceneSelection) => void;
  setStatusMessage: (message: string) => void;
  onApplyBackground: (asset: StudioAsset) => void;
}

/** 素材面板共享 props（内容 / 地图 / 数据阶段与旧版素材面板共用）。 */
export function buildAssetPanelProps({
  project,
  summary,
  userAssets,
  resources,
  scene,
  setSelection,
  setStatusMessage,
  onApplyBackground,
}: BuildAssetPanelPropsOptions): StageSlotsContext["assetPanelProps"] {
  const { patchScene } = scene;
  return {
    instances: project.assetElements
      .filter((element) => element.kind !== "province-texture")
      .map((element) => ({ id: element.id, assetId: element.assetId, label: element.label, kind: element.kind })),
    provinces: provinceNames,
    dataProvinces: summary.map((item) => item.province),
    provinceStyles: project.map.provinceStyles,
    provinceAdjacency: CHINA_PROVINCE_ADJACENCY,
    mapBaseColor: project.map.landColor,
    posterBackground: project.canvas.backgroundColor,
    userAssets,
    assetUsageById: resources.assetUsageById,
    onApplyBackground,
    onSelectInstance: (id) => setSelection({ type: "asset", id }),
    onPatchProvinceTextureUniformSize: (next) => patchScene({ type: "map" }, { provinceTextureUniformSize: next }),
    onApplyProvinceAppearance: (province, appearance, fill) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
      setStatusMessage(`已应用到地图：${province}`);
    },
    onApplyProvinceThemes: scene.applyProvinceThemes,
    onResetProvinceAppearance: (province) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
      setStatusMessage(`已恢复系统默认：${province}`);
    },
    onAddUserAsset: resources.addUserAsset,
    onReplaceUserAsset: resources.replaceUserAsset,
    onDeleteUserAsset: resources.deleteUserAsset,
    onExportResourcePack: resources.exportResourcePack,
    onImportResourcePack: resources.importResourcePack,
  };
}

export interface BuildStageSlotsContextOptions {
  project: ProjectDocument;
  renderProject: ProjectDocument;
  selection: SceneSelection;
  selectedStudentId: string | null;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  /** 派生检查结果（useProjectHealth）。 */
  health: ProjectHealth;
  dataWorkspaceProps: StudioDataWorkspaceProps;
  assetPanelProps: StageSlotsContext["assetPanelProps"];
  posterExport: UsePosterExportResult;
  history: ProjectHistorySummary;
  scene: SceneActions;
  resources: ResourceLibrary;
  onUndo: () => void;
  onRedo: () => void;
  onSelect: (next: SceneSelection) => void;
  onSelectStudent: (id: string | null) => void;
  onChangeDataView: (view: DataViewId) => void;
  onCreateDecoration: (asset: StudioAsset) => void;
  onLocateDeliveryIssue: (item: DeliveryIssue) => void;
  onBackToMapStage: () => void;
}

/**
 * 阶段上下文组装：把各 hook 的动作映射到 StageSlotsContext 的回调槽位。
 * posterRef 不经函数参数传递（react-hooks/refs 禁止渲染期把 ref 传入普通函数），
 * 由 App 在对象字面量上补齐后再交给页面组件。
 */
export function buildStageSlotsContext(options: BuildStageSlotsContextOptions): Omit<StageSlotsContext, "posterRef"> {
  const { health, history, scene, resources } = options;
  return {
    project: options.project,
    renderProject: options.renderProject,
    selection: options.selection,
    selectedStudentId: options.selectedStudentId,
    userAssets: options.userAssets,
    userFonts: options.userFonts,
    dataHealth: health.dataHealth,
    dataIssues: health.dataIssues,
    layoutIssues: health.contentLayoutIssues.filter((issue) => issue.kind !== "object-in-bleed"),
    printIssues: health.contentLayoutIssues.filter((issue) => issue.kind === "object-in-bleed"),
    resourceIssues: health.resourceIssues,
    fontIssues: health.fontIssues,
    printPreflight: health.printPreflight,
    dataWorkspaceProps: options.dataWorkspaceProps,
    assetPanelProps: options.assetPanelProps,
    posterExport: options.posterExport,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    onUndo: options.onUndo,
    onRedo: options.onRedo,
    onSelect: options.onSelect,
    onSelectStudent: options.onSelectStudent,
    onPatchScene: scene.patchScene,
    onResetScene: scene.resetSceneTarget,
    onChangeDataView: options.onChangeDataView,
    onAddUserAsset: resources.addUserAsset,
    onCreateDecoration: options.onCreateDecoration,
    onCardPositionsResolved: scene.captureCardPositions,
    onMoveProvinceTexture: scene.moveProvinceTexture,
    onResizeMapImage: scene.resizeMapImage,
    onRefreshDisplayFramePositions: scene.refreshDisplayFramePositions,
    onLocateDeliveryIssue: options.onLocateDeliveryIssue,
    onBackToMapStage: options.onBackToMapStage,
    onApplyFont: scene.applyFont,
    onUploadFont: resources.uploadUserFont,
    onDeleteUserFont: resources.deleteUserFont,
    onMoveText: scene.moveTextElement,
    onMoveAsset: scene.moveAssetElement,
    onResizeAsset: scene.resizeAssetElement,
    onMoveCard: scene.moveCardPosition,
    onMoveGuests: scene.moveGuestsPanel,
  };
}
