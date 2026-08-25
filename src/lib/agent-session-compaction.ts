const MAX_TOOL_RESULT_BYTES = 16 * 1024;
export const MAX_CONVERSATION_MESSAGES = 24;
const MAX_HEALTH_ISSUES = 20;
const MAX_ASSET_RESULTS = 20;
const MAX_LAYOUT_SAMPLES = 10;

export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8Bytes(value) <= maxBytes) return value;
  let result = "";
  for (const character of value) {
    if (utf8Bytes(result + character) > maxBytes) break;
    result += character;
  }
  return result;
}

export function compactAgentToolResult(callName: string, content: string): string {
  let compact: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(content);
    compact = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { ok: false, value: parsed };
    if (callName === "auto_layout" && Array.isArray(compact.placements)) {
      const placements = compact.placements as unknown[];
      compact = { ok: compact.ok, placementCount: placements.length, samples: placements.slice(0, MAX_LAYOUT_SAMPLES), lostManualLayout: compact.lostManualLayout };
    } else if (callName === "check_health" && Array.isArray(compact.issues)) {
      const issues = compact.issues as unknown[];
      compact = { ok: compact.ok, issueCount: issues.length, issues: issues.slice(0, MAX_HEALTH_ISSUES) };
    } else if (callName === "find_assets" && Array.isArray(compact.assets)) {
      compact = { ok: compact.ok, assets: compact.assets.slice(0, MAX_ASSET_RESULTS) };
    }
  } catch {
    compact = { ok: false, code: "TOOL_RESULT_INVALID_JSON" };
  }
  const base = JSON.stringify(compact);
  if (utf8Bytes(base) <= MAX_TOOL_RESULT_BYTES) return base;
  const makeTruncated = (preview: string) => JSON.stringify({ ok: false, code: "TOOL_RESULT_TRUNCATED", preview });
  let low = 0;
  let high = base.length;
  let best = makeTruncated("");
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = makeTruncated(truncateUtf8(base, middle));
    if (utf8Bytes(candidate) <= MAX_TOOL_RESULT_BYTES) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

export function compactConversationMessages(conversation: Array<Record<string, unknown>>): void {
  if (conversation.length <= MAX_CONVERSATION_MESSAGES) return;
  const groups: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < conversation.length; index += 1) {
    const message = conversation[index];
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
    const ids = new Set(message.tool_calls.map((call) => (call as { id?: unknown }).id).filter((id): id is string => typeof id === "string"));
    let end = index + 1;
    while (end < conversation.length && conversation[end]?.role === "tool") {
      ids.delete(String(conversation[end]?.tool_call_id ?? ""));
      end += 1;
    }
    if (ids.size === 0) groups.push({ start: index, end });
    index = end - 1;
  }
  const keepCount = MAX_CONVERSATION_MESSAGES - 1;
  const minimumCut = Math.max(1, conversation.length - keepCount);
  const preferredCut = groups.length > 4 ? groups[groups.length - 4]!.start : minimumCut;
  const cut = Array.from({ length: conversation.length - preferredCut + 1 }, (_, offset) => preferredCut + offset)
    .find((candidate) => groups.every((group) => candidate <= group.start || candidate >= group.end))
    ?? conversation.length;
  const removed = conversation.slice(0, cut);
  conversation.splice(0, cut, {
    role: "user",
    content: `会话摘要：已压缩 ${removed.length} 条较早消息${groups.length > 0 ? "与完整工具回合" : "连续对话"}，当前影子工程状态保持不变。`,
  });
}
