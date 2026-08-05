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

  it("normalizes invalid model tool calls into a plain Chinese rejection assistant message", async () => {
    stubReply(calls(["unknown_tool", {}]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") {
      expect(outcome.assistantMessage.tool_calls).toBeUndefined();
      expect(outcome.assistantMessage.content).toContain("工具");
    }
  });

  it("keeps a valid assistant/tool shape when only a scene patch is rejected", async () => {
    stubReply(calls(["update_map", { patch: { fontSize: 60 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.assistantMessage.tool_calls).toHaveLength(1);
  });

  it("rejects duplicate tool call ids in a model response", async () => {
    stubReply({ role: "assistant", content: null, tool_calls: [
      { id: "same", type: "function", function: { name: "check_health", arguments: "{}" } },
      { id: "same", type: "function", function: { name: "find_assets", arguments: "{}" } },
    ] });
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.assistantMessage.tool_calls).toBeUndefined();
  });

  it("rejects oversized, non-object, and data URL tool arguments", async () => {
    for (const raw of ["[]", "x".repeat(16 * 1024 + 1), JSON.stringify({ image: `data:image/png;base64,${"a".repeat(300)}` })]) {
      stubReply({ role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "check_health", arguments: raw } }] });
      const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
      expect(outcome.kind).toBe("tool-rejected");
    }
  });

  it("rejects empty, non-string, null, and overlong manage_students fact values", async () => {
    for (const value of ["", "   ", 1, {}, null, "a".repeat(201)]) {
      stubReply(calls(["manage_students", { action: "update_fact", fields: { city: value } }]));
      const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
      expect(outcome.kind).toBe("tool-rejected");
    }
  });

  it("rejects manage_students facts outside the server whitelist", async () => {
    stubReply(calls(["manage_students", { action: "update_fact", fields: { province: "广东" } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.error).toContain("province");
  });

  it("rejects finish when it is mixed with another tool call", async () => {
    stubReply(calls(["finish", { summary: "完成" }], ["update_map", { patch: { width: 640 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [] });
    expect(outcome.kind).toBe("tool-rejected");
    if (outcome.kind === "tool-rejected") expect(outcome.error).toContain("finish");
  });

  it("sends one server system message and a non-system digest", async () => {
    let sent: Array<{ role: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string }> };
      sent = body.messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    await runAgentTurn(CONFIG, { userMessage: "x", digest: { map: { scale: 1 } }, messages: [] });
    expect(sent.filter((message) => message.role === "system")).toHaveLength(1);
    expect(sent.some((message) => message.role === "user")).toBe(true);
  });

  it("injects the exact user message when the client sends an empty history", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    await runAgentTurn(CONFIG, { userMessage: "新的用户需求", digest: {}, messages: [] });
    expect(sent.filter((message) => message.role === "user" && message.content === "新的用户需求")).toHaveLength(1);
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
