import { createHash } from "node:crypto";
import type { AiConfig } from "./llm-client";
import { chatWithTools } from "./llm-client";
import type { AgentBudgetState, AiCallMeta, ChatMessage } from "./agent-types";
import { usedTokenDelta } from "./agent-types";
import { AiCallError } from "./ai-errors";
import { validateAgentToolBatch } from "./agent-request";
import { AGENT_TOOLS, READ_ONLY_TOOLS } from "./tool-registry";
import { isSceneDomain, validateScenePatch } from "./patch-validator";

export const MAX_TURNS = 20;
export const MAX_READ_ONLY_STREAK = 3;
export const MAX_TOOL_REJECTIONS = 2;
export const AGENT_MAX_TOKENS = 4_000;

export interface AgentLoopRequest {
  userMessage: string;
  digest: Record<string, unknown>;
  messages: ChatMessage[];
  budget?: AgentBudgetState;
  /** 续聊时由路由层给出：当前 digest 指纹与上一轮回执里的一致，本轮只发短声明而不重发整包投影。 */
  digestUnchanged?: boolean;
  requestId?: string;
  signal?: AbortSignal;
  route?: "primary" | "fallback";
  retryMaxAttempts?: number;
  retryBaseDelayMs?: number;
}

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentLoopOutcome =
  | { kind: "tool-call"; calls: AgentToolCall[]; assistantMessage: ChatMessage; meta?: AiCallMeta; budget?: AgentBudgetState }
  | { kind: "tool-rejected"; error: string; assistantMessage: ChatMessage; meta?: AiCallMeta; budget?: AgentBudgetState }
  | { kind: "finish"; summary: string; assistantMessage?: ChatMessage; meta?: AiCallMeta; budget?: AgentBudgetState }
  | { kind: "failed"; error: string; code?: string };

const SYSTEM_PROMPT = `你是“蹭饭图”毕业去向海报编辑器的 AI 助手。你要理解中文自然语言需求，自主规划多步修改，并尽可能不破坏用户原有画布。

规则：
1. digest 已包含当前工程的投影值与各工具可写属性已写在工具说明里，并含 layout 节：layout.mapContentBounds 是地图内容框，layout.cardBlocks 是与 students.topProvinces 对齐的卡片实际方位（id/x/y/w/h/side，已叠加手工位置）；版面位置问题直接读 layout，其余 digest 能回答的问题也直接用 digest，不要重复 inspect_project；只有 digest 未覆盖的路径（例如 cards.padding、cards.connectorColor）才调用 inspect_project 读真实值。禁止凭记忆猜测 before。
2. 一轮可以并行调用多个互不冲突的工具。
3. 修改布局后调用 check_health 检查出界、遮挡、文字不可读和连线冲突。
4. cards.positions 受保护，只能由 auto_layout 修改。已有手工位置时 auto_layout 会丢失它们，必须如实说明。
5. 学生姓名、院校、城市是事实字段，改写必须谨慎并在总结中说明。
6. 全部完成后调用 finish，summary 使用中文。
7. 未知补丁属性被拒后，按返回的 availableProps 修正，最多重试两次。`;

function assistantTurnCount(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

/** digest 的稳定指纹：先按 key 排序规范化再 sha256，键序抖动不会被误判成工程变化。 */
export function digestFingerprint(digest: Record<string, unknown> | undefined): string {
  return createHash("sha256").update(JSON.stringify(canonicalValue(digest ?? {})), "utf8").digest("hex");
}

/** 只读回合的指纹：工具名加规范化后的参数，用来区分“原地重复”和“翻页/换路径继续读”。 */
function readOnlyCallSignature(message: ChatMessage): string | null {
  if (message.role !== "assistant" || !message.tool_calls?.length) return null;
  if (!message.tool_calls.every((call) => READ_ONLY_TOOLS.has(call.function.name))) return null;
  return message.tool_calls
    .map((call) => {
      let args: unknown;
      try {
        args = canonicalValue(JSON.parse(call.function.arguments || "{}"));
      } catch {
        args = call.function.arguments;
      }
      return `${call.function.name}:${JSON.stringify(args)}`;
    })
    .sort()
    .join("|");
}

/** 只累计与上一只读回合签名完全相同的回合；参数不同（例如 query_students 递增 offset）说明仍在推进，不计入。 */
function readOnlyStreak(messages: ChatMessage[]): number {
  let streak = 0;
  let previousSignature: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) break;
    if (message.role === "tool") continue;
    const signature = readOnlyCallSignature(message);
    if (signature === null) break;
    if (previousSignature !== null && signature !== previousSignature) break;
    previousSignature = signature;
    streak += 1;
  }
  return streak;
}

