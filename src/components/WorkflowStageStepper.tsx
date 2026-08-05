import { AlertTriangle, Check, Circle } from "lucide-react";
import type { WorkflowProgress, WorkflowStepStatus } from "../lib/workflow-progress";
import {
  getWorkflowStageStatus,
  getWorkflowStageWarningCount,
  WORKFLOW_STAGES,
  type WorkflowStageId,
} from "../lib/workflow-stages";
import type { ProjectDocument } from "../lib/project-document";

function StatusIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "ready") return <Check size={13} aria-hidden="true" />;
  if (status === "warning") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Circle size={11} aria-hidden="true" />;
}

export function WorkflowStageStepper({
  activeId,
  progress,
  project,
  onChange,
}: {
  activeId: WorkflowStageId;
  progress: WorkflowProgress;
  project?: ProjectDocument;
  onChange: (id: WorkflowStageId) => void;
}) {
  return (
    <nav className="workflow-stage-stepper" aria-label="制作步骤">
      {WORKFLOW_STAGES.map((stage, index) => {
        const status = project ? getWorkflowStageStatus(stage.id, project, progress) : "ready";
        const warningCount = getWorkflowStageWarningCount(stage.id, progress);
        return (
          <button
            key={stage.id}
            type="button"
            className={activeId === stage.id ? "is-active" : undefined}
            aria-current={activeId === stage.id ? "step" : undefined}
            aria-label={warningCount > 0 ? `${stage.label}，${warningCount} 项待处理` : stage.label}
            title={stage.description}
            onClick={() => onChange(stage.id)}
          >
            <span className="workflow-stepper__number">{index + 1}</span>
            <span className="workflow-stepper__label">{stage.label}</span>
            <span className="workflow-stepper__status" data-status={status}>
              <StatusIcon status={status} />
              {warningCount > 0 && <small>{warningCount}</small>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
