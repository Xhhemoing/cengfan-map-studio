import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle, Check, LoaderCircle, Minus, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { AgentSession, type AgentSessionSnapshot, type AgentStep } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import { loadAssistantConversationState, saveAssistantConversationState, type AssistantConversationRecord } from "../lib/agent-conversation-store";
import { fingerprintProject } from "../lib/project-digest";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";

const READ_ONLY = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);
type Mode = "conservative" | "smart";
type ConversationStatus = "draft" | "running" | "completed" | "failed" | "cancelled" | "applied";

type AssistantConversation = {
  id: string;
  title: string;
  session: AgentSession;
  request: string;
  status: ConversationStatus;
  summary: string;
  error: string;
  steps: AgentStep[];
  selectedStepIds: string[];
  mode: Mode;
  progress: string;
  route?: "primary" | "fallback" | "local";
  provider: string;
  restored: boolean;
  projectDigest: string;
};

function digestFor(project: ProjectDocument): string {
  return fingerprintProject(project);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function restoreConversation(project: ProjectDocument, assets: UserAsset[], record: AssistantConversationRecord): AssistantConversation {
  const session = record.snapshot
    ? (() => {
      try {
        return AgentSession.restore(project, record.snapshot, { mode: record.mode, assets });
      } catch {
        return new AgentSession(project, { mode: record.mode, assets });
      }
    })()
    : new AgentSession(project, { mode: record.mode, assets });
  return {
    id: record.id,
    title: record.title,
    session,
    request: record.request,
    status: record.status,
    summary: record.summary,
    error: record.error,
    steps: record.snapshot ? session.steps : [],
    selectedStepIds: record.selectedStepIds,
    mode: record.mode,
    progress: "",
    route: record.route,
    provider: record.provider,
    restored: true,
    projectDigest: record.projectDigest ?? digestFor(project),
  };
}

function persistedConversation(conversation: AssistantConversation): AssistantConversationRecord {
  const snapshot: AgentSessionSnapshot | null = (() => {
    try {
      return conversation.session.exportSnapshot();
    } catch {
      return null;
    }
  })();
  const snapshotFailed = snapshot === null && (conversation.steps.length > 0 || conversation.status === "running" || conversation.status === "completed");
  return {
    id: conversation.id,
    title: conversation.title,
    request: conversation.request,
    status: snapshotFailed ? "failed" : conversation.status,
    summary: snapshotFailed ? "会话无法保存，预览已取消" : conversation.summary,
    error: snapshotFailed ? "会话快照过大或无效" : conversation.error,
    steps: snapshotFailed ? [] : conversation.steps
      .filter((step) => !READ_ONLY.has(step.name) && step.result.ok)
      .map(({ id, name, arguments: args, risk, lostManualLayout }) => ({ id, name, arguments: structuredClone(args), risk, lostManualLayout })),
    selectedStepIds: snapshotFailed ? [] : conversation.selectedStepIds,
    mode: conversation.mode,
    route: conversation.route,
    provider: conversation.provider,
    restored: conversation.restored,
    projectDigest: conversation.projectDigest,
    snapshot,
  };
}

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

function newId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rebaseTextSession(project: ProjectDocument, assets: UserAsset[], conversation: AssistantConversation): AgentSession {
  try {
    const snapshot = conversation.session.exportSnapshot();
    return AgentSession.restoreTextHistory(project, snapshot, { mode: conversation.mode, assets });
  } catch {
    return new AgentSession(project, { mode: conversation.mode, assets });
  }
}

function createConversation(project: ProjectDocument, mode: Mode, assets: UserAsset[], onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void): AssistantConversation {
  return {
    id: newId(),
    title: "新对话",
    session: new AgentSession(project, { mode, assets, onProgress }),
    request: "",
    status: "draft",
    summary: "",
    error: "",
    steps: [],
    selectedStepIds: [],
    mode,
    progress: "",
    provider: "",
    restored: false,
    projectDigest: digestFor(project),
  };
}

type AssistantConversationState = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  conversations: AssistantConversation[];
  setConversations: Dispatch<SetStateAction<AssistantConversation[]>>;
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  position: { x: number; y: number } | null;
  setPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  hydrated: boolean;
  hydrate: (project: ProjectDocument, assets: UserAsset[]) => void;
};

