import { isRecord, type ChatMessage } from "./agent-types";
import { READ_ONLY_TOOLS } from "./tool-registry";
import { validatePlannedArguments } from "./capability-catalog";

export const MAX_PLAN_STEPS = 12;
export interface TaskStep {
  id: string;
  title: string;
  tool: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
}
export interface TaskPlan { version: 1; steps: TaskStep[]; unsupported: string[]; }
export type PlanValidation = { ok: true; plan: TaskPlan } | { ok: false; error: string };
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{0,39}$/.test(value);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && Boolean(value.trim()) && value.length <= limit;

export function validateTaskPlan(value: unknown): PlanValidation {
  const fail = (error: string): PlanValidation => ({ ok: false, error });
  if (!isRecord(value) || value.version !== 1 || Object.keys(value).some((key) => !["version", "steps", "unsupported"].includes(key))) return fail("计划版本或字段无效");
  if (!Array.isArray(value.steps) || value.steps.length > MAX_PLAN_STEPS || !Array.isArray(value.unsupported) || value.unsupported.length > 8 || !value.unsupported.every((item) => text(item, 240))) return fail("计划步骤或未支持需求超出限制");
  if (!value.steps.length && !value.unsupported.length) return fail("计划不能为空");
  try { if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16 * 1024) return fail("计划超过 16KiB"); } catch { return fail("计划不能序列化"); }
  const steps: TaskStep[] = [];
  const ids = new Set<string>();
  for (const raw of value.steps) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !["id", "title", "tool", "arguments", "dependsOn"].includes(key)) || !validId(raw.id) || ids.has(raw.id) || !text(raw.title, 120) || typeof raw.tool !== "string" || !isRecord(raw.arguments) || !Array.isArray(raw.dependsOn) || raw.dependsOn.length > MAX_PLAN_STEPS || !raw.dependsOn.every(validId) || new Set(raw.dependsOn).size !== raw.dependsOn.length) return fail("步骤字段或 ID 无效");
    const error = validatePlannedArguments(raw.tool, raw.arguments);
    if (error) return fail(`${raw.id}: ${error}`);
    ids.add(raw.id);
    steps.push({ id: raw.id, title: raw.title, tool: raw.tool, arguments: raw.arguments, dependsOn: [...raw.dependsOn] });
  }
  if (steps.some((step) => step.dependsOn.some((id) => id === step.id || !ids.has(id)))) return fail("存在未知或自引用依赖");
  const ancestors = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  function visit(id: string): Set<string> {
    if (visiting.has(id)) throw new Error("计划存在循环依赖");
    const cached = ancestors.get(id);
    if (cached) return cached;
    visiting.add(id);
    const result = new Set<string>();
    for (const parent of steps.find((step) => step.id === id)!.dependsOn) {
      result.add(parent);
      for (const ancestor of visit(parent)) result.add(ancestor);
    }
    visiting.delete(id);
    ancestors.set(id, result);
    return result;
  }
  try { for (const step of steps) visit(step.id); } catch { return fail("计划存在循环依赖"); }
  // V1 serializes all scene writes. A selector must never choose a different write ordering.
  const writes = steps.filter((step) => !READ_ONLY_TOOLS.has(step.tool));
  for (let i = 0; i < writes.length; i += 1) {
    for (let j = i + 1; j < writes.length; j += 1) {
      if (!ancestors.get(writes[i]!.id)!.has(writes[j]!.id) && !ancestors.get(writes[j]!.id)!.has(writes[i]!.id)) return fail("写步骤必须用依赖明确排序");
    }
  }
  return { ok: true, plan: structuredClone({ version: 1, steps, unsupported: value.unsupported as string[] }) };
}

export function readySteps(plan: TaskPlan, completed: ReadonlySet<string>): TaskStep[] {
  return plan.steps.filter((step) => !completed.has(step.id) && step.dependsOn.every((id) => completed.has(id)));
}

export interface PendingCall { id: string; name: string; arguments: Record<string, unknown>; }
/** Correlate with the exact emitted assistant call; unrelated successes are not evidence. */
export function readSuccessfulReceipts(messages: ChatMessage[], pending: PendingCall[]): Record<string, unknown>[] | null {
  const first = pending[0];
  if (!first) return null;
  const index = messages.findLastIndex((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === first.id));
  const assistant = messages[index];
  if (index < 0 || assistant?.tool_calls?.length !== pending.length) return null;
  const values: Record<string, unknown>[] = [];
  for (const call of pending) {
    const emitted = assistant.tool_calls.find((item) => item.id === call.id);
    if (!emitted || emitted.function.name !== call.name || emitted.function.arguments !== JSON.stringify(call.arguments)) return null;
    const matches = messages.slice(index + 1).filter((message) => message.role === "tool" && message.tool_call_id === call.id);
    if (matches.length !== 1) return null;
    try {
      const result: unknown = JSON.parse(matches[0]!.content ?? "");
      if (!isRecord(result) || result.ok !== true) return null;
      values.push(result);
    } catch { return null; }
  }
  return values;
}

export function isCleanHealthReceipt(value: Record<string, unknown>): boolean {
  return value.ok === true && Array.isArray(value.issues) && value.issues.length === 0 && (value.issueCount === undefined || value.issueCount === 0);
}
