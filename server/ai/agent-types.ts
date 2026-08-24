export type AiErrorCode =
  | "AI_ABORTED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_UNAVAILABLE"
  | "AI_UPSTREAM_REJECTED"
  | "AI_INVALID_RESPONSE"
  | "AI_BUDGET_EXCEEDED"
  | "AI_VALIDATION_ERROR";

export type AiRoute = "primary" | "fallback" | "local";

export interface AiUsage {
  /** 上游未报告分项时省略，此时只能按 totalTokens 计量。 */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}

export interface AiCallMeta {
  requestId: string;
  provider: string;
  model: string;
  route: AiRoute;
  latencyMs: number;
  attempts: number;
  usage?: AiUsage;
  fallbackReason?: string;
}

export interface AgentBudgetState {
  usedTokens: number;
  maxTokens: number;
  rounds: number;
  maxRounds: number;
  /** 上一轮上游报告的 prompt_tokens，用于在缓存未报告命中时估算本轮新增的 prompt。 */
  lastPromptTokens?: number;
}

/**
 * 一轮调用真正新增的计费 token：补全 token 加上未命中缓存的 prompt token。
 * 多轮对话会把同一段前缀反复发给上游，直接累加 totalTokens 会把它重复计量到预算里。
 */
export function usedTokenDelta(usage: AiUsage | undefined, lastPromptTokens?: number): number {
  if (!usage) return 0;
  const { promptTokens, completionTokens, promptCacheMissTokens } = usage;
  if (promptTokens === undefined && completionTokens === undefined) return Math.max(0, usage.totalTokens);
  const freshPromptTokens = promptCacheMissTokens
    ?? (promptTokens === undefined ? 0 : Math.max(0, promptTokens - Math.max(0, lastPromptTokens ?? 0)));
  return Math.max(0, (completionTokens ?? 0) + freshPromptTokens);
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  reasoning_content?: string | null;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
