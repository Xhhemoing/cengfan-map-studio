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

export const DEFAULT_AGENT_MODEL = "deepseek-v4-flash";
export const FALLBACK_AGENT_MODEL = "gpt-5.6-luna";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const TOKENFREE_BASE_URL = "https://tokenfreevip.cc.cd/v1";
export const AGENT_MAX_TOKENS = 4_000;

export function resolveAgentConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const base = resolveAiConfig(env);
  const configuredModel = (env.AI_MODEL || "").trim();
  // claude-sonnet-5 was the old single-turn default. Treat it as legacy so a
  // pre-existing .env does not silently opt the new agent into the broken proxy.
  const explicitModel = configuredModel === "claude-sonnet-5" ? "" : configuredModel;
  const useDeepSeekDefault = !explicitModel;
  return {
    ...base,
    apiKey: (env.DEEPSEEK_API_KEY || env.AI_API_KEY || "").trim() || undefined,
    baseUrl: useDeepSeekDefault
      ? ((env.DEEPSEEK_BASE_URL || "").trim() || DEEPSEEK_BASE_URL)
      : base.baseUrl,
    model: explicitModel || DEFAULT_AGENT_MODEL,
    maxTokens: Math.max(base.maxTokens, AGENT_MAX_TOKENS),
  };
}

export interface AgentLoopBackend {
  provider: string;
  isConfigured: boolean;
  runTurn(request: AgentLoopRequest): Promise<AgentLoopOutcome>;
}

/** 主模型失败时切换到同一 OpenAI 兼容端点的 luna；两者均失败则交给调用方的 local fallback。 */
export function createAgentLoopBackend(config: AiConfig): AgentLoopBackend {
  const fallbackConfig: AiConfig = {
    ...config,
    apiKey: config.fallbackApiKey ?? config.apiKey,
    baseUrl: config.fallbackBaseUrl ?? (config.model === DEFAULT_AGENT_MODEL ? TOKENFREE_BASE_URL : config.baseUrl),
    model: FALLBACK_AGENT_MODEL,
  };
  return {
    provider: config.apiKey ? config.model : "local-fallback",
    isConfigured: Boolean(config.apiKey),
    async runTurn(request) {
      if (!config.apiKey) return runLocalAgentTurn(request);
      let primary: AgentLoopOutcome;
      try {
        primary = await runAgentTurn(config, request);
      } catch {
        primary = { kind: "failed", error: "主模型调用失败" };
      }
      if (primary.kind !== "failed" || fallbackConfig.model === config.model) return primary;
      let fallback: AgentLoopOutcome;
      try {
        fallback = await runAgentTurn(fallbackConfig, request);
      } catch {
        fallback = { kind: "failed", error: "备选模型调用失败" };
      }
      return fallback.kind === "failed" ? runLocalAgentTurn(request) : fallback;
    },
  };
}
