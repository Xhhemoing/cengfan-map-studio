import type { AgentBudgetState, ChatMessage, ChatToolCall } from "./agent-types";
import { isRecord } from "./agent-types";
import { ALL_TOOL_NAMES, READ_ONLY_TOOLS } from "./tool-registry";

const MAX_MESSAGES = 80;
const MAX_CONTENT_BYTES = 32 * 1024;
const MAX_DIGEST_DATA_BYTES = 256;
const MAX_TOKEN_BUDGET = 60_000;
const MAX_ROUNDS = 20;
const MAX_TOOL_ARGUMENT_BYTES = 16 * 1024;
const ROLES = new Set(["system", "user", "assistant", "tool"]);

export interface AgentRequest {
  userMessage: string;
  digest: Record<string, unknown>;
  messages: ChatMessage[];
  budget: AgentBudgetState;
  taskId?: string;
  budgetReceipt?: string;
}

export interface AgentBudgetLimits {
  maxTokens: number;
  maxRounds: number;
}

export type AgentRequestParseResult =
  | { ok: true; value: AgentRequest }
  | { ok: false; error: string };

function contentSize(content: unknown): number {
  return typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0;
}

function hasLongDataUrl(value: unknown): boolean {
  if (typeof value === "string") return /data:[^\s]{257,}/i.test(value);
  if (Array.isArray(value)) return value.some(hasLongDataUrl);
  return isRecord(value) && Object.values(value).some(hasLongDataUrl);
}

