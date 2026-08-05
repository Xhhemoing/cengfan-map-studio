import type { ProjectDocument } from "./project-document";
import type { WorkflowProgress, WorkflowStepStatus } from "./workflow-progress";

export type WorkflowStageId = "template" | "data" | "map" | "frame" | "content" | "export";

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

export const WORKFLOW_STAGES: readonly WorkflowStageDefinition[] = [
  { id: "template", label: "选择模板", description: "先确定海报的视觉基础" },
  { id: "data", label: "上传数据", description: "导入并检查名单数据" },
  { id: "map", label: "地图样式", description: "确定地图表达与外观" },
  { id: "frame", label: "展示框样式", description: "设计数据展示框" },
  { id: "content", label: "内容与排版", description: "编辑内容并完成排版" },
  { id: "export", label: "最终导出", description: "检查并导出最终文件" },
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
  return value && LEGACY_PANEL_TO_WORKFLOW_STAGE[value] ? LEGACY_PANEL_TO_WORKFLOW_STAGE[value] : "template";
}

export function legacyWorkflowStepToStage(value: string | null | undefined): WorkflowStageId {
  return value && LEGACY_WORKFLOW_STEP_TO_STAGE[value] ? LEGACY_WORKFLOW_STEP_TO_STAGE[value] : "template";
}

export function deriveWorkflowStageProgress(
  project: ProjectDocument,
  progress: WorkflowProgress,
): Record<WorkflowStageId, WorkflowStageProgress> {
  return {
    template: { id: "template", status: project.templateId ? "ready" : "empty", counts: progress.roster.counts },
    data: { id: "data", status: progress.roster.status, counts: progress.roster.counts },
    map: { id: "map", status: progress.presentation.status, counts: progress.presentation.counts },
    frame: { id: "frame", status: progress.layout.status, counts: progress.layout.counts },
    content: { id: "content", status: progress.local.status, counts: progress.local.counts },
    export: { id: "export", status: progress.exportStep.status, counts: progress.exportStep.counts },
  };
}

export function getWorkflowStageStatus(
  stage: WorkflowStageId,
  project: ProjectDocument,
  progress: WorkflowProgress,
): WorkflowStepStatus {
  if (stage === "template") return project.templateId ? "ready" : "empty";
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
