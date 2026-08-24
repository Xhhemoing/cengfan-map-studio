import type { RiskLevel } from "./agent-risk";
import { MAX_CONVERSATION_MESSAGES, truncateUtf8 } from "./agent-session-compaction";

export const MAX_ROUNDS = 20;

const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_SNAPSHOT_STRING = 64 * 1024;
const MAX_SNAPSHOT_DEPTH = 32;
const MAX_SNAPSHOT_STEPS = MAX_CONVERSATION_MESSAGES * 2;

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

export function textOnlyConversation(messages: Array<Record<string, unknown>>): Array<{ role: "user" | "assistant"; content: string }> {
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
