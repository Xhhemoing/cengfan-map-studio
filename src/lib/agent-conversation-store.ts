import { AgentSession, validateAgentSessionSnapshot, type AgentSessionReplayStep, type AgentSessionSnapshot } from "./agent-session";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument } from "./project-document";
import { CARD_LAYOUT_MODES } from "./scene-document";

export const ASSISTANT_CONVERSATION_STORAGE_KEY = "cengfan-map-studio:ai-conversations:v1";
const SCHEMA_VERSION = 1;
const MAX_CONVERSATIONS = 20;
const MAX_SERIALIZED_BYTES = 256 * 1024;
const MAX_STRING_LENGTH = 64 * 1024;
const GENERIC_REQUEST = "已保存的 AI 对话";
const GENERIC_TITLE = "AI 对话";
const GENERIC_SUMMARY = "已保存对话";
const GENERIC_ERROR = "会话无法恢复，预览未应用";
const PERSISTABLE_WRITE_TOOLS = new Set(["update_canvas", "update_map", "update_cards", "set_data_view", "auto_layout"]);
const SAFE_PATCH_KEYS: Record<string, ReadonlySet<string>> = {
  update_canvas: new Set(["width", "height", "safeMargin", "backgroundColor", "backgroundFit", "backgroundOpacity", "lineHeight"]),
  update_map: new Set(["x", "y", "width", "height", "scale", "zIndex", "opacity", "landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "showProvinceLabels", "collapseSouthChinaSea", "fillMode", "emptyProvinceFill"]),
  update_cards: new Set(["preset", "compactLayout", "x", "y", "maxWidth", "padding", "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity", "textColor", "fontSize", "connectorStyle", "connectorColor", "connectorWidth", "connectorDash", "layoutMode", "autoBalance", "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex"]),
};
const SAFE_STYLE_KEYS = new Set(["backgroundColor", "landColor", "activeColor", "edgeColor", "background", "textColor", "connectorColor"]);
const SAFE_ENUMS: Record<string, ReadonlySet<string>> = {
  backgroundFit: new Set(["cover", "contain", "stretch"]),
  edgeStyle: new Set(["solid", "dashed", "dotted"]),
  fillMode: new Set(["heat", "manual"]),
  emptyProvinceFill: new Set(["land-color", "transparent"]),
  preset: new Set(["standard", "compact"]),
  connectorStyle: new Set(["straight", "elbow", "curve"]),
  connectorDash: new Set(["solid", "dashed", "dotted"]),
  layoutMode: new Set(CARD_LAYOUT_MODES),
};

type ConversationStatus = "draft" | "running" | "completed" | "failed" | "cancelled" | "applied";
type ConversationMode = "conservative" | "smart";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface AssistantConversationRecord {
  id: string;
  title: string;
  request: string;
  status: ConversationStatus;
  summary: string;
  error: string;
  steps: AgentSessionReplayStep[];
  selectedStepIds: string[];
  mode: ConversationMode;
  route?: "primary" | "fallback" | "local";
  provider: string;
  restored?: boolean;
  projectDigest?: string;
  snapshot: AgentSessionSnapshot | null;
}

export interface AssistantConversationState {
  mode: ConversationMode;
  activeId: string | null;
  conversations: AssistantConversationRecord[];
}

interface PersistedState extends AssistantConversationState {
  schemaVersion: 1;
  projectDigest: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown, max = MAX_STRING_LENGTH): value is string {
  return typeof value === "string" && value.length <= max;
}

function isMode(value: unknown): value is ConversationMode {
  return value === "conservative" || value === "smart";
}

function isStatus(value: unknown): value is ConversationStatus {
  return value === "draft" || value === "running" || value === "completed" || value === "failed" || value === "cancelled" || value === "applied";
}

function isSafeJson(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return isString(value);
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((item) => isSafeJson(item, depth + 1));
  return isRecord(value) && Object.keys(value).length <= 1_000 && Object.values(value).every((item) => isSafeJson(item, depth + 1));
}

function digestFor(project: ProjectDocument): string {
  return fingerprintProject(project);
}

function studentFacts(project: ProjectDocument): string[] {
  return project.students.flatMap((student) => [student.id, student.name, student.university, student.city, student.province])
    .filter((value): value is string => Boolean(value && value.trim()));
}

function containsStudentData(value: unknown, facts: readonly string[], key = ""): boolean {
  if (key === "studentId" || key === "studentIds" || key === "student" || key === "students" || key === "manage_students") return true;
  if (typeof value === "string") return facts.some((fact) => value.includes(fact));
  if (Array.isArray(value)) return value.some((item) => containsStudentData(item, facts, key));
  return isRecord(value) && Object.entries(value).some(([childKey, childValue]) => containsStudentData(childValue, facts, childKey));
}

function isSafeReplayValue(value: unknown, key: string): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    if (value.length > 128 || /^(?:data:|blob:|https?:)/i.test(value)) return false;
    if (SAFE_ENUMS[key]?.has(value)) return true;
    return SAFE_STYLE_KEYS.has(key) && /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([^)]{1,100}\))$/i.test(value);
  }
  if (Array.isArray(value)) return value.every((item) => isSafeReplayValue(item, key));
  return isRecord(value) && Object.entries(value).every(([childKey, childValue]) => isSafeReplayValue(childValue, childKey));
}

