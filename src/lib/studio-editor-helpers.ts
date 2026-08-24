import type { UserAsset } from "./assets";
import { findAssetUsage, isAssetInUse, type STYLE_LAYER_TARGETS } from "./catalog-usage";
import type { CollaborationRole } from "./collaboration-client";
import { diffCollaborationDocument, type CollaborationOperation } from "./collaboration-operations";
import type { WorkspaceSession } from "./workspace-session";
import type { WorkflowStageId } from "./workflow-stages";
import type { CustomTemplateRecord } from "./template-store";
import { snapPoint } from "./grid";
import type { UserFont } from "./fonts";
import type { ProjectDocument } from "./project-document";
import { createProjectPackageEnvelope, type ProjectPackage } from "./project-package";
import type { RenderSettings } from "./render-settings";
import type { SceneSelection } from "./scene-document";

// 门面（facade）：模板构建、事务工厂与排版体检输入已按领域拆分，公开导出保持不变。
export { buildCustomTemplateDraft, buildResolvedTemplate } from "./studio-editor-helpers-templates";
export { listContentLayoutIssues } from "./content-layout-objects";
export {
  createAppendStudentsTransaction,
  createApplySystemTemplateTransaction,
  createDataViewTransaction,
  createReplaceStudentsTransaction,
  createStudentDeleteTransaction,
  createStudentsVisibilityTransaction,
  createStudentUpdateTransaction,
  createStudentVisibilityToggleTransaction,
} from "./studio-editor-helpers-transactions";
export type { StudentEditPatch } from "./studio-editor-helpers-transactions";

/** 编辑器工作区的最新完整状态（用于打包保存与协作快照）。 */
export interface WorkspaceStateSnapshot {
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
}

export function snapCanvasPoint(x: number, y: number, showGrid: boolean, gridSize: number): { x: number; y: number } {
  if (!showGrid) return { x: Math.round(x), y: Math.round(y) };
  return snapPoint({ x, y }, gridSize);
}

export function freezeCardPositions(
  current: ProjectDocument,
  positions: Record<string, { x: number; y: number }> | null,
): ProjectDocument["cards"] {
  if (!positions || Object.keys(positions).length === 0) return current.cards;
  return { ...current.cards, positions: { ...positions, ...current.cards.positions } };
}

/** 协作快照统一去掉历史记录，避免把撤销栈同步给其他成员。 */
export function buildCollaborationPackage(latest: WorkspaceStateSnapshot, exportedAt: string): ProjectPackage {
  const pack = createProjectPackageEnvelope(latest);
  return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
}

/** 增量上传的房间侧门槛字段（useCollaborationRoom 结果的子集）。 */
export interface CollaborationSendGate {
  roomId: string | null;
  roomAccessToken: string | null;
  roomRole: CollaborationRole | null;
  roomReadonly: boolean;
  roomClosed: boolean;
}

/** 查看者、只读、已关闭、缺少房间凭证或缺少基线时一律不上传本地修改。 */
export function canSendCollaborationUpdate(room: CollaborationSendGate, hasBaseline: boolean): boolean {
  return Boolean(room.roomId)
    && Boolean(room.roomAccessToken)
    && room.roomRole !== "viewer"
    && !room.roomReadonly
    && !room.roomClosed
    && hasBaseline;
}

/**
 * 以基线的 exportedAt 打包当前工作区并与基线做差分，得到待上传的增量操作。
 * exportedAt 固定为基线值，避免每次打包时间戳都产生一条伪增量。
 */
export function planCollaborationSend(baseline: ProjectPackage, latest: WorkspaceStateSnapshot): CollaborationOperation[] {
  return diffCollaborationDocument(baseline, buildCollaborationPackage(latest, baseline.exportedAt));
}

export function buildAssetUsageMap(project: ProjectDocument, userAssets: UserAsset[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const asset of userAssets) {
    if (!isAssetInUse(project, asset.id, asset) && asset.src !== project.canvas.backgroundImageSrc) continue;
    const usage = findAssetUsage(project, asset.id);
    const parts: string[] = [];
    if (usage.provinces.length) parts.push(usage.provinces.map((name) => name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "")).join("/"));
    if (usage.instances.length) parts.push(`${usage.instances.length} 个实例`);
    if (asset.src === project.canvas.backgroundImageSrc) parts.push("背景");
    map[asset.id] = parts.length ? `使用中 · ${parts.join(" · ")}` : "使用中";
  }
  return map;
}

