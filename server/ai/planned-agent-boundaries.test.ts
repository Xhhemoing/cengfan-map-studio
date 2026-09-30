// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import * as llm from "./llm-client";
import { generateTaskPlan } from "./task-planner";
import { createPlannedAgent } from "./planned-agent";
import type { ChatMessage } from "./agent-types";

const primary: llm.AiConfig = { apiKey: "test", model: "test", baseUrl: "https://model.example", timeoutMs: 100, maxTokens: 4000 };
afterEach(() => vi.restoreAllMocks());

it("rejects malformed provider tool data and retains conservative accounting", async () => {
  const mock = vi.spyOn(llm, "chatWithTools");
  for (const bad of [{}, { tool_calls: [null] }, { tool_calls: [{}] }, { tool_calls: [{ function: { name: "submit_task_plan", arguments: null } }] }]) {
    mock.mockResolvedValue(bad as ChatMessage);
    const result = await generateTaskPlan({ primary }, { userMessage: "x", digest: {}, remainingTokens: 60000 });
    expect(result.ok).toBe(false);
    expect(result.chargedTokens).toBeGreaterThan(0);
  }
});

it("binds checkpoints to the task used by the signed budget receipt", async () => {
  const run = createPlannedAgent({ primary });
  const req = { userMessage: "x", digest: {}, messages: [] as ChatMessage[], taskId: "task-a" };
  const outcome = await run(req);
  if (outcome.kind !== "tool-call") throw new Error("expected preflight");
  const messages: ChatMessage[] = [outcome.assistantMessage, ...outcome.calls.map((call) => ({ role: "tool" as const, tool_call_id: call.id, content: JSON.stringify({ ok: true, value: {} }) }))];
  const result = await run({ ...req, taskId: "task-b", messages });
  expect(result.kind).toBe("failed");
});