function sanitizedUpdateArguments(name: string, args: Record<string, unknown>, facts: readonly string[]): Record<string, unknown> | null {
  const allowedKeys = SAFE_PATCH_KEYS[name];
  if (!allowedKeys) return null;

  let sanitized: Record<string, unknown>;
  if ("patch" in args) {
    if (!isRecord(args.patch)) return null;
    const patchEntries = Object.entries(args.patch);
    if (!patchEntries.every(([key, value]) => allowedKeys.has(key) && isSafeReplayValue(value, key))) return null;
    sanitized = { patch: Object.fromEntries(patchEntries) };
  } else {
    const safeEntries = Object.entries(args).filter(([key]) => allowedKeys.has(key));
    if (!safeEntries.every(([key, value]) => isSafeReplayValue(value, key))) return null;
    sanitized = Object.fromEntries(safeEntries);
  }
  return containsStudentData(sanitized, facts) ? null : sanitized;
}

function sanitizedReplayStep(step: AgentSessionReplayStep, facts: readonly string[]): AgentSessionReplayStep | null {
  if (!PERSISTABLE_WRITE_TOOLS.has(step.name) || !isRecord(step.arguments)) return null;
  if (step.name === "set_data_view") {
    return Object.keys(step.arguments).length === 1 && typeof step.arguments.view === "string" && ["province", "pins", "heat", "city", "university"].includes(step.arguments.view)
      ? { ...structuredClone(step), arguments: { view: step.arguments.view } }
      : null;
  }
  if (step.name === "auto_layout") {
    if (Object.keys(step.arguments).length === 0) return { ...structuredClone(step), arguments: { mode: "quadrant" } };
    return Object.keys(step.arguments).length === 1 && typeof step.arguments.mode === "string" && ["quadrant", "radial", "right-stack", "grid"].includes(step.arguments.mode)
      ? { ...structuredClone(step), arguments: { mode: step.arguments.mode } }
      : null;
  }
  const argumentsSafe = sanitizedUpdateArguments(step.name, step.arguments, facts);
  return argumentsSafe ? { ...structuredClone(step), arguments: argumentsSafe } : null;
}

function sanitizedSnapshot(snapshot: AgentSessionSnapshot | null, steps: AgentSessionReplayStep[]): AgentSessionSnapshot | null {
  if (!snapshot) return null;
  return {
    ...structuredClone(snapshot),
    conversation: [],
    steps: structuredClone(steps),
    metrics: {
      rounds: snapshot.metrics.rounds,
      usedTokens: snapshot.metrics.usedTokens,
      route: snapshot.metrics.route,
      provider: snapshot.metrics.provider,
      fallbackReason: undefined,
    },
  };
}

