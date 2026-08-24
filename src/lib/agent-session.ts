import { applyDataViewChange } from "./catalog-usage";
import { solveCardLayout, type CardLayoutMode, type CardPlacement } from "./card-layout";
import { checkLayoutHealth } from "./layout-health";
import { buildLayoutRequest } from "./render-facts";
import { buildHealthInput } from "./render-health";
import type { StudioAsset } from "./assets";
import { duplicateStudentIds } from "./data-duplicate";
import { createId } from "./ids";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { buildProjectDigest, type ProjectDigestLayer } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { updateSceneTarget, type SceneSelection } from "./scene-document";
import { SCENE_DOMAIN_PROPS, type SceneDomain } from "./scene-writable-props";
import type { DataViewId, Student } from "./project-data";
import { buildProvinceSummary } from "./project-data";
import { resolveCityLocation, resolveStudentLocation } from "./student-data";
import { resolveProvinceName } from "./search-catalog";
import { getProvinceNames } from "./map-data";

const MAX_TOOL_RESULT_BYTES = 16 * 1024;
const MAX_CONVERSATION_MESSAGES = 24;
const CLIENT_ROUND_TIMEOUT_MS = 70_000;
const MAX_HEALTH_ISSUES = 20;
const MAX_ASSET_RESULTS = 20;
const MAX_LAYOUT_SAMPLES = 10;
const MAX_STUDENT_RESULTS = 50;
/** 拒绝幻觉目标时回传的候选清单上限，避免工具结果膨胀。 */
const MAX_AVAILABLE_HINTS = 20;
const MAX_INSPECT_STRING = 200;

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  let result = "";
  for (const character of value) {
    if (utf8Bytes(result + character) > maxBytes) break;
    result += character;
  }
  return result;
}

export function compactAgentToolResult(callName: string, content: string): string {
  let compact: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(content);
    compact = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { ok: false, value: parsed };
    if (callName === "auto_layout" && Array.isArray(compact.placements)) {
      const placements = compact.placements as unknown[];
      compact = { ok: compact.ok, placementCount: placements.length, samples: placements.slice(0, MAX_LAYOUT_SAMPLES), lostManualLayout: compact.lostManualLayout };
    } else if (callName === "check_health" && Array.isArray(compact.issues)) {
      const issues = compact.issues as unknown[];
      compact = { ok: compact.ok, issueCount: issues.length, issues: issues.slice(0, MAX_HEALTH_ISSUES) };
    } else if (callName === "find_assets" && Array.isArray(compact.assets)) {
      compact = { ok: compact.ok, assets: compact.assets.slice(0, MAX_ASSET_RESULTS) };
    } else if (callName === "query_students" && Array.isArray(compact.students)) {
      compact = { ...compact, students: compact.students.slice(0, MAX_STUDENT_RESULTS) };
    }
  } catch {
    compact = { ok: false, code: "TOOL_RESULT_INVALID_JSON" };
  }
  const base = JSON.stringify(compact);
  if (utf8Bytes(base) <= MAX_TOOL_RESULT_BYTES) return base;
  const makeTruncated = (preview: string) => JSON.stringify({ ok: false, code: "TOOL_RESULT_TRUNCATED", preview });
  let low = 0;
  let high = base.length;
  let best = makeTruncated("");
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = makeTruncated(truncateUtf8(base, middle));
    if (utf8Bytes(candidate) <= MAX_TOOL_RESULT_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

// 可写清单与服务端共用同一份定义（server/ai/patch-validator.ts 亦从此文件转发）。
const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [], map: [], province: [], cards: ["positions"], guests: [], text: ["id"], asset: ["id", "src"],
};

function validateScenePatch(domain: SceneDomain, patch: Record<string, unknown>): { ok: true } | { ok: false; error: { domain: SceneDomain; unknownProps: string[]; protectedProps: string[]; availableProps: string[] } } {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedFields = PROTECTED_SCENE_FIELDS[domain];
  const keys = Object.keys(patch);
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedFields.includes(key));
  const protectedProps = keys.filter((key) => protectedFields.includes(key));
  return unknownProps.length === 0 && protectedProps.length === 0
    ? { ok: true }
    : { ok: false, error: { domain, unknownProps, protectedProps, availableProps: [...writable] } };
}

const MAX_ROUNDS = 20;
/** 快照可接受的最大计量值；服务端预算上限可配置，越界时宁可截断也不能让快照失效。 */
const MAX_SNAPSHOT_USED_TOKENS = 100_000;
const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets", "query_students"]);

export interface AgentToolResult {
  id: string;
  ok: boolean;
  content: string;
}

export interface AgentStep {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: AgentToolResult;
  risk: RiskLevel;
  lostManualLayout?: boolean;
}

export interface AgentSessionMetrics {
  rounds: number;
  usedTokens: number;
  route: "primary" | "fallback" | "local" | undefined;
  provider: string | undefined;
  fallbackReason: string | undefined;
}

export interface AgentSessionReplayStep {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  risk: RiskLevel;
  lostManualLayout?: boolean;
}

