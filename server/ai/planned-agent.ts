import { randomUUID } from "node:crypto";
import type { AgentLoopOutcome, AgentLoopRequest } from "./agent-loop";
import type { AgentBudgetState, AiCallMeta, ChatMessage } from "./agent-types";
import { READ_ONLY_TOOLS } from "./tool-registry";
import { chooseReadyStep, checkCancellation, JEV_TOKEN_RESERVE, type JevConfig } from "./jev-decision";
import { generateTaskPlan, type TaskPlannerConfig } from "./task-planner";
import { isCleanHealthReceipt, readSuccessfulReceipts, readySteps, type PendingCall, type TaskPlan } from "./task-plan";

const MARKER = "CENGFAN_PLAN_V1:";
const CHECKPOINT_TTL_MS = 15 * 60_000;
const MAX_CHECKPOINTS = 512;
type PlannedOutcome = AgentLoopOutcome & { budget?: AgentBudgetState; meta?: AiCallMeta };
export type PlannedRequest = AgentLoopRequest & { taskId?: string };
interface Checkpoint {
  goal: string;
  taskId?: string;
  plan?: TaskPlan;
  completed: string[];
  pending: PendingCall[];
  stepId?: string;
  phase: "preflight" | "step" | "health";
  createdAt: number;
}
export interface PlannedAgentConfig extends TaskPlannerConfig { decision?: JevConfig; }

