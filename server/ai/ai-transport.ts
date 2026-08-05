import { AiCallError, classifyUpstreamFailure, isRetryableAiError } from "./ai-errors";
import type { AiCallMeta, AiRoute, AiUsage } from "./agent-types";

export interface AiTransportConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
}

interface CompletionPayload {
  choices?: Array<{ message?: unknown }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseUsage(payload: CompletionPayload): AiUsage | undefined {
  const promptTokens = nonNegativeInteger(payload.usage?.prompt_tokens);
  const completionTokens = nonNegativeInteger(payload.usage?.completion_tokens);
  const totalTokens = nonNegativeInteger(payload.usage?.total_tokens);
  return promptTokens !== undefined && completionTokens !== undefined && totalTokens !== undefined
    ? { promptTokens, completionTokens, totalTokens }
    : undefined;
}

function abortError(): AiCallError {
  return new AiCallError("AI_ABORTED", "AI 调用已取消");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response: Response): number | undefined {
  const value = typeof response.headers?.get === "function" ? response.headers.get("retry-after") : null;
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(2000, seconds * 1000) : undefined;
}

export async function requestChatCompletion<T>(input: {
  config: AiTransportConfig;
  requestId: string;
  route: AiRoute;
  body: Record<string, unknown>;
  parse(payload: unknown): T;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<{ value: T; meta: AiCallMeta }> {
  const started = (input.now ?? Date.now)();
  let attempts = 0;
  for (;;) {
      if (input.signal?.aborted) throw abortError();
      attempts += 1;
      const controller = new AbortController();
      const abortForCaller = () => controller.abort();
      input.signal?.addEventListener("abort", abortForCaller, { once: true });
      const timeout = setTimeout(() => controller.abort(), Math.max(1, input.config.timeoutMs));
      try {
        const response = await fetch(`${input.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.config.apiKey}` },
          body: JSON.stringify({ model: input.config.model, ...input.body }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = classifyUpstreamFailure({ status: response.status, detail: await response.text().catch(() => "") });
          if (error.code === "AI_RATE_LIMITED") {
            const retry = retryAfterMs(response);
            (error as AiCallError).retryAfterMs = retry;
          }
          if (!isRetryableAiError(error) || attempts >= Math.max(1, input.config.maxAttempts)) throw error;
          const delay = Math.min(2000, error.retryAfterMs ?? input.config.retryBaseDelayMs + Math.floor(Math.random() * 50));
          await (input.sleep ?? wait)(delay, input.signal);
          continue;
        }
        let payload: CompletionPayload;
        try {
          payload = await response.json() as CompletionPayload;
        } catch (cause) {
          throw new AiCallError("AI_INVALID_RESPONSE", "AI 返回格式无效", { cause });
        }
        if (!Array.isArray(payload.choices) || !payload.choices[0]?.message) {
          throw new AiCallError("AI_INVALID_RESPONSE", "AI 未返回 assistant 消息");
        }
        let value: T;
        try {
          value = input.parse(payload);
        } catch (cause) {
          if (cause instanceof AiCallError) throw cause;
          throw new AiCallError("AI_INVALID_RESPONSE", "AI 返回内容无效", { cause });
        }
        const finished = (input.now ?? Date.now)();
        return {
          value,
          meta: {
            requestId: input.requestId,
            provider: new URL(input.config.baseUrl).hostname,
            model: input.config.model,
            route: input.route,
            latencyMs: Math.max(0, finished - started),
            attempts,
            usage: parseUsage(payload),
          },
        };
      } catch (cause) {
        if (cause instanceof AiCallError) {
          if (cause.code === "AI_ABORTED") throw cause;
          if (!isRetryableAiError(cause) || attempts >= Math.max(1, input.config.maxAttempts)) throw cause;
          await (input.sleep ?? wait)(Math.min(2000, cause.retryAfterMs ?? input.config.retryBaseDelayMs), input.signal);
          continue;
        }
        const error = controller.signal.aborted
          ? (input.signal?.aborted ? abortError() : new AiCallError("AI_TIMEOUT", "AI 上游请求超时", { cause }))
          : classifyUpstreamFailure({ cause });
        if (!isRetryableAiError(error) || attempts >= Math.max(1, input.config.maxAttempts)) throw error;
        await (input.sleep ?? wait)(Math.min(2000, input.config.retryBaseDelayMs), input.signal);
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", abortForCaller);
      }
    }
}