export interface AgentSessionSnapshot {
  /** 2：无回执的历史快照，恢复后只读；3：带 taskId + budgetReceipt，可继续同一个 AI 任务。 */
  schemaVersion: 2 | 3;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  steps: AgentSessionReplayStep[];
  metrics: AgentSessionMetrics;
  completed: boolean;
  taskId?: string;
  budgetReceipt?: string;
}

export interface AgentSessionOptions {
  mode: "conservative" | "smart";
  assets?: StudioAsset[];
  endpoint?: string;
  onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void;
}

interface AgentApiOutcome {
  kind: "tool-call" | "tool-rejected" | "finish" | "failed";
  calls?: AgentToolCall[];
  assistantMessage?: Record<string, unknown>;
  summary?: string;
  error?: string;
  meta?: { requestId?: string; provider?: string; model?: string; route?: "primary" | "fallback" | "local"; latencyMs?: number; attempts?: number; usage?: { totalTokens?: number }; fallbackReason?: string };
  budget?: { usedTokens: number; maxTokens: number; rounds: number; maxRounds: number };
}

const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_SNAPSHOT_STRING = 64 * 1024;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_STEPS = MAX_CONVERSATION_MESSAGES * 2;
/**
 * v3 在快照里多带 taskId + budgetReceipt，恢复出来的会话才能续用同一份服务端预算。
 * 回滚方案：把这里改回 2 并删掉 exportSnapshot 里的回执字段即可；校验层仍然接受 2 和 3，
 * 已写入的 v3 快照会退化成「只读恢复」，不会让历史对话打不开。
 */
const AGENT_SNAPSHOT_SCHEMA_VERSION = 3;
/** 与服务端 taskId / 回执长度约束保持一致，超出的快照按无效处理。 */
const SNAPSHOT_TASK_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SNAPSHOT_RECEIPT_LENGTH = 2048;

function cloneProject(project: ProjectDocument): ProjectDocument {
  const cloned = structuredClone(project) as ProjectDocument;
  cloned.history = { past: [], future: [] };
  return cloned;
}

function textOnlyConversation(messages: Array<Record<string, unknown>>): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.flatMap((message) => {
    const role = message.role;
    const content = message.content;
    return (role === "user" || role === "assistant") && typeof content === "string"
      ? [{ role, content: truncateUtf8(content, MAX_SNAPSHOT_STRING) }]
      : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeJson(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (depth > MAX_SNAPSHOT_DEPTH) return false;
  if (value === undefined || value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= MAX_SNAPSHOT_STRING;
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.length <= 10_000 && value.every((item) => isSafeJson(item, depth + 1, seen))
    : isRecord(value) && Object.keys(value).length <= 1_000 && Object.values(value).every((item) => isSafeJson(item, depth + 1, seen));
  seen.delete(value);
  return valid;
}

function isPersistedStep(value: unknown): value is AgentSessionReplayStep {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length > 256 || typeof value.name !== "string" || value.name.length > 256 ||
    !isRecord(value.arguments) || !["low", "medium", "high"].includes(value.risk as string) ||
    (value.lostManualLayout !== undefined && typeof value.lostManualLayout !== "boolean")) return false;
  return isSafeJson(value);
}

export function validateAgentSessionSnapshot(value: unknown): asserts value is AgentSessionSnapshot {
  if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 3) || !Array.isArray(value.conversation) ||
    value.conversation.length > MAX_CONVERSATION_MESSAGES || !value.conversation.every((message) => isRecord(message) &&
      (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && isSafeJson(message)) ||
    !Array.isArray(value.steps) || value.steps.length > MAX_SNAPSHOT_STEPS || !value.steps.every(isPersistedStep) ||
    !isRecord(value.metrics) || typeof value.completed !== "boolean") {
    throw new Error("Agent 会话快照格式无效");
  }
  if (typeof value.metrics.rounds !== "number" || typeof value.metrics.usedTokens !== "number" ||
    !Number.isFinite(value.metrics.rounds) || !Number.isFinite(value.metrics.usedTokens) ||
    !Number.isInteger(value.metrics.rounds) || !Number.isInteger(value.metrics.usedTokens) ||
    value.metrics.rounds < 0 || value.metrics.usedTokens < 0 || value.metrics.rounds > MAX_ROUNDS || value.metrics.usedTokens > MAX_SNAPSHOT_USED_TOKENS ||
    (value.metrics.route !== undefined && value.metrics.route !== "primary" && value.metrics.route !== "fallback" && value.metrics.route !== "local") ||
    (value.metrics.provider !== undefined && (typeof value.metrics.provider !== "string" || value.metrics.provider.length > 512)) ||
    (value.metrics.fallbackReason !== undefined && (typeof value.metrics.fallbackReason !== "string" || value.metrics.fallbackReason.length > 2048)) ||
    !isSafeJson(value.metrics)) throw new Error("Agent 会话快照字段无效");
  if (value.schemaVersion === 2 && (value.taskId !== undefined || value.budgetReceipt !== undefined)) throw new Error("v2 会话快照不得携带预算回执");
  if (value.taskId !== undefined && (typeof value.taskId !== "string" || !SNAPSHOT_TASK_ID_PATTERN.test(value.taskId))) throw new Error("Agent 会话快照 taskId 无效");
  if (value.budgetReceipt !== undefined && (typeof value.budgetReceipt !== "string" || !value.budgetReceipt || value.budgetReceipt.length > MAX_SNAPSHOT_RECEIPT_LENGTH)) throw new Error("Agent 会话快照预算回执无效");
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SNAPSHOT_BYTES) throw new Error("Agent 会话快照过大");
}

