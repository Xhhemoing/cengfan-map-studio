import { applyDataViewChange } from "./catalog-usage";
import { solveCardLayout, type CardLayoutInput, type CardLayoutMode } from "./card-layout";
import { checkLayoutHealth, type LayoutHealthInput, type LayoutHealthObject } from "./layout-health";
import type { StudioAsset } from "./assets";
import { duplicateStudentIds } from "./data-duplicate";
import { createId } from "./ids";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { buildProjectDigest } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { updateSceneTarget, type SceneSelection } from "./scene-document";
import type { DataViewId, Student } from "./project-data";
import { buildProvinceSummary } from "./project-data";

const MAX_TOOL_RESULT_BYTES = 16 * 1024;
const MAX_CONVERSATION_MESSAGES = 24;
const CLIENT_ROUND_TIMEOUT_MS = 70_000;
const MAX_HEALTH_ISSUES = 20;
const MAX_ASSET_RESULTS = 20;
const MAX_LAYOUT_SAMPLES = 10;

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
type SceneDomain = "canvas" | "map" | "province" | "cards" | "guests" | "text" | "asset";

const SCENE_DOMAIN_PROPS: Record<SceneDomain, readonly string[]> = {
  canvas: ["width", "height", "safeMargin", "backgroundColor", "backgroundImageSrc", "backgroundFit", "backgroundOpacity", "lineHeight"],
  map: ["x", "y", "width", "height", "scale", "zIndex", "opacity", "landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "showProvinceLabels", "provinceLabelFontId", "provinceLabelTypography", "collapseSouthChinaSea", "fillMode", "heatScale", "emptyProvinceFill", "renderSource", "provinceStyles", "provinceTextureUniformSize"],
  province: ["fill", "textureSrc", "visible", "labelFontId", "appearance"],
  cards: ["preset", "displayFrame", "compactLayout", "x", "y", "maxWidth", "padding", "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity", "textColor", "fontSize", "fieldFonts", "fieldTypography", "connectorStyle", "connectorColor", "connectorWidth", "connectorDash", "visibleFields", "noWrapFields", "citySubgroups", "expressionTemplates", "nameFormat", "layoutMode", "autoBalance", "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex"],
  guests: ["title", "x", "y", "width", "padding", "background", "opacity", "textColor", "fontSize", "titleFontId", "peopleFontId", "titleTypography", "peopleTypography", "displayMode", "customText", "visibility", "people"],
  text: ["role", "content", "x", "y", "fontSize", "color", "fontWeight", "fontId", "textAlign", "maxWidth", "visibility"],
  asset: ["assetId", "label", "kind", "province", "x", "y", "width", "height", "rotation", "opacity", "zIndex", "visibility"],
};

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
const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);

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
  schemaVersion: 2;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  steps: AgentSessionReplayStep[];
  metrics: AgentSessionMetrics;
  completed: boolean;
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
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.conversation) ||
    value.conversation.length > MAX_CONVERSATION_MESSAGES || !value.conversation.every((message) => isRecord(message) &&
      (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && isSafeJson(message)) ||
    !Array.isArray(value.steps) || value.steps.length > MAX_SNAPSHOT_STEPS || !value.steps.every(isPersistedStep) ||
    !isRecord(value.metrics) || typeof value.completed !== "boolean") {
    throw new Error("Agent 会话快照格式无效");
  }
  if (typeof value.metrics.rounds !== "number" || typeof value.metrics.usedTokens !== "number" ||
    !Number.isFinite(value.metrics.rounds) || !Number.isFinite(value.metrics.usedTokens) ||
    !Number.isInteger(value.metrics.rounds) || !Number.isInteger(value.metrics.usedTokens) ||
    value.metrics.rounds < 0 || value.metrics.usedTokens < 0 || value.metrics.rounds > MAX_ROUNDS || value.metrics.usedTokens > 100_000 ||
    (value.metrics.route !== undefined && value.metrics.route !== "primary" && value.metrics.route !== "fallback" && value.metrics.route !== "local") ||
    (value.metrics.provider !== undefined && (typeof value.metrics.provider !== "string" || value.metrics.provider.length > 512)) ||
    (value.metrics.fallbackReason !== undefined && (typeof value.metrics.fallbackReason !== "string" || value.metrics.fallbackReason.length > 2048)) ||
    !isSafeJson(value.metrics)) throw new Error("Agent 会话快照字段无效");
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SNAPSHOT_BYTES) throw new Error("Agent 会话快照过大");
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

function groupCards(project: ProjectDocument): CardLayoutInput[] {
  const summary = buildProvinceSummary(project.students);
  const mapCenterX = project.map.x + (project.map.width * project.map.scale) / 2;
  const mapCenterY = project.map.y + (project.map.height * project.map.scale) / 2;
  const maxWidth = Math.max(120, project.cards.maxWidth);
  return summary.map((group, index) => ({
    id: group.province,
    anchorX: mapCenterX + Math.cos(index * 1.7) * project.map.width * project.map.scale * 0.28,
    anchorY: mapCenterY + Math.sin(index * 1.7) * project.map.height * project.map.scale * 0.28,
    width: maxWidth,
    height: Math.max(72, project.cards.fontSize * Math.max(2, Math.min(group.students.length + 1, 6))),
  }));
}

