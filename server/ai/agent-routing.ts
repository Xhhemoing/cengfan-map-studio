import {
  resolveAiConfig,
  type AiConfig,
} from "./llm-client";
import {
  runAgentTurn,
  runLocalAgentTurn,
  type AgentLoopOutcome,
  type AgentLoopRequest,
} from "./agent-loop";
import type { AiRoute } from "./agent-types";
import { AiCallError } from "./ai-errors";

export const DEFAULT_AGENT_MODEL = "deepseek-v4-flash";
export const FALLBACK_AGENT_MODEL = "gpt-5.6-luna";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const TOKENFREE_BASE_URL = "https://tokenfreevip.cc.cd/v1";
export const AGENT_MAX_TOKENS = 4_000;

const DEFAULT_MAX_ROUNDS = 20;
const DEFAULT_TOKEN_BUDGET = 60_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY = 250;
const MAX_RETRY_DELAY = 2000;

function numeric(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function clampInteger(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
}

export interface AgentRuntimeConfig {
  primary?: AiConfig;
  fallback?: AiConfig;
  maxRounds: number;
  tokenBudget: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}

export function resolveAgentConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const base = resolveAiConfig(env);
  const configuredModel = (env.AI_MODEL || "").trim();
  const explicitModel = configuredModel === "claude-sonnet-5" ? "" : configuredModel;
  return {
    ...base,
    apiKey: (env.AI_PRIMARY_API_KEY || env.DEEPSEEK_API_KEY || env.AI_API_KEY || "").trim() || undefined,
    baseUrl: (env.AI_PRIMARY_BASE_URL || (!explicitModel ? env.DEEPSEEK_BASE_URL : env.AI_BASE_URL) || "").trim() || (!explicitModel ? DEEPSEEK_BASE_URL : base.baseUrl),
    model: (env.AI_PRIMARY_MODEL || explicitModel || DEFAULT_AGENT_MODEL).trim(),
    maxTokens: Math.max(base.maxTokens, AGENT_MAX_TOKENS),
  };
}

export function resolveAgentRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AgentRuntimeConfig {
  const primaryBase = resolveAgentConfig(env);
  const primary: AiConfig | undefined = primaryBase.apiKey ? primaryBase : undefined;
  const fallbackBaseUrl = (env.AI_FALLBACK_BASE_URL || TOKENFREE_BASE_URL).trim();
  const fallbackApiKey = (env.AI_FALLBACK_API_KEY || (fallbackBaseUrl === primaryBase.baseUrl ? primaryBase.apiKey : "") || "").trim() || undefined;
  const fallbackModel = (env.AI_FALLBACK_MODEL || FALLBACK_AGENT_MODEL).trim();
  const fallback = fallbackApiKey && primary && !(fallbackBaseUrl === primary.baseUrl && fallbackModel === primary.model)
    ? { ...primary, apiKey: fallbackApiKey, baseUrl: fallbackBaseUrl, model: fallbackModel }
    : undefined;
  return {
    primary,
    fallback,
    maxRounds: clampInteger(numeric(env, "AI_AGENT_MAX_ROUNDS", DEFAULT_MAX_ROUNDS), 1, 20),
    tokenBudget: numeric(env, "AI_AGENT_TOKEN_BUDGET", DEFAULT_TOKEN_BUDGET) <= 0
      ? DEFAULT_TOKEN_BUDGET
      : clampInteger(numeric(env, "AI_AGENT_TOKEN_BUDGET", DEFAULT_TOKEN_BUDGET), 1, 60_000),
    retryMaxAttempts: clampInteger(numeric(env, "AI_RETRY_MAX_ATTEMPTS", DEFAULT_RETRY_ATTEMPTS), 1, 3),
    retryBaseDelayMs: Math.min(MAX_RETRY_DELAY, Math.max(0, Math.floor(numeric(env, "AI_RETRY_BASE_DELAY_MS", DEFAULT_RETRY_DELAY)))),
  };
}

export interface AgentLoopBackend {
  provider: string;
  isConfigured: boolean;
  runTurn(request: AgentLoopRequest): Promise<AgentLoopOutcome>;
}

function applyRuntimeBudget(request: AgentLoopRequest, runtime: AgentRuntimeConfig): AgentLoopRequest {
  const maxTokens = clampInteger(runtime.tokenBudget, 1, 60_000);
  const maxRounds = clampInteger(runtime.maxRounds, 1, 20);
  const budget = request.budget ?? { usedTokens: 0, maxTokens, rounds: 0, maxRounds };
  return {
    ...request,
    budget: {
      usedTokens: Math.min(maxTokens, Math.max(0, Math.floor(budget.usedTokens))),
      maxTokens,
      rounds: Math.min(maxRounds, Math.max(0, Math.floor(budget.rounds))),
      maxRounds,
    },
  };
}

