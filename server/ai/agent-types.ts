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
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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