function boundedMetric(value: number | undefined, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : fallback;
}

function readPath(value: unknown, path: string): unknown {
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  let current: unknown = value;
  for (const token of tokens) {
    if (current && typeof current === "object" && token in current) current = (current as Record<string, unknown>)[token];
    else return undefined;
  }
  return current;
}

/** 与 readPath 相同的寻址，同时保留父对象，便于把 data URL 换成 `<asset:id>`。 */
function readPathWithParent(value: unknown, path: string): { value: unknown; parent: unknown } {
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  let parent: unknown;
  let current: unknown = value;
  for (const token of tokens) {
    if (!current || typeof current !== "object" || !(token in current)) return { value: undefined, parent: undefined };
    parent = current;
    current = (current as Record<string, unknown>)[token];
  }
  return { value: current, parent };
}

function sceneView(project: ProjectDocument) {
  return {
    canvas: project.canvas,
    map: project.map,
    cards: project.cards,
    guests: project.guests,
    textElements: project.textElements,
    assetElements: project.assetElements,
  };
}

/** 场景真值可能带 data URL 或超长文本，回传前统一压成引用或截断。 */
function sanitizeSceneValue(value: unknown, assetId?: string): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return assetId ? `<asset:${assetId}>` : `<data-url:length=${value.length}>`;
    return value.length > MAX_INSPECT_STRING ? `${value.slice(0, MAX_INSPECT_STRING)}…` : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeSceneValue(item));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : assetId;
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, sanitizeSceneValue(item, id)]));
  }
  return value;
}

/** 影子工程中真实存在的省名：地图省名 + 已有省份样式 + 学生省份。 */
function knownProvinceNames(project: ProjectDocument): string[] {
  const names = new Set<string>(getProvinceNames());
  for (const key of Object.keys(project.map.provinceStyles ?? {})) {
    if (key.trim()) names.add(resolveProvinceName(key) || key.trim());
  }
  for (const group of buildProvinceSummary(project.students)) {
    if (group.province && group.province !== "未知") names.add(group.province);
  }
  return [...names];
}

function sceneTargetRecord(project: ProjectDocument, target: SceneSelection): Record<string, unknown> | undefined {
  switch (target.type) {
    case "canvas": return project.canvas as unknown as Record<string, unknown>;
    case "map": return project.map as unknown as Record<string, unknown>;
    case "cards": return project.cards as unknown as Record<string, unknown>;
    case "guests": return project.guests as unknown as Record<string, unknown>;
    case "province": return project.map.provinceStyles?.[target.province] as Record<string, unknown> | undefined;
    case "text": return project.textElements.find((element) => element.id === target.id) as unknown as Record<string, unknown> | undefined;
    case "asset": return project.assetElements.find((element) => element.id === target.id) as unknown as Record<string, unknown> | undefined;
  }
}

/** 写入后回读 normalize 的最终值，让 clamp（例如 scale>3 → 3）对模型可见。 */
function appliedPatchValues(project: ProjectDocument, target: SceneSelection, patch: Record<string, unknown>): Record<string, unknown> {
  const record = sceneTargetRecord(project, target);
  return Object.fromEntries(Object.keys(patch).map((key) => [key, sanitizeSceneValue(record?.[key])]));
}

function matchesQuery(value: string, query: string): boolean {
  return !query || value.toLocaleLowerCase("zh-CN").includes(query.toLocaleLowerCase("zh-CN"));
}

function sceneTargetForTool(name: string, args: Record<string, unknown>): SceneSelection | null {
  if (name === "update_canvas") return { type: "canvas" };
  if (name === "update_map") return { type: "map" };
  if (name === "update_cards") return { type: "cards" };
  if (name === "update_guests") return { type: "guests" };
  if (name === "update_province") return { type: "province", province: String(args.province ?? "") };
  if (name === "update_text") return { type: "text", id: String(args.id ?? "") };
  if (name === "update_asset") return { type: "asset", id: String(args.id ?? "") };
  return null;
}

function patchForTool(name: string, args: Record<string, unknown>): { domain: SceneDomain; patch: Record<string, unknown> } | null {
  const target = sceneTargetForTool(name, args);
  if (!target) return null;
  const patch = name.startsWith("update_") && ["update_province", "update_text", "update_asset"].includes(name)
    ? (args.patch ?? {})
    : args.patch ?? args;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { domain: target.type, patch: {} };
  return { domain: target.type, patch: patch as Record<string, unknown> };
}

