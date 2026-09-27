import { useEffect, useRef } from "react";
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
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const viewport = nav.closest<HTMLElement>(".topbar-workflow") ?? nav;
    let frame = 0;
    const revealActiveStep = () => {
      frame = 0;
      const active = nav.querySelector<HTMLElement>('[aria-current="step"]');
      if (!active || viewport.clientWidth === 0) return;
      const bounds = viewport.getBoundingClientRect();
      const step = active.getBoundingClientRect();
      const style = window.getComputedStyle(viewport);
      const left = bounds.left + viewport.clientLeft + (parseFloat(style.paddingLeft) || 0);
      const right = bounds.left + viewport.clientLeft + viewport.clientWidth - (parseFloat(style.paddingRight) || 0);
      let target = viewport.scrollLeft;
      if (step.left < left) target += step.left - left;
      else if (step.right > right) target += step.right - right;
      target = Math.max(0, Math.min(target, viewport.scrollWidth - viewport.clientWidth));
      if (target !== viewport.scrollLeft) {
        // Scroll this horizontal viewport only, not the header/page ancestors.
        // Instant placement also avoids a partially clipped step during motion.
        viewport.scrollTo({ left: target, behavior: "instant" });
      }
    };
    const scheduleReveal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(revealActiveStep);
    };
    revealActiveStep();
    window.addEventListener("resize", scheduleReveal);
    // Observe the actual scrollport: wrapping and parent layout changes need
    // not coincide with a window resize event or a changed activeId.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleReveal);
    observer?.observe(viewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleReveal);
      observer?.disconnect();
    };
  }, [activeId]);

  return (
    <nav ref={navRef} className="workflow-stage-stepper" aria-label="制作步骤">
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
