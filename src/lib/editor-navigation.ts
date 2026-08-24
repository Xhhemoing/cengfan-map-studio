import type { ActivePanel } from "./app-constants";
import type { StyleLayerTarget } from "./catalog-usage";
import type { DataIssue } from "./data-health";
import { resolveDeliveryIssueLocation, type DeliveryIssueLocation } from "./delivery-target";
import type { LayoutHealthIssue } from "./layout-health";
import type { ProjectDocument } from "./project-document";
import type { ResourceHealthIssue } from "./resource-health";
import type { SceneSelection } from "./scene-document";
import {
  LEGACY_PANEL_TO_WORKFLOW_STAGE,
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  type WorkflowStageId,
} from "./workflow-stages";
import type { WorkflowStepId } from "./workflow-progress";

/** 编辑器内的「跳到问题所在」与阶段切换:全部是纯解析,由 App 负责真正 setState。 */

export function styleLayerSelection(target: StyleLayerTarget): SceneSelection {
  if (target.type === "text") return { type: "text", id: target.id };
  if (target.type === "map") return { type: "map" };
  if (target.type === "canvas") return { type: "canvas" };
  if (target.type === "guests") return { type: "guests" };
  return { type: "cards" };
}

/**
 * 布局问题的 id 是一串由冒号连接的参与者(例如 `overlap:map:text-title`)。
 * 只认工程里真实存在的那一段,认不出来就不动选区 —— 跳到一个不存在的元素比不跳更糟。
 */
export function resolveLayoutIssueSelection(
  project: ProjectDocument,
  issue: { id: string },
): SceneSelection | null {
  const target = issue.id.split(":").find((id) => (
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

/** 与交付面板 `DeliveryIssue` 同构,放在 lib 侧免得纯逻辑反向依赖组件。 */
export type EditorDeliveryIssue =
  | { kind: "data"; issue: DataIssue }
  | { kind: "layout"; issue: LayoutHealthIssue }
  | { kind: "resource"; issue: ResourceHealthIssue };

export interface DeliveryIssueNavigation {
  /** null 表示这类问题不改选区(名单问题只高亮行)。 */
  selection: SceneSelection | null;
  stage: WorkflowStageId;
  panel: ActivePanel;
  studentId?: string;
}

export function resolveDeliveryIssueNavigation(
  project: ProjectDocument,
  item: EditorDeliveryIssue,
): DeliveryIssueNavigation | null {
  if (item.kind === "data") {
    return { selection: null, stage: "data", panel: "roster", studentId: item.issue.studentId };
  }
  if (item.kind === "layout") {
    return { selection: resolveLayoutIssueSelection(project, item.issue), stage: "content", panel: "content" };
  }
  const location = resolveDeliveryIssueLocation(item.issue.target);
  // 认不出目标时连阶段都不切:把用户丢到一个没有对应问题的工作台是更糟的定位。
  if (!location) return null;
  const panel: ActivePanel = location.stage === "frame" ? "layout" : location.stage === "map" ? "map" : "content";
  return { selection: selectionForLocation(location), stage: location.stage, panel };
}

function selectionForLocation(location: DeliveryIssueLocation): SceneSelection {
  switch (location.selectionKind) {
    case "map":
      return { type: "map" };
    case "province":
      return { type: "province", province: location.province! };
    case "guests":
      return { type: "guests" };
    case "cards":
      return { type: "cards" };
    default:
      return { type: location.selectionKind, id: location.id! };
  }
}

export interface WorkflowStageNavigation {
  panel: ActivePanel;
  step: WorkflowStepId;
}

/**
 * 顶栏阶段 → 旧面板 + 旧进度步骤。data 阶段由 App 单独处理(它还要收起全局设置),
 * 没有对应旧面板的阶段返回 null,调用方保持当前面板不动。
 */
export function resolveWorkflowStageNavigation(stage: WorkflowStageId): WorkflowStageNavigation | null {
  const panel = WORKFLOW_STAGE_TO_LEGACY_PANEL[stage];
  if (!panel) return null;
  return { panel, step: workflowStepForStage(stage) };
}

function workflowStepForStage(stage: WorkflowStageId): WorkflowStepId {
  if (stage === "map") return "presentation";
  if (stage === "frame") return "layout";
  if (stage === "export") return "export";
  return "local";
}

export interface WorkflowPanelNavigation {
  stage: WorkflowStageId;
  step: WorkflowStepId;
}

/** 旧面板 → 阶段 + 进度步骤。 */
export function resolveWorkflowPanelNavigation(panel: ActivePanel): WorkflowPanelNavigation {
  const stage = LEGACY_PANEL_TO_WORKFLOW_STAGE[panel];
  const step: WorkflowStepId = panel === "map"
    ? "presentation"
    : panel === "layout"
      ? "layout"
      : panel === "deliver"
        ? "export"
        : "local";
  return { stage, step };
}
