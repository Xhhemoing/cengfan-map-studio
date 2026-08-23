import type { WorkflowStageId } from "./workflow-stages";

export const WORKSPACE_SESSION_STORAGE_KEY = "cengfan-map-studio:workspace-session";
export const LEGACY_EDITOR_STORAGE_KEY = "cengfan-legacy-editor";

/**
 * 阶段等会话状态按项目隔离：项目模式使用 `…:project:<id>`，
 * 无项目 id 的独立编辑器沿用全局 key。新项目没有会话记录，
 * 因此自然落在默认的 `data` 阶段。
 */
export function workspaceSessionStorageKey(projectId?: string | null): string {
  return projectId ? `${WORKSPACE_SESSION_STORAGE_KEY}:project:${projectId}` : WORKSPACE_SESSION_STORAGE_KEY;
}

export interface WorkspaceSession {
  stage: WorkflowStageId;
  selectedProvince?: string;
  selectedObject?: string;
  savedAt: string;
}

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSession = {
  stage: "data",
  savedAt: "",
};

const STAGES = new Set<WorkflowStageId>(["data", "map", "frame", "content", "export"]);

export function serializeWorkspaceSession(session: WorkspaceSession): string {
  return JSON.stringify(session);
}

export function parseWorkspaceSession(raw: string | null | undefined): WorkspaceSession {
  if (!raw) return { ...DEFAULT_WORKSPACE_SESSION };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...DEFAULT_WORKSPACE_SESSION };
    const candidate = value as Partial<WorkspaceSession>;
    if (typeof candidate.stage !== "string" || !STAGES.has(candidate.stage as WorkflowStageId)) {
      return { ...DEFAULT_WORKSPACE_SESSION };
    }
    return {
      stage: candidate.stage as WorkflowStageId,
      ...(typeof candidate.selectedProvince === "string" ? { selectedProvince: candidate.selectedProvince } : {}),
      ...(typeof candidate.selectedObject === "string" ? { selectedObject: candidate.selectedObject } : {}),
      savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : "",
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_SESSION };
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadWorkspaceSession(storage: StorageLike | null | undefined, key = WORKSPACE_SESSION_STORAGE_KEY): WorkspaceSession {
  if (!storage) return { ...DEFAULT_WORKSPACE_SESSION };
  try {
    return parseWorkspaceSession(storage.getItem(key));
  } catch {
    return { ...DEFAULT_WORKSPACE_SESSION };
  }
}

export function saveWorkspaceSession(
  storage: StorageLike | null | undefined,
  session: WorkspaceSession,
  key = WORKSPACE_SESSION_STORAGE_KEY,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, serializeWorkspaceSession(session));
    return true;
  } catch {
    return false;
  }
}
