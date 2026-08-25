import type { ProjectDocument } from "./project-document";
import type { WorkflowProgress, WorkflowStepStatus } from "./workflow-progress";

export type WorkflowStageId = "data" | "map" | "frame" | "content" | "export";

export interface WorkflowStageDefinition {
  id: WorkflowStageId;
  label: string;
  description: string;
}

export interface WorkflowStageProgress {
  id: WorkflowStageId;
  status: WorkflowStepStatus;
  counts: WorkflowProgress["roster"]["counts"];
}

/**
 * 一级步骤条文案以「用户要完成的事」命名（对齐 function.md 的制作顺序）：
 * 名单 → 地图 → 版式 → 内容 → 交付。素材不占一级导航，
 * 主入口在内容阶段（素材库），省份贴图从地图阶段直达。
 */
export const WORKFLOW_STAGES: readonly WorkflowStageDefinition[] = [
  { id: "data", label: "名单", description: "导入并校验毕业去向名单" },
  { id: "map", label: "地图", description: "选择呈现方式并调整地图外观" },
  { id: "frame", label: "版式", description: "设计展示框与海报结构" },
  { id: "content", label: "内容", description: "编辑文字、卡片并管理素材" },
  { id: "export", label: "交付", description: "检查并导出海报" },
];

export const LEGACY_PANEL_TO_WORKFLOW_STAGE: Record<string, WorkflowStageId> = {
  roster: "data",
  map: "map",
  layout: "frame",
  content: "content",
  assets: "content",
  deliver: "export",
};

export const LEGACY_WORKFLOW_STEP_TO_STAGE: Record<string, WorkflowStageId> = {
  roster: "data",
  presentation: "map",
  layout: "frame",
  local: "content",
  export: "export",
};

export const WORKFLOW_STAGE_TO_LEGACY_PANEL: Partial<Record<WorkflowStageId, "roster" | "map" | "layout" | "content" | "assets" | "deliver">> = {
  data: "roster",
  map: "map",
  frame: "layout",
  content: "content",
  export: "deliver",
};

export function legacyPanelToWorkflowStage(value: string | null | undefined): WorkflowStageId {
  return value && LEGACY_PANEL_TO_WORKFLOW_STAGE[value] ? LEGACY_PANEL_TO_WORKFLOW_STAGE[value] : "data";
}

export function legacyWorkflowStepToStage(value: string | null | undefined): WorkflowStageId {
  return value && LEGACY_WORKFLOW_STEP_TO_STAGE[value] ? LEGACY_WORKFLOW_STEP_TO_STAGE[value] : "data";
}

export function deriveWorkflowStageProgress(
  _project: ProjectDocument,
  progress: WorkflowProgress,
): Record<WorkflowStageId, WorkflowStageProgress> {
  return {
    data: { id: "data", status: progress.roster.status, counts: progress.roster.counts },
    map: { id: "map", status: progress.presentation.status, counts: progress.presentation.counts },
    frame: { id: "frame", status: progress.layout.status, counts: progress.layout.counts },
    content: { id: "content", status: progress.local.status, counts: progress.local.counts },
    export: { id: "export", status: progress.exportStep.status, counts: progress.exportStep.counts },
  };
}

export function getWorkflowStageStatus(
  stage: WorkflowStageId,
  _project: ProjectDocument,
  progress: WorkflowProgress,
): WorkflowStepStatus {
  if (stage === "data") return progress.roster.status;
  if (stage === "map") return progress.presentation.status;
  if (stage === "frame") return progress.layout.status;
  if (stage === "content") return progress.local.status;
  return progress.exportStep.status;
}

export function getWorkflowStageWarningCount(
  stage: WorkflowStageId,
  progress: WorkflowProgress,
): number {
  const item = stage === "data"
    ? progress.roster
    : stage === "map"
      ? progress.presentation
      : stage === "export"
        ? progress.exportStep
        : null;
  return item?.status === "warning" ? item.counts.unresolved + item.counts.hidden : 0;
}
