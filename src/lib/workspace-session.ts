import type { WorkflowStageId } from "./workflow-stages";
import type { SceneSelection } from "./scene-document";

export const WORKSPACE_SESSION_STORAGE_KEY = "cengfan-map-studio:workspace-session";
export const LEGACY_EDITOR_STORAGE_KEY = "cengfan-legacy-editor";

/** The public editor keeps its original key; stored projects never adopt that session. */
export function workspaceSessionStorageKey(projectId?: string): string {
  return projectId
    ? `${WORKSPACE_SESSION_STORAGE_KEY}:project:${encodeURIComponent(projectId)}`
    : WORKSPACE_SESSION_STORAGE_KEY;
}

export interface WorkspaceSession {
  stage: WorkflowStageId;
  selection?: SceneSelection;
  /** Compatibility fields for sessions written by older editor versions. */
  selectedProvince?: string;
  selectedObject?: string;
  savedAt: string;
}

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSession = {
  stage: "data",
  savedAt: "",
};

const STAGES = new Set<WorkflowStageId>(["data", "map", "frame", "content", "export"]);

function parseSelection(value: unknown): SceneSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const selection = value as Record<string, unknown>;
  switch (selection.type) {
    case "canvas":
    case "map":
    case "cards":
    case "guests":
      return { type: selection.type };
    case "province":
      return typeof selection.province === "string" && selection.province.trim()
        ? { type: "province", province: selection.province }
        : undefined;
    case "text":
    case "asset":
      return typeof selection.id === "string" && selection.id.trim()
        ? { type: selection.type, id: selection.id }
        : undefined;
    default:
      return undefined;
  }
}

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
    const selection = parseSelection(candidate.selection);
    return {
      stage: candidate.stage as WorkflowStageId,
      ...(selection ? { selection } : {}),
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
