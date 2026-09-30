/// <reference lib="dom" />
// @vitest-environment jsdom
// This cross-boundary test imports browser font/canvas types; production Node modules do not.
import { afterEach, expect, it, vi } from "vitest";
import * as llm from "./llm-client";
import { createPlannedAgent } from "./planned-agent";
import { AgentSession } from "../../src/lib/agent-session";
import { createProjectDocument } from "../../src/lib/project-document";
import type { AgentLoopRequest } from "./agent-loop";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])("executes a shadow plan and requires a clean final health check (blocked=%s)", async (blocked) => {
  // A controlled fictional canvas avoids accepting either outcome from incidental template defects.
  const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const project = { ...base, canvas: { ...base.canvas, width: 2000, height: 2000, safeMargin: 24 },
    map: { ...base.map, x: blocked ? -1000 : 100, y: 100, width: 500, height: 500, scale: 1 },
    cards: { ...base.cards, x: 1000, y: 1000, maxWidth: 300, positions: {} },
    guests: { ...base.guests, visibility: false }, textElements: [], assetElements: [] };
  const originalScale = project.map.scale;
  vi.spyOn(llm, "chatWithTools").mockResolvedValue({ role: "assistant", tool_calls: [{ id: "plan", type: "function", function: { name: "submit_task_plan", arguments: JSON.stringify({ version: 1, unsupported: [], steps: [
    { id: "scale", title: "地图缩小", tool: "update_map", arguments: { scale: 0.8 }, dependsOn: [] },
  ] }) } }] });
  const run = createPlannedAgent({ primary: { apiKey: "test-key", baseUrl: "https://model.example", model: "test", maxTokens: 4000, timeoutMs: 100 } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => ({
    ok: true, status: 200, json: async () => run(JSON.parse(String(init.body)) as AgentLoopRequest),
  })));
  const session = new AgentSession(project, { mode: "smart" });
  const outcome = await session.run("把地图缩小到 0.8，其他内容不变");
  expect(outcome.kind).toBe(blocked ? "failed" : "finish");
  expect(session.shadowProject.map.scale).toBe(0.8);
  expect(project.map.scale).toBe(originalScale);
  expect(session.landingPreview().needsConfirmation).toBe(true);
  const transaction = session.transactionForSteps(new Set(session.landingPreview().steps.filter((step) => step.result.ok).map((step) => step.id)));
  if (blocked) expect(transaction).toBeNull();
  else {
    expect(transaction).not.toBeNull();
    expect(transaction!.apply(project).map.scale).toBe(0.8);
  }
});