function withRoute(outcome: AgentLoopOutcome, route: AiRoute, fallbackReason?: string, requestId = "local", config?: AiConfig): AgentLoopOutcome {
  if (outcome.kind === "failed") return outcome;
  if (route === "local") {
    return {
      ...outcome,
      meta: { requestId, provider: "local-fallback", model: "local-rules", route: "local", latencyMs: 0, attempts: 0, fallbackReason },
    };
  }
  return {
    ...outcome,
    meta: outcome.meta ? { ...outcome.meta, route, fallbackReason } : {
      requestId,
      provider: config ? new URL(config.baseUrl).hostname : "unknown",
      model: config?.model ?? "unknown",
      route,
      latencyMs: 0,
      attempts: 0,
      fallbackReason,
    },
  };
}

function normalizeAiConfig(config: AiConfig | undefined): AiConfig | undefined {
  if (!config) return undefined;
  return {
    ...config,
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 60000,
    maxTokens: Number.isFinite(config.maxTokens) && config.maxTokens > 0 ? Math.max(4000, config.maxTokens) : 4000,
  };
}

export function normalizeAgentRuntimeConfig(runtime: AgentRuntimeConfig): AgentRuntimeConfig {
  return {
    ...runtime,
    primary: normalizeAiConfig(runtime.primary),
    fallback: normalizeAiConfig(runtime.fallback),
    tokenBudget: Number.isFinite(runtime.tokenBudget) && runtime.tokenBudget > 0 ? Math.min(60_000, Math.floor(runtime.tokenBudget)) : DEFAULT_TOKEN_BUDGET,
    maxRounds: clampInteger(Number.isFinite(runtime.maxRounds) ? runtime.maxRounds : DEFAULT_MAX_ROUNDS, 1, 20),
    retryMaxAttempts: clampInteger(Number.isFinite(runtime.retryMaxAttempts) ? runtime.retryMaxAttempts : DEFAULT_RETRY_ATTEMPTS, 1, 3),
    retryBaseDelayMs: Number.isFinite(runtime.retryBaseDelayMs) ? Math.min(MAX_RETRY_DELAY, Math.max(0, Math.floor(runtime.retryBaseDelayMs))) : DEFAULT_RETRY_DELAY,
  };
}

function isRuntimeConfig(value: AgentRuntimeConfig | AiConfig): value is AgentRuntimeConfig {
  return "primary" in value && "maxRounds" in value;
}

export function createAgentLoopBackend(config: AgentRuntimeConfig | AiConfig): AgentLoopBackend {
  const runtime: AgentRuntimeConfig = normalizeAgentRuntimeConfig(isRuntimeConfig(config)
    ? config
    : {
      primary: config.apiKey ? config : undefined,
      fallback: undefined,
      maxRounds: DEFAULT_MAX_ROUNDS,
      tokenBudget: DEFAULT_TOKEN_BUDGET,
      retryMaxAttempts: DEFAULT_RETRY_ATTEMPTS,
      retryBaseDelayMs: DEFAULT_RETRY_DELAY,
    });
  return {
    provider: runtime.primary?.model ?? "local-fallback",
    isConfigured: Boolean(runtime.primary),
    async runTurn(request) {
      const boundedRequest = applyRuntimeBudget(request, runtime);
      if (boundedRequest.signal?.aborted) throw new AiCallError("AI_ABORTED", "AI 调用已取消");
      const budget = boundedRequest.budget!;
      if (!runtime.primary || budget.rounds >= budget.maxRounds || budget.usedTokens >= budget.maxTokens || budget.usedTokens + AGENT_MAX_TOKENS > budget.maxTokens) {
        return withRoute(
          budget.rounds >= budget.maxRounds || budget.usedTokens >= budget.maxTokens || budget.usedTokens + AGENT_MAX_TOKENS > budget.maxTokens
            ? { kind: "finish", summary: "已达到 AI 任务预算，保留当前预览结果。", budget }
            : runLocalAgentTurn(boundedRequest),
          runtime.primary ? "local" : "local",
          runtime.primary && budget.usedTokens + AGENT_MAX_TOKENS > budget.maxTokens ? "AI_BUDGET_EXCEEDED" : undefined,
          request.requestId,
          runtime.primary,
        );
      }
      let primary: AgentLoopOutcome;
      try {
        primary = await runAgentTurn(runtime.primary, boundedRequest);
      } catch (error) {
        if (error instanceof AiCallError && error.code === "AI_ABORTED") throw error;
        primary = { kind: "failed", error: "主模型调用失败" };
      }
      if (primary.kind !== "failed") return withRoute(primary, "primary", undefined, request.requestId, runtime.primary);
      if (runtime.fallback) {
        let fallback: AgentLoopOutcome;
        try {
          fallback = await runAgentTurn(runtime.fallback, boundedRequest);
        } catch (error) {
          if (error instanceof AiCallError && error.code === "AI_ABORTED") throw error;
          fallback = { kind: "failed", error: "备选模型调用失败" };
        }
        if (fallback.kind !== "failed") return withRoute(fallback, "fallback", primary.error, request.requestId, runtime.fallback);
      }
      return withRoute(runLocalAgentTurn(boundedRequest), "local", primary.error, request.requestId);
    },
  };
}