function findStudent(project: ProjectDocument, args: Record<string, unknown>): Student | undefined {
  const studentId = typeof args.studentId === "string" ? args.studentId : "";
  const name = typeof args.name === "string" ? args.name.trim() : "";
  return project.students.find((student) => student.id === studentId || (!studentId && name && student.name === name));
}

/**
 * 影子工程的自动排版：分组 id、锚点、卡高、遮挡区全部取自渲染真值，
 * 与画布 worker 用的是同一个请求，落地后不会再跳位。
 */
function runAutoLayout(project: ProjectDocument, mode: string): { project: ProjectDocument; placements: CardPlacement[] } {
  const request = buildLayoutRequest(project);
  if (!request) return { project, placements: [] };
  const result = solveCardLayout(request.cards, request.bounds, {
    ...request.options,
    mode: (mode || project.cards.layoutMode || "quadrant") as CardLayoutMode,
  });
  const positions = Object.fromEntries(result.placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    project: { ...project, cards: { ...project.cards, positions } },
    placements: result.placements,
  };
}

export class AgentSession {
  private shadow: ProjectDocument;
  private readonly options: AgentSessionOptions;
  private readonly conversation: Array<Record<string, unknown>> = [];
  private _steps: AgentStep[] = [];
  private activeController: AbortController | null = null;
  private activeRun: Promise<{ kind: "finish" | "tool-rejected" | "failed" | "cancelled"; summary?: string; error?: string }> | null = null;
  private completed = false;
  private taskId: string | undefined;
  private budgetReceipt: string | undefined;
  /** 恢复出来的会话只有带回执才能续聊：无回执时服务端会拒绝带历史的请求，只能新开任务。 */
  private continuable = true;
  private _metrics = { rounds: 0, usedTokens: 0, route: undefined as "primary" | "fallback" | "local" | undefined, provider: undefined as string | undefined, fallbackReason: undefined as string | undefined };

  constructor(project: ProjectDocument, options: AgentSessionOptions) {
    this.shadow = cloneProject(project);
    this.options = options;
  }

  static restore(project: ProjectDocument, snapshot: AgentSessionSnapshot, options: AgentSessionOptions): AgentSession {
    validateAgentSessionSnapshot(snapshot);
    const session = new AgentSession(project, options);
    session.conversation.push(...structuredClone(snapshot.conversation));
    for (const replayStep of snapshot.steps) {
      const result = session.execute({ id: replayStep.id, name: replayStep.name, arguments: structuredClone(replayStep.arguments) });
      if (!result.ok) throw new Error("Agent 会话步骤无法在当前项目上重放");
      session._steps.push({ ...structuredClone(replayStep), result });
    }
    session._metrics = structuredClone(snapshot.metrics);
    session.completed = snapshot.completed;
    session.adoptBudgetReceipt(snapshot);
    return session;
  }

  static restoreTextHistory(project: ProjectDocument, snapshot: AgentSessionSnapshot, options: AgentSessionOptions): AgentSession {
    validateAgentSessionSnapshot(snapshot);
    const session = new AgentSession(project, options);
    session.conversation.push(...structuredClone(snapshot.conversation));
    session._metrics = structuredClone(snapshot.metrics);
    session.completed = true;
    session.adoptBudgetReceipt(snapshot);
    return session;
  }

  /** 回执与 taskId 必须成对出现，缺一即视为 v2 只读快照。 */
  private adoptBudgetReceipt(snapshot: AgentSessionSnapshot): void {
    const receipted = snapshot.schemaVersion === 3 && Boolean(snapshot.taskId) && Boolean(snapshot.budgetReceipt);
    this.taskId = receipted ? snapshot.taskId : undefined;
    this.budgetReceipt = receipted ? snapshot.budgetReceipt : undefined;
    this.continuable = receipted;
  }

  exportSnapshot(): AgentSessionSnapshot {
    const snapshot: AgentSessionSnapshot = {
      schemaVersion: AGENT_SNAPSHOT_SCHEMA_VERSION,
      conversation: textOnlyConversation(this.conversation),
      steps: this._steps
        .filter((step) => !READ_ONLY_TOOLS.has(step.name) && step.result.ok)
        .map(({ id, name, arguments: args, risk, lostManualLayout }) => ({ id, name, arguments: structuredClone(args), risk, lostManualLayout })),
      metrics: structuredClone(this._metrics),
      completed: this.completed,
      ...(this.taskId && this.budgetReceipt ? { taskId: this.taskId, budgetReceipt: this.budgetReceipt } : {}),
    };
    validateAgentSessionSnapshot(snapshot);
    return structuredClone(snapshot);
  }

  get shadowProject(): ProjectDocument {
    return this.shadow;
  }

  get steps(): AgentStep[] {
    return [...this._steps];
  }

  get metrics() {
    return { ...this._metrics };
  }

  get canContinue(): boolean {
    return this.completed && !this.activeRun && this.continuable;
  }

  cancel(): void {
    this.activeController?.abort();
  }