function runAutoLayout(project: ProjectDocument, mode: string): { project: ProjectDocument; placements: unknown[] } {
  const cards = groupCards(project);
  const result = solveCardLayout(cards, {
    width: project.canvas.width,
    height: project.canvas.height,
    map: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale },
    margin: project.canvas.safeMargin,
    gap: Math.max(10, project.cards.gap),
    occupiedAreas: project.guests.visibility ? [{ x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 }] : [],
    allowMapOverlap: project.cards.allowMapOverlap === true,
  }, { mode: (mode || project.cards.layoutMode || "quadrant") as CardLayoutMode, autoBalance: project.cards.autoBalance !== false });
  const positions = Object.fromEntries(result.placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    project: { ...project, cards: { ...project.cards, positions } },
    placements: result.placements,
  };
}

function healthInput(project: ProjectDocument): LayoutHealthInput {
  const objects: LayoutHealthObject[] = [
    { id: "map", kind: "map", zIndex: project.map.zIndex, bounds: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale } },
    { id: "cards", kind: "card", zIndex: project.cards.zIndex, bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 } },
    ...(project.guests.visibility ? [{ id: "guests", kind: "guests" as const, zIndex: 20, bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 } }] : []),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: 40,
      bounds: { x: text.x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 },
      visible: text.visibility,
      content: text.content,
      textColor: text.color,
      backgroundColor: project.canvas.backgroundColor,
    })),
    ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
  ];
  return { canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin }, objects, cardsPositions: project.cards.positions };
}

export class AgentSession {
  private shadow: ProjectDocument;
  private readonly options: AgentSessionOptions;
  private readonly conversation: Array<Record<string, unknown>> = [];
  private _steps: AgentStep[] = [];
  private activeController: AbortController | null = null;
  private activeRun: Promise<{ kind: "finish" | "tool-rejected" | "failed" | "cancelled"; summary?: string; error?: string }> | null = null;
  private completed = false;
  private budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
  private taskId: string | undefined;
  private budgetReceipt: string | undefined;
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
    return session;
  }

  static restoreTextHistory(project: ProjectDocument, snapshot: AgentSessionSnapshot, options: AgentSessionOptions): AgentSession {
    validateAgentSessionSnapshot(snapshot);
    const session = new AgentSession(project, options);
    session.conversation.push(...structuredClone(snapshot.conversation));
    session._metrics = structuredClone(snapshot.metrics);
    session.completed = true;
    return session;
  }

  exportSnapshot(): AgentSessionSnapshot {
    const snapshot: AgentSessionSnapshot = {
      schemaVersion: 2,
      conversation: textOnlyConversation(this.conversation),
      steps: this._steps
        .filter((step) => !READ_ONLY_TOOLS.has(step.name) && step.result.ok)
        .map(({ id, name, arguments: args, risk, lostManualLayout }) => ({ id, name, arguments: structuredClone(args), risk, lostManualLayout })),
      metrics: structuredClone(this._metrics),
      completed: this.completed,
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
    return this.completed && !this.activeRun;
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
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value: readPath(buildProjectDigest(this.shadow), path) }) };
      }
      if (call.name === "describe_capability") {
        const domain = String(args.domain);
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, domain, properties: SCENE_DOMAIN_PROPS[domain as SceneDomain] ?? [] }) };
      }
      if (call.name === "check_health") {
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, issues: checkLayoutHealth(healthInput(this.shadow)) }) };
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
      const target = sceneTargetForTool(call.name, args);
      if (target) {
        const patch = patchForTool(call.name, args)?.patch ?? {};
        this.shadow = { ...this.shadow, ...scenePatch(this.shadow, target, patch) };
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, target }) };
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
          const fields = (args.fields ?? {}) as Partial<Pick<Student, "name" | "university" | "city" | "province">>;
          this.shadow = { ...this.shadow, students: this.shadow.students.map((item) => item.id === student.id ? { ...item, ...fields } : item) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, before: student, after: { ...student, ...fields } }) };
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
      this.budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
      this.taskId = undefined;
      this.budgetReceipt = undefined;
    }
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
              body: JSON.stringify({ userMessage: message, digest: buildProjectDigest(this.shadow), messages: this.conversation, budget: this.budget, taskId: this.taskId, budgetReceipt: this.budgetReceipt }),
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
              AI_UPSTREAM_UNAVAILABLE: "AI 服务暂时不可用，请稍后重试。",
              AI_TIMEOUT: "AI 请求超时，请稍后重试。",
            };
            return { kind: "failed" as const, error: messageByCode[code ?? ""] ?? data?.error?.message ?? `Agent 接口错误：${response.status}` };
          }
          const outcome = await response.json() as AgentApiOutcome & { taskId?: string; budgetReceipt?: string };
          this.taskId = outcome.taskId ?? this.taskId;
          this.budgetReceipt = outcome.budgetReceipt ?? this.budgetReceipt;
          if (outcome.meta) {
            this._metrics = { ...this._metrics, rounds: this._metrics.rounds + 1, usedTokens: this._metrics.usedTokens + (outcome.meta.usage?.totalTokens ?? 0), route: outcome.meta.route, provider: outcome.meta.provider ?? outcome.meta.model, fallbackReason: outcome.meta.fallbackReason };
          }
          if (outcome.budget) this.budget = outcome.budget;
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
