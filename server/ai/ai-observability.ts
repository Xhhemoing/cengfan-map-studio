const AI_EVENTS = new Set([
  "ai.request.started",
  "ai.request.completed",
  "ai.request.failed",
  "ai.route.fallback",
  "ai.agent.finished",
  "ai.agent.cancelled",
  "ai.rate_limited",
]);

/** 协作房间子系统的观测事件。只用于判断房间健康度，成员身份与工程快照永不进日志。 */
const ROOM_EVENTS = new Set([
  "room.created",
  "room.joined",
  "room.kicked",
  "room.closed",
  "room.conflict",
  "room.rate_limited",
  "room.ticket_rejected",
]);

const ALLOWED = new Set(["requestId", "taskId", "roundIndex", "route", "provider", "model", "latencyMs", "attempts", "usage", "budgetUsedTokens", "errorCode", "messageCount", "promptBytes", "toolNames", "fallbackReason"]);

const ROOM_ALLOWED = new Set(["roomId", "role", "errorCode"]);

const ROOM_FIELD_MAX_LENGTH = 64;

export function createAiLogger(write: (line: string) => void = (line) => console.warn(line)) {
  return {
    log(event: string, fields: Record<string, unknown> = {}) {
      const roomEvent = ROOM_EVENTS.has(event);
      if (!roomEvent && !AI_EVENTS.has(event)) return;
      const allowed = roomEvent ? ROOM_ALLOWED : ALLOWED;
      const output: Record<string, unknown> = { event, occurredAt: new Date().toISOString() };
      for (const key of allowed) {
        const value = fields[key];
        if (value === undefined) continue;
        if (roomEvent) {
          // 房间字段一律按短字符串落盘：传进来的若是房间对象或快照，直接丢弃而不是序列化。
          if (typeof value !== "string" && typeof value !== "number") continue;
          output[key] = String(value).slice(0, ROOM_FIELD_MAX_LENGTH);
          continue;
        }
        output[key] = key === "toolNames" && Array.isArray(value) ? value.slice(0, 20).map(String) : value;
      }
      write(JSON.stringify(output));
    },
  };
}
