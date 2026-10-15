import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Sparkles, X } from "lucide-react";
import { AgentSession } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import { saveAssistantConversationState } from "../lib/agent-conversation-store";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";
import { AssistantConversationContext, createConversation, digestFor, browserStorage, persistedConversation, rebaseTextSession, landingFailureMessage, isNoopStep, type AssistantConversation } from "./agent-assistant-state";
import type { SceneSelection } from "../lib/scene-document";
import { AgentConversationPanel } from "./AgentConversationPanel";
import { useAssistantWindowDrag } from "./use-assistant-window-drag";
import { useAssistantCapability } from "./use-assistant-capability";
import { READ_ONLY_AGENT_TOOLS as READ_ONLY } from "../lib/agent-tool-contract";
import type { UserFont } from "../lib/fonts";
import type { ResolvedProjectScene } from "../lib/resolved-scene";
import { useAssistantSceneContext } from "./use-assistant-scene-context";
import "../styles/assistant-intelligence.css";
export { AssistantConversationProvider } from "./AssistantConversationProvider";
const AUTO_APPLIED_NOTE = " 低风险修改已自动应用。";
export function AgentAssistant({
  project,
  assets,
  onPreview,
  onCommit,
  onPendingCountChange,
  presentation = "floating",
  selection,
  onLocalLayout,
  onLocalDiagnose,
  contextStage,
  userFonts,
  scene,
}: {
  project: ProjectDocument;
  assets: UserAsset[];
  onPreview?: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
  onPendingCountChange?: (count: number) => void;
  presentation?: "floating" | "docked";
  selection?: SceneSelection;
  onLocalLayout?: () => void;
  onLocalDiagnose?: () => void;
  contextStage?: string;
  userFonts?: UserFont[];
  scene?: ResolvedProjectScene | null;
}) {
  const state = useContext(AssistantConversationContext);
  if (!state) throw new Error("AgentAssistant must be rendered inside AssistantConversationProvider");
  const { open, setOpen, mode, setMode, conversations, setConversations, activeId, setActiveId, position, setPosition, hydrated, hydrate } = state;
  const [message, setMessage] = useState("");
  const { capability, check: checkCapability, publicDemo, canPlan } = useAssistantCapability();
  const mountedRef = useRef(false);
  const hasMountedRef = useRef(false);
  const projectDigestRef = useRef<string | null>(null);
  const latestProjectDigestRef = useRef<string | null>(null);
  const projectGenerationRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { beginDrag, moveDrag, endDrag } = useAssistantWindowDrag(position, setPosition);
  const activeRunRef = useRef<AgentSession | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  useAssistantSceneContext({ scene, userFonts, selection, contextStage, project, assets, conversations, setConversations, activeRunRef, projectGenerationRef, onPreview });
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const currentProjectDigest = useMemo(() => digestFor(project), [project]);
  latestProjectDigestRef.current = currentProjectDigest;
  const projectIsCurrent = active === null || active.projectDigest === currentProjectDigest;
  const pendingCount = useMemo(() => conversations.filter((conversation) =>
    conversation.projectDigest === currentProjectDigest && conversation.status === "completed" && conversation.selectedStepIds.length > 0,
  ).length, [conversations, currentProjectDigest]);
  const activeWriteSteps = projectIsCurrent ? active?.steps.filter((step) => !READ_ONLY.has(step.name)) ?? [] : [];
  const selectedIds = new Set(projectIsCurrent ? active?.selectedStepIds ?? [] : []);
  const selectedWriteSteps = activeWriteSteps.filter((step) => step.result.ok && selectedIds.has(step.id));
  useEffect(() => {
    hydrate(project, assets);
  }, [assets, hydrate, project]);
  useEffect(() => {
    if (!hydrated) return;
    if (hasMountedRef.current) return;
    hasMountedRef.current = true;
    if (conversations.length === 0) {
      const draft = createConversation(project, mode, assets);
      setConversations([draft]);
      setActiveId(draft.id);
    }
  }, [assets, conversations.length, hydrated, mode, project, setActiveId, setConversations]);
  useEffect(() => {
    if (!hydrated) return;
    const currentDigest = currentProjectDigest;
    if (projectDigestRef.current === null) {
      projectDigestRef.current = currentDigest;
    } else if (projectDigestRef.current !== currentDigest) {
      projectGenerationRef.current += 1;
      activeRunRef.current?.cancel();
      projectDigestRef.current = currentDigest;
      setConversations((current) => current.map((conversation) => {
        if (conversation.projectDigest === currentDigest) return conversation;
        return {
          ...conversation,
          session: rebaseTextSession(project, assets, conversation),
          status: conversation.status === "completed" ? "completed" : conversation.status === "running" ? "draft" : conversation.status,
          steps: [],
          selectedStepIds: [],
          projectDigest: currentDigest,
          landingError: "",
          resumable: false,
          staleNotice: "项目已变化，旧提案已取消；任务目标和保留约束已保留，请基于当前项目重新规划。",
        };
      }));
      onPreview?.(null);
      const changedRecords = conversations.map((conversation) => conversation.projectDigest === currentDigest ? conversation : {
        ...conversation,
          status: conversation.status === "completed" ? "completed" as const : conversation.status === "running" ? "draft" as const : conversation.status,
        steps: [],
        selectedStepIds: [],
        session: rebaseTextSession(project, assets, conversation),
        projectDigest: currentDigest,
      });
      const changedStorage = browserStorage();
      if (changedStorage) saveAssistantConversationState(changedStorage, project, { mode, activeId, conversations: changedRecords.map(persistedConversation) });
      return;
    }
    const storage = browserStorage();
    if (!storage) return;
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      // 环境销毁(jsdom teardown)后定时器仍可能触发;挂载守卫避免卸载后 setState。
      if (!mountedRef.current) return;
      const records = conversations.map(persistedConversation);
      saveAssistantConversationState(storage, project, { mode, activeId, conversations: records });
      if (records.some((record, index) => record.status === "failed" && conversations[index]?.steps.length)) {
        setConversations((current) => current.map((conversation) => {
          const record = records.find((candidate) => candidate.id === conversation.id);
          return record?.status === "failed" && conversation.steps.length > 0
            ? { ...conversation, status: "failed", summary: record.summary, error: record.error, steps: [], selectedStepIds: [], resumable: conversation.resumable && record.snapshot !== null }
            : conversation;
        }));
        onPreview?.(null);
      }
    }, 20);
    return () => {
      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [activeId, assets, conversations, currentProjectDigest, hydrated, mode, onPreview, project, setConversations]);
  useEffect(() => () => {
    if (persistTimerRef.current !== null) clearTimeout(persistTimerRef.current);
  }, []);
  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [onPendingCountChange, pendingCount]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRunRef.current?.cancel();
      const runningId = activeRunIdRef.current;
      if (runningId) setConversations((current) => current.map((conversation) => conversation.id === runningId && conversation.status === "running" ? { ...conversation, status: "cancelled", summary: "已取消，预览未应用" } : conversation));
    };
  }, [setConversations]);
  const openAssistant = () => {
    if (!activeId) {
      const draft = createConversation(project, mode, assets);
      setConversations((current) => [...current, draft]);
      setActiveId(draft.id);
    }
    setOpen(true);
  };
  const updateConversation = (id: string, update: (conversation: AssistantConversation) => AssistantConversation) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? update(conversation) : conversation));
  };
  const createNewConversation = () => {
    if (active?.status === "running") return;
    const conversation = createConversation(project, mode, assets);
    setConversations((current) => [...current, conversation]);
    setActiveId(conversation.id);
    setMessage("");
    onPreview?.(null);
  };
  const selectConversation = (conversation: AssistantConversation) => {
    if (conversation.status === "running") return;
    setActiveId(conversation.id);
    if (conversation.projectDigest !== currentProjectDigest) {
      onPreview?.(null);
      return;
    }
    setMessage(conversation.request);
    if (conversation.selectedStepIds.length === 0) {
      onPreview?.(null);
      return;
    }
    const transaction = conversation.session.transactionForSteps(new Set(conversation.selectedStepIds));
    onPreview?.(transaction?.apply(project) ?? null);
  };
  /**
   * 宿主通常在 React 状态更新函数里才调用 `transaction.apply`，所以 `onCommit` 返回时会话上还看不到
   * 重放结果。改为观察被包装的事务，并在渲染阶段之外回报：整体放弃时把对话退回可重试的已完成态。
   */
  const commitWithLandingGuard = (conversationId: string, session: AgentSession, transaction: ProjectTransaction, stepIds: string[]) => {
    let reported = false;
    onCommit({
      ...transaction,
      apply: (current) => {
        const next = transaction.apply(current);
        const failure = session.lastReplayFailure;
        if (!failure || reported) return next;
        reported = true;
        queueMicrotask(() => {
          if (!mountedRef.current) return;
          updateConversation(conversationId, (conversation) => conversation.status === "running" || conversation.steps.length === 0
            ? conversation
            : {
              ...conversation,
              status: "completed",
              summary: conversation.summary.replace(AUTO_APPLIED_NOTE, ""),
              selectedStepIds: stepIds,
              landingError: landingFailureMessage(failure, conversation.steps),
            });
          onPreview?.(null);
        });
        return next;
      },
    });
  };
  /** `resumeRequest` 重发那次被网络中断的需求，此时输入框可能已被清空或改写。 */
  const run = async (resumeRequest?: string) => {
    if (!mountedRef.current || !active || !projectIsCurrent || active.status === "running" || !canPlan) return;
    const request = (resumeRequest ?? message).trim();
    if (!request) return;
    const runProjectDigest = currentProjectDigest;
    const runProjectGeneration = projectGenerationRef.current;
    const isCurrentRun = () => mountedRef.current && activeRunIdRef.current === active.id &&
      latestProjectDigestRef.current === runProjectDigest && projectGenerationRef.current === runProjectGeneration;
    const progress = ({ round, name, status }: { round: number; name: string; status: "running" | "done" | "rejected" }) => {
      if (isCurrentRun()) updateConversation(active.id, (conversation) => ({
        ...conversation,
        progress: `第 ${round} 轮 · ${name} · ${status === "running" ? "执行中" : status === "done" ? "已完成" : "已拒绝"}`,
      }));
    };
    const isFresh = active.status === "draft" || active.status === "cancelled" || (active.status === "failed" && !active.resumable);
    const session = isFresh
      ? new AgentSession(project, { mode: active.mode, assets, onProgress: progress, taskBrief: active.taskBrief, selection, contextStage, userFonts, scene })
      : active.session;
    session.setTaskContext({ taskBrief: active.taskBrief, selection, stage: contextStage, userFonts, scene });
    activeRunRef.current = session;
    activeRunIdRef.current = active.id;
    updateConversation(active.id, (conversation) => ({
      ...conversation,
      session,
      request,
      title: request.slice(0, 28),
      status: "running",
      error: "",
      landingError: "",
      summary: "",
      steps: isFresh ? [] : active.steps,
      selectedStepIds: isFresh ? [] : active.selectedStepIds,
      progress: "",
      mode: active.mode,
      resumable: false,
      staleNotice: undefined,
    }));
    try {
      const sessionWithProgress = session;
      const outcome = await (isFresh ? sessionWithProgress.run(request) : sessionWithProgress.continue(request));
      if (!isCurrentRun()) return;
      const preview = sessionWithProgress.landingPreview();
      const validWrites = preview.steps.filter((step) => !READ_ONLY.has(step.name) && step.result.ok && !isNoopStep(step));
      try {
        sessionWithProgress.exportSnapshot();
      } catch {
        updateConversation(active.id, (conversation) => ({ ...conversation, status: "failed", summary: "会话无法保存，预览已取消", error: "会话快照过大或无效", steps: [], selectedStepIds: [], progress: "" }));
        onPreview?.(null);
        return;
      }
      if (outcome.kind === "cancelled") {
        updateConversation(active.id, (conversation) => ({ ...conversation, status: "cancelled", summary: "已取消，预览未应用", steps: preview.steps, selectedStepIds: [], progress: "" }));
        onPreview?.(null);
        return;
      }
      if (outcome.kind === "failed") {
        // 传输中断没有污染对话：预算、taskId 与消息都还在，所以只标记可续跑，不清空任何东西。
        const resumable = outcome.retriable === true && sessionWithProgress.canContinue;
        updateConversation(active.id, (conversation) => ({ ...conversation, status: "failed", error: outcome.error ?? "AI 会话失败", steps: preview.steps, progress: "", resumable }));
        onPreview?.(null);
        return;
      }
      const selectedStepIds = [...new Set([...active.selectedStepIds, ...validWrites.map((step) => step.id)])];
      const completed = outcome.kind === "finish";
      const allLowRisk = validWrites.length > 0 && validWrites.every((step) => step.risk === "low");
      const smartApply = active.mode === "smart" && !active.restored && completed && allLowRisk;
      updateConversation(active.id, (conversation) => ({
        ...conversation,
        status: smartApply ? "applied" : "completed",
        summary: `${outcome.summary ?? "已完成。"}${smartApply ? AUTO_APPLIED_NOTE : ""}`,
        steps: preview.steps,
        selectedStepIds: smartApply ? [] : selectedStepIds,
        route: sessionWithProgress.metrics.route,
        provider: sessionWithProgress.metrics.provider ?? "",
        progress: "",
      }));
      if (smartApply && isCurrentRun()) {
        const transaction = sessionWithProgress.transactionForSteps(new Set(selectedStepIds));
        if (transaction) commitWithLandingGuard(active.id, sessionWithProgress, transaction, selectedStepIds);
        onPreview?.(null);
      } else if (isCurrentRun()) {
        const transaction = sessionWithProgress.transactionForSteps(new Set(selectedStepIds));
        onPreview?.(transaction?.apply(project) ?? null);
      }
    } catch (cause) {
      if (isCurrentRun()) updateConversation(active.id, (conversation) => ({ ...conversation, status: "failed", error: cause instanceof Error ? cause.message : "AI 会话失败" }));
    } finally {
      if (activeRunIdRef.current === active.id && projectGenerationRef.current === runProjectGeneration) {
        activeRunRef.current = null;
        activeRunIdRef.current = null;
      }
    }
  };
  const cancel = () => activeRunRef.current?.cancel();
  const toggleStep = (stepId: string, checked: boolean) => {
    if (!active || !projectIsCurrent || active.status === "running" || active.status === "applied") return;
    const next = checked ? [...new Set([...active.selectedStepIds, stepId])] : active.selectedStepIds.filter((id) => id !== stepId);
    updateConversation(active.id, (conversation) => ({ ...conversation, selectedStepIds: next }));
    const transaction = active.session.transactionForSteps(new Set(next));
    onPreview?.(transaction?.apply(project) ?? null);
  };
  const applySelected = () => {
    if (!active || !projectIsCurrent || active.status === "running" || active.status === "applied") return;
    const stepIds = active.selectedStepIds;
    const transaction = active.session.transactionForSteps(new Set(stepIds));
    if (!transaction) return;
    commitWithLandingGuard(active.id, active.session, transaction, stepIds);
    onPreview?.(null);
    updateConversation(active.id, (conversation) => ({ ...conversation, status: "applied", selectedStepIds: [], landingError: "" }));
  };
  const displayConversation = active ?? conversations[0] ?? null;
  const renderConversation = (conversation: AssistantConversation) => <AgentConversationPanel
    conversation={conversation} conversations={conversations} activeWriteSteps={activeWriteSteps}
    selectedWriteSteps={selectedWriteSteps} selectedIds={selectedIds} projectIsCurrent={projectIsCurrent}
    message={message} setMessage={setMessage} capability={capability} publicDemo={publicDemo} canPlan={canPlan}
    selection={selection} onCheckCapability={() => void checkCapability()} onLocalLayout={onLocalLayout} onLocalDiagnose={onLocalDiagnose}
    onSelectConversation={selectConversation} onModeChange={(next) => { setMode(next); updateConversation(conversation.id, (item) => ({ ...item, mode: next })); }}
    onBriefChange={(taskBrief) => updateConversation(conversation.id, (item) => ({ ...item, taskBrief }))}
    onRun={(request) => void run(request)} onCancel={cancel} onToggleStep={toggleStep} onApplySelected={applySelected}
  />;
  if (presentation === "docked") {
    return (
      <section className="agent-assistant agent-assistant--docked" data-agent-presentation="docked" aria-label="AI 助手">
        {displayConversation ? renderConversation(displayConversation) : <p className="panel-note">AI 助手正在初始化…</p>}
      </section>
    );
  }
  return (
    <div className="agent-assistant">
      {!open && (
        <button className="agent-assistant-launcher" type="button" aria-label={pendingCount > 0 ? `打开 AI 助手，${pendingCount} 个待应用对话` : "打开 AI 助手"} title="打开 AI 助手" onClick={openAssistant}>
          <Sparkles size={21} aria-hidden />
          {pendingCount > 0 && <span className="agent-assistant-badge" aria-hidden="true">{pendingCount}</span>}
        </button>
      )}
      {open && active && (
        <section
          className="agent-assistant-window"
          role="dialog"
          aria-label="AI 助手"
          style={position ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto" } : undefined}
        >
          <header className="agent-assistant-header" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <span><Sparkles size={16} aria-hidden /> AI 助手</span>
            <div className="agent-assistant-header-actions">
              <button type="button" title="新建对话" aria-label="新建对话" onClick={createNewConversation}><Plus size={15} aria-hidden /></button>
              <button type="button" title="最小化 AI 助手" aria-label="最小化 AI 助手" onClick={() => setOpen(false)}><Minus size={15} aria-hidden /></button>
              <button type="button" title="重置窗口位置" aria-label="重置窗口位置" onClick={() => setPosition(null)}><Sparkles size={15} aria-hidden /></button>
              <button type="button" title="关闭 AI 助手" aria-label="关闭 AI 助手" onClick={() => { setOpen(false); onPreview?.(null); }}><X size={15} aria-hidden /></button>
            </div>
          </header>
          {renderConversation(active)}
        </section>
      )}
    </div>
  );
}
