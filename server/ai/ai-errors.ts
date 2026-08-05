import type { AiErrorCode } from "./agent-types";

export type { AiErrorCode };

export class AiCallError extends Error {
  readonly code: AiErrorCode;
  readonly status?: number;
  retryAfterMs?: number;
  readonly detail?: string;
  override readonly cause?: unknown;

  constructor(
    code: AiErrorCode,
    message: string,
    options: { status?: number; retryAfterMs?: number; detail?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AiCallError";
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.detail = options.detail;
    this.cause = options.cause;
  }
}

function isAbortLike(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError"
    || cause instanceof Error && (cause.name === "AbortError" || cause.name === "CanceledError");
}

function isTimeoutLike(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === "TimeoutError" || /timed? ?out|timeout/i.test(cause.message));
}

export function sanitizeAiDetail(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, "[credential]")
    .replace(/\b(?:sk|key|token|secret)[-_]?[a-z0-9._-]{4,}\b/gi, "[credential]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function classifyUpstreamFailure(input: {
  status?: number;
  detail?: string;
  cause?: unknown;
}): AiCallError {
  const detail = input.detail ? sanitizeAiDetail(input.detail) : undefined;
  if (isAbortLike(input.cause)) return new AiCallError("AI_ABORTED", "AI 调用已取消", { detail, cause: input.cause });
  if (isTimeoutLike(input.cause)) return new AiCallError("AI_TIMEOUT", "AI 上游请求超时", { detail, cause: input.cause });
  if (input.status === 429) return new AiCallError("AI_RATE_LIMITED", `AI 上游请求过于频繁${input.status ? ` (${input.status})` : ""}`, { status: input.status, detail, cause: input.cause });
  if (input.status === 502 || input.status === 503 || input.status === 504 || input.cause) {
    return new AiCallError("AI_UPSTREAM_UNAVAILABLE", `AI 上游暂时不可用${input.status ? ` (${input.status})` : ""}`, { status: input.status, detail, cause: input.cause });
  }
  return new AiCallError("AI_UPSTREAM_REJECTED", `AI 上游拒绝了请求${input.status ? ` (${input.status})` : ""}`, { status: input.status, detail, cause: input.cause });
}

export function isRetryableAiError(error: unknown): boolean {
  return error instanceof AiCallError && (
    error.code === "AI_TIMEOUT"
    || error.code === "AI_RATE_LIMITED"
    || error.code === "AI_UPSTREAM_UNAVAILABLE"
  );
}
