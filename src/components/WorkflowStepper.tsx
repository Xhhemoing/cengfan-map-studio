import { AlertTriangle, Check, Circle } from "lucide-react";
import type { WorkflowProgress, WorkflowStepStatus } from "../lib/workflow-progress";

export type WorkflowPanelId = "roster" | "map" | "layout" | "content" | "assets" | "deliver";

const steps: Array<{ id: WorkflowPanelId; label: string; progressId: keyof WorkflowProgress }> = [
  { id: "roster", label: "名单", progressId: "roster" },
  { id: "map", label: "地图", progressId: "presentation" },
  { id: "layout", label: "版式", progressId: "layout" },
  { id: "content", label: "内容", progressId: "local" },
  { id: "assets", label: "素材", progressId: "local" },
  { id: "deliver", label: "交付", progressId: "exportStep" },
];

function StatusIcon({ status }: { status: WorkflowStepStatus }) {
  if (status === "ready") return <Check size={13} aria-hidden="true" />;
  if (status === "warning") return <AlertTriangle size={13} aria-hidden="true" />;
  return <Circle size={11} aria-hidden="true" />;
}

export function WorkflowStepper({ activeId, progress, onChange }: {
  activeId: WorkflowPanelId;
  progress: WorkflowProgress;
  onChange: (id: WorkflowPanelId) => void;
}) {
  return (
    <nav className="workflow-stepper" aria-label="制作步骤">
      {steps.map((step, index) => {
        const item = progress[step.progressId];
        const warningCount = item.status === "warning" ? item.counts.unresolved + item.counts.hidden : 0;
        return (
          <button
            key={step.id}
            type="button"
            className={activeId === step.id ? "is-active" : undefined}
            aria-current={activeId === step.id ? "step" : undefined}
            aria-label={warningCount > 0 ? `${step.label}，${warningCount} 项待处理` : step.label}
            onClick={() => onChange(step.id)}
          >
            <span className="workflow-stepper__number">{index + 1}</span>
            <span className="workflow-stepper__label">{step.label}</span>
            <span className="workflow-stepper__status" data-status={item.status}>
              <StatusIcon status={item.status} />
              {warningCount > 0 && <small>{warningCount}</small>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