function genericRecord(record: AssistantConversationRecord, project: ProjectDocument): AssistantConversationRecord {
  const facts = studentFacts(project);
  const steps = record.steps.flatMap((step) => {
    const sanitized = sanitizedReplayStep(step, facts);
    return sanitized ? [sanitized] : [];
  });
  const snapshotSteps = record.snapshot?.steps.flatMap((step) => {
    const sanitized = sanitizedReplayStep(step, facts);
    return sanitized ? [sanitized] : [];
  }) ?? [];
  const recordHasUnsafeStep = steps.length !== record.steps.length;
  const snapshotHasUnsafeStep = record.snapshot ? snapshotSteps.length !== record.snapshot.steps.length : false;
  const snapshot = recordHasUnsafeStep || snapshotHasUnsafeStep ? null : sanitizedSnapshot(record.snapshot, snapshotSteps);
  const snapshotMissing = snapshot === null;
  const nonRestorable = recordHasUnsafeStep || snapshotHasUnsafeStep || snapshotMissing;
  const normalizedStatus = nonRestorable ? (record.status === "running" || record.status === "cancelled" ? "cancelled" : "failed") : record.status;
  return {
    ...record,
    title: GENERIC_TITLE,
    request: GENERIC_REQUEST,
    summary: nonRestorable ? GENERIC_ERROR : GENERIC_SUMMARY,
    error: nonRestorable ? GENERIC_ERROR : "",
    status: normalizedStatus,
    steps: nonRestorable || record.status === "running" ? [] : steps,
    selectedStepIds: nonRestorable || record.status === "running" ? [] : record.selectedStepIds.filter((id) => steps.some((step) => step.id === id)),
    snapshot,
  };
}

function parseRecord(value: unknown): AssistantConversationRecord | null {
  if (!isRecord(value) || !isString(value.id, 256) || !isString(value.title) || !isString(value.request) ||
    !isStatus(value.status) || !isString(value.summary) || !isString(value.error) || !Array.isArray(value.steps) ||
    !value.steps.every((step) => isRecord(step) && isString(step.id, 256) && isString(step.name, 256) && isRecord(step.arguments) &&
      (step.risk === "low" || step.risk === "medium" || step.risk === "high") && isSafeJson(step)) ||
    !Array.isArray(value.selectedStepIds) || !value.selectedStepIds.every((id) => isString(id, 256)) ||
    !isMode(value.mode) || !isString(value.provider) ||
    (value.restored !== undefined && typeof value.restored !== "boolean") ||
    (value.projectDigest !== undefined && !isString(value.projectDigest, 64 * 1024)) ||
    (value.route !== undefined && value.route !== "primary" && value.route !== "fallback" && value.route !== "local") ||
    (value.snapshot !== null && value.snapshot !== undefined && !isSafeJson(value.snapshot))) return null;
  if (value.snapshot !== null && value.snapshot !== undefined) {
    try { validateAgentSessionSnapshot(value.snapshot); } catch { return null; }
  }
  return {
    id: value.id,
    title: value.title,
    request: value.request,
    status: value.status,
    summary: value.summary,
    error: value.error,
    steps: structuredClone(value.steps) as AgentSessionReplayStep[],
    selectedStepIds: [...value.selectedStepIds],
    mode: value.mode,
    ...(value.route !== undefined ? { route: value.route } : {}),
    provider: value.provider,
    ...(value.restored === true ? { restored: true } : {}),
    ...(typeof value.projectDigest === "string" ? { projectDigest: value.projectDigest } : {}),
    snapshot: value.snapshot === null || value.snapshot === undefined ? null : structuredClone(value.snapshot) as AgentSessionSnapshot,
  };
}

function parseState(value: unknown): PersistedState | null {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION || !isString(value.projectDigest, 64 * 1024) ||
    !isMode(value.mode) || (value.activeId !== null && !isString(value.activeId, 256)) || !Array.isArray(value.conversations) ||
    value.conversations.length > MAX_CONVERSATIONS || !value.conversations.every((item) => parseRecord(item) !== null)) return null;
  const parsedConversations = value.conversations.map(parseRecord);
  if (parsedConversations.some((item) => item === null)) return null;
  const conversations = parsedConversations.map((item) => item!).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  return { schemaVersion: SCHEMA_VERSION, projectDigest: value.projectDigest, mode: value.mode, activeId: conversations.some((item) => item.id === value.activeId) ? value.activeId : conversations[0]?.id ?? null, conversations };
}