/** In-memory, immutable checkpoints. Expiry/restart fails closed instead of replaying writes. */
export function createPlannedAgent(config: PlannedAgentConfig, now: () => number = Date.now) {
  const checkpoints = new Map<string, Checkpoint>();
  function save(state: Checkpoint): string {
    for (const [key, stored] of checkpoints) if (now() - stored.createdAt >= CHECKPOINT_TTL_MS) checkpoints.delete(key);
    while (checkpoints.size >= MAX_CHECKPOINTS) checkpoints.delete(checkpoints.keys().next().value!);
    const key = randomUUID();
    checkpoints.set(key, state);
    return key;
  }
  return async function run(request: PlannedRequest): Promise<PlannedOutcome> {
    checkCancellation(request.signal);
    const previous = request.budget ?? { rounds: 0, maxRounds: 20, usedTokens: 0, maxTokens: 60_000 };
    const budget = { ...previous, rounds: previous.rounds + 1 };
    let meta: AiCallMeta | undefined;
    const failed = (error: string): PlannedOutcome => ({ kind: "failed", code: "AI_PLAN_BLOCKED", error, budget, meta });
    if (previous.rounds >= previous.maxRounds || previous.usedTokens >= previous.maxTokens) {
      budget.rounds = previous.rounds;
      return failed("已达到任务预算，未完成步骤不会标记为成功；已有预览仍需人工检查。");
    }
    const charge = (tokens: number) => { budget.usedTokens = Math.min(budget.maxTokens, budget.usedTokens + tokens); };
    const emit = (state: Omit<Checkpoint, "createdAt"> & { createdAt?: number }, summary: string): PlannedOutcome => {
      checkCancellation(request.signal);
      const stored: Checkpoint = { ...state, createdAt: state.createdAt ?? now() };
      const key = save(stored);
      const assistantMessage: ChatMessage = {
        role: "assistant", content: `${MARKER}${key}\n${summary}`,
        tool_calls: stored.pending.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
      };
      return { kind: "tool-call", calls: stored.pending, assistantMessage, budget, meta };
    };
    const makeCall = (name: string, args: Record<string, unknown>): PendingCall => ({ id: `plan-${randomUUID()}`, name, arguments: args });
    const lastAssistant = request.messages.findLast((message) => message.role === "assistant");
    if (!lastAssistant) {
      if (request.messages.some((message) => message.role === "tool")) return failed("工具历史没有可验证的计划上下文，请重新开始任务。");
      return emit({ goal: request.userMessage, taskId: request.taskId, completed: [], phase: "preflight", pending: [
        makeCall("inspect_project", { path: "canvas" }), makeCall("inspect_project", { path: "map" }), makeCall("inspect_project", { path: "cards" }),
      ] }, "正在读取画布、地图和卡片的真实状态；尚未修改工程。");
    }
    const key = lastAssistant.content?.match(/^CENGFAN_PLAN_V1:([a-f0-9-]{36})\n/)?.[1];
    const state = key ? checkpoints.get(key) : undefined;
    if (!state || now() - state.createdAt >= CHECKPOINT_TTL_MS || state.goal !== request.userMessage || state.taskId !== request.taskId) return failed("计划检查点已失效、任务不匹配或需求已改变；请保留当前预览并新建任务，不会自动重放修改。");
    const receipts = readSuccessfulReceipts(request.messages, state.pending);
    if (!receipts) return failed("缺少匹配的成功工具回执，或某一步执行失败；已停止后续修改。");
    if (state.phase === "health") {
      if (!isCleanHealthReceipt(receipts[0]!)) return failed("布局检查仍有问题，不能宣称全部完成。请检查已有预览并局部修复。");
      const unsupported = state.plan!.unsupported;
      return { kind: "finish", summary: `已在影子预览中完成 ${state.completed.length} 个计划步骤，并通过最终布局检查。尚未保存、导出或发布，请按现有界面确认应用。${unsupported.length ? ` 未执行：${unsupported.join("；")}` : ""}`, budget };
    }
    let plan = state.plan;
    const completed = new Set(state.completed);
    if (state.phase === "preflight") {
      if (receipts.some((receipt) => !Object.hasOwn(receipt, "value"))) return failed("工程状态读取不完整，未开始规划或写入。");
      const planned = await generateTaskPlan(config, { userMessage: state.goal, digest: request.digest, remainingTokens: budget.maxTokens - budget.usedTokens, requestId: request.requestId, signal: request.signal });
      charge(planned.chargedTokens);
      meta = planned.meta;
      if (!planned.ok) return failed(planned.error);
      plan = planned.plan;
      const hasWrites = plan.steps.some((step) => !READ_ONLY_TOOLS.has(step.tool));
      if (plan.steps.length + (hasWrites ? 2 : 1) > previous.maxRounds - previous.rounds) return failed("剩余轮次不足以执行并验证整个计划；未开始写入，请拆小任务。");
    } else if (state.stepId) completed.add(state.stepId);
    if (!plan) return failed("计划状态不完整，请重新开始任务。");
    if (completed.size === plan.steps.length) {
      if (plan.steps.some((step) => !READ_ONLY_TOOLS.has(step.tool))) return emit({ ...state, plan, completed: [...completed], phase: "health", pending: [makeCall("check_health", {})], stepId: undefined }, "计划步骤已返回成功，正在验证当前影子画布；尚未确认应用。");
      return { kind: "finish", summary: `已完成 ${completed.size} 个只读步骤，没有修改工程。${plan.unsupported.length ? ` 未执行：${plan.unsupported.join("；")}` : ""}`, budget, meta };
    }
    if (budget.usedTokens >= budget.maxTokens) return failed("已达到任务预算，停止后续修改；已有预览不等于任务完成。");
    const ready = readySteps(plan, completed);
    if (!ready.length) return failed("没有就绪步骤，计划已阻塞。");
    const decision = await chooseReadyStep(ready, budget.maxTokens - budget.usedTokens > JEV_TOKEN_RESERVE ? config.decision : undefined, request.signal);
    charge(decision.chargedTokens);
    const next = ready.find((step) => step.id === decision.stepId)!;
    const summary = `计划进度 ${completed.size}/${plan.steps.length}；本步：${next.title}。调度：${decision.source}（${decision.reason}）。\n${plan.steps.map((step) => `${completed.has(step.id) ? "[完成]" : "[待执行]"} ${step.title}`).join("\n")}${plan.unsupported.length ? `\n未支持：${plan.unsupported.join("；")}` : ""}`;
    return emit({ goal: state.goal, taskId: state.taskId, plan, completed: [...completed], phase: "step", stepId: next.id, pending: [makeCall(next.tool, next.arguments)], createdAt: state.createdAt }, summary);
  };
}