function rejectedCount(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === "tool" && message.content?.includes("unknownProps")).length;
}

function parseArguments(name: string, raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, "utf8") > 16 * 1024) throw new Error(`工具 ${name} 的 arguments 超过 16KiB`);
  if (/data:[^\s]{257,}/i.test(raw)) throw new Error(`工具 ${name} 的 arguments 不得包含超长 data URL`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`工具 ${name} 的 arguments 不是合法 JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`工具 ${name} 的 arguments 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function patchForCall(name: string, args: Record<string, unknown>): { domain: Parameters<typeof validateScenePatch>[0]; patch: Record<string, unknown> } | null {
  if (name === "update_text") return { domain: "text", patch: (args.patch ?? {}) as Record<string, unknown> };
  if (name === "update_asset") return { domain: "asset", patch: (args.patch ?? {}) as Record<string, unknown> };
  if (name === "update_province") return { domain: "province", patch: (args.patch ?? {}) as Record<string, unknown> };
  if (name.startsWith("update_")) {
    const domain = name.slice("update_".length);
    if (isSceneDomain(domain)) return { domain, patch: args.patch === undefined ? args : args.patch as Record<string, unknown> };
  }
  return null;
}

function validateCalls(calls: AgentToolCall[]): string | null {
  const ids = new Set<string>();
  for (const call of calls) {
    if (ids.has(call.id)) return JSON.stringify({ code: "TOOL_ARGUMENTS_INVALID", message: "tool_call_id 必须唯一" });
    ids.add(call.id);
    if (call.name === "manage_students" && call.arguments.action === "update_fact") {
      const fields = call.arguments.fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return JSON.stringify({ code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message: "fields 必须是对象" });
      const fieldRecord = fields as Record<string, unknown>;
      const unknown = Object.keys(fieldRecord).filter((key) => !["name", "university", "city"].includes(key));
      if (unknown.length > 0) return JSON.stringify({ code: "TOOL_ARGUMENTS_INVALID", tool: call.name, field: "fields", unknownProps: unknown, allowedProps: ["name", "university", "city"], message: "update_fact 只允许修改 name、university、city" });
      if (Object.values(fieldRecord).some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 200)) return JSON.stringify({ code: "TOOL_ARGUMENTS_INVALID", tool: call.name, field: "fields", message: "update_fact 字段值必须是非空字符串且 trim 后不超过 200 个字符" });
    }
    const target = patchForCall(call.name, call.arguments);
    if (!target) continue;
    const validation = validateScenePatch(target.domain, target.patch);
    if (!validation.ok) {
      const { unknownProps, protectedProps, availableProps } = validation.error;
      return JSON.stringify({
        code: "PATCH_REJECTED",
        domain: target.domain,
        unknownProps,
        protectedProps,
        availableProps,
        message: `${target.domain} 补丁被拒，请按 availableProps 修正。`,
      });
    }
  }
  return null;
}

export function buildSystemMessage(): ChatMessage {
  return { role: "system", content: SYSTEM_PROMPT };
}

function localToolCall(id: string, name: string, args: Record<string, unknown>): AgentToolCall {
  return { id, name, arguments: args };
}

/** 只剥离称呼与句末语气，保留判定意图所需的实词。 */
function normalizeLocalMessage(raw: string): string {
  return (raw ?? "")
    .replace(/\s+/gu, "")
    .replace(/^(?:请问|请帮我|请帮|帮我|麻烦|请|你)+/u, "")
    .replace(/[?？。.!！,，、~～]+$/u, "")
    .replace(/(?:一下|吧|啊|呀|哦|嘛|呢|哈)+$/u, "");
}

/**
 * 本地兜底只会切分组视图、套紧凑预设、缩放地图，改不了任何字号或配色。
 * 句子点名了具体样式属性就整句判未识别，避免「把城市字号调大」被切成城市视图。
 */
const STYLE_PROPERTY_INTENT = /字号|字体|字大小|文字大小|颜色|配色|粗细|加粗|间距|行高|行距|透明度|边距|留白|宽度|高度/u;

