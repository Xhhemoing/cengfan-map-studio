import { AlertTriangle, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { AgentStep } from "../lib/agent-session";
import type { AgentTaskBrief } from "../lib/agent-task-brief";
import type { AssistantCapability } from "../lib/assistant-capability";
import type { SceneSelection } from "../lib/scene-document";
import { primaryAction, stepLabel, riskLabel, isNoopStep, replayFailureReason, type AssistantConversation, type Mode } from "./agent-assistant-state";
import { AssistantTaskBrief } from "./AssistantTaskBrief";
import { AssistantCapabilityPanel } from "./AssistantCapabilityPanel";
import { AssistantStepDetail } from "./AssistantStepDetail";

export function AgentConversationPanel({ conversation, conversations, activeWriteSteps, selectedWriteSteps, selectedIds, projectIsCurrent, message, setMessage, capability, publicDemo, canPlan, selection, onCheckCapability, onLocalLayout, onLocalDiagnose, onSelectConversation, onModeChange, onBriefChange, onRun, onCancel, onToggleStep, onApplySelected }: {
  conversation: AssistantConversation;
  conversations: AssistantConversation[];
  activeWriteSteps: AgentStep[];
  selectedWriteSteps: AgentStep[];
  selectedIds: Set<string>;
  projectIsCurrent: boolean;
  message: string;
  setMessage: (message: string) => void;
  capability: AssistantCapability;
  publicDemo: boolean;
  canPlan: boolean;
  selection?: SceneSelection;
  onCheckCapability: () => void;
  onLocalLayout?: () => void;
  onLocalDiagnose?: () => void;
  onSelectConversation: (conversation: AssistantConversation) => void;
  onModeChange: (mode: Mode) => void;
  onBriefChange: (brief: AgentTaskBrief) => void;
  onRun: (resumeRequest?: string) => void;
  onCancel: () => void;
  onToggleStep: (stepId: string, checked: boolean) => void;
  onApplySelected: () => void;
}) {
  return (
    <>
      <div className="agent-assistant-history" aria-label="对话历史">
        {conversations.map((item) => (
          <button key={item.id} type="button" className={item.id === conversation.id ? "is-active" : undefined} disabled={item.status === "running"} title={item.request || "新对话"} onClick={() => onSelectConversation(item)}>
            <span>{item.title}</span>
            {item.selectedStepIds.length > 0 && item.status === "completed" && <small>待应用</small>}
          </button>
        ))}
      </div>
      <div className="agent-assistant-body">
        <div className="agent-mode-control" role="radiogroup" aria-label="AI 执行模式">
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="conservative" checked={conversation.mode === "conservative"} disabled={conversation.status !== "draft"} onChange={() => onModeChange("conservative")} />保守模式</label>
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="smart" checked={conversation.mode === "smart"} disabled={conversation.status !== "draft"} onChange={() => onModeChange("smart")} />智能模式</label>
        </div>
        <AssistantCapabilityPanel capability={capability} publicDemo={publicDemo} onCheck={onCheckCapability} onLocalLayout={onLocalLayout} onLocalDiagnose={onLocalDiagnose} />
        <AssistantTaskBrief brief={conversation.taskBrief} selection={selection} disabled={conversation.status === "running" || conversation.status === "applied"} onChange={onBriefChange} />
        {conversation.staleNotice && <p className="panel-note assistant-stale" role="status">{conversation.staleNotice}</p>}
        {conversation.request && <p className="agent-assistant-request">需求：{conversation.request}</p>}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="描述你的需求" aria-label="描述 AI 修改需求" disabled={conversation.status === "running"} />
        {conversation.status === "running" ? (
          <button className="wide-button" type="button" onClick={onCancel} aria-label="取消 AI 会话"><LoaderCircle size={16} className="spin" aria-hidden /> 取消</button>
        ) : (() => {
          const action = primaryAction(conversation, message, projectIsCurrent);
          return (
            <button className="wide-button" type="button" data-agent-action={action.kind} aria-label={action.label} onClick={() => onRun(action.kind === "resume" ? conversation.request : undefined)} disabled={action.disabled || !canPlan || (conversation.taskBrief.scope === "selection" && !conversation.taskBrief.selection)}><Sparkles size={16} aria-hidden /> {action.label}</button>
          );
        })()}
        {conversation.progress && <p className="panel-note" role="status">{conversation.progress}</p>}
        {conversation.error && <p className="panel-note agent-error" role="alert">{conversation.error}</p>}
        {conversation.landingError && <p className="panel-note agent-error" role="alert">{conversation.landingError}</p>}
        {conversation.route === "local" && <p className="panel-note" role="status">已使用本地规则完成可识别的修改。</p>}
        {conversation.route === "fallback" && <p className="panel-note" role="status">已切换备选模型：{conversation.provider || "备选模型"}。</p>}
        {conversation.summary && <p className="panel-note agent-summary">{conversation.summary}</p>}
        {conversation.status === "applied" && <p className="panel-note agent-summary" role="status">已应用</p>}
        {activeWriteSteps.filter((step) => !step.result.ok).map((step) => <p key={step.id} className="panel-note agent-error" role="alert">未执行「{stepLabel(step)}」：{replayFailureReason(step.result.content)}</p>)}
        {activeWriteSteps.some((step) => step.result.ok) && conversation.status !== "failed" && conversation.status !== "applied" && (
          <section className="ai-proposal agent-review" aria-label="AI 修改预览">
            <div className="agent-review-heading"><strong>修改预览</strong><small>{selectedWriteSteps.length}/{activeWriteSteps.filter((step) => step.result.ok).length} 项已选</small></div>
            <p className="panel-note">部分采纳会按所选步骤重新试算并检查范围与保留约束。</p>
            <div className="review-list">
              {activeWriteSteps.filter((step) => step.result.ok).map((step) => (
                <label key={step.id} className="review-row agent-review-row">
                  <input type="checkbox" checked={selectedIds.has(step.id)} disabled={isNoopStep(step)} onChange={(event) => onToggleStep(step.id, event.target.checked)} aria-label={`选择 ${stepLabel(step)}`} />
                  <span className="agent-review-icon" aria-hidden>{step.risk === "high" ? <AlertTriangle size={16} /> : step.result.ok ? <Check size={16} /> : <ShieldCheck size={16} />}</span>
                  <span><strong>{stepLabel(step)}</strong><small>{riskLabel(step.risk)} · {isNoopStep(step) ? "已试算，无需修改" : "已在预览中执行"}{step.lostManualLayout ? " · 将丢弃手工位置" : ""}</small><AssistantStepDetail step={step} /></span>
                </label>
              ))}
            </div>
            <button className="wide-button" type="button" aria-label="确认应用" onClick={onApplySelected} disabled={selectedWriteSteps.length === 0}><Check size={16} aria-hidden />确认应用（{selectedWriteSteps.length}）</button>
          </section>
        )}
      </div>
    </>
  );
}