const AssistantConversationContext = createContext<AssistantConversationState | null>(null);

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("conservative");
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const hydrate = (project: ProjectDocument, assets: UserAsset[]) => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const storage = browserStorage();
    const saved = storage ? loadAssistantConversationState(storage, project) : null;
    if (saved) {
      setMode(saved.mode);
      setActiveId(saved.activeId);
      setConversations(saved.conversations.map((record) => restoreConversation(project, assets, record)));
    }
    setHydrated(true);
  };
  return <AssistantConversationContext.Provider value={{ open, setOpen, mode, setMode, conversations, setConversations, activeId, setActiveId, position, setPosition, hydrated, hydrate }}>{children}</AssistantConversationContext.Provider>;
}

export function AgentAssistant({
  project,
  assets,
  onPreview,
  onCommit,
  onPendingCountChange,
  presentation = "floating",
}: {
  project: ProjectDocument;
  assets: UserAsset[];
  onPreview?: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
  onPendingCountChange?: (count: number) => void;
  presentation?: "floating" | "docked";
}) {
  const state = useContext(AssistantConversationContext);
  if (!state) throw new Error("AgentAssistant must be rendered inside AssistantConversationProvider");
  const { open, setOpen, mode, setMode, conversations, setConversations, activeId, setActiveId, position, setPosition, hydrated, hydrate } = state;
  const [message, setMessage] = useState("");
  const mountedRef = useRef(false);
  const hasMountedRef = useRef(false);
  const projectDigestRef = useRef<string | null>(null);
  const latestProjectDigestRef = useRef<string | null>(null);
  const projectGenerationRef = useRef(0);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const activeRunRef = useRef<AgentSession | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

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
          status: conversation.status === "running" || conversation.status === "completed" ? "draft" : conversation.status,
          steps: [],
          selectedStepIds: [],
          projectDigest: currentDigest,
        };
      }));
      onPreview?.(null);
      const changedRecords = conversations.map((conversation) => conversation.projectDigest === currentDigest ? conversation : {
        ...conversation,
        status: conversation.status === "running" || conversation.status === "completed" ? "draft" as const : conversation.status,
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
            ? { ...conversation, status: "failed", summary: record.summary, error: record.error, steps: [], selectedStepIds: [] }
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

  useEffect(() => {
    if (!open || !position) return;
    const clamp = () => {
      const width = 390;
      setPosition((current) => current ? {
        x: Math.max(0, Math.min(current.x, Math.max(0, window.innerWidth - width))),
        y: Math.max(0, Math.min(current.y, Math.max(0, window.innerHeight - 52))),
      } : current);
    };
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [open, position, setPosition]);

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

  const run = async () => {
    if (!mountedRef.current || !active || !projectIsCurrent || !message.trim() || active.status === "running") return;
    const request = message.trim();
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
    const isFresh = active.status === "draft" || active.status === "failed" || active.status === "cancelled";
    const session = isFresh
      ? new AgentSession(project, { mode: active.mode, assets, onProgress: progress })
      : active.session;
    activeRunRef.current = session;
    activeRunIdRef.current = active.id;
    updateConversation(active.id, (conversation) => ({
      ...conversation,
      session,
      request,
      title: request.slice(0, 28),
      status: "running",
      error: "",
      summary: "",
      steps: isFresh ? [] : active.steps,
      selectedStepIds: isFresh ? [] : active.selectedStepIds,
      progress: "",
      mode: active.mode,
    }));
    try {
      const sessionWithProgress = session;
      const outcome = await (isFresh ? sessionWithProgress.run(request) : sessionWithProgress.continue(request));
      if (!isCurrentRun()) return;
      const preview = sessionWithProgress.landingPreview();
      const validWrites = preview.steps.filter((step) => !READ_ONLY.has(step.name) && step.result.ok);
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
        updateConversation(active.id, (conversation) => ({ ...conversation, status: "failed", error: outcome.error ?? "AI 会话失败", steps: preview.steps, progress: "" }));
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
        summary: `${outcome.summary ?? "已完成。"}${smartApply ? " 低风险修改已自动应用。" : ""}`,
        steps: preview.steps,
        selectedStepIds: smartApply ? [] : selectedStepIds,
        route: sessionWithProgress.metrics.route,
        provider: sessionWithProgress.metrics.provider ?? "",
        progress: "",
      }));
      if (smartApply && isCurrentRun()) {
        const transaction = sessionWithProgress.transactionForSteps(new Set(selectedStepIds));
        if (transaction) onCommit(transaction);
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
    const transaction = active.session.transactionForSteps(new Set(active.selectedStepIds));
    if (!transaction) return;
    onCommit(transaction);
    onPreview?.(null);
    updateConversation(active.id, (conversation) => ({ ...conversation, status: "applied", selectedStepIds: [] }));
  };

  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, label, textarea")) return;
    const panel = event.currentTarget.closest(".agent-assistant-window") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setPosition({ x: Math.max(0, rect.left), y: Math.max(0, rect.top) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = 390;
    const x = Math.max(0, Math.min(event.clientX - drag.offsetX, Math.max(0, window.innerWidth - width)));
    const y = Math.max(0, Math.min(event.clientY - drag.offsetY, Math.max(0, window.innerHeight - 52)));
    setPosition({ x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  const renderConversation = (conversation: AssistantConversation) => (
    <>
      <div className="agent-assistant-history" aria-label="对话历史">
        {conversations.map((item) => (
          <button key={item.id} type="button" className={item.id === conversation.id ? "is-active" : undefined} disabled={item.status === "running"} title={item.request || "新对话"} onClick={() => selectConversation(item)}>
            <span>{item.title}</span>
            {item.selectedStepIds.length > 0 && item.status === "completed" && <small>待应用</small>}
          </button>
        ))}
      </div>
      <div className="agent-assistant-body">
        <div className="agent-mode-control" role="radiogroup" aria-label="AI 执行模式">
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="conservative" checked={conversation.mode === "conservative"} disabled={conversation.status !== "draft"} onChange={() => { setMode("conservative"); updateConversation(conversation.id, (item) => ({ ...item, mode: "conservative" })); }} />保守模式</label>
          <label><input type="radio" name={`agent-mode-${conversation.id}`} value="smart" checked={conversation.mode === "smart"} disabled={conversation.status !== "draft"} onChange={() => { setMode("smart"); updateConversation(conversation.id, (item) => ({ ...item, mode: "smart" })); }} />智能模式</label>
        </div>
        {conversation.request && <p className="agent-assistant-request">需求：{conversation.request}</p>}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="描述你的需求" aria-label="描述 AI 修改需求" disabled={conversation.status === "running"} />
        {conversation.status === "running" ? (
          <button className="wide-button" type="button" onClick={cancel} aria-label="取消 AI 会话"><LoaderCircle size={16} className="spin" aria-hidden /> 取消</button>
        ) : (
          <button className="wide-button" type="button" onClick={() => void run()} disabled={!projectIsCurrent || !message.trim() || conversation.status === "applied"}><Sparkles size={16} aria-hidden /> {projectIsCurrent && conversation.status === "completed" ? "继续对话" : "开始规划"}</button>
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
                  <input type="checkbox" checked={selectedIds.has(step.id)} onChange={(event) => toggleStep(step.id, event.target.checked)} aria-label={`选择 ${stepLabel(step)}`} />
                  <span className="agent-review-icon" aria-hidden>{step.risk === "high" ? <AlertTriangle size={16} /> : step.result.ok ? <Check size={16} /> : <ShieldCheck size={16} />}</span>
                  <span><strong>{stepLabel(step)}</strong><small>{riskLabel(step.risk)} · 影子画布已执行{step.lostManualLayout ? " · 将丢弃手工位置" : ""}</small></span>
                </label>
              ))}
            </div>
            <button className="wide-button" type="button" aria-label="确认应用" onClick={applySelected} disabled={selectedWriteSteps.length === 0}><Check size={16} aria-hidden />确认应用（{selectedWriteSteps.length}）</button>
          </section>
        )}
      </div>
    </>
  );

  const displayConversation = active ?? conversations[0] ?? (presentation === "docked" ? {
    id: "docked-initializing",
    title: "AI 对话",
    session: new AgentSession(project, { mode, assets }),
    request: "",
    status: "draft" as const,
    summary: "",
    error: "",
    steps: [],
    selectedStepIds: [],
    mode,
    progress: "",
    provider: "",
    restored: false,
    projectDigest: currentProjectDigest,
  } : null);

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
