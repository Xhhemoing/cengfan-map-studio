import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import { AlertTriangle, Check, LoaderCircle, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AgentSession, type AgentSessionSnapshot, type AgentStep } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import { loadAssistantConversationState, saveAssistantConversationState, type AssistantConversationRecord } from "../lib/agent-conversation-store";
import { fingerprintProject } from "../lib/project-digest";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";

const READ_ONLY = new Set(["inspect_project", "describe_capability", "check_health", "find_assets", "query_students"]);
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
  /**
   * 服务端回执过期/被占用：仅本次会话内有效，不进持久化，刷新后按普通失败对话处理（失败态本来就会新开任务）。
   * 回滚：删掉该字段与依赖它的按钮文案、提示语即可，续聊失败会退回"开始规划"。
   */
  budgetExpired: boolean;
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
    budgetExpired: false,
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
    budgetExpired: false,
  };
}

type AssistantConversationState = {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  conversations: AssistantConversation[];
  setConversations: Dispatch<SetStateAction<AssistantConversation[]>>;
  activeId: string | null;
  setActiveId: Dispatch<SetStateAction<string | null>>;
  hydrated: boolean;
  hydrate: (project: ProjectDocument, assets: UserAsset[]) => void;
  // 进行中的会话归属 Provider 而非某个 AgentAssistant 实例：移动端抽屉关闭会卸载助手，
  // 但会话必须继续跑完并把结果写回共享状态。
  activeRunRef: MutableRefObject<AgentSession | null>;
  activeRunIdRef: MutableRefObject<string | null>;
  providerMountedRef: MutableRefObject<boolean>;
  // 过期判定也必须跨卸载存活，否则重新挂载后代次归零会把仍然有效的结果误判为过期。
  projectGenerationRef: MutableRefObject<number>;
  latestProjectDigestRef: MutableRefObject<string | null>;
  latestProjectRef: MutableRefObject<ProjectDocument | null>;
  observeProject: (project: ProjectDocument, digest: string) => void;
};

const AssistantConversationContext = createContext<AssistantConversationState | null>(null);

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("conservative");
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const activeRunRef = useRef<AgentSession | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const providerMountedRef = useRef(true);
  const projectGenerationRef = useRef(0);
  const latestProjectDigestRef = useRef<string | null>(null);
  const latestProjectRef = useRef<ProjectDocument | null>(null);
  /**
   * 当前工程的登记入口，由 useAssistantProjectSync 在渲染阶段调用。
   * 记账放在 Provider 而不是 AgentAssistant：关抽屉会卸载助手，指纹若停在卸载那一刻，
   * 会话跑完时 isCurrentRun() 仍判"当前"，就会把旧快照上算出的 transaction 盖到已编辑的工程上。
   */
  const observeProject = (nextProject: ProjectDocument, digest: string) => {
    latestProjectRef.current = nextProject;
    const previous = latestProjectDigestRef.current;
    if (previous === digest) return;
    latestProjectDigestRef.current = digest;
    // 首次登记只是建立基线，不算"工程变了"。
    if (previous !== null) projectGenerationRef.current += 1;
  };
  useEffect(() => {
    providerMountedRef.current = true;
    return () => {
      providerMountedRef.current = false;
      activeRunRef.current?.cancel();
      activeRunRef.current = null;
      activeRunIdRef.current = null;
    };
  }, []);
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
  return <AssistantConversationContext.Provider value={{ mode, setMode, conversations, setConversations, activeId, setActiveId, hydrated, hydrate, activeRunRef, activeRunIdRef, providerMountedRef, projectGenerationRef, latestProjectDigestRef, latestProjectRef, observeProject }}>{children}</AssistantConversationContext.Provider>;
}

/**
 * 把当前工程登记进 Provider，并在工程变化时中止仍在跑的会话，返回当前工程指纹。
 * 编辑器（StudioApp）与 AgentAssistant 都调用它：助手随抽屉关闭卸载后由前者接力，
 * 指纹与代次因此不会停在卸载那一刻。渲染阶段登记（而不是只在 effect 里）是为了让指纹
 * 先于任何异步回写可见；同一份工程重复登记是幂等的，StrictMode 双渲染不会多记一代。
 *
 * 回滚：删掉本 hook、Provider 的 observeProject/latestProjectRef 与 App.tsx 里的调用，
 * 把指纹赋值与代次自增搬回 AgentAssistant 的 digest 看门狗即可；
 * 但这样会回到"关抽屉→改工程→会话完成→旧预览盖掉新工程"的 bug。
 */
export function useAssistantProjectSync(project: ProjectDocument): string {
  const state = useContext(AssistantConversationContext);
  if (!state) throw new Error("useAssistantProjectSync must be called inside AssistantConversationProvider");
  const { observeProject, activeRunRef } = state;
  const digest = useMemo(() => digestFor(project), [project]);
  observeProject(project, digest);
  const cancelledDigestRef = useRef<string | null>(null);
  useEffect(() => {
    if (cancelledDigestRef.current === null || cancelledDigestRef.current === digest) {
      cancelledDigestRef.current = digest;
      return;
    }
    cancelledDigestRef.current = digest;
    // 工程已变：进行中的会话结果注定过期，早点中止省掉后续模型往返。
    activeRunRef.current?.cancel();
  }, [activeRunRef, digest]);
  return digest;
}

