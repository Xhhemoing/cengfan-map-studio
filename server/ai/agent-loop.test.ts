// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemMessage, digestFingerprint, hasToolResultInCurrentTask, runAgentTurn, runLocalAgentTurn, MAX_READ_ONLY_STREAK, MAX_TOOL_REJECTIONS, MAX_TURNS } from "./agent-loop";
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

  it("keeps the projection skeleton in the digest message when the caller says it did not change", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    const history: ChatMessage[] = [
      { role: "user", content: "地图小一点" },
      calls(["check_health", {}]),
      { role: "tool", tool_call_id: "call-0", content: "{\"ok\":true}" },
    ];
    const digest = {
      layer: "core",
      map: { scale: 1 },
      layout: { mapContentBounds: { x: 10, y: 20, width: 300, height: 400 }, cardBlocks: [{ province: "北京", id: "b1" }], cardBlockCount: 4 },
      textElements: [{ id: "t1", content: "毕业去向" }],
      textElementCount: 7,
      students: { total: 42, topProvinces: [{ province: "北京", count: 9 }] },
    };
    await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest, messages: history, digestUnchanged: true });

    const noticeIndex = sent.findIndex((message) => message.content?.includes("与上一轮相同"));
    const notice = sent[noticeIndex]?.content ?? "";
    expect(noticeIndex).toBeGreaterThan(-1);
    // digest 消息从不回写 messages，续聊窗口里没有上一轮投影：关键字段必须原地重贴。
    expect(notice).toContain("\"layer\":\"core\"");
    expect(notice).toContain("\"mapContentBounds\"");
    expect(notice).toContain("\"cardBlockCount\":4");
    expect(notice).toContain("\"textElementCount\":7");
    expect(notice).toContain("\"topProvinces\"");
    expect(notice).toContain("\"scale\":1");
    // 省下来的只有明细：三处大数组不重贴，并明说「字段缺失≠没有」。
    expect(notice).not.toContain("毕业去向");
    // 只查 JSON 里的键：说明文字本身就点名了 layout.cardBlocks。
    expect(notice).not.toContain("\"cardBlocks\"");
    expect(notice).toContain("字段缺失不代表");
    expect(notice).toContain("inspect_project");
    // 前缀纪律不变：digest 消息仍夹在 history 与本轮用户消息之间。
    expect(sent.findIndex((message) => message.content === "{\"ok\":true}")).toBeLessThan(noticeIndex);
    expect(sent.at(-1)).toMatchObject({ role: "user", content: "地图小一点" });
  });

  it("emits byte-identical text for an unchanged digest so the prefix stays cacheable", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const messages = (JSON.parse(String(init.body)) as { messages: Array<{ content?: string | null }> }).messages;
      seen.push(messages.find((message) => message.content?.includes("与上一轮相同"))?.content ?? "");
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    const digest = { layer: "core", layout: { mapContentBounds: { x: 0, y: 0, width: 10, height: 10 }, cardBlockCount: 2 }, textElementCount: 3 };
    await runAgentTurn(CONFIG, { userMessage: "继续", digest, messages: [], digestUnchanged: true });
    // 轮次推进、键序抖动都不该改动文本：内容一样就必须逐字节一样。
    await runAgentTurn(CONFIG, {
      userMessage: "继续",
      digest: { textElementCount: 3, layout: { cardBlockCount: 2, mapContentBounds: { height: 10, width: 10, y: 0, x: 0 } }, layer: "core" },
      messages: [{ role: "user", content: "继续" }, calls(["check_health", {}]), { role: "tool", tool_call_id: "call-0", content: "{\"ok\":true}" }],
      digestUnchanged: true,
    });

    expect(seen[0]).not.toBe("");
    expect(seen[1]).toBe(seen[0]);
  });

  it("still sends the whole digest on the first turn and whenever it changed", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    for (const digestUnchanged of [undefined, false]) {
      await runAgentTurn(CONFIG, { userMessage: "x", digest: { map: { scale: 1 } }, messages: [], digestUnchanged });
      expect(sent.some((message) => message.content?.includes("\"scale\":1"))).toBe(true);
      expect(sent.some((message) => message.content?.includes("与上一轮相同"))).toBe(false);
    }
  });

  it("no longer forces an inspect-then-describe preamble in the system prompt", () => {
    const prompt = String(buildSystemMessage().content);
    expect(prompt).not.toContain("先 inspect_project 读取真实当前值，再 describe_capability");
    expect(prompt).toContain("digest");
    expect(prompt).toContain("inspect_project");
  });

  it("tells the model the digest already carries the rendered layout", () => {
    const prompt = String(buildSystemMessage().content);
    expect(prompt).toContain("layout.mapContentBounds");
    expect(prompt).toContain("layout.cardBlocks");
  });

  it("tells the model that the core layer trimmed the detail and needs inspect_project", () => {
    const prompt = String(buildSystemMessage().content);
    expect(prompt).toContain("digest.layer");
    expect(prompt).toContain("layer=\"core\"");
    expect(prompt).toContain("layout.cardBlockCount");
    // 「空数组不代表没有」必须和 inspect_project 一起出现，否则模型仍会把裁空当成没有。
    expect(prompt).toContain("空数组不代表");
    expect(prompt).toContain("inspect_project");
  });

  it("marks the core layer in the digest message on both the full and the short form", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    const coreDigest = { layer: "core", layout: { mapContentBounds: { x: 0, y: 0, width: 10, height: 10 }, cardBlocks: [], cardBlockCount: 4 }, textElements: [], textElementCount: 7 };

    for (const digestUnchanged of [false, true]) {
      await runAgentTurn(CONFIG, { userMessage: "继续", digest: coreDigest, messages: [], digestUnchanged });
      const note = sent.find((message) => message.content?.includes("layer=core"));
      expect(note?.content).toContain("layout.cardBlockCount");
      expect(note?.content).toContain("inspect_project");
    }
  });

  it("keeps the core-layer notice out of full-layer turns", async () => {
    let sent: Array<{ role: string; content?: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent = (JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string | null }> }).messages;
      return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "完成" } }] }) };
    }));
    await runAgentTurn(CONFIG, { userMessage: "继续", digest: { layer: "full", map: { scale: 1 } }, messages: [] });

    expect(sent.some((message) => message.content?.includes("layer=core"))).toBe(false);
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

  it("still brakes when parseAgentRequest appended the user echo after the read-only rounds", async () => {
    stubReply(calls(["inspect_project", { path: "cards.padding" }]));
    // HTTP 路径每轮都会在末尾补一条本轮用户消息的回声，倒序扫描不摘掉它就会立刻 break，只读熔断永不触发。
    const messages: ChatMessage[] = [
      { role: "user", content: "广东有几人" },
      ...readOnlyRounds(MAX_READ_ONLY_STREAK, () => ({ path: "cards.padding" })),
      { role: "user", content: "广东有几人" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "广东有几人", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("无进展");
  });

  it("keeps paging past the echo because each offset is still a different read-only round", async () => {
    stubReply(calls(["query_students", { offset: 250 }]));
    const messages: ChatMessage[] = [
      { role: "user", content: "把所有学生按城市分组" },
      ...readOnlyRounds(5, (index) => ({ offset: index * 50 }), "query_students"),
      { role: "user", content: "把所有学生按城市分组" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "把所有学生按城市分组", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
  });

  it("still calls the model when the user repeats a sentence that stalled on read-only rounds", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    // 末尾这条前面是 assistant 文本收尾，属于用户新提的真起点而非回声，摘掉它会把上一段的空转算进新一轮。
    const messages: ChatMessage[] = [
      { role: "user", content: "广东有几人" },
      ...readOnlyRounds(MAX_READ_ONLY_STREAK, () => ({ path: "cards.padding" })),
      { role: "assistant", content: "连续多轮只读未动手，任务无进展，已交回当前结论。" },
      { role: "user", content: "广东有几人" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "广东有几人", digest: {}, messages });
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

  it("still calls the model when the rejections belong to an earlier task in the same conversation", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    const rejection = JSON.stringify({ code: "PATCH_REJECTED", domain: "map", unknownProps: ["fontSize"], availableProps: ["scale"] });
    const messages: ChatMessage[] = [
      { role: "user", content: "上一个需求" },
      calls(["update_map", { patch: { fontSize: 60 } }]),
      { role: "tool", tool_call_id: "call-0", content: rejection },
      calls(["update_map", { patch: { fontSize: 60 } }]),
      { role: "tool", tool_call_id: "call-0", content: rejection },
      { role: "assistant", content: "参数多次校验失败，已停止继续尝试。" },
      { role: "user", content: "地图小一点" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
  });

  it("still calls the model when the user repeats the same sentence after a rejected task", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    const rejection = JSON.stringify({ code: "PATCH_REJECTED", domain: "map", unknownProps: ["fontSize"], availableProps: ["scale"] });
    // 两轮文字完全相同：段边界取第一条会把上一段的两次拒绝算进新一轮，用户重问一次就再也调不动模型。
    const messages: ChatMessage[] = [
      { role: "user", content: "地图小一点" },
      ...Array.from({ length: MAX_TOOL_REJECTIONS }, () => [
        calls(["update_map", { patch: { fontSize: 60 } }]),
        { role: "tool" as const, tool_call_id: "call-0", content: rejection },
      ]).flat(),
      { role: "assistant", content: "工具参数多次校验失败，已停止继续尝试。" },
      { role: "user", content: "地图小一点" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
  });

  it("still counts rejections before the echo parseAgentRequest appends mid-task", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    const rejection = JSON.stringify({ code: "PATCH_REJECTED", domain: "map", unknownProps: ["fontSize"], availableProps: ["scale"] });
    // 段内轮次里末尾那条用户消息是 parseAgentRequest 补写的回声（前一条是 tool 结果），
    // 拿它当段起点会让段内计数恒为 0，两次拒绝的硬闸就失效了。
    const messages: ChatMessage[] = [
      { role: "user", content: "地图小一点" },
      ...Array.from({ length: MAX_TOOL_REJECTIONS }, () => [
        calls(["update_map", { patch: { fontSize: 60 } }]),
        { role: "tool" as const, tool_call_id: "call-0", content: rejection },
      ]).flat(),
      { role: "user", content: "地图小一点" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("多次校验失败");
  });

  it("still stops after MAX_TOOL_REJECTIONS rejections inside the current task segment", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    const rejection = JSON.stringify({ code: "PATCH_REJECTED", domain: "map", unknownProps: ["fontSize"], availableProps: ["scale"] });
    const messages: ChatMessage[] = [
      { role: "user", content: "地图小一点" },
      ...Array.from({ length: MAX_TOOL_REJECTIONS }, () => [
        calls(["update_map", { patch: { fontSize: 60 } }]),
        { role: "tool" as const, tool_call_id: "call-0", content: rejection },
      ]).flat(),
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("多次校验失败");
  });

  it("stops at the turn limit", async () => {
    const messages: ChatMessage[] = Array.from({ length: MAX_TURNS }, () => calls(["update_map", { patch: { width: 1 } }]));
    const outcome = await runAgentTurn(CONFIG, { userMessage: "x", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
  });

  it("still stops at the turn limit inside one task segment that carries the echo", async () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "重排整版" },
      ...Array.from({ length: MAX_TURNS }, () => [
        calls(["update_map", { patch: { width: 1 } }]),
        { role: "tool" as const, tool_call_id: "call-0", content: "{}" },
      ]).flat(),
      { role: "user", content: "重排整版" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "重排整版", digest: {}, messages });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("轮上限");
  });

  it("still calls the model when the turns belong to an earlier task in the same conversation", async () => {
    stubReply(calls(["update_map", { patch: { scale: 0.85 } }]));
    // 上一段用满轮次不该让续聊的第一句在不调模型的情况下直接被判上限。
    const messages: ChatMessage[] = [
      { role: "user", content: "重排整版" },
      ...Array.from({ length: MAX_TURNS }, () => [
        calls(["update_map", { patch: { width: 1 } }]),
        { role: "tool" as const, tool_call_id: "call-0", content: "{}" },
      ]).flat(),
      { role: "assistant", content: "已达轮次上限，先交付已完成的部分。" },
      { role: "user", content: "地图小一点" },
    ];
    const outcome = await runAgentTurn(CONFIG, { userMessage: "地图小一点", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
  });
});

describe("digestFingerprint", () => {
  it("ignores key order but reacts to any value change", () => {
    const digest = { map: { scale: 1, width: 640 }, students: { total: 3 } };
    const reordered = { students: { total: 3 }, map: { width: 640, scale: 1 } };
    expect(digestFingerprint(digest)).toBe(digestFingerprint(reordered));
    expect(digestFingerprint({ ...digest, map: { scale: 0.85, width: 640 } })).not.toBe(digestFingerprint(digest));
    expect(digestFingerprint(undefined)).toBe(digestFingerprint({}));
  });

  it("keeps array order significant", () => {
    expect(digestFingerprint({ topProvinces: ["粤", "浙"] })).not.toBe(digestFingerprint({ topProvinces: ["浙", "粤"] }));
  });
});

/** 本地兜底会直接产出工具调用，误判就是改画布，因此意图必须和只读预路由一样严格。 */
describe("runLocalAgentTurn", () => {
  function localCalls(userMessage: string, digest: Record<string, unknown> = {}) {
    const outcome = runLocalAgentTurn({ userMessage, digest, messages: [] });
    return outcome.kind === "tool-call" ? outcome.calls : [];
  }

  it.each([
    ["按城市分组", "city"],
    ["按照城市来分组", "city"],
    ["帮我把所有学生按城市分组", "city"],
    ["城市分组", "city"],
    ["城市视图", "city"],
    ["切换到城市视图", "city"],
    ["城市视图切换一下", "city"],
    ["按大学分组", "university"],
    ["按院校归类", "university"],
    ["切换到大学视图", "university"],
  ])("把「%s」识别为 %s 视图", (message, view) => {
    expect(localCalls(message)).toEqual([{ id: expect.any(String), name: "set_data_view", arguments: { view } }]);
  });

  it("不再把「把城市字号调大」切成城市视图", () => {
    const outcome = runLocalAgentTurn({ userMessage: "把城市字号调大", digest: {}, messages: [] });
    expect(outcome.kind).toBe("finish");
    if (outcome.kind === "finish") expect(outcome.summary).toContain("字号");
  });

  it.each([
    "把城市字号调大",
    "城市卡片的颜色换成蓝色",
    "把大学名字的字体改一下",
    "城市太多了",
    "广东有几人",
    "这些城市该怎么排版",
    "把地图上的城市字号调小",
  ])("含样式属性或非切换意图的「%s」不产出 set_data_view", (message) => {
    expect(localCalls(message, { map: { scale: 1 } }).filter((call) => call.name === "set_data_view")).toEqual([]);
  });

  it("保留地图缩放与紧凑预设兜底", () => {
    expect(localCalls("把地图缩小一点", { map: { scale: 1 } })).toEqual([
      { id: "local-map", name: "update_map", arguments: { patch: { scale: 0.85 } } },
    ]);
    expect(localCalls("地图放大", { map: { scale: 2 } })).toEqual([
      { id: "local-map", name: "update_map", arguments: { patch: { scale: 2.3 } } },
    ]);
    expect(localCalls("生成一版更紧凑的布局")).toEqual([
      { id: "local-cards", name: "update_cards", arguments: { patch: { preset: "compact", compactLayout: true } } },
    ]);
  });

  it("已有工具往返时只收尾，不再追加本地规则", () => {
    const outcome = runLocalAgentTurn({
      userMessage: "按城市分组",
      digest: {},
      messages: [calls(["set_data_view", { view: "city" }]), { role: "tool", tool_call_id: "call-0", content: "{}" }],
    });
    expect(outcome.kind).toBe("finish");
  });

  it("段内工具往返才算数：上一段的工具结果不该让新一句直接收尾", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "把地图缩小" },
      calls(["update_map", { patch: { scale: 0.85 } }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      { role: "assistant", content: "已把地图缩小。" },
      { role: "user", content: "按城市分组" },
    ];
    const outcome = runLocalAgentTurn({ userMessage: "按城市分组", digest: {}, messages });
    expect(outcome.kind).toBe("tool-call");
    if (outcome.kind === "tool-call") expect(outcome.calls[0]).toMatchObject({ name: "set_data_view", arguments: { view: "city" } });
  });

  it("续跑回声不影响段边界：同一句话的工具往返仍然只收尾", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "按城市分组" },
      calls(["set_data_view", { view: "city" }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      { role: "user", content: "按城市分组" },
    ];
    expect(runLocalAgentTurn({ userMessage: "按城市分组", digest: {}, messages }).kind).toBe("finish");
  });
});

describe("hasToolResultInCurrentTask", () => {
  it("只统计当前任务段内的工具结果", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "把地图缩小" },
      calls(["update_map", { patch: { scale: 0.85 } }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
      { role: "assistant", content: "已把地图缩小。" },
      { role: "user", content: "按城市分组" },
    ];
    expect(hasToolResultInCurrentTask(history, "按城市分组")).toBe(false);
    expect(hasToolResultInCurrentTask(history, "把地图缩小")).toBe(true);
  });

  it("段边界找不到时退回全量口径", () => {
    const history: ChatMessage[] = [
      calls(["update_map", { patch: { scale: 0.85 } }]),
      { role: "tool", tool_call_id: "call-0", content: "{}" },
    ];
    expect(hasToolResultInCurrentTask(history, "无法匹配的用户消息")).toBe(true);
  });
});
