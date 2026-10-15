import { useMemo } from "react";
import { dataViews } from "./app-constants";
import { deriveStageOverviewModel } from "./stage-overview";
import { deriveWorkflowStageProgress, type WorkflowStageId } from "./workflow-stages";
import type { ProjectDocument } from "./project-document";
import type { useProjectDiagnostics } from "./use-project-diagnostics";
import type { DeliveryExportState } from "../components/workspaces/DeliveryWorkspace";

type Diagnostics = ReturnType<typeof useProjectDiagnostics>;

export function useEditorStageOverview(options: Pick<Diagnostics, "workflowProgress" | "dataHealth" | "dataIssues" | "contentLayoutIssues" | "resourceHealthIssues"> & {
  project: ProjectDocument;
  stage: WorkflowStageId;
  dataView: string;
  exportState: DeliveryExportState;
  exportIsStale: boolean;
}) {
  const { project, stage, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceHealthIssues, dataView, exportState, exportIsStale } = options;
  return useMemo(() => deriveStageOverviewModel({
    stage, project, stageProgress: deriveWorkflowStageProgress(project, workflowProgress),
    dataHealth, dataIssues, layoutIssues: contentLayoutIssues,
    resourceIssues: resourceHealthIssues.filter((issue) => issue.kind === "resource"),
    fontIssues: resourceHealthIssues.filter((issue) => issue.kind === "font"),
    dataViewLabel: dataViews.find((view) => view.id === dataView)?.name ?? dataView,
    exportState, exportIsStale,
  }), [stage, project, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceHealthIssues, dataView, exportState, exportIsStale]);
}
