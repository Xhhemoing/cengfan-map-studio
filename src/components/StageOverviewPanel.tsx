import { WORKFLOW_STAGES } from "../lib/workflow-stages";
import type { WorkflowStepStatus } from "../lib/workflow-progress";
import type {
  StageOverviewAction,
  StageOverviewCard,
  StageOverviewModel,
} from "../lib/stage-overview";

const STATUS_LABELS: Record<WorkflowStepStatus, string> = {
  empty: "未开始",
  ready: "已完成",
  warning: "待处理",
};

export interface StageOverviewPanelProps {
  model: StageOverviewModel;
  /** 保存状态文本（来自 rail 的同步状态）。 */
  saveLabel: string;
  /** 协作状态文本（来自 rail 的协作状态）。 */
  collaborationLabel: string;
  onAction: (action: StageOverviewAction) => void;
}

/**
 * 左栏「本阶段」总览面板（T2）。
 *
 * 只接收窄只读模型（StageOverviewModel）与动作回调，不接触
 * setter/refs/hook 返回值；卡片点击把动作交给外层分派。
 */
export function StageOverviewPanel({ model, saveLabel, collaborationLabel, onAction }: StageOverviewPanelProps) {
  const stageDefinition = WORKFLOW_STAGES.find((item) => item.id === model.stage);
  return (
    <div className="studio-stage-overview">
      <div className="studio-stage-overview__header">
        <strong>{stageDefinition?.label ?? model.stage}</strong>
        <span
          className={`studio-stage-overview__badge studio-stage-overview__badge--${model.progressStatus}`}
          data-stage-status={model.progressStatus}
        >
          {STATUS_LABELS[model.progressStatus]}
        </span>
      </div>
      <p className="studio-stage-overview__hint">{stageDefinition?.description ?? ""}</p>
      <div className="studio-stage-overview__meta" aria-label="工程状态">
        <span>{saveLabel}</span>
        <span>{collaborationLabel}</span>
      </div>
      <ul className="studio-stage-overview__cards" aria-label="本阶段总览">
        {model.cards.map((card) => (
          <li key={card.id}>
            <StageCard card={card} onAction={onAction} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StageCard({ card, onAction }: { card: StageOverviewCard; onAction: (action: StageOverviewAction) => void }) {
  const body = (
    <>
      <div className="studio-stage-overview__card-heading">
        <span className={`studio-stage-overview__dot studio-stage-overview__dot--${card.severity}`} aria-hidden="true" />
        <strong>{card.question}</strong>
      </div>
      <small>{card.status}</small>
    </>
  );
  if (card.action) {
    return (
      <button
        type="button"
        className={`studio-stage-overview__card studio-stage-overview__card--action studio-stage-overview__card--${card.severity}`}
        onClick={() => onAction(card.action!)}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={`studio-stage-overview__card studio-stage-overview__card--${card.severity}`}>
      {body}
    </div>
  );
}