const GROUP_SCOPE = "(?:(?:把|将)(?:名单|表格|数据|学生|同学|卡片|所有(?:学生|同学)?|全部(?:学生|同学)?)?)?";
const GROUP_BY = "(?:按|按照|依|依照|以|用|根据|基于)";
const GROUP_ACTION = "(?:分组|归类|分类|聚合)";
const VIEW_NOUN = "(?:视图|分组|模式|维度)";
/** 只认纯切换动词。「改成/调成」这类写动词一律交给主模型，宁可少切一次视图。 */
const VIEW_SWITCH = "(?:切换|切|换)";

function anchoredIntent(body: string): RegExp {
  return new RegExp(`^${body}$`, "u");
}

/** 整串锚定，维度词必须独立成分出现；「城市字号」这类偏正短语无法命中。 */
function viewIntentPatterns(dimension: string): RegExp[] {
  return [
    anchoredIntent(`${GROUP_SCOPE}${GROUP_BY}${dimension}(?:来|去|重新)?${GROUP_ACTION}`),
    anchoredIntent(`${dimension}${GROUP_ACTION}`),
    anchoredIntent(`(?:${VIEW_SWITCH}(?:到|成|为|至)?)?${dimension}${VIEW_NOUN}(?:${VIEW_SWITCH})?`),
  ];
}

const VIEW_INTENTS: Array<{ id: string; view: string; patterns: RegExp[] }> = [
  { id: "local-view", view: "city", patterns: viewIntentPatterns("(?:城市|都市)") },
  { id: "local-view-university", view: "university", patterns: viewIntentPatterns("(?:大学|高校|院校|学校)") },
];

function mapScale(digest: Record<string, unknown>): number {
  const scale = (digest.map as Record<string, unknown> | undefined)?.scale;
  return typeof scale === "number" ? Number(scale) : 1;
}

/** 无 API key 或模型暂时不可用时的确定性兜底，保持 agent 协议可继续工作。 */
export function runLocalAgentTurn(request: AgentLoopRequest): AgentLoopOutcome {
  const hasToolResult = request.messages.some((message) => message.role === "tool");
  if (hasToolResult) return { kind: "finish", summary: "已按本地规则完成可识别的修改；更复杂的需求需要配置 AI 模型。" };
  const message = normalizeLocalMessage(request.userMessage);
  const calls: AgentToolCall[] = [];
  const digest = request.digest;
  const stylePropertyRequest = STYLE_PROPERTY_INTENT.test(message);
  if (!stylePropertyRequest) {
    const view = VIEW_INTENTS.find((intent) => intent.patterns.some((pattern) => pattern.test(message)));
    if (view) calls.push(localToolCall(view.id, "set_data_view", { view: view.view }));
    if (message.includes("紧凑")) calls.push(localToolCall("local-cards", "update_cards", { patch: { preset: "compact", compactLayout: true } }));
    if (/(地图|map).*(缩小|小一点|小些)/i.test(message)) {
      calls.push(localToolCall("local-map", "update_map", { patch: { scale: Math.max(0.1, Number((mapScale(digest) * 0.85).toFixed(2))) } }));
    } else if (/(地图|map).*(放大|大一点|大些)/i.test(message)) {
      calls.push(localToolCall("local-map", "update_map", { patch: { scale: Math.min(3, Number((mapScale(digest) * 1.15).toFixed(2))) } }));
    }
  }
  if (calls.length === 0) {
    return {
      kind: "finish",
      summary: stylePropertyRequest
        ? "本地兜底规则改不了字号、颜色这类样式属性；请配置 deepseek-v4-flash 后再试。"
        : "当前未识别出可自动执行的修改；请配置 deepseek-v4-flash 或换一种更明确的描述。",
    };
  }
  const assistantMessage: ChatMessage = {
    role: "assistant",
    content: null,
    tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
  };
  const validationError = validateCalls(calls);
  if (validationError) return { kind: "tool-rejected", error: validationError, assistantMessage };
  return { kind: "tool-call", calls, assistantMessage };
}

