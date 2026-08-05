import type { AiConfig } from "./llm-client";
import { chatWithTools } from "./llm-client";
import type { AgentBudgetState, AiCallMeta, ChatMessage } from "./agent-types";
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
1. 先 inspect_project 读取真实当前值，再 describe_capability 查询属性，禁止凭记忆猜测 before。
2. 一轮可以并行调用多个互不冲突的工具。
3. 修改布局后调用 check_health 检查出界、遮挡、文字不可读和连线冲突。
4. cards.positions 受保护，只能由 auto_layout 修改。已有手工位置时 auto_layout 会丢失它们，必须如实说明。
5. 学生姓名、院校、城市是事实字段，改写必须谨慎并在总结中说明。
6. 全部完成后调用 finish，summary 使用中文。
7. 未知补丁属性被拒后，按返回的 availableProps 修正，最多重试两次。`;

function assistantTurnCount(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === "assistant").length;
}

function readOnlyStreak(messages: ChatMessage[]): number {
  let streak = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) break;
    if (message.role === "tool") continue;
    if (message.role !== "assistant" || !message.tool_calls?.length) break;
    if (!message.tool_calls.every((call) => READ_ONLY_TOOLS.has(call.function.name))) break;
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

/** 无 API key 或模型暂时不可用时的确定性兜底，保持 agent 协议可继续工作。 */
export function runLocalAgentTurn(request: AgentLoopRequest): AgentLoopOutcome {
  const hasToolResult = request.messages.some((message) => message.role === "tool");
  if (hasToolResult) return { kind: "finish", summary: "已按本地规则完成可识别的修改；更复杂的需求需要配置 AI 模型。" };
  const message = request.userMessage;
  const calls: AgentToolCall[] = [];
  const digest = request.digest;
  if (message.includes("城市")) calls.push(localToolCall("local-view", "set_data_view", { view: "city" }));
  if (message.includes("大学") && message.includes("分组")) calls.push(localToolCall("local-view-university", "set_data_view", { view: "university" }));
  if (message.includes("紧凑")) calls.push(localToolCall("local-cards", "update_cards", { patch: { preset: "compact", compactLayout: true } }));
  if (/(地图|map).*(缩小|小一点|小些)/i.test(message)) {
    const currentScale = typeof (digest.map as Record<string, unknown> | undefined)?.scale === "number"
      ? Number((digest.map as Record<string, unknown>).scale)
      : 1;
    calls.push(localToolCall("local-map", "update_map", { patch: { scale: Math.max(0.1, Number((currentScale * 0.85).toFixed(2))) } }));
  } else if (/(地图|map).*(放大|大一点|大些)/i.test(message)) {
    const currentScale = typeof (digest.map as Record<string, unknown> | undefined)?.scale === "number"
      ? Number((digest.map as Record<string, unknown>).scale)
      : 1;
    calls.push(localToolCall("local-map", "update_map", { patch: { scale: Math.min(3, Number((currentScale * 1.15).toFixed(2))) } }));
  }
  if (calls.length === 0) return { kind: "finish", summary: "当前未识别出可自动执行的修改；请配置 deepseek-v4-flash 或换一种更明确的描述。" };
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

  const digestMessage: ChatMessage = {
    role: "user",
    content: `当前工程精简投影（只读；不要把它当作可直接写回的完整工程）：${JSON.stringify(request.digest)}`,
  };
  const history = request.messages.filter((message) => message.role !== "system");
  const lastHistoryMessage = history.at(-1);
  const currentUserMessage = lastHistoryMessage?.role === "user" && lastHistoryMessage.content === request.userMessage
    ? []
    : [{ role: "user" as const, content: request.userMessage }];
  const messages = [
    buildSystemMessage(),
    digestMessage,
    ...history,
    ...currentUserMessage,
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
  const nextBudget: AgentBudgetState = {
    ...budget,
    rounds: budget.rounds + 1,
    usedTokens: Math.min(budget.maxTokens, budget.usedTokens + (assistantMessage.meta?.usage?.totalTokens ?? 0)),
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
