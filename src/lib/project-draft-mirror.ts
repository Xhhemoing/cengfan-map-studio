/**
 * Per-project localStorage draft mirror for project mode.
 *
 * IndexedDB writes are asynchronous and can be cut off by a refresh (pagehide
 * fires, the async put never completes). The mirror is written synchronously
 * before the page unloads and read back on the next project load, so edits
 * committed between the last durable save and the refresh survive.
 */
import { restoreProjectDocument, serializeProjectDocument, type ProjectDocument } from "./project-document";

const PROJECT_DRAFT_PREFIX = "cengfan-map-studio:project-draft:";

/** 草稿镜像有效期：过期镜像视为陈旧数据，加载时忽略并等待正常清理。 */
export const PROJECT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProjectDraftMirror {
  savedAt: string;
  project: ProjectDocument;
}

export function projectDraftMirrorKey(projectId: string): string {
  return `${PROJECT_DRAFT_PREFIX}${projectId}`;
}

/**
 * Synchronously persists the project document for `projectId`. History is
 * stripped so the mirror stays small enough for localStorage quotas.
 */
export function writeProjectDraftMirror(
  storage: Storage,
  projectId: string,
  project: ProjectDocument,
  savedAt: string = new Date().toISOString(),
): void {
  try {
    const compact: ProjectDocument = { ...project, history: { past: [], future: [] } };
    storage.setItem(
      projectDraftMirrorKey(projectId),
      JSON.stringify({ savedAt, project: serializeProjectDocument(compact) }),
    );
  } catch {
    // Quota/privacy failures are non-fatal: the debounced IndexedDB save remains.
  }
}

export function clearProjectDraftMirror(storage: Storage, projectId: string): void {
  try {
    storage.removeItem(projectDraftMirrorKey(projectId));
  } catch {
    // Ignore storage failures; a stale mirror is filtered by savedAt on read.
  }
}

/**
 * Reads back a draft mirror. Returns null when the mirror is missing, invalid,
 * older than `newerThan` (usually the durable record's updatedAt), or expired.
 */
export function readProjectDraftMirror(
  storage: Storage,
  projectId: string,
  options: { newerThan?: string; now?: number; ttlMs?: number } = {},
): ProjectDraftMirror | null {
  try {
    const raw = storage.getItem(projectDraftMirrorKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; project?: unknown };
    if (typeof parsed?.savedAt !== "string" || typeof parsed?.project !== "string") return null;
    const savedTime = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedTime)) return null;
    const now = options.now ?? Date.now();
    if (savedTime <= now - (options.ttlMs ?? PROJECT_DRAFT_TTL_MS)) return null;
    if (options.newerThan) {
      const baseline = Date.parse(options.newerThan);
      if (Number.isFinite(baseline) && savedTime <= baseline) return null;
    }
    const document: unknown = JSON.parse(parsed.project);
    if (!document || typeof document !== "object" || Array.isArray(document)) return null;
    return { savedAt: parsed.savedAt, project: restoreProjectDocument(parsed.project) };
  } catch {
    return null;
  }
}
