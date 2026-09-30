import type { ChatMessage } from "./agent-types";
import { WRITE_TOOLS } from "./tool-registry";
import { readSuccessfulReceipts, type PendingCall } from "./task-plan";

/** A tool result is not by itself proof that a requested edit happened. */
export function localHistorySummary(messages: ChatMessage[]): string | null {
  if (!messages.some((message) => message.role === "assistant" || message.role === "tool")) return null;
  const writes: PendingCall[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.tool_calls ?? []) {
      if (!WRITE_TOOLS.has(call.function.name)) continue;
      try {
        const args: unknown = JSON.parse(call.function.arguments);
        if (!args || typeof args !== "object" || Array.isArray(args)) return "工具参数无法核验，未确认修改完成。";
        writes.push({ id: call.id, name: call.function.name, arguments: args as Record<string, unknown> });
      } catch { return "工具参数无法核验，未确认修改完成。"; }
    }
  }
  if (!writes.length) return "仅有读取或对话记录，未确认任何修改成功；复杂任务需要可用的规划模型。";
  // Validate each full assistant batch, including its read results, to preserve ID pairing.
  for (const message of messages) {
    if (message.role !== "assistant" || !message.tool_calls?.some((call) => WRITE_TOOLS.has(call.function.name))) continue;
    let batch: PendingCall[];
    try { batch = message.tool_calls.map((call) => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments) as Record<string, unknown> })); }
    catch { return "工具参数无法核验，未确认修改完成。"; }
    if (!readSuccessfulReceipts(messages, batch)) return "至少一步修改缺少成功回执或执行失败，不能确认完成；请检查当前预览。";
  }
  return `已确认 ${writes.length} 个修改工具返回成功，但不代表复杂需求全部完成。结果仍在预览中，请检查并确认应用。`;
}
