// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as llm from "./llm-client";
import { createPlannedAgent } from "./planned-agent";
import { createAgentLoopBackend, resolveAgentRuntimeConfig } from "./agent-routing";
import { generateTaskPlan } from "./task-planner";
import type { AgentLoopRequest } from "./agent-loop";
import type { ChatMessage } from "./agent-types";
import type { TaskPlan } from "./task-plan";

const primary: llm.AiConfig = { apiKey: "test-key", baseUrl: "https://model.example/v1", model: "test-model", timeoutMs: 100, maxTokens: 4000 };
const plan: TaskPlan = { version: 1, unsupported: ["实际导出需在交付界面执行"], steps: [
  { id: "view", title: "城市分组", tool: "set_data_view", arguments: { view: "city" }, dependsOn: [] },
  { id: "cards", title: "紧凑卡片", tool: "update_cards", arguments: { preset: "compact" }, dependsOn: ["view"] },
] };
function plannerReply(value: unknown = plan) {
  return { role: "assistant" as const, tool_calls: [{ id: "p1", type: "function" as const, function: { name: "submit_task_plan", arguments: JSON.stringify(value) } }], meta: {
    requestId: "test", provider: "test", model: "test-model", route: "primary" as const, latencyMs: 1, attempts: 1, usage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
  } };
}
function request(): AgentLoopRequest { return { userMessage: "按城市分组，紧凑卡片，最后导出", digest: { canvas: {}, map: {}, cards: {} }, messages: [] }; }
type Runner = ReturnType<typeof createPlannedAgent>;
type Outcome = Awaited<ReturnType<Runner>>;
function consume(req: AgentLoopRequest, outcome: Outcome, result?: Record<string, unknown>, compact = false): AgentLoopRequest {
  if (outcome.kind !== "tool-call") throw new Error(`Expected tools, got ${outcome.kind}`);
  const messages: ChatMessage[] = [outcome.assistantMessage, ...outcome.calls.map((call) => ({ role: "tool" as const, tool_call_id: call.id, content: JSON.stringify(result ?? (call.name === "inspect_project" ? { ok: true, value: {} } : call.name === "check_health" ? { ok: true, issues: [], issueCount: 0 } : { ok: true })) }))];
  return { ...req, budget: outcome.budget, messages: [...(compact ? [] : req.messages), ...messages] };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("planned agent protocol", () => {
  it("inspects, plans, executes dependencies, verifies health, and explicitly hands off export", async () => {
    const model = vi.spyOn(llm, "chatWithTools").mockResolvedValue(plannerReply());
    const run = createPlannedAgent({ primary }); let req = request();
    let outcome = await run(req); expect(outcome.kind).toBe("tool-call"); expect(model).not.toHaveBeenCalled();
    req = consume(req, outcome); outcome = await run(req);
    if (outcome.kind !== "tool-call") throw new Error(JSON.stringify(outcome));
    expect(outcome.calls[0]!.name).toBe("set_data_view");
    req = consume(req, outcome, undefined, true); outcome = await run(req);
    if (outcome.kind !== "tool-call") throw new Error(JSON.stringify(outcome));
    expect(outcome.calls[0]!.name).toBe("update_cards");
    req = consume(req, outcome, undefined, true); outcome = await run(req);
    if (outcome.kind !== "tool-call") throw new Error(JSON.stringify(outcome));
    expect(outcome.calls[0]!.name).toBe("check_health");
    req = consume(req, outcome); outcome = await run(req);
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") { expect(outcome.summary).toContain("未执行"); expect(outcome.summary).toContain("尚未保存"); }
    expect(model).toHaveBeenCalledTimes(1);
    expect(outcome.budget?.rounds).toBe(5);
  });
  it("stops on failed or missing receipts without a second writer", async () => {
    const model = vi.spyOn(llm, "chatWithTools").mockResolvedValue(plannerReply());
    const run = createPlannedAgent({ primary }); let req = request();
    req = consume(req, await run(req)); const write = await run(req);
    expect((await run(consume(req, write, { ok: false }))).kind).toBe("failed");
    if (write.kind !== "tool-call") throw new Error("Expected write");
    expect((await run({ ...req, messages: [...req.messages, write.assistantMessage] })).kind).toBe("failed");
    expect(model).toHaveBeenCalledTimes(1);
  });
  it("fails closed on restart, expiry or changed goals", async () => {
    let clock = 0; const run = createPlannedAgent({ primary }, () => clock); const req = request();
    const next = consume(req, await run(req));
    expect((await createPlannedAgent({ primary })(next)).kind).toBe("failed");
    expect((await run({ ...next, userMessage: "different goal" })).kind).toBe("failed");
    clock = 15 * 60_000;
    expect((await run(next)).kind).toBe("failed");
  });
  it("does not equate a health tool success with a problem-free canvas", async () => {
    vi.spyOn(llm, "chatWithTools").mockResolvedValue(plannerReply());
    const run = createPlannedAgent({ primary }); let req = request();
    for (let i = 0; i < 3; i += 1) req = consume(req, await run(req));
    const health = await run(req);
    expect((await run(consume(req, health, { ok: true, issues: [{ type: "overlap" }], issueCount: 1 }))).kind).toBe("failed");
  });
  it("blocks invalid plans and insufficient remaining rounds before writes", async () => {
    const model = vi.spyOn(llm, "chatWithTools").mockResolvedValue(plannerReply({ ...plan, steps: [{ ...plan.steps[0], tool: "publish" }] }));
    const run = createPlannedAgent({ primary }); const req = request();
    expect((await run(consume(req, await run(req)))).kind).toBe("failed");
    model.mockResolvedValue(plannerReply());
    const next = consume(req, await run(req)); next.budget = { usedTokens: 0, maxTokens: 60000, rounds: 1, maxRounds: 3 };
    expect((await run(next)).kind).toBe("failed");
  });
  it("propagates pre-cancellation and stops at budget without model calls", async () => {
    const model = vi.spyOn(llm, "chatWithTools"); const run = createPlannedAgent({ primary });
    const controller = new AbortController(); controller.abort();
    await expect(run({ ...request(), signal: controller.signal })).rejects.toMatchObject({ code: "AI_ABORTED" });
    expect((await run({ ...request(), budget: { rounds: 20, maxRounds: 20, usedTokens: 0, maxTokens: 60000 } })).kind).toBe("failed");
    expect(model).not.toHaveBeenCalled();
  });
  it("selects a configured fallback only during planning, not during partial execution", async () => {
    const model = vi.spyOn(llm, "chatWithTools").mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(plannerReply());
    const result = await generateTaskPlan({ primary, fallback: { ...primary, model: "fallback-test" } }, { ...request(), remainingTokens: 60000 });
    expect(result.ok).toBe(true); expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1]![0].model).toBe("fallback-test");
    expect(result.chargedTokens).toBeGreaterThan(100);
  });
  it("leaves legacy routing enabled by default and refuses unconfigured planning", async () => {
    expect(resolveAgentRuntimeConfig({}).planning).toBeUndefined();
    vi.spyOn(llm, "chatWithTools").mockResolvedValue({ role: "assistant", content: "只读回答" });
    expect((await createAgentLoopBackend(primary).runTurn(request())).kind).toBe("finish");
    const config = { primary: undefined, planning: true, maxRounds: 20, tokenBudget: 60000, retryMaxAttempts: 1, retryBaseDelayMs: 0 };
    expect((await createAgentLoopBackend(config).runTurn(request())).kind).toBe("failed");
  });
});
