import { createContext, type Dispatch, type SetStateAction } from "react";
import { AgentSession, type AgentReplayFailure, type AgentSessionSnapshot, type AgentStep } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import { type AssistantConversationRecord } from "../lib/agent-conversation-store";
import { fingerprintProject } from "../lib/project-digest";
import type { ProjectDocument } from "../lib/project-document";
import { createTaskBrief, type AgentTaskBrief } from "../lib/agent-task-brief";
import { READ_ONLY_AGENT_TOOLS as READ_ONLY } from "../lib/agent-tool-contract";

export type Mode = "conservative" | "smart";
export type ConversationStatus = "draft" | "running" | "completed" | "failed" | "cancelled" | "applied";

export type AssistantConversation = {
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
  landingError: string;
  /** 传输中断留下的会话仍能续跑：只有这种失败可以接着聊，模型拒绝或快照失败仍要重开。 */
  resumable: boolean;
  taskBrief: AgentTaskBrief;
  staleNotice?: string;
};

export function digestFor(project: ProjectDocument): string {
  return fingerprintProject(project);
}

export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function restoreConversation(project: ProjectDocument, assets: UserAsset[], record: AssistantConversationRecord): AssistantConversation {
  const session = record.snapshot
    ? (() => {
      try {
        return AgentSession.restore(project, record.snapshot, { mode: record.mode, assets, taskBrief: record.taskBrief });
      } catch {
        return new AgentSession(project, { mode: record.mode, assets, taskBrief: record.taskBrief });
      }
    })()
    : new AgentSession(project, { mode: record.mode, assets, taskBrief: record.taskBrief });
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
    landingError: "",
    resumable: false,
    taskBrief: record.taskBrief ?? createTaskBrief(),
  };
}

export function persistedConversation(conversation: AssistantConversation): AssistantConversationRecord {
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
    taskBrief: conversation.taskBrief,
  };
}

export function stepLabel(step: AgentStep): string {
  const labels: Record<string, string> = { update_canvas: "调整画布", update_map: "调整地图", update_cards: "调整展示框", apply_card_style: "应用展示框样式", update_text: "调整文字", update_guests: "调整嘉宾板块", update_asset: "调整素材", update_province: "调整省区", manage_students: "调整名单" };
  const fieldsLabel: Record<string, string> = { fontSize: "字号", maxWidth: "框宽", gap: "间距", background: "背景", textColor: "文字颜色", showCount: "人数", scale: "比例", columns: "列数", padding: "内边距", opacity: "透明度", width: "宽度", height: "高度" };
  const label = labels[step.name] ?? step.name;
  const patch = step.arguments.patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const fields = Object.keys(patch as Record<string, unknown>);
    if (fields.length > 0) return `${label}：${fields.map((field) => fieldsLabel[field] ?? field).join("、")}`;
  }
  if (step.name === "set_data_view") return `切换数据视图：${String(step.arguments.view ?? "")}`;
  if (step.name === "auto_layout") return "智能调整展示框排布";
  return label;
}

export function isNoopStep(step: AgentStep): boolean {
  try { return (JSON.parse(step.result.content) as { noop?: unknown }).noop === true; } catch { return false; }
}

export function riskLabel(risk: AgentStep["risk"]): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  return "低风险";
}

export function replayFailureReason(content: string): string {
  try {
    const parsed = JSON.parse(content) as { code?: unknown; error?: unknown; message?: unknown };
    for (const candidate of [parsed.error, parsed.message]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    if (parsed.code === "SCENE_TARGET_MISSING") return "目标元素已不在当前工程中";
    if (typeof parsed.code === "string" && parsed.code.trim()) return parsed.code.trim();
  } catch {
    // 工具结果可能已被压缩成非 JSON 文本，退回到原文摘要。
  }
  return content.slice(0, 80) || "原因未知";
}

/**
 * 落地被整体放弃时给用户的解释：哪一步失败、为什么，否则用户只看到一次“什么都没发生”。
 * project-document 的拒绝契约保证工程文档原样返回，无需再提醒用户清理历史。
 */
export function landingFailureMessage(failure: AgentReplayFailure, steps: AgentStep[]): string {
  const step = steps.find((candidate) => candidate.id === failure.stepId);
  const label = step ? stepLabel(step) : failure.name;
  return `未能应用：「${label}」在当前工程上已无法执行（${replayFailureReason(failure.content)}）。`
    + "为避免只落地一半，本次全部改动都已放弃，画布内容与历史记录都没有变化。"
    + "请取消该步骤或重新规划后再次确认应用。";
}

function newId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type PrimaryAction = { kind: "start" | "continue" | "resume"; label: string; disabled: boolean };

/**
 * 主按钮是唯一的续跑入口：传输中断后默认重发原需求，用户改写输入框后才换成带新文本的续跑。
 * 两个按钮同时出现会让用户在“重试”和“继续对话”之间二选一，而它们发出的其实是同一种请求。
 */
export function primaryAction(conversation: { status: ConversationStatus; resumable: boolean; request: string }, draft: string, projectIsCurrent: boolean): PrimaryAction {
  const typed = draft.trim();
  const rewritten = typed.length > 0 && typed !== conversation.request.trim();
  const canResume = projectIsCurrent && conversation.status === "failed" && conversation.resumable;
  if (canResume && !rewritten) return { kind: "resume", label: "网络恢复后重试", disabled: false };
  const canContinue = projectIsCurrent && (conversation.status === "completed" || canResume);
  return {
    kind: canContinue ? "continue" : "start",
    label: canContinue ? "继续对话" : "开始规划",
    disabled: !projectIsCurrent || typed.length === 0 || conversation.status === "applied",
  };
}

export function rebaseTextSession(project: ProjectDocument, assets: UserAsset[], conversation: AssistantConversation): AgentSession {
  try {
    const snapshot = conversation.session.exportSnapshot();
    return AgentSession.restoreTextHistory(project, snapshot, { mode: conversation.mode, assets, taskBrief: conversation.taskBrief });
  } catch {
    return new AgentSession(project, { mode: conversation.mode, assets, taskBrief: conversation.taskBrief });
  }
}

export function createConversation(project: ProjectDocument, mode: Mode, assets: UserAsset[], onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void): AssistantConversation {
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
    landingError: "",
    resumable: false,
    taskBrief: createTaskBrief(),
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

export const AssistantConversationContext = createContext<AssistantConversationState | null>(null);
