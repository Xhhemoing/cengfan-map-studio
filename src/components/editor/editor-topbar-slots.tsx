import { Redo2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import type { HistoryActionLabels } from "../../lib/editor-history";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import type { ProjectDocument } from "../../lib/project-document";
import type { WorkflowProgress } from "../../lib/workflow-progress";
import type { WorkflowStageId } from "../../lib/workflow-stages";
import { ProjectSaveIndicator } from "../ProjectSaveIndicator";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import { WorkbenchBackButton } from "../WorkbenchBackButton";
import { WorkflowStageStepper } from "../WorkflowStageStepper";
import { EditorTopbarActions, type EditorAppearanceControls } from "./EditorTopbarActions";

export interface EditorTopbarSlotOptions {
  assistantEntry: ReactNode;
  history: HistoryActionLabels;
  onUndo: () => void;
  onRedo: () => void;
  projectId?: string;
  projectName: string | null;
  syncState: LocalWorkspaceOverwriteState;
  onSave: () => void;
  onBackToWorkbench: () => void;
  exportActions: ReactNode;
  appearance: EditorAppearanceControls;
  onCopyEnvironment: () => void;
  activeStage: WorkflowStageId;
  project: ProjectDocument;
  workflowProgress: WorkflowProgress;
  onChangeStage: (stage: WorkflowStageId) => void;
}

/** Assemble the common header once; each editor shell receives the same slots. */
export function createEditorTopbarSlots(options: EditorTopbarSlotOptions) {
  const { history } = options;
  return {
    assistantEntry: options.assistantEntry,
    historyActions: (
      <ToolbarGroup label="历史" className="topbar-action-group--history">
        <ToolbarButton label={history.undoLabel} icon={<Undo2 size={18} />} disabled={!history.canUndo} onClick={options.onUndo} />
        <ToolbarButton label={history.redoLabel} icon={<Redo2 size={18} />} disabled={!history.canRedo} onClick={options.onRedo} />
      </ToolbarGroup>
    ),
    projectActions: (
      <EditorTopbarActions
        backButton={options.projectId ? <WorkbenchBackButton onClick={options.onBackToWorkbench} /> : null}
        exportActions={options.exportActions}
        appearance={options.appearance}
        onCopyEnvironment={options.onCopyEnvironment}
      />
    ),
    workflowNav: (
      <WorkflowStageStepper
        activeId={options.activeStage}
        project={options.project}
        progress={options.workflowProgress}
        onChange={options.onChangeStage}
      />
    ),
    projectIdentity: options.projectId ? (
      <ProjectSaveIndicator
        projectName={options.projectName ?? "本地草稿"}
        syncState={options.syncState}
        onSave={options.onSave}
      />
    ) : undefined,
  };
}
