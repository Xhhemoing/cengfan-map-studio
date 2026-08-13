import { WORKFLOW_STAGES, type WorkflowStageId } from "../lib/workflow-stages";

/**
 * 右栏顶部「阶段说明」（T3）。
 *
 * 默认折叠为一句（本阶段目标），展开后补充当前动作与结果预期；
 * 用原生 details/summary，无需 JS，键盘与屏幕阅读器可直接操作。
 */
export function StageGuideLine({ stage }: { stage: WorkflowStageId }) {
  const definition = WORKFLOW_STAGES.find((item) => item.id === stage);
  if (!definition) return null;
  return (
    <details className="studio-stage-guide" aria-label={`${definition.label}说明`}>
      <summary>{definition.description}</summary>
      <p className="studio-stage-guide__body">
        完成本阶段的关键动作后，步骤条会标记为已完成，即可进入下一步。
        {stage === "template" ? " 建议先选择模板再导入名单。" : ""}
      </p>
    </details>
  );
}
