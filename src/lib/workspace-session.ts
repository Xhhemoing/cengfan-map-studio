import type { WorkflowStageId } from "./workflow-stages";

export const WORKSPACE_SESSION_STORAGE_KEY = "cengfan-map-studio:workspace-session";
/** @deprecated Kept so old localStorage values do not crash. The three-column editor is gone. */
export const LEGACY_EDITOR_STORAGE_KEY = "cengfan-legacy-editor";

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
