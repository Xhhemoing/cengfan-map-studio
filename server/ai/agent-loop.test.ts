// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemMessage, runAgentTurn, MAX_READ_ONLY_STREAK, MAX_TURNS } from "./agent-loop";
import type { AiConfig } from "./llm-client";
import type { AgentBudgetState, ChatMessage } from "./agent-types";

const CONFIG: AiConfig = {
  apiKey: "key",
  baseUrl: "https://llm.example/v1",
  model: "deepseek-v4-flash",
  timeoutMs: 5_000,
  maxTokens: 4_000,
};

function stubReply(message: ChatMessage, usage?: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message }], usage }),
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

/** 构造 count 个只读回合（assistant tool_calls + tool 结果），第 index 轮的参数由 argsFor 决定。 */
function readOnlyRounds(count: number, argsFor: (index: number) => Record<string, unknown>, name = "inspect_project"): ChatMessage[] {
  return Array.from({ length: count }, (_unused, index) => [
    calls([name, argsFor(index)]),
    { role: "tool" as const, tool_call_id: "call-0", content: "{}" },
  ]).flat();
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

  it("keeps the digest behind the history so the cached prefix stays stable", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    const history: ChatMessage[] = [
      { role: "user", content: "旧需求" },
      calls(["inspect_project", { path: "cards.padding" }]),
      { role: "tool", tool_call_id: "call-0", content: "{\"ok\":true}" },
      { role: "user", content: "地图小一点" },
    ];
    await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: { map: { scale: 1 } }, messages: history });

    const digestIndex = sent.findIndex((message) => message.content?.includes("\"scale\":1"));
    const historyIndexes = ["旧需求", "{\"ok\":true}"].map((content) => sent.findIndex((message) => message.content === content));
    expect(digestIndex).toBeGreaterThan(-1);
    for (const index of historyIndexes) {
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(digestIndex);
    }
    expect(sent.at(-1)).toMatchObject({ role: "user", content: "地图小一点" });
    expect(sent.filter((message) => message.role === "user" && message.content === "地图小一点")).toHaveLength(1);
  });

  it("no longer forces an inspect-then-describe preamble in the system prompt", () => {
    const prompt = String(buildSystemMessage().content);
    expect(prompt).not.toContain("先 inspect_project 读取真实当前值，再 describe_capability");
    expect(prompt).toContain("digest");
    expect(prompt).toContain("inspect_project");
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

  it("stops after repeating the identical read-only call MAX_READ_ONLY_STREAK times", async () => {
    stubReply(calls(["inspect_project", { path: "map.scale" }]));
    const outcome = await runAgentTurn(CONFIG, {
      userMessage: "x",
      digest: {},
      messages: [{ role: "user", content: "x" }, ...readOnlyRounds(MAX_READ_ONLY_STREAK, () => ({ path: "cards.padding" }))],
    });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("无进展");
  });

  it("treats reordered keys and equivalent arguments as the same read-only round", async () => {
    stubReply(calls(["query_students", { province: "广东", offset: 0 }]));
    const messages: ChatMessage[] = [
      { role: "user", content: "x" },
      calls(["query_students", { province: "广东", offset: 0 }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["query_students", { offset: 0, province: "广东" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["query_students", { province: "广东", offset: 0 }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("无进展");
  });

  it("keeps paging through query_students because each offset is a different read-only round", async () => {
    stubReply(calls(["query_students", { offset: 250 }]));
    const outcome = await runAgentTurn(CONFIG, {
      userMessage: "把所有学生按城市分组",
      digest: {},
      messages: [{ role: "user", content: "把所有学生按城市分组" }, ...readOnlyRounds(5, (index) => ({ offset: index * 50 }), "query_students")],
    });
    expect(outcome.kind).toBe("tool-call");
  });

  it("does not brake when consecutive read-only rounds inspect different paths", async () => {
    stubReply(calls(["check_health", {}]));
    const messages: ChatMessage[] = [
      { role: "user", content: "x" },
      calls(["inspect_project", { path: "cards.padding" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["inspect_project", { path: "cards.connectorColor" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      calls(["describe_capability", { domain: "map" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
  });

  it("charges only the fresh prompt tokens so a growing conversation stays linear", async () => {
    const promptTokensPerRound = [1_000, 2_000, 3_000];
    let round = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "继续" } }],
        usage: { prompt_tokens: promptTokensPerRound[round++], completion_tokens: 100, total_tokens: promptTokensPerRound[round - 1]! + 100 },
      }),
    })));
    let budget: AgentBudgetState = { usedTokens: 0, maxTokens: 60_000, rounds: 0, maxRounds: 20 };
    const used: number[] = [];
    for (let index = 0; index < promptTokensPerRound.length; index += 1) {
      const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages: [], budget });
      budget = outcome.kind === "failed" ? budget : outcome.budget!;
      used.push(budget.usedTokens);
    }
    expect(used).toEqual([1_100, 2_200, 3_300]);
    expect(budget.lastPromptTokens).toBe(3_000);
  });

  it("prefers the reported cache miss over the prompt difference", async () => {
    stubReply({ role: "assistant", content: "完成" }, { prompt_tokens: 5_000, completion_tokens: 120, total_tokens: 5_120, prompt_cache_hit_tokens: 4_800, prompt_cache_miss_tokens: 200 });
    const outcome = await runAgentTurn(CONFIG, {
      userMessage: "x",
      digest: {},
      messages: [],
      budget: { usedTokens: 900, maxTokens: 60_000, rounds: 1, maxRounds: 20, lastPromptTokens: 1_000 },
    });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.budget).toMatchObject({ usedTokens: 900 + 120 + 200, lastPromptTokens: 5_000 });
  });

  it("falls back to totalTokens when the upstream reports no prompt or completion split", async () => {
    stubReply({ role: "assistant", content: "完成" }, { total_tokens: 777 });
    const outcome = await runAgentTurn(CONFIG, {
      userMessage: "x",
      digest: {},
      messages: [],
      budget: { usedTokens: 100, maxTokens: 60_000, rounds: 1, maxRounds: 20, lastPromptTokens: 1_000 },
    });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.budget).toMatchObject({ usedTokens: 877, lastPromptTokens: 1_000 });
  });

  it("stops at the turn limit", async () => {
    const messages: ChatMessage[] = Array.from({ length: MAX_TURNS }, () => calls(["update_map", { patch: { width: 1 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
  });
});
