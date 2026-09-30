// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import * as llm from "./llm-client";
import { createPlannedAgent } from "./planned-agent";
import { AgentSession } from "../../src/lib/agent-session";
import { createProjectDocument } from "../../src/lib/project-document";
import type { AgentLoopRequest } from "./agent-loop";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("executes a real browser shadow edit through the planned protocol without changing the source project", async () => {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const originalScale = project.map.scale;
  vi.spyOn(llm, "chatWithTools").mockResolvedValue({ role: "assistant", tool_calls: [{ id: "plan", type: "function", function: { name: "submit_task_plan", arguments: JSON.stringify({ version: 1, unsupported: [], steps: [
    { id: "scale", title: "地图缩小", tool: "update_map", arguments: { scale: 0.8 }, dependsOn: [] },
  ] }) } }] });
  const run = createPlannedAgent({ primary: { apiKey: "test-key", baseUrl: "https://model.example", model: "test", maxTokens: 4000, timeoutMs: 100 } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true, status: 200, json: async () => run(JSON.parse(String(init.body)) as AgentLoopRequest),
  })));
  const session = new AgentSession(project, { mode: "conservative" });
  const outcome = await session.run("把地图缩小到 0.8，其他内容不变");
  // The real layout checker may report existing layout defects; either way no source commit is allowed.
  expect(["finish", "failed"]).toContain(outcome.kind);
  expect(session.shadowProject.map.scale).toBe(0.8);
  expect(project.map.scale).toBe(originalScale);
  expect(session.landingPreview().needsConfirmation).toBe(true);
  const transaction = session.transactionForSteps(new Set(session.landingPreview().steps.filter((step) => step.result.ok).map((step) => step.id)));
  expect(transaction).not.toBeNull();
  expect(transaction!.apply(project).map.scale).toBe(0.8);
});
