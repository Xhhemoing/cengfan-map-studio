// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, MAX_TURNS } from "./agent-loop";
import type { AiConfig } from "./llm-client";
import type { ChatMessage } from "./agent-types";

const CONFIG: AiConfig = {
  apiKey: "key",
  baseUrl: "https://llm.example/v1",
  model: "deepseek-v4-flash",
  timeoutMs: 5_000,
  maxTokens: 4_000,
};

function stubReply(message: ChatMessage) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message }] }),
  })));
}

function calls(...entries: Array<[string, Record<string, unknown>]>) {
  return {
    role: "assistant" as const,
    content: null,
    tool_calls: entries.map(([name, args], index) => ({
      id: `call-${index}`,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) },
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runAgentTurn", () => {
  it("returns parsed and validated tool calls", async () => {
    stubReply(calls(["update_map", { patch: { width: 640, scale: 1.2 } }]));
    const outcome = await runAgentTurn(CONFIG, {
      userMessage: "地图小一点",
      digest: {},
      messages: [{ role: "user", content: "地图小一点" }],
    });
    expect(outcome.kind).toBe("tool-call");
    if (outcome.kind === "tool-call") expect(outcome.calls[0]).toMatchObject({ name: "update_map" });
  });

  it("returns available properties when a patch is invalid", async () => {
    stubReply(calls(["update_map", { patch: { fontSize: 60 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") {
      expect(outcome.error).toContain("fontSize");
      expect(outcome.error).toContain("scale");
    }
  });

  it("rejects cards.positions", async () => {
    stubReply(calls(["update_cards", { patch: { positions: {} } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.error).toContain("positions");
  });

  it("extracts a finish summary", async () => {
    stubReply(calls(["finish", { summary: "完成", lostManualLayout: false }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toBe("完成");
  });

  it("stops after the read-only streak limit", async () => {
    stubReply(calls(["inspect_project", { path: "map.scale" }]));
    const messages: ChatMessage[] = [
      { role: "user", content: "x" },
      calls(["inspect_project", { path: "a" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["describe_capability", { domain: "map" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["check_health", {}]),
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("无进展");
  });

  it("stops at the turn limit", async () => {
    const messages: ChatMessage[] = Array.from({ length: MAX_TURNS }, () => calls(["update_map", { patch: { width: 1 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
  });
});
