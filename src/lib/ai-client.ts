export interface ParseDataResult {
  provider: string;
  candidates: Array<{
    name: string;
    university: string;
    city: string;
    /** 服务端识别出海外去向时才有；缺省按国内处理，兼容不返回该字段的旧服务端。 */
    locationScope?: "china" | "international";
    /** 服务端归一化后的省级行政区名；缺省交给下游按城市推断。 */
    province?: string;
    sourceLine: number;
    rawLine: string;
  }>;
  unparsed: Array<{ sourceLine: number; rawLine: string; reason: string }>;
}

/** 超过一天的退避窗口不像限流，多半是坏值或代理写入的日期串，念给用户没有意义。 */
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

/** 只取得到响应头即可解析，测试里的假响应可以不带 headers。 */
export interface RetryAfterSource {
  headers?: { get?: (name: string) => string | null } | null;
}

/**
 * 服务端 429 固定回整秒 Retry-After（server/index.ts 的 sendThrottled）。
 * 缺头、非整数或越界一律当作没有，让调用方退回不带秒数的原句。
 */
export function parseRetryAfterSeconds(response: RetryAfterSource): number | null {
  const raw = response.headers?.get?.("Retry-After");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (seconds < 1 || seconds > MAX_RETRY_AFTER_SECONDS) return null;
  return seconds;
}

/** 限流文案：读到退避秒数就直接告诉用户等多久，否则保持原来的模糊说法。 */
export function rateLimitedMessage(response: RetryAfterSource): string {
  const seconds = parseRetryAfterSeconds(response);
  return seconds === null ? "请求过于频繁，请稍后重试。" : `请求过于频繁，请 ${seconds} 秒后再试。`;
}

function resolveEndpoint(path: string, endpoint?: string): string {
  if (endpoint) return endpoint;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

async function readAiError(response: Response, fallback: string): Promise<Error> {
  const data = await response.json().catch(() => null) as { error?: { message?: string; code?: string } } | null;
  const code = data?.error?.code;
  const message = data?.error?.message;
  if (code === "AI_RATE_LIMITED") return new Error(rateLimitedMessage(response));
  if (code === "AI_TIMEOUT") return new Error("AI 请求超时，请稍后重试。");
  if (code === "WORKSPACE_API_DISABLED") return new Error("AI 服务尚未配置，请先配置服务端 API Key。");
  return new Error(message || fallback);
}

export async function requestAiParseData(input: {
  text: string;
  source?: "paste" | "csv" | "excel" | "ocr";
  endpoint?: string;
  signal?: AbortSignal;
}): Promise<ParseDataResult> {
  const response = await fetch(
    resolveEndpoint("/api/ai/parse-data", input.endpoint),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        source: input.source ?? "paste",
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) {
    throw await readAiError(response, `AI parse error: ${response.status}`);
  }
  return response.json();
}