export async function runAgentTurn(
  config: AiConfig,
  request: AgentLoopRequest,
): Promise<AgentLoopOutcome> {
  const budget = request.budget ?? { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: MAX_TURNS };
  if (budget.rounds >= budget.maxRounds || budget.usedTokens >= budget.maxTokens) {
    return { kind: "finish", summary: "已达到 AI 任务预算，保留当前预览结果。", budget };
  }
  if (assistantTurnCount(request.messages) >= MAX_TURNS) {
    return { kind: "finish", summary: `已达 ${MAX_TURNS} 轮上限，先交付已完成的部分。`, budget };
  }
  if (readOnlyStreak(request.messages) >= MAX_READ_ONLY_STREAK) {
    return { kind: "finish", summary: "连续多轮只读未动手，任务无进展，已交回当前结论。" };
  }
  if (rejectedCount(request.messages) >= MAX_TOOL_REJECTIONS) {
    return { kind: "finish", summary: "工具参数多次校验失败，已停止继续尝试。" };
  }

  // digest 与上一轮完全一致时只发一句短声明：整包 JSON 上一轮已经进过 prompt，重发是纯重复付费。
  const digestMessage: ChatMessage = {
    role: "user",
    content: request.digestUnchanged
      ? "当前工程精简投影与上一轮相同，继续使用已给出的工程投影（只读；不要把它当作可直接写回的完整工程）。"
      : `当前工程精简投影（只读；不要把它当作可直接写回的完整工程）：${JSON.stringify(request.digest)}`,
  };
  const history = request.messages.filter((message) => message.role !== "system");
  const lastHistoryMessage = history.at(-1);
  const historyEndsWithCurrentUser = lastHistoryMessage?.role === "user" && lastHistoryMessage.content === request.userMessage;
  // digest 每轮都会变化，放在 history 之后才能让 [system, ...history] 成为稳定前缀并命中上游的前缀缓存。
  const stableHistory = historyEndsWithCurrentUser ? history.slice(0, -1) : history;
  const currentUserMessage: ChatMessage = historyEndsWithCurrentUser
    ? lastHistoryMessage!
    : { role: "user", content: request.userMessage };
  const messages = [
    buildSystemMessage(),
    ...stableHistory,
    digestMessage,
    currentUserMessage,
  ];
  let assistantMessage: ChatMessage & { meta?: AiCallMeta };
  try {
    assistantMessage = await chatWithTools({ ...config, retryMaxAttempts: request.retryMaxAttempts, retryBaseDelayMs: request.retryBaseDelayMs }, messages, AGENT_TOOLS, AGENT_MAX_TOKENS, {
      requestId: request.requestId,
      route: request.route,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof AiCallError) throw error;
    return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
  }
  const usage = assistantMessage.meta?.usage;
  const nextBudget: AgentBudgetState = {
    ...budget,
    rounds: budget.rounds + 1,
    usedTokens: Math.min(budget.maxTokens, budget.usedTokens + usedTokenDelta(usage, budget.lastPromptTokens)),
    lastPromptTokens: usage?.promptTokens ?? budget.lastPromptTokens,
  };
  const meta = assistantMessage.meta;

  const rawCalls = assistantMessage.tool_calls ?? [];
  if (rawCalls.length === 0) {
    return { kind: "finish", summary: assistantMessage.content?.trim() || "已完成。", assistantMessage, meta, budget: nextBudget };
  }

  const calls: AgentToolCall[] = [];
  try {
    for (const call of rawCalls) {
      if (!call.id || calls.some((existing) => existing.id === call.id)) throw new Error("tool_call_id 必须唯一");
      if (!call.function || !call.function.name || !AGENT_TOOLS.some((tool) => tool.function.name === call.function.name)) throw new Error(`工具 ${call.function?.name ?? "unknown"} 不存在`);
      calls.push({ id: call.id, name: call.function.name, arguments: parseArguments(call.function.name, call.function.arguments) });
    }
  } catch (error) {
    return { kind: "tool-rejected", error: error instanceof Error ? error.message : String(error), assistantMessage: { role: "assistant", content: `模型请求的工具无效：${error instanceof Error ? error.message : String(error)}` }, meta, budget: nextBudget };
  }
  const batch = validateAgentToolBatch(calls);
  if (!batch.ok) return { kind: "tool-rejected", error: batch.error, assistantMessage: { role: "assistant", content: `模型工具调用未通过校验：${batch.error}` }, meta, budget: nextBudget };
  const finishCall = calls.find((call) => call.name === "finish");
  if (finishCall) {
    const summary = typeof finishCall.arguments.summary === "string" && finishCall.arguments.summary.trim()
      ? finishCall.arguments.summary.trim()
      : "已完成。";
    return { kind: "finish", summary, assistantMessage, meta, budget: nextBudget };
  }
  const validationError = validateCalls(calls);
  if (validationError) {
    const legalCallShape = calls.every((call) => AGENT_TOOLS.some((tool) => tool.function.name === call.name));
    return { kind: "tool-rejected", error: validationError, assistantMessage: legalCallShape ? assistantMessage : { role: "assistant", content: `模型工具调用未通过校验：${validationError}` }, meta, budget: nextBudget };
  }
  return { kind: "tool-call", calls, assistantMessage, meta, budget: nextBudget };
}