export function loadAssistantConversationState(storage: StorageLike, project: ProjectDocument): AssistantConversationState | null {
  try {
    const raw = storage.getItem(ASSISTANT_CONVERSATION_STORAGE_KEY);
    if (!raw || new TextEncoder().encode(raw).byteLength > MAX_SERIALIZED_BYTES) return null;
    const persisted = parseState(JSON.parse(raw));
    if (!persisted) return null;
    const currentDigest = digestFor(project);
    const projectMatches = persisted.projectDigest === currentDigest;
    const conversations = persisted.conversations.map((conversation) => {
      const wasRunning = conversation.status === "running";
      const normalized = wasRunning
        ? conversation.snapshot === null
          ? genericRecord(conversation, project)
          : { ...conversation, status: "cancelled" as const, summary: "页面刷新，任务已中止，预览未应用", error: "", steps: [], selectedStepIds: [], snapshot: null }
        : genericRecord(conversation, project);
      const conversationMatches = (conversation.projectDigest ?? persisted.projectDigest) === currentDigest;
      if (projectMatches && conversationMatches) {
        if (!normalized.snapshot) return normalized.status === "completed"
          ? { ...normalized, status: "failed" as const, summary: GENERIC_ERROR, error: GENERIC_ERROR, steps: [], selectedStepIds: [] }
          : normalized;
        try {
          AgentSession.restore(project, normalized.snapshot, { mode: normalized.mode });
          return normalized;
        } catch {
          return { ...normalized, status: "cancelled" as const, summary: "会话无法在当前项目上恢复，预览已取消", steps: [], selectedStepIds: [], snapshot: null };
        }
      }
      if (wasRunning) return { ...normalized, status: "cancelled" as const, steps: [], selectedStepIds: [], snapshot: null, projectDigest: currentDigest };
      if (!normalized.snapshot) return { ...normalized, status: normalized.status === "completed" || normalized.status === "failed" ? "failed" as const : normalized.status === "applied" ? "applied" as const : "draft" as const, summary: normalized.status === "completed" || normalized.status === "failed" ? GENERIC_ERROR : normalized.summary, error: normalized.status === "completed" || normalized.status === "failed" ? GENERIC_ERROR : normalized.error, steps: [], selectedStepIds: [], projectDigest: currentDigest };
      const textHistory = AgentSession.restoreTextHistory(project, normalized.snapshot, { mode: normalized.mode }).exportSnapshot();
      return { ...normalized, status: normalized.status === "completed" ? "completed" as const : normalized.status === "applied" ? "applied" as const : "draft" as const, steps: [], selectedStepIds: [], snapshot: textHistory, projectDigest: currentDigest };
    });
    return { mode: persisted.mode, activeId: conversations.some((item) => item.id === persisted.activeId) ? persisted.activeId : conversations[0]?.id ?? null, conversations };
  } catch {
    return null;
  }
}

export function saveAssistantConversationState(storage: StorageLike, project: ProjectDocument, state: AssistantConversationState): void {
  try {
    const conversations = state.conversations.slice(-MAX_CONVERSATIONS).map((conversation) => {
      if (conversation.title.length > MAX_STRING_LENGTH || conversation.request.length > MAX_STRING_LENGTH || conversation.summary.length > MAX_STRING_LENGTH || conversation.error.length > MAX_STRING_LENGTH) throw new Error("持久化字段过大");
      const normalized = genericRecord(conversation, project);
      return {
        ...normalized,
        steps: structuredClone(normalized.steps),
        selectedStepIds: [...normalized.selectedStepIds],
        ...(normalized.restored ? { restored: true } : {}),
        ...(normalized.projectDigest ? { projectDigest: normalized.projectDigest } : {}),
        snapshot: normalized.snapshot ? structuredClone(normalized.snapshot) : null,
      };
    });
    const safeConversations = conversations.filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== null);
    const persisted: PersistedState = {
      schemaVersion: SCHEMA_VERSION,
      projectDigest: digestFor(project),
      mode: state.mode,
      activeId: safeConversations.some((conversation) => conversation.id === state.activeId) ? state.activeId : safeConversations[0]?.id ?? null,
      conversations: safeConversations,
    };
    const serialized = JSON.stringify(persisted);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) return;
    storage.setItem(ASSISTANT_CONVERSATION_STORAGE_KEY, serialized);
  } catch {
    // Browser storage is optional and must never interrupt editing.
  }
}
