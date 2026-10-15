import type { UserFont } from "./fonts";
import type { ResolvedProjectScene } from "./resolved-scene";
import type { AgentTaskContext } from "./agent-task-constraints";
import type { StudioAsset } from "./assets";
import { createId } from "./ids";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { buildProjectDigest, fingerprintProject } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import type { SceneSelection } from "./scene-document";
import type { AgentTaskBrief } from "./agent-task-brief";
import { executeAgentTool } from "./agent-tool-executor";
import { READ_ONLY_AGENT_TOOLS } from "./agent-tool-contract";

const MAX_TOOL_RESULT_BYTES = 16 * 1024;
const MAX_CONVERSATION_MESSAGES = 24;
/** Generous on purpose: a single model round with tool planning routinely runs tens of seconds. */
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MESSAGE = "AI 请求超时，请稍后重试。";
const NETWORK_FAILURE_MESSAGE = "网络连接中断，AI 请求未完成，请检查网络后重试。";
const HTTP_ERROR_MESSAGES: Record<string, string> = {
  AI_RATE_LIMITED: "请求过于频繁，请稍后重试。",
  AI_VALIDATION_ERROR: "请求内容未通过校验，请重新开始当前 AI 任务。",
  AI_UPSTREAM_UNAVAILABLE: "AI 服务暂时不可用，请稍后重试。",
  AI_TIMEOUT: REQUEST_TIMEOUT_MESSAGE,
};
const MAX_HEALTH_ISSUES = 20;
const MAX_ASSET_RESULTS = 20;
const MAX_LAYOUT_SAMPLES = 10;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function utf8Bytes(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

function isUtf8Continuation(byte: number): boolean {
  return (byte & 0b1100_0000) === 0b1000_0000;
}

/** Longest prefix of `bytes` within `maxBytes` that ends on a UTF-8 sequence boundary. */
function sliceUtf8(bytes: Uint8Array, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (maxBytes >= bytes.byteLength) return utf8Decoder.decode(bytes);
  let end = maxBytes;
  while (end > 0 && isUtf8Continuation(bytes[end]!)) end -= 1;
  return utf8Decoder.decode(bytes.subarray(0, end));
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = utf8Encoder.encode(value);
  return bytes.byteLength <= maxBytes ? value : sliceUtf8(bytes, maxBytes);
}

export function compactAgentToolResult(callName: string, content: string): string {
  let compact: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(content);
    compact = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { ok: false, value: parsed };
    if (callName === "auto_layout" && Array.isArray(compact.placements)) {
      const placements = compact.placements as unknown[];
      const { placements: _placements, ...metadata } = compact;
      compact = { ...metadata, placementCount: placements.length, samples: placements.slice(0, MAX_LAYOUT_SAMPLES) };
    } else if (callName === "check_health" && Array.isArray(compact.issues)) {
      const issues = compact.issues as unknown[];
      compact = { ...compact, issueCount: issues.length, issues: issues.slice(0, MAX_HEALTH_ISSUES) };
    } else if (callName === "find_assets" && Array.isArray(compact.assets)) {
      compact = { ok: compact.ok, assets: compact.assets.slice(0, MAX_ASSET_RESULTS) };
    }
  } catch {
    compact = { ok: false, code: "TOOL_RESULT_INVALID_JSON" };
  }
  const base = JSON.stringify(compact);
  const baseBytes = utf8Encoder.encode(base);
  if (baseBytes.byteLength <= MAX_TOOL_RESULT_BYTES) return base;
  const makeTruncated = (preview: string) => JSON.stringify({ ok: false, code: "TOOL_RESULT_TRUNCATED", preview });
  let low = 0;
  // JSON escaping never shrinks the preview, so a prefix longer than the whole budget can never fit.
  let high = Math.min(baseBytes.byteLength, MAX_TOOL_RESULT_BYTES);
  let best = makeTruncated("");
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = makeTruncated(sliceUtf8(baseBytes, middle));
    if (utf8Bytes(candidate) <= MAX_TOOL_RESULT_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}
const MAX_ROUNDS = 20;
const READ_ONLY_TOOLS = READ_ONLY_AGENT_TOOLS;

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

export interface AgentReplayFailure {
  stepId: string;
  name: string;
  content: string;
}

export class AgentReplayError extends Error {
  readonly failure: AgentReplayFailure;

  constructor(failure: AgentReplayFailure) {
    super("Agent 会话步骤无法在当前项目上重放");
    this.name = "AgentReplayError";
    this.failure = failure;
  }
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
  taskBrief?: AgentTaskBrief;
  selection?: SceneSelection | null;
  contextStage?: string;
  userFonts?: UserFont[];
  scene?: ResolvedProjectScene | null;
  endpoint?: string;
  /** Per-request deadline in milliseconds; non-positive or non-finite values fall back to the default. */
  requestTimeoutMs?: number;
  onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void;
}

/** Transport-level failures the caller can retry as-is, unlike a model refusal or a user cancel. */
export type AgentTransportFailure = "timeout" | "network";

export interface AgentRunOutcome {
  kind: "finish" | "tool-rejected" | "failed" | "cancelled";
  summary?: string;
  error?: string;
  reason?: AgentTransportFailure;
  retriable?: boolean;
}

type AgentApiPayload = AgentApiOutcome & { taskId?: string; budgetReceipt?: string };

type RoundResponse =
  | { kind: "ok"; outcome: AgentApiPayload }
  | { kind: "http-error"; error: string }
  | { kind: "transport-failure"; reason: AgentTransportFailure };

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
 * History is dropped before cloning, not after: `applyTransaction` hands transactions a document
 * whose `history` is a readonly Proxy, and `structuredClone` cannot clone a Proxy. Sessions never
 * read history anyway, so this also keeps up to MAX_HISTORY snapshots out of every clone.
 */
function cloneProject(project: ProjectDocument): ProjectDocument {
  return structuredClone({ ...project, history: { past: [], future: [] } }) as ProjectDocument;
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

export class AgentSession {
  private shadow: ProjectDocument;
  private instructionId = createId("instruction");
  private readonly options: AgentSessionOptions;
  private readonly conversation: Array<Record<string, unknown>> = [];
  private _steps: AgentStep[] = [];
  private activeController: AbortController | null = null;
  private activeRun: Promise<AgentRunOutcome> | null = null;
  private completed = false;
  private retriableFailure = false;
  private budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
  private taskId: string | undefined;
  private budgetReceipt: string | undefined;
  private _lastReplayFailure: AgentReplayFailure | null = null;
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
      if (!result.ok) throw new AgentReplayError({ stepId: replayStep.id, name: replayStep.name, content: result.content });
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

  /** Set when the last `transactionForSteps` apply refused to land because a step no longer replays. */
  get lastReplayFailure(): AgentReplayFailure | null {
    return this._lastReplayFailure ? { ...this._lastReplayFailure } : null;
  }

  /** A transport failure leaves the conversation intact, so the user can resume it instead of restarting. */
  get canContinue(): boolean {
    return (this.completed || this.retriableFailure) && !this.activeRun;
  }

  cancel(): void {
    this.activeController?.abort();
  }

  private compactToolResult(callName: string, content: string): string {
    return compactAgentToolResult(callName, content);
  }

  private get requestTimeoutMs(): number {
    const configured = this.options.requestTimeoutMs;
    return typeof configured === "number" && Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private failTransport(reason: AgentTransportFailure): AgentRunOutcome {
    this.retriableFailure = true;
    return { kind: "failed", error: reason === "timeout" ? REQUEST_TIMEOUT_MESSAGE : NETWORK_FAILURE_MESSAGE, reason, retriable: true };
  }

  /**
   * One round trip under a deadline that covers the body read as well: a partition can deliver headers
   * and then stall forever. The deadline settles the race on its own rather than relying on `signal`,
   * because a wedged transport may never react to the abort at all.
   */
  private async requestRound(message: string, cancelSignal: AbortSignal): Promise<RoundResponse> {
    const roundController = new AbortController();
    const abortRound = () => roundController.abort();
    cancelSignal.addEventListener("abort", abortRound, { once: true });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<RoundResponse>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        roundController.abort();
        resolve({ kind: "transport-failure", reason: "timeout" });
      }, this.requestTimeoutMs);
    });
    const attempt = (async (): Promise<RoundResponse> => {
      let response: Response;
      try {
        response = await fetch(this.options.endpoint ?? "/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: message, digest: { ...buildProjectDigest(this.shadow), context: { instructionId: this.instructionId, selection: this.options.selection, taskBrief: this.options.taskBrief, stage: this.options.contextStage } }, messages: this.conversation, budget: this.budget, taskId: this.taskId, budgetReceipt: this.budgetReceipt }),
          signal: roundController.signal,
        });
      } catch (cause) {
        if (timedOut) return { kind: "transport-failure", reason: "timeout" };
        // A user cancel must stay a cancel; fetch rejects for nothing else but transport trouble.
        if (cancelSignal.aborted) throw cause;
        return { kind: "transport-failure", reason: "network" };
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        return { kind: "http-error", error: HTTP_ERROR_MESSAGES[data?.error?.code ?? ""] ?? data?.error?.message ?? `Agent 接口错误：${response.status}` };
      }
      try {
        return { kind: "ok", outcome: await response.json() as AgentApiPayload };
      } catch (cause) {
        if (timedOut) return { kind: "transport-failure", reason: "timeout" };
        throw cause;
      }
    })();
    // When the deadline wins the race nobody awaits the attempt any more; its later rejection is expected.
    attempt.catch(() => {});
    try {
      return await Promise.race([attempt, deadline]);
    } finally {
      clearTimeout(timer);
      cancelSignal.removeEventListener("abort", abortRound);
    }
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

  /**
   * A round that fails in transport leaves its request as the conversation tail with no reply after it.
   * The resume re-sends that text as `userMessage` anyway, so pushing it again would only ask twice.
   */
  private tailIsUnansweredRequest(message: string): boolean {
    const last = this.conversation.at(-1);
    return last?.role === "user" && last.content === message;
  }

  private execute(call: AgentToolCall): AgentToolResult {
    try {
      const result = executeAgentTool(this.shadow, call, this.options);
      if (result.payload.ok !== false) this.shadow = result.project;
      return { id: call.id, ok: result.payload.ok !== false, content: JSON.stringify(result.payload) };
    } catch (error) {
      return { id: call.id, ok: false, content: JSON.stringify({ ok: false, code: "TOOL_EXECUTION_FAILED", error: error instanceof Error ? error.message : String(error) }) };
    }
  }

  setTaskContext(context: AgentTaskContext & { contextStage?: string }): void {
    if (this.activeRun) throw new Error("正在执行时不能更改任务约束");
    Object.assign(this.options, context, { contextStage: context.stage ?? context.contextStage ?? this.options.contextStage });
  }

  async run(message: string, options: { signal?: AbortSignal; continue?: boolean } = {}): Promise<AgentRunOutcome> {
    if (this.activeRun) throw new Error("Agent 会话正在进行中");
    if (options.signal?.aborted) return { kind: "cancelled" };
    this.retriableFailure = false;
    if (!options.continue) {
      this.conversation.length = 0;
      this.completed = false;
      this.budget = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
      this.taskId = undefined;
      this.budgetReceipt = undefined;
    }
    if (!options.continue || !this.tailIsUnansweredRequest(message)) {
      this.instructionId = createId("instruction");
      this.conversation.push({ role: "user", content: message });
    }
    const controller = new AbortController();
    this.activeController = controller;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const work = (async () => {
      try {
        for (let round = 0; round < MAX_ROUNDS; round += 1) {
          if (controller.signal.aborted) return { kind: "cancelled" as const };
          this.compactConversation();
          const roundResponse = await this.requestRound(message, controller.signal);
          if (roundResponse.kind === "transport-failure") {
            // A cancel that raced the deadline still reads as a cancel; budget and metrics stay untouched.
            if (controller.signal.aborted) return { kind: "cancelled" as const };
            return this.failTransport(roundResponse.reason);
          }
          if (roundResponse.kind === "http-error") return { kind: "failed" as const, error: roundResponse.error };
          const outcome = roundResponse.outcome;
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
        this._lastReplayFailure = null;
        const replay = new AgentSession(current, { ...this.options, onProgress: undefined });
        for (const step of selectedSteps) {
          const result = replay.execute({ id: step.id, name: step.name, arguments: structuredClone(step.arguments) });
          // All-or-nothing: a step that no longer applies to the live document must not land partially.
          if (!result.ok) {
            this._lastReplayFailure = { stepId: step.id, name: step.name, content: result.content };
            return current;
          }
        }
        if (fingerprintProject(replay.shadowProject) === fingerprintProject(current)) return current;
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
