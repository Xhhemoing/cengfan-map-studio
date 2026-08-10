import { WorkflowStageStepper } from "./WorkflowStageStepper";
import type { ProjectDocument } from "../lib/project-document";
import type { WorkflowProgress } from "../lib/workflow-progress";
import type { WorkflowStageId } from "../lib/workflow-stages";

export type StudioLeftRailProps = {
  activeStage: WorkflowStageId;
  project: ProjectDocument;
  progress: WorkflowProgress;
  onChangeStage: (stage: WorkflowStageId) => void;
};

/**
 * Persistent left workflow rail: the six-stage navigation only. The AI
 * assistant and advanced-function entries live in the topbar-opened assistant
 * drawer instead of inside this rail.
 */
export function StudioLeftRail({
  activeStage,
  project,
  progress,
  onChangeStage,
}: StudioLeftRailProps) {
  return (
    <nav className="studio-left-rail" aria-label="编辑器左侧栏">
      <div className="studio-left-rail__nav">
        <WorkflowStageStepper
          activeId={activeStage}
          project={project}
          progress={progress}
          onChange={onChangeStage}
        />
      </div>
    </nav>
  );
}