/** 素材去重入库：重复素材返回原数组引用；message 供调用方提示用户。 */
export function addAssetToLibrary(current: UserAsset[], asset: UserAsset): { assets: UserAsset[]; message: string } {
  const duplicate = current.some((item) =>
    item.id === asset.id
    || item.src === asset.src && item.kind === asset.kind && JSON.stringify(item.provinceIds) === JSON.stringify(asset.provinceIds));
  if (duplicate) return { assets: current, message: `素材库已有相同素材：${asset.label}` };
  return { assets: [...current, asset], message: `已加入素材库：${asset.label}` };
}

export function resolveStyleLayerSelection(target: (typeof STYLE_LAYER_TARGETS)[number]): SceneSelection {
  if (target.type === "text") return { type: "text", id: target.id };
  if (target.type === "map") return { type: "map" };
  if (target.type === "canvas") return { type: "canvas" };
  if (target.type === "guests") return { type: "guests" };
  return { type: "cards" };
}

/** 由排版问题 id 找到画布上应选中的对象；找不到时返回 null（保持当前选择不变）。 */
export function resolveLayoutIssueSelection(project: ProjectDocument, issueId: string): SceneSelection | null {
  const target = issueId.split(":").find((id) => (
    id === "map"
    || id === "cards"
    || id === "guests"
    || Boolean(project.cards.positions?.[id])
    || project.textElements.some((text) => text.id === id)
    || project.assetElements.some((asset) => asset.id === id)
  ));
  if (!target) return null;
  if (target === "map") return { type: "map" };
  if (target === "cards" || project.cards.positions?.[target]) return { type: "cards" };
  if (target === "guests") return { type: "guests" };
  if (project.textElements.some((text) => text.id === target)) return { type: "text", id: target };
  if (project.assetElements.some((asset) => asset.id === target)) return { type: "asset", id: target };
  return null;
}

/** 从上次会话恢复画布选中对象；无记录时选中默认标题文本。 */
export function deriveSessionSelection(session: WorkspaceSession): SceneSelection {
  if (session.selectedProvince) return { type: "province", province: session.selectedProvince };
  if (session.selectedObject === "cards") return { type: "cards" };
  if (session.selectedObject === "guests") return { type: "guests" };
  if (session.selectedObject) return { type: "asset", id: session.selectedObject };
  return { type: "text", id: "text-note" };
}

/** 由当前阶段与画布选中对象生成要落盘的会话快照；旧的选中记录被替换而非叠加。 */
export function buildWorkspaceSessionUpdate(
  session: WorkspaceSession,
  stage: WorkflowStageId,
  selection: SceneSelection,
  savedAt: string,
): WorkspaceSession {
  const selectedProvince = selection.type === "province" ? selection.province : undefined;
  const selectedObject = selection.type === "asset"
    ? selection.id
    : selection.type === "cards" || selection.type === "guests" ? selection.type : undefined;
  const { selectedProvince: _savedProvince, selectedObject: _savedObject, ...sessionBase } = session;
  return {
    ...sessionBase,
    stage,
    ...(selectedProvince ? { selectedProvince } : {}),
    ...(selectedObject ? { selectedObject } : {}),
    savedAt,
  };
}

export interface ProjectHistorySummary {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

/** 撤销/重做按钮的可用状态与提示文案。 */
export function describeProjectHistory(history: ProjectDocument["history"]): ProjectHistorySummary {
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  return {
    canUndo,
    canRedo,
    undoLabel: canUndo
      ? `撤销：${history.past[history.past.length - 1]?.label ?? "上一步"}`
      : "暂无可撤销操作",
    redoLabel: canRedo
      ? `重做：${history.future[0]?.label ?? "下一步"}`
      : "暂无可重做操作",
  };
}
