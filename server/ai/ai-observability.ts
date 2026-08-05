const EVENTS = new Set([
  "ai.request.started",
  "ai.request.completed",
  "ai.request.failed",
  "ai.route.fallback",
  "ai.agent.finished",
  "ai.agent.cancelled",
  "ai.rate_limited",
]);

const ALLOWED = new Set(["requestId", "route", "provider", "model", "latencyMs", "attempts", "usage", "errorCode", "messageCount", "promptBytes", "toolNames", "fallbackReason"]);

export function createAiLogger(write: (line: string) => void = (line) => console.warn(line)) {
  return {
    log(event: string, fields: Record<string, unknown> = {}) {
      if (!EVENTS.has(event)) return;
      const output: Record<string, unknown> = { event, occurredAt: new Date().toISOString() };
      for (const key of ALLOWED) {
        const value = fields[key];
        if (value !== undefined) output[key] = key === "toolNames" && Array.isArray(value) ? value.slice(0, 20).map(String) : value;
      }
      write(JSON.stringify(output));
    },
  };
}