function validToolCall(call: unknown): call is ChatToolCall {
  if (!isRecord(call)
    || typeof call.id !== "string" || !call.id.trim().length
    || call.type !== "function"
    || !isRecord(call.function)
    || typeof call.function.name !== "string"
    || !ALL_TOOL_NAMES.includes(call.function.name)
    || typeof call.function.arguments !== "string"
    || contentSize(call.function.arguments) > MAX_TOOL_ARGUMENT_BYTES
    || hasLongDataUrl(call.function.arguments)) return false;
  try {
    const parsed = JSON.parse(call.function.arguments) as unknown;
    if (!isRecord(parsed)) return false;
    if (call.function.name === "manage_students" && parsed.action === "update_fact") {
      const fields = parsed.fields;
      if (!isRecord(fields)) return false;
      if (Object.keys(fields).some((key) => !["name", "university", "city"].includes(key))) return false;
      if (Object.values(fields).some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 200)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function containsLongData(value: unknown): boolean {
  if (typeof value === "string") return new RegExp(`data:[^\\s]{${MAX_DIGEST_DATA_BYTES + 1},}`, "i").test(value);
  if (Array.isArray(value)) return value.some(containsLongData);
  return isRecord(value) && Object.values(value).some(containsLongData);
}

function normalizeBudget(value: unknown, limits: AgentBudgetLimits): AgentBudgetState {
  const input = isRecord(value) ? value : {};
  const maxTokens = Math.max(1, Math.min(MAX_TOKEN_BUDGET, Math.floor(limits.maxTokens)));
  const maxRounds = Math.max(1, Math.min(MAX_ROUNDS, Math.floor(limits.maxRounds)));
  const integer = (key: string, fallback: number) => typeof input[key] === "number" && Number.isFinite(input[key]) ? Math.max(0, Math.floor(input[key] as number)) : fallback;
  return {
    usedTokens: Math.min(maxTokens, integer("usedTokens", 0)),
    maxTokens,
    rounds: Math.min(maxRounds, integer("rounds", 0)),
    maxRounds,
  };
}

export function parseAgentRequest(value: unknown, limits: AgentBudgetLimits = { maxTokens: MAX_TOKEN_BUDGET, maxRounds: MAX_ROUNDS }): AgentRequestParseResult {
  if (!isRecord(value) || typeof value.userMessage !== "string" || !value.userMessage.trim() || !isRecord(value.digest) || !Array.isArray(value.messages)) {
    return { ok: false, error: "userMessage、digest 和 messages 格式无效" };
  }
  if (contentSize(value.userMessage) > MAX_CONTENT_BYTES || /data:[^\s]{257,}/i.test(value.userMessage)) return { ok: false, error: "userMessage 超过 32KiB 或包含超长 data URL" };
  if (value.messages.length > MAX_MESSAGES || containsLongData(value.digest)) return { ok: false, error: "会话消息或 digest 超过限制" };
  const messages: ChatMessage[] = [];
  const pendingToolCalls = new Set<string>();
  const seenToolCallIds = new Set<string>();
  let awaitingToolResults = false;
  for (const raw of value.messages) {
    if (!isRecord(raw) || typeof raw.role !== "string" || !ROLES.has(raw.role)) return { ok: false, error: "消息 role 无效" };
    if (raw.role === "assistant" && raw.tool_calls === undefined && ("tool_call_id" in raw || "name" in raw)) return { ok: false, error: "assistant 消息字段无效" };
    if ((raw.role === "system" || raw.role === "user") && typeof raw.content !== "string") return { ok: false, error: `${raw.role} 消息 content 必须是字符串` };
    if (raw.role === "assistant" && raw.content !== undefined && raw.content !== null && typeof raw.content !== "string") return { ok: false, error: "assistant 消息 content 类型无效" };
    if (raw.role === "tool" && (typeof raw.tool_call_id !== "string" || !raw.tool_call_id.trim() || typeof raw.content !== "string")) return { ok: false, error: "tool 消息字段无效" };
    if (contentSize(raw.content) > MAX_CONTENT_BYTES) return { ok: false, error: "单条消息过长" };
    if (awaitingToolResults && raw.role !== "tool") return { ok: false, error: "assistant tool_calls 必须先消费全部 tool 结果" };
    if (raw.role === "assistant" && raw.tool_calls !== undefined) {
      if (!Array.isArray(raw.tool_calls) || raw.tool_calls.length === 0 || !raw.tool_calls.every(validToolCall)) return { ok: false, error: "assistant tool_calls 无效" };
      for (const call of raw.tool_calls as ChatToolCall[]) {
        if (seenToolCallIds.has(call.id) || pendingToolCalls.has(call.id)) return { ok: false, error: "tool_call_id 必须全局唯一" };
        seenToolCallIds.add(call.id);
        pendingToolCalls.add(call.id);
      }
      awaitingToolResults = true;
    }
    if (raw.role === "tool") {
      const id = String(raw.tool_call_id);
      if (!pendingToolCalls.has(id)) return { ok: false, error: "tool_call_id 不对应未消费的 assistant tool call" };
      pendingToolCalls.delete(id);
      if (pendingToolCalls.size === 0) awaitingToolResults = false;
    }
    if (raw.role !== "system") messages.push(raw as unknown as ChatMessage);
  }
  if (pendingToolCalls.size > 0) return { ok: false, error: "assistant tool_calls 存在未消费的调用" };
  const last = messages.at(-1);
  if (!last || last.role !== "user" || last.content !== value.userMessage) messages.push({ role: "user", content: value.userMessage });
  if (value.taskId !== undefined && (typeof value.taskId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value.taskId))) return { ok: false, error: "taskId 无效" };
  if (value.budgetReceipt !== undefined && (typeof value.budgetReceipt !== "string" || value.budgetReceipt.length > 2048)) return { ok: false, error: "budgetReceipt 无效" };
  return { ok: true, value: { userMessage: value.userMessage, digest: value.digest, messages, budget: normalizeBudget(value.budget, limits), taskId: value.taskId as string | undefined, budgetReceipt: value.budgetReceipt as string | undefined } };
}

export interface AgentToolBatchCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type AgentToolBatchResult = { ok: true } | { ok: false; error: string };

function domainFor(name: string, args: Record<string, unknown>): string {
  if (name === "update_text" || name === "update_asset" || name === "update_province") return `${name}:${String(args.id ?? args.province ?? "")}`;
  if (name.startsWith("update_")) return name;
  if (name === "auto_layout") return "cards:layout";
  return "";
}

export function validateAgentToolBatch(calls: AgentToolBatchCall[]): AgentToolBatchResult {
  if (calls.some((call) => !ALL_TOOL_NAMES.includes(call.name))) return { ok: false, error: "未知工具被拒绝" };
  const finish = calls.some((call) => call.name === "finish");
  if (finish && calls.length > 1) return { ok: false, error: "finish 不能与其他工具混用" };
  const domains = new Set<string>();
  for (const call of calls) {
    if (READ_ONLY_TOOLS.has(call.name) || call.name === "finish") continue;
    const domain = domainFor(call.name, call.arguments);
    if (call.name === "update_text" && domain.endsWith(":")) continue;
    if (call.name === "auto_layout" && calls.some((other) => other.name === "update_cards")) return { ok: false, error: "auto_layout 与 update_cards 存在冲突" };
    if (domain && domains.has(domain)) return { ok: false, error: `工具批次写入冲突：${domain}` };
    if (domain) domains.add(domain);
  }
  return { ok: true };
}