export function AgentAssistant({
  project,
  assets,
  onPreview,
  onCommit,
  onPendingCountChange,
}: {
  project: ProjectDocument;
  assets: UserAsset[];
  onPreview?: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
  onPendingCountChange?: (count: number) => void;
}) {
  const state = useContext(AssistantConversationContext);
  if (!state) throw new Error("AgentAssistant must be rendered inside AssistantConversationProvider");
  const { mode, setMode, conversations, setConversations, activeId, setActiveId, hydrated, hydrate, activeRunRef, activeRunIdRef, providerMountedRef, projectGenerationRef, latestProjectDigestRef, latestProjectRef } = state;
  const [message, setMessage] = useState("");
  const mountedRef = useRef(false);
  const hasMountedRef = useRef(false);
  const projectDigestRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  // 助手挂载时也走同一条登记路径；卸载后由编辑器里的调用接力，两边幂等。
  const currentProjectDigest = useAssistantProjectSync(project);
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
      // 代次自增与中止会话都归 useAssistantProjectSync：那条路径在助手卸载后仍然生效。
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

  // 只标记本实例的挂载状态：卸载(移动端抽屉关闭)不取消进行中的会话，
  // 取消交给 AssistantConversationProvider 的卸载清理。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    // 回写归属：Provider 仍在，且这一路仍是该对话的当前会话。助手自己卸载不改变归属。
    const runOwnsConversation = () => providerMountedRef.current && activeRunIdRef.current === active.id;
    // "当前"取 Provider 记的最新工程指纹，而不是助手最后一次渲染时的那一份。
    const isCurrentRun = () => runOwnsConversation() &&
      latestProjectDigestRef.current === runProjectDigest && projectGenerationRef.current === runProjectGeneration;
    /**
     * 会话跑完时工程已经变了：这次回执是在旧快照上算出来的，落地会覆盖用户新改的内容。
     * 与 digest 看门狗同样处理——归 draft、清掉可应用步骤、只把文本历史 rebase 到当前工程。
     * 不这样标记的话，关抽屉期间改工程会让对话永远停在 running。
     */
    const dropStaleRun = () => {
      if (!runOwnsConversation()) return;
      const currentProject = latestProjectRef.current ?? project;
      updateConversation(active.id, (conversation) => ({
        ...conversation,
        session: rebaseTextSession(currentProject, assets, conversation),
        status: conversation.status === "running" || conversation.status === "completed" ? "draft" : conversation.status,
        steps: [],
        selectedStepIds: [],
        progress: "",
        projectDigest: latestProjectDigestRef.current ?? conversation.projectDigest,
      }));
      onPreview?.(null);
    };
    const progress = ({ round, name, status }: { round: number; name: string; status: "running" | "done" | "rejected" }) => {
      if (isCurrentRun()) updateConversation(active.id, (conversation) => ({
        ...conversation,
        progress: `第 ${round} 轮 · ${name} · ${status === "running" ? "执行中" : status === "done" ? "已完成" : "已拒绝"}`,
      }));
    };
    // 没有预算回执的会话（v2 快照恢复）只能只读打开，续聊会被服务端拒绝，这里直接改成新开任务。
    // 回执过期（服务端台账默认 30 分钟 TTL）同理：上一次续聊已经判定过期，这一次必须新开任务。
    const isFresh = active.status === "draft" || active.status === "failed" || active.status === "cancelled" || active.budgetExpired || !active.session.canContinue;
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
      budgetExpired: false,
    }));
    try {
      const sessionWithProgress = session;
      const outcome = await (isFresh ? sessionWithProgress.run(request) : sessionWithProgress.continue(request));
      if (!isCurrentRun()) {
        dropStaleRun();
        return;
      }
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
        // 续聊失败后会话仍标记为已完成，只有回执被服务端判过期/占用时 canContinue 才会翻成 false。
        const budgetExpired = !isFresh && !sessionWithProgress.canContinue;
        updateConversation(active.id, (conversation) => ({ ...conversation, status: "failed", error: outcome.error ?? "AI 会话失败", steps: preview.steps, progress: "", budgetExpired }));
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
      else dropStaleRun();
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

  const renderConversation = (conversation: AssistantConversation) => (
    <>
      <div className="agent-assistant-history" aria-label="对话历史">
        {conversations.map((item) => (
          <button key={item.id} type="button" className={item.id === conversation.id ? "is-active" : undefined} disabled={item.status === "running"} title={item.request || "新对话"} onClick={() => selectConversation(item)}>
            <span>{item.title}</span>
            {item.selectedStepIds.length > 0 && item.status === "completed" && <small>待应用</small>}
          </button>
        ))}
        <button type="button" title="新建对话" aria-label="新建对话" disabled={conversation.status === "running"} onClick={createNewConversation}>
          <Plus size={14} aria-hidden />
        </button>
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
          <button className="wide-button" type="button" onClick={() => void run()} disabled={!projectIsCurrent || !message.trim() || conversation.status === "applied"}><Sparkles size={16} aria-hidden /> {projectIsCurrent && (conversation.budgetExpired || conversation.status === "completed") ? (!conversation.budgetExpired && conversation.session.canContinue ? "继续对话" : "新开任务") : "开始规划"}</button>
        )}
        {projectIsCurrent && conversation.budgetExpired && <p className="panel-note" role="status">会话预算已过期或已被占用，发送新需求会新开一个 AI 任务。</p>}
        {projectIsCurrent && conversation.status === "completed" && !conversation.session.canContinue && <p className="panel-note" role="status">历史会话已只读恢复，发送新需求会新开一个 AI 任务。</p>}
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

  const displayConversation = active ?? conversations[0] ?? {
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
    budgetExpired: false,
  };

  return (
    <section className="agent-assistant agent-assistant--docked" data-agent-presentation="docked" aria-label="AI 助手">
      {renderConversation(displayConversation)}
    </section>
  );
}