  private validateClientCall(call: AgentToolCall): string | null {
    if (call.name === "manage_students" && call.arguments.action === "update_fact") {
      const fields = call.arguments.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message: "fields 必须是对象" });
      const fieldRecord = fields as Record<string, unknown>;
      const unknownProps = Object.keys(fieldRecord).filter((key) => !["name", "university", "city"].includes(key));
      if (unknownProps.length > 0) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, unknownProps, allowedProps: ["name", "university", "city"], message: "update_fact 只允许修改 name、university、city" });
      if (Object.values(fieldRecord).some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 200)) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message: "update_fact 字段值必须是非空字符串且 trim 后不超过 200 个字符" });
    }
    const patch = patchForTool(call.name, call.arguments);
    if (!patch) return null;
    const validation = validateScenePatch(patch.domain, patch.patch);
    if (!validation.ok) return JSON.stringify({ ok: false, code: "PATCH_REJECTED", ...validation.error });
    if (call.name === "update_asset" && "src" in patch.patch) return JSON.stringify({ ok: false, code: "PROTECTED_FIELD", field: "src" });
    return null;
  }

  /** 幻觉 id/省名必须显式失败，否则写入会落到一个永远不渲染的目标上并被当成成功。 */
  private resolveSceneTarget(target: SceneSelection): { ok: true; target: SceneSelection } | { ok: false; content: string } {
    if (target.type === "text" && !this.shadow.textElements.some((element) => element.id === target.id)) {
      return { ok: false, content: JSON.stringify({
        ok: false, code: "TARGET_NOT_FOUND", target: "text", id: target.id,
        availableIds: this.shadow.textElements.slice(0, MAX_AVAILABLE_HINTS).map((element) => element.id),
        totalCount: this.shadow.textElements.length,
        error: `文本元素 ${target.id} 不存在，请使用 availableIds 中的 id。`,
      }) };
    }
    if (target.type === "asset" && !this.shadow.assetElements.some((element) => element.id === target.id)) {
      return { ok: false, content: JSON.stringify({
        ok: false, code: "TARGET_NOT_FOUND", target: "asset", id: target.id,
        availableIds: this.shadow.assetElements.slice(0, MAX_AVAILABLE_HINTS).map((element) => element.id),
        totalCount: this.shadow.assetElements.length,
        error: `贴图元素 ${target.id} 不存在，请使用 availableIds 中的 id。`,
      }) };
    }
    if (target.type === "province") {
      const available = knownProvinceNames(this.shadow);
      const resolved = resolveProvinceName(target.province.trim());
      const province = available.find((name) => name === resolved || name === target.province.trim());
      if (!province) {
        return { ok: false, content: JSON.stringify({
          ok: false, code: "TARGET_NOT_FOUND", target: "province", province: target.province,
          availableProvinces: available.slice(0, MAX_AVAILABLE_HINTS),
          totalCount: available.length,
          error: `省份「${target.province}」不在当前工程中，请使用 availableProvinces 中的省名。`,
        }) };
      }
      return { ok: true, target: { type: "province", province } };
    }
    return { ok: true, target };
  }

  private compactToolResult(callName: string, content: string): string {
    return compactAgentToolResult(callName, content);
  }

  private compactConversation(): void {
    if (this.conversation.length <= MAX_CONVERSATION_MESSAGES) return;
    const groups: Array<{ start: number; end: number }> = [];
    for (let index = 0; index < this.conversation.length; index += 1) {
      const message = this.conversation[index];
      if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
      const ids = new Set(message.tool_calls.map((call) => (call as { id?: unknown }).id).filter((id): id is string => typeof id === "string"));
      let end = index + 1;
      while (end < this.conversation.length && this.conversation[end]?.role === "tool") {
        ids.delete(String(this.conversation[end]?.tool_call_id ?? ""));
        end += 1;
      }
      if (ids.size === 0) groups.push({ start: index, end });
      index = end - 1;
    }
    const keepCount = MAX_CONVERSATION_MESSAGES - 1;
    const minimumCut = Math.max(1, this.conversation.length - keepCount);
    const preferredCut = groups.length > 4 ? groups[groups.length - 4]!.start : minimumCut;
    const cut = Array.from({ length: this.conversation.length - preferredCut + 1 }, (_, offset) => preferredCut + offset)
      .find((candidate) => groups.every((group) => candidate <= group.start || candidate >= group.end))
      ?? this.conversation.length;
    const removed = this.conversation.slice(0, cut);
    this.conversation.splice(0, cut, {
      role: "user",
      content: `会话摘要：已压缩 ${removed.length} 条较早消息${groups.length > 0 ? "与完整工具回合" : "连续对话"}，当前影子工程状态保持不变。`,
    });
  }

  private execute(call: AgentToolCall): AgentToolResult {
    const rejected = this.validateClientCall(call);
    if (rejected) return { id: call.id, ok: false, content: rejected };
    const args = call.arguments;
    try {
      if (call.name === "inspect_project") {
        const path = String(args.path ?? "");
        // students 走 digest（聚合计数），其余路径读影子场景真值，digest 未投影的属性才能被读到。
        // 这里固定 full：inspect 是模型现取明细的唯一入口，续聊只发 core 时也必须能读到被裁掉的明细。
        if (!path || path === "students" || path.startsWith("students.")) {
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value: readPath(buildProjectDigest(this.shadow, { layer: "full" }), path) }) };
        }
        const { value, parent } = readPathWithParent(sceneView(this.shadow), path);
        const parentId = parent && typeof parent === "object" && typeof (parent as Record<string, unknown>).id === "string"
          ? (parent as Record<string, string>).id
          : undefined;
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value: sanitizeSceneValue(value, parentId) }) };
      }
      if (call.name === "describe_capability") {
        const domain = String(args.domain);
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, domain, properties: SCENE_DOMAIN_PROPS[domain as SceneDomain] ?? [] }) };
      }
      if (call.name === "check_health") {
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, issues: checkLayoutHealth(buildHealthInput(this.shadow)) }) };
      }
      if (call.name === "find_assets") {
        const province = String(args.province ?? "").trim();
        const keyword = String(args.keyword ?? "").trim().toLocaleLowerCase("zh-CN");
        const assets = (this.options.assets ?? []).filter((asset) => {
          const provinceMatch = !province || asset.provinceIds.some((id) => id.includes(province) || province.includes(id.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区/g, "")));
          const keywordMatch = !keyword || asset.label.toLocaleLowerCase("zh-CN").includes(keyword);
          return provinceMatch && keywordMatch;
        }).map(({ id, label, kind, provinceIds, source }) => ({ id, label, kind, provinceIds, source }));
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, assets }) };
      }
      if (call.name === "query_students") {
        const offset = Math.max(0, Math.floor(Number(args.offset ?? 0) || 0));
        const rows = this.shadow.students.map((student) => {
          const location = resolveStudentLocation(student);
          return {
            id: student.id,
            name: student.name,
            province: student.province?.trim() || location.province,
            city: student.city,
            university: student.university,
            visibility: student.visibility !== false,
          };
        }).filter((row) =>
          matchesQuery(row.province, String(args.province ?? "").trim())
          && matchesQuery(row.city, String(args.city ?? "").trim())
          && matchesQuery(row.university, String(args.university ?? "").trim())
          && matchesQuery(row.name, String(args.name ?? "").trim()));
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, students: rows.slice(offset, offset + MAX_STUDENT_RESULTS), total: rows.length, offset, limit: MAX_STUDENT_RESULTS }) };
      }
      const target = sceneTargetForTool(call.name, args);
      if (target) {
        const resolution = this.resolveSceneTarget(target);
        if (!resolution.ok) return { id: call.id, ok: false, content: resolution.content };
        const resolvedTarget = resolution.target;
        const patch = patchForTool(call.name, args)?.patch ?? {};
        this.shadow = { ...this.shadow, ...scenePatch(this.shadow, resolvedTarget, patch) };
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, target: resolvedTarget, applied: appliedPatchValues(this.shadow, resolvedTarget, patch) }) };
      }
      if (call.name === "set_data_view") {
        this.shadow = applyDataViewChange(this.shadow, String(args.view) as DataViewId);
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, view: args.view }) };
      }
      if (call.name === "auto_layout") {
        const hadManualPositions = Object.keys(this.shadow.cards.positions ?? {}).length > 0;
        const layout = runAutoLayout(this.shadow, String(args.mode ?? "quadrant"));
        this.shadow = layout.project;
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, placements: layout.placements, lostManualLayout: hadManualPositions }) };
      }
      if (call.name === "manage_students") {
        const action = String(args.action ?? "");
        if (action === "remove_duplicate") {
          const duplicateIds = duplicateStudentIds(this.shadow.students);
          const seenKeys = new Set<string>();
          const nextStudents = this.shadow.students.filter((student) => {
            const key = `${student.name}\u001f${student.university}\u001f${student.city}`;
            if (!duplicateIds.has(student.id)) return true;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          });
          const removed = this.shadow.students.length - nextStudents.length;
          this.shadow = { ...this.shadow, students: nextStudents };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, removed }) };
        }
        const student = findStudent(this.shadow, args);
        if (!student) throw new Error("找不到指定学生");
        if (action === "hide" || action === "show") {
          this.shadow = { ...this.shadow, students: this.shadow.students.map((item) => item.id === student.id ? { ...item, visibility: action === "show" } : item) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, visibility: action === "show" }) };
        }
        if (action === "update_fact") {
          // 模型只能传 name/university/city；province 由执行层按 city 推导。
          // 回滚方案：删掉下面的 city→province 推导块即可回到「只改 city」。
          const fields = { ...(args.fields ?? {}) } as Partial<Pick<Student, "name" | "university" | "city" | "province">>;
          let warning: string | undefined;
          if (typeof fields.city === "string" && fields.city.trim()) {
            const location = resolveCityLocation(fields.city);
            if (location.status === "resolved" && location.province) fields.province = location.province;
            else warning = `无法根据城市「${fields.city.trim()}」推断省份，已保留原省份 ${student.province || "（空）"}。`;
          }
          this.shadow = { ...this.shadow, students: this.shadow.students.map((item) => item.id === student.id ? { ...item, ...fields } : item) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, before: student, after: { ...student, ...fields }, ...(warning ? { warning } : {}) }) };
        }
      }
      throw new Error(`未知工具 ${call.name}`);
    } catch (error) {
      return { id: call.id, ok: false, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) };
    }
  }

  async run(message: string, options: { signal?: AbortSignal; continue?: boolean } = {}): Promise<{ kind: "finish" | "tool-rejected" | "failed" | "cancelled"; summary?: string; error?: string }> {
    if (this.activeRun) throw new Error("Agent 会话正在进行中");
    if (options.signal?.aborted) return { kind: "cancelled" };
    if (!options.continue) {
      this.conversation.length = 0;
      this.completed = false;
      this.taskId = undefined;
      this.budgetReceipt = undefined;
      this.continuable = true;
    }
    // 首轮（新任务或历史为空）发 full 建立上下文；续聊时明细已在历史里，只发 core（统计+几何），
    // 模型要明细可随时用 inspect_project 现取。必须在压入本轮用户消息之前判断，否则历史永远非空。
    // 回滚：删掉本行与请求体里的 layer 参数、以及 inspect_project 处的 { layer: "full" }，两处都回到无参 buildProjectDigest(this.shadow)。
    const digestLayer: ProjectDigestLayer = options.continue && this.conversation.length > 0 ? "core" : "full";
    this.conversation.push({ role: "user", content: message });
    const controller = new AbortController();
    this.activeController = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const work = (async () => {
      try {
        for (let round = 0; round < MAX_ROUNDS; round += 1) {
          if (controller.signal.aborted) return { kind: "cancelled" as const };
          this.compactConversation();
          const roundController = new AbortController();
          let timedOut = false;
          const abortRound = () => roundController.abort();
          controller.signal.addEventListener("abort", abortRound, { once: true });
          const timeout = setTimeout(() => {
            timedOut = true;
            roundController.abort();
          }, CLIENT_ROUND_TIMEOUT_MS);
          let response: Response;
          try {
            response = await fetch(this.options.endpoint ?? "/api/ai/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              // 预算只认服务端回执：客户端镜像发过去也会被忽略，发了反而像是可协商的。
              body: JSON.stringify({ userMessage: message, digest: buildProjectDigest(this.shadow, { layer: digestLayer }), messages: this.conversation, taskId: this.taskId, budgetReceipt: this.budgetReceipt }),
              signal: roundController.signal,
            });
          } catch (cause) {
            if (timedOut) return { kind: "failed" as const, error: "AI 请求超时，请稍后重试。" };
            throw cause;
          } finally {
            clearTimeout(timeout);
            controller.signal.removeEventListener("abort", abortRound);
          }
          if (!response.ok) {
            const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
            const code = data?.error?.code;
            const messageByCode: Record<string, string> = {
              AI_RATE_LIMITED: "请求过于频繁，请稍后重试。",
              AI_VALIDATION_ERROR: "请求内容未通过校验，请重新开始当前 AI 任务。",
              AI_RECEIPT_EXPIRED: "会话预算回执已过期或已被使用，无法继续这轮对话。",
              AI_UPSTREAM_UNAVAILABLE: "AI 服务暂时不可用，请稍后重试。",
              AI_TIMEOUT: "AI 请求超时，请稍后重试。",
            };
            // 回执一旦过期/被占用，本会话再也续不上，直接置成不可续聊，UI 会把按钮换成「新开任务」。
            // 回滚：删掉这一行与上面的 AI_RECEIPT_EXPIRED 映射，续聊失败会退回统一的校验失败文案。
            if (code === "AI_RECEIPT_EXPIRED") this.continuable = false;
            return { kind: "failed" as const, error: messageByCode[code ?? ""] ?? data?.error?.message ?? `Agent 接口错误：${response.status}` };
          }
          const outcome = await response.json() as AgentApiOutcome & { taskId?: string; budgetReceipt?: string };
          this.taskId = outcome.taskId ?? this.taskId;
          this.budgetReceipt = outcome.budgetReceipt ?? this.budgetReceipt;
          // usedTokens 以服务端预算为准：meta.usage.totalTokens 含缓存复用的提示词，逐轮累加会在长会话里虚高数倍。
          if (outcome.meta || outcome.budget) {
            this._metrics = {
              ...this._metrics,
              rounds: boundedMetric(outcome.budget?.rounds ?? this._metrics.rounds + 1, MAX_ROUNDS, this._metrics.rounds),
              usedTokens: boundedMetric(outcome.budget?.usedTokens, MAX_SNAPSHOT_USED_TOKENS, this._metrics.usedTokens),
            };
          }
          if (outcome.meta) {
            this._metrics = { ...this._metrics, route: outcome.meta.route, provider: outcome.meta.provider ?? outcome.meta.model, fallbackReason: outcome.meta.fallbackReason };
          }
          if (outcome.kind === "failed") return { kind: "failed" as const, error: outcome.error ?? "Agent 失败" };
          if (outcome.kind === "finish") { this.completed = true; return { kind: "finish" as const, summary: outcome.summary ?? "已完成。" }; }
          if (outcome.kind === "tool-rejected") {
            const assistantToolCalls = Array.isArray(outcome.assistantMessage?.tool_calls) ? outcome.assistantMessage.tool_calls as Array<{ id?: unknown }> : [];
            if (assistantToolCalls.length > 0) {
              this.conversation.push(outcome.assistantMessage!);
              for (const toolCall of assistantToolCalls) {
                if (typeof toolCall.id === "string" && toolCall.id) this.conversation.push({ role: "tool", tool_call_id: toolCall.id, content: outcome.error ?? "工具参数被拒绝" });
              }
            } else {
              this.conversation.push({ role: "assistant", content: outcome.assistantMessage?.content ?? "模型工具调用未通过校验。" });
              this.conversation.push({ role: "user", content: "请不要调用无效工具；请根据上一条拒绝原因重新规划，并只使用合法工具或直接用中文总结。" });
            }
            continue;
          }
          if (outcome.assistantMessage) this.conversation.push(outcome.assistantMessage);
          for (const call of outcome.calls ?? []) {
            const risk = classifyAgentCall(this.shadow, call);
            this.options.onProgress?.({ round: round + 1, name: call.name, status: "running" });
            const rawToolResult = this.execute(call);
        const toolResult = { ...rawToolResult, content: this.compactToolResult(call.name, rawToolResult.content) };
            let lostManualLayout = false;
            try { lostManualLayout = call.name === "auto_layout" && Boolean(JSON.parse(toolResult.content).lostManualLayout); } catch { /* result is already represented as a tool error */ }
            this._steps.push({ id: call.id, name: call.name, arguments: call.arguments, result: toolResult, risk: lostManualLayout ? "high" : risk.level, lostManualLayout });
            this.options.onProgress?.({ round: round + 1, name: call.name, status: toolResult.ok ? "done" : "rejected" });
            this.conversation.push({ role: "tool", tool_call_id: call.id, content: toolResult.content });
          }
        }
        this.completed = true;
        return { kind: "finish" as const, summary: "已达到 20 轮上限，已交付当前完成的修改。" };
      } catch (cause) {
        if (controller.signal.aborted || cause instanceof DOMException && cause.name === "AbortError") return { kind: "cancelled" as const };
        return { kind: "failed" as const, error: cause instanceof Error ? cause.message : "AI 会话失败" };
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
        this.activeController = null;
      }
    })();
    this.activeRun = work;
    try { return await work; } finally { this.activeRun = null; }
  }

  continue(message: string, options: { signal?: AbortSignal } = {}) {
    if (!this.canContinue) return Promise.reject(new Error("当前会话不能继续"));
    return this.run(message, { ...options, continue: true });
  }

  landingPreview(): { steps: AgentStep[]; needsConfirmation: boolean; highestRisk: RiskLevel } {
    const steps = this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name));
    const level = highestRisk(steps.map((step) => ({ level: step.risk, reason: "" })));
    return { steps, needsConfirmation: this.options.mode === "conservative" || level === "high", highestRisk: level };
  }

  transactionForSteps(stepIds: ReadonlySet<string>): ProjectTransaction | null {
    const selectedSteps = this._steps.filter((step) =>
      stepIds.has(step.id) && !READ_ONLY_TOOLS.has(step.name) && step.result.ok,
    );
    if (selectedSteps.length === 0) return null;

    return {
      id: createId("tx-ai-agent"),
      label: `AI 助手：${selectedSteps.length} 项改动`,
      source: "ai",
      apply: (current) => {
        const replay = new AgentSession(current, { ...this.options, onProgress: undefined });
        for (const step of selectedSteps) {
          replay.execute({ id: step.id, name: step.name, arguments: structuredClone(step.arguments) });
        }
        const finalSnapshot = cloneProject(replay.shadowProject);
        return { ...finalSnapshot, history: current.history, version: current.version };
      },
    };
  }

  transaction(): ProjectTransaction {
    const stepIds = new Set(this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name)).map((step) => step.id));
    return this.transactionForSteps(stepIds) ?? {
      id: createId("tx-ai-agent"),
      label: "AI 助手：0 项改动",
      source: "ai",
      apply: (current) => current,
    };
  }
}

function scenePatch(project: ProjectDocument, target: SceneSelection, patch: Record<string, unknown>): Partial<ProjectDocument> {
  const next = updateSceneTarget(project, target, patch);
  switch (target.type) {
    case "canvas": return { canvas: next.canvas };
    case "map": return { map: next.map };
    case "province": return { map: next.map };
    case "cards": return { cards: next.cards };
    case "guests": return { guests: next.guests };
    case "text": return { textElements: next.textElements };
    case "asset": return { assetElements: next.assetElements };
  }
}
