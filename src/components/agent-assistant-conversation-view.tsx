import { AlertTriangle, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { AgentStep } from "../lib/agent-session";
import type { AssistantConversation, Mode } from "./agent-assistant-model";

function stepLabel(step: AgentStep): string {
  const patch = step.arguments.patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const fields = Object.keys(patch as Record<string, unknown>);
    if (fields.length > 0) return `${step.name}：${fields.join("、")}`;
  }
  if (step.name === "set_data_view") return `切换数据视图：${String(step.arguments.view ?? "")}`;
  if (step.name === "auto_layout") return `自动排版：${String(step.arguments.mode ?? "quadrant")}`;
  return step.name;
}

function riskLabel(risk: AgentStep["risk"]): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  return "低风险";
}

export type AssistantConversationViewProps = {
  conversation: AssistantConversation;
  conversations: AssistantConversation[];
  message: string;
  projectIsCurrent: boolean;
  activeWriteSteps: AgentStep[];
  selectedWriteSteps: AgentStep[];
  selectedIds: ReadonlySet<string>;
  onMessageChange: (value: string) => void;
  onSelectConversation: (conversation: AssistantConversation) => void;
  onModeChange: (conversation: AssistantConversation, mode: Mode) => void;
  onRun: () => void;
  onCancel: () => void;
  onToggleStep: (stepId: string, checked: boolean) => void;
  onApplySelected: () => void;
};

/** 纯展示层：对话历史 + 输入区 + 修改预览。所有状态与副作用留在 AgentAssistant 容器。 */
export function AssistantConversationView({
  conversation,
  conversations,
  message,
  projectIsCurrent,
  activeWriteSteps,
  selectedWriteSteps,
  selectedIds,
  onMessageChange,
  onSelectConversation,
  onModeChange,
  onRun,
  onCancel,
  onToggleStep,
  onApplySelected,
}: AssistantConversationViewProps) {
  return (
    <>
      {/* role="group" 让 aria-label 生效（无角色 div 上的 aria-label 是惰性属性）；当前对话用 aria-current 暴露，不只靠视觉高亮。 */}
      <div className="agent-assistant-history" role="group" aria-label="对话历史">
        {conversations.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === conversation.id ? "is-active" : undefined}
            aria-current={item.id === conversation.id ? "true" : undefined}
            disabled={item.status === "running"}
            title={item.request || "新对话"}
            onClick={() => onSelectConversation(item)}
          >
            <span>{item.title}</span>
            {item.selectedStepIds.length > 0 && item.status === "completed" && <small>待应用</small>}
          </button>
        ))}
      </div>
      <div className="agent-assistant-body">
        <div className="agent-mode-control" role="radiogroup" aria-label="AI 执行模式">
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="conservative" checked={conversation.mode === "conservative"} disabled={conversation.status !== "draft"} onChange={() => onModeChange(conversation, "conservative")} />保守模式</label>
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="smart" checked={conversation.mode === "smart"} disabled={conversation.status !== "draft"} onChange={() => onModeChange(conversation, "smart")} />智能模式</label>
        </div>
        {conversation.request && <p className="agent-assistant-request">需求：{conversation.request}</p>}
        <textarea value={message} onChange={(event) => onMessageChange(event.target.value)} rows={3} placeholder="描述你的需求" aria-label="描述 AI 修改需求" disabled={conversation.status === "running"} />
        {conversation.status === "running" ? (
          <button className="wide-button" type="button" onClick={onCancel} aria-label="取消 AI 会话"><LoaderCircle size={16} className="spin" aria-hidden /> 取消</button>
        ) : (
          <button className="wide-button" type="button" onClick={onRun} disabled={!projectIsCurrent || !message.trim() || conversation.status === "applied"}><Sparkles size={16} aria-hidden /> {projectIsCurrent && conversation.status === "completed" ? "继续对话" : "开始规划"}</button>
        )}
        {conversation.progress && <p className="panel-note" role="status">{conversation.progress}</p>}
        {conversation.error && <p className="panel-note agent-error" role="alert">{conversation.error}</p>}
        {conversation.route === "local" && <p className="panel-note" role="status">已使用本地规则完成可识别的修改。</p>}
        {conversation.route === "fallback" && <p className="panel-note" role="status">已切换备选模型：{conversation.provider || "备选模型"}。</p>}
        {conversation.summary && <p className="panel-note agent-summary">{conversation.summary}</p>}
        {conversation.status === "applied" && <p className="panel-note agent-summary" role="status">已应用</p>}
        {activeWriteSteps.length > 0 && conversation.status !== "failed" && conversation.status !== "applied" && (
          <section className="ai-proposal agent-review" aria-label="AI 修改预览">
            <div className="agent-review-heading"><strong>修改预览</strong><small>{selectedWriteSteps.length}/{activeWriteSteps.filter((step) => step.result.ok).length} 项已选</small></div>
            <div className="review-list">
              {activeWriteSteps.filter((step) => step.result.ok).map((step) => (
                <label key={step.id} className="review-row agent-review-row">
                  <input type="checkbox" checked={selectedIds.has(step.id)} onChange={(event) => onToggleStep(step.id, event.target.checked)} aria-label={`选择 ${stepLabel(step)}`} />
                  <span className="agent-review-icon" aria-hidden>{step.risk === "high" ? <AlertTriangle size={16} /> : step.result.ok ? <Check size={16} /> : <ShieldCheck size={16} />}</span>
                  <span><strong>{stepLabel(step)}</strong><small>{riskLabel(step.risk)} · 影子画布已执行{step.lostManualLayout ? " · 将丢弃手工位置" : ""}</small></span>
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
