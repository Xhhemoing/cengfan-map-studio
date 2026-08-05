import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { AgentSession, type AgentStep } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";

const READ_ONLY = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);

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

export function AgentAssistant({
  project,
  assets,
  onPreview,
  onCommit,
}: {
  project: ProjectDocument;
  assets: UserAsset[];
  onPreview?: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
}) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"conservative" | "smart">("conservative");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const sessionRef = useRef<AgentSession | null>(null);

  const writeSteps = useMemo(() => steps.filter((step) => !READ_ONLY.has(step.name)), [steps]);
  const needsConfirmation = mode === "conservative" || writeSteps.some((step) => step.risk === "high");

  const run = async () => {
    if (!message.trim() || running) return;
    setRunning(true);
    setError("");
    setSummary("");
    setSteps([]);
    try {
      const session = new AgentSession(project, {
        mode,
        assets,
        onProgress: ({ round, name, status }) => setProgress(`第 ${round} 轮 · ${name} · ${status === "running" ? "执行中" : status === "done" ? "已完成" : "已拒绝"}`),
      });
      sessionRef.current = session;
      const outcome = await session.run(message.trim());
      if (outcome.kind === "failed") {
        setError(outcome.error ?? "AI 会话失败");
        return;
      }
      const preview = session.landingPreview();
      setSteps(preview.steps);
      setSummary(outcome.summary ?? "");
      onPreview?.(session.shadowProject);
      if (mode === "smart" && !preview.needsConfirmation && preview.steps.some((step) => step.result.ok)) {
        onCommit(session.transaction());
        onPreview?.(null);
        setSummary(`${outcome.summary ?? "修改已完成。"} 低风险修改已自动应用。`);
      }
      setProgress("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI 会话失败");
    } finally {
      setRunning(false);
    }
  };

  const commit = () => {
    const session = sessionRef.current;
    if (!session || writeSteps.length === 0) return;
    onCommit(session.transaction());
    onPreview?.(null);
    setSteps([]);
    setSummary("");
    setProgress("");
  };

  return (
    <div className="ai-assistant agent-assistant">
      <div className="panel-heading">
        <span><Sparkles size={15} aria-hidden /> AI 助手</span>
        <small>{mode === "conservative" ? "保守模式" : "智能模式"}</small>
      </div>
      <div className="agent-mode-control" role="group" aria-label="AI 执行模式">
        <label>
          <input
            type="radio"
            name="agent-mode"
            checked={mode === "conservative"}
            onChange={() => setMode("conservative")}
          />
          保守模式
        </label>
        <label>
          <input
            type="radio"
            name="agent-mode"
            checked={mode === "smart"}
            onChange={() => setMode("smart")}
          />
          智能模式
        </label>
      </div>
      <p className="panel-note agent-mode-note">
        {mode === "conservative" ? "所有改动先预览，确认后才写入工程。" : "低风险改动可直接落地，高风险改动仍需确认。"}
      </p>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        placeholder="描述你的需求，例如：地图缩小一点让卡片有地方放，广东突出一些，标题字号调大"
        aria-label="描述 AI 修改需求"
      />
      <button className="wide-button" type="button" onClick={() => void run()} disabled={running || !message.trim()}>
        {running ? <><LoaderCircle size={16} className="spin" aria-hidden /> AI 思考中...</> : <><Sparkles size={16} aria-hidden /> 开始规划</>}
      </button>
      {progress && <p className="panel-note" role="status">{progress}</p>}
      {error && <p className="panel-note agent-error" role="alert">{error}</p>}
      {summary && <p className="panel-note agent-summary">{summary}</p>}
      {writeSteps.length > 0 && (
        <section className="ai-proposal agent-review" aria-label="AI 修改预览">
          <div className="agent-review-heading">
            <strong>{needsConfirmation ? "修改预览" : "已完成低风险修改"}</strong>
            <small>{writeSteps.length} 项</small>
          </div>
          <div className="review-list">
            {writeSteps.map((step) => (
              <div key={step.id} className={`review-row agent-review-row risk-${step.risk}`}>
                <span className="agent-review-icon" aria-hidden>
                  {step.risk === "high" ? <AlertTriangle size={16} /> : step.result.ok ? <Check size={16} /> : <ShieldCheck size={16} />}
                </span>
                <span>
                  <strong>{stepLabel(step)}</strong>
                  <small>{riskLabel(step.risk)} · {step.result.ok ? "影子画布已执行" : "未执行"}{step.lostManualLayout ? " · 将丢弃手工位置" : ""}</small>
                </span>
              </div>
            ))}
          </div>
          {needsConfirmation && (
            <p className="panel-note agent-confirm-note">
              {mode === "conservative" ? "确认前不会修改当前工程。" : "包含高风险操作，确认前不会修改当前工程。"}
            </p>
          )}
          <button className="wide-button" type="button" onClick={commit} disabled={!writeSteps.some((step) => step.result.ok)}>
            <Check size={16} aria-hidden /> 确认应用（{writeSteps.filter((step) => step.result.ok).length}）
          </button>
        </section>
      )}
    </div>
  );
}
