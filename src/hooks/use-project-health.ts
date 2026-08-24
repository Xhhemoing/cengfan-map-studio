/**
 * 工程派生检查结果的集中 memo：工作流进度、数据健康、资源 / 字体健康、
 * 内容排版问题与左栏阶段总览模型。一次计算，阶段槽位 / 总览 / 交付多处共用。
 * 自 App.tsx 提取（Round 4），行为保持一致。
 */
import { useMemo } from "react";
import { dataViews } from "../lib/app-constants";
import type { UserAsset } from "../lib/assets";
import { buildDataHealthSummary, listDataIssues } from "../lib/data-health";
import type { UserFont } from "../lib/fonts";
import type { DataViewId } from "../lib/project-data";
import type { ProjectDocument } from "../lib/project-document";
import { listResourceHealthIssues } from "../lib/resource-health";
import { deriveStageOverviewModel } from "../lib/stage-overview";
import { listContentLayoutIssues } from "../lib/studio-editor-helpers";
import type { UsePosterExportResult } from "../lib/usePosterExport";
import { computeWorkflowProgress } from "../lib/workflow-progress";
import { deriveWorkflowStageProgress, type WorkflowStageId } from "../lib/workflow-stages";

export interface UseProjectHealthOptions {
  project: ProjectDocument;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  activeStage: WorkflowStageId;
  /** 画布渲染文档（AI 预览优先）的数据呈现方式，用于总览文案。 */
  dataView: DataViewId;
  exportState: UsePosterExportResult["exportState"];
}

export function useProjectHealth({
  project,
  userAssets,
  userFonts,
  activeStage,
  dataView,
  exportState,
}: UseProjectHealthOptions) {
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const resourceHealthIssues = useMemo(
    () => listResourceHealthIssues(project, userAssets, userFonts),
    [project, userAssets, userFonts],
  );
  const resourceIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "resource"),
    [resourceHealthIssues],
  );
  const fontIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "font"),
    [resourceHealthIssues],
  );
  const contentLayoutIssues = useMemo(() => listContentLayoutIssues(project), [project]);

  const stageOverview = useMemo(
    () => deriveStageOverviewModel({
      stage: activeStage,
      project,
      stageProgress: deriveWorkflowStageProgress(project, workflowProgress),
      dataHealth,
      dataIssues,
      layoutIssues: contentLayoutIssues,
      resourceIssues,
      dataViewLabel: dataViews.find((view) => view.id === dataView)?.name ?? dataView,
      exportState,
    }),
    [activeStage, project, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceIssues, dataView, exportState],
  );

  return {
    workflowProgress,
    dataHealth,
    dataIssues,
    resourceIssues,
    fontIssues,
    contentLayoutIssues,
    stageOverview,
  };
}

export type ProjectHealth = ReturnType<typeof useProjectHealth>;
