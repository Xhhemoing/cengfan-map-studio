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
  if (code === "AI_RATE_LIMITED") return new Error("请求过于频繁，请稍后重试。");
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
