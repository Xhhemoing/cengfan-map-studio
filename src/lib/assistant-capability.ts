export type AssistantCapability = { state: "unchecked" | "checking" | "remote" | "local-only" | "unavailable"; detail: string };

export function initialAssistantCapability(publicDemo: boolean): AssistantCapability {
  return publicDemo
    ? { state: "unavailable", detail: "当前为静态站点，未连接远程 AI 服务。本地排版与体检可直接使用。" }
    : { state: "unchecked", detail: "远程 AI 服务尚未检测。服务配置在服务器端管理。" };
}

/** A health response proves capability only when its explicit agent flags are present. HTML 200 is not healthy. */
export async function checkAssistantCapability(signal?: AbortSignal): Promise<AssistantCapability> {
  try {
    const response = await fetch("/api/health", { method: "GET", headers: { Accept: "application/json" }, signal });
    if (!response.ok) return { state: "unavailable", detail: `AI 服务未连接（HTTP ${response.status}），可继续使用本地排版与体检。` };
    const body = await response.json() as { ok?: boolean; ai?: { agent?: { primary?: { configured?: boolean }; fallback?: { configured?: boolean }; localFallback?: boolean } } };
    const agent = body.ai?.agent;
    if (body.ok === true && (agent?.primary?.configured === true || agent?.fallback?.configured === true)) return { state: "remote", detail: "远程 AI 服务已配置，可按自然语言规划；本地排版与体检同时可用。" };
    if (body.ok === true && agent?.localFallback === true) return { state: "local-only", detail: "服务已连接，当前仅支持可识别的本地规则。复杂自然语言需要配置远程 AI。" };
    return { state: "unavailable", detail: "未检测到有效 AI 服务，可继续使用本地排版与体检。" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { state: "unavailable", detail: "AI 服务暂时无法连接，可继续使用本地排版与体检。" };
  }
}
