import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import { AgentSession, type AgentSessionSnapshot, type AgentStep } from "../lib/agent-session";
import type { UserAsset } from "../lib/assets";
import type { AssistantConversationRecord } from "../lib/agent-conversation-store";
import { fingerprintProject } from "../lib/project-digest";
import type { ProjectDocument } from "../lib/project-document";

/** 只读工具不生成可应用步骤，持久化回放时也会被过滤。 */
export const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);

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
};

export type AssistantProgressEvent = { round: number; name: string; status: "running" | "done" | "rejected" };

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
      .filter((step) => !READ_ONLY_TOOLS.has(step.name) && step.result.ok)
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

function newId(): string {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function rebaseTextSession(project: ProjectDocument, assets: UserAsset[], conversation: AssistantConversation): AgentSession {
  try {
    const snapshot = conversation.session.exportSnapshot();
    return AgentSession.restoreTextHistory(project, snapshot, { mode: conversation.mode, assets });
  } catch {
    return new AgentSession(project, { mode: conversation.mode, assets });
  }
}

export function createConversation(project: ProjectDocument, mode: Mode, assets: UserAsset[], onProgress?: (progress: AssistantProgressEvent) => void): AssistantConversation {
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

export type AssistantConversationState = {
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

export function useAssistantConversationState(): AssistantConversationState {
  const state = useContext(AssistantConversationContext);
  if (!state) throw new Error("AgentAssistant must be rendered inside AssistantConversationProvider");
  return state;
}
