import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { buildCardFacts } from "./render-facts";
import { AgentSession, compactAgentToolResult, type AgentSessionSnapshot } from "./agent-session";

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession", () => {
  it("exports only replay data and restores it by replaying on the current project", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "snapshot-step", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const source = new AgentSession(project, { mode: "conservative" });
    await source.run("调整地图");

    const snapshot = source.exportSnapshot();
    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    expect(snapshot).not.toHaveProperty("shadowProject");
    expect(snapshot).not.toHaveProperty("budget");
    expect(snapshot).not.toHaveProperty("taskId");
    expect(snapshot).not.toHaveProperty("budgetReceipt");
    expect(snapshot.conversation).toEqual([{ role: "user", content: "调整地图" }]);
    expect(snapshot.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(snapshot.steps[0]).not.toHaveProperty("result");
    expect(restored.shadowProject.map.width).toBe(640);
    expect(restored.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(restored.canContinue).toBe(true);
    expect(() => AgentSession.restore(project, { ...snapshot, schemaVersion: 3 } as unknown as AgentSessionSnapshot, { mode: "conservative" })).toThrow();
  });

  it("does not restore active execution state", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = () => resolve(response({ kind: "finish", summary: "完成" })); })));
    const source = new AgentSession(project, { mode: "conservative" });
    const running = source.run("执行");
    const snapshot = source.exportSnapshot();
    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    release();
    await running;
    expect(restored.canContinue).toBe(false);
    expect(restored.steps).toEqual([]);
  });

  it.each([
    { rounds: -1 },
    { rounds: 1.5 },
    { usedTokens: -1 },
    { usedTokens: 1.5 },
  ])("rejects invalid metric values in a snapshot: %o", (metrics) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    expect(() => AgentSession.restore(project, { ...snapshot, metrics: { ...snapshot.metrics, ...metrics } }, { mode: "conservative" })).toThrow();
  });

  it("executes scene tools on a shadow copy", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "地图已缩小" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("地图小一点");
    expect(outcome.kind).toBe("finish");
    expect(session.shadowProject.map.width).toBe(640);
    expect(project.map.width).not.toBe(640);
    expect(session.landingPreview().needsConfirmation).toBe(true);
    const applied = session.transaction().apply(project);
    expect(applied.map.width).toBe(640);
    expect(applied.history).toEqual(project.history);
  });

  it("builds a selected-step transaction without applying deselected writes", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const originalFontSize = project.cards.fontSize;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-cards", name: "update_cards", arguments: { patch: { fontSize: originalFontSize + 4 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图和卡片");

    const transaction = session.transactionForSteps(new Set(["call-map"]));
    expect(transaction).not.toBeNull();
    const changed = transaction!.apply(project);
    expect(changed.map.scale).toBe(0.9);
    expect(changed.cards.fontSize).toBe(originalFontSize);
  });

  it("replays selected writes onto the current project without overwriting other fields", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    const current = {
      ...project,
      cards: { ...project.cards, fontSize: project.cards.fontSize + 6 },
    };
    const transaction = session.transactionForSteps(new Set(["call-map"]));

    expect(transaction).not.toBeNull();
    const changed = transaction!.apply(current);
    expect(changed.map.scale).toBe(0.9);
    expect(changed.cards.fontSize).toBe(current.cards.fontSize);
  });

  it("preserves a manual edit to a different student when the AI confirms an update_fact", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true },
        { id: "B", name: "乙", university: "大学", city: "北京", province: "北京", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把甲同学的城市改到深圳");

    const current = {
      ...project,
      students: project.students.map((student) => student.id === "B" ? { ...student, name: "乙改" } : student),
    };
    const transaction = session.transactionForSteps(new Set(["call-fact"]));

    expect(transaction).not.toBeNull();
    const applied = transaction!.apply(current);
    expect(applied.students).toHaveLength(2);
    expect(applied.students.find((student) => student.id === "A")?.city).toBe("深圳");
    expect(applied.students.find((student) => student.id === "B")?.name).toBe("乙改");
    expect(current.students.find((student) => student.id === "A")?.city).toBe("广州");
  });

  it("returns no selected-step transaction for an empty selection", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    expect(session.transactionForSteps(new Set())).toBeNull();
  });

  it("replays selected steps in session order rather than Set insertion order", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-first", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-second", name: "update_map", arguments: { patch: { scale: 0.8 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    const transaction = session.transactionForSteps(new Set(["call-second", "call-first"]));
    expect(transaction).not.toBeNull();
    expect(transaction!.apply(project).map.scale).toBe(0.8);
  });

  it("passes an abort signal and cancel preserves preview without committing", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const session = new AgentSession(project, { mode: "conservative" });
    const running = session.run("地图小一点");
    session.cancel();
    const outcome = await running;
    expect(signal?.aborted).toBe(true);
    expect(outcome.kind).toBe("cancelled");
    expect(session.steps).toHaveLength(0);
  });

  it("returns cancelled without fetching when the external signal is already aborted", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const outcome = await new AgentSession(project, { mode: "conservative" }).run("地图小一点", { signal: controller.signal });

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("compacts large tool results before sending them back to the server", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");
    const request = JSON.parse(String((fetchMock.mock.calls[1] as unknown[])[1] && ((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body));
    const toolMessage = request.messages.find((message: { role: string }) => message.role === "tool");
    expect(JSON.stringify(toolMessage).length).toBeLessThanOrEqual(16 * 1024);
    expect(toolMessage.content).not.toContain("placements");
  });

  it("always returns valid JSON within the UTF-8 tool-result budget", () => {
    const compacted = compactAgentToolResult("generic", JSON.stringify({ text: "界".repeat(20000) }));
    expect(() => JSON.parse(compacted)).not.toThrow();
    expect(new TextEncoder().encode(compacted).byteLength).toBeLessThanOrEqual(16 * 1024);
    const invalid = compactAgentToolResult("generic", "not json");
    expect(() => JSON.parse(invalid)).not.toThrow();
    expect(new TextEncoder().encode(invalid).byteLength).toBeLessThanOrEqual(16 * 1024);
  });

  it.each([
    [429, "请求过于频繁，请稍后重试。"],
    [400, "请求内容未通过校验"],
    [502, "AI 服务暂时不可用"],
    [503, "AI 服务暂时不可用"],
  ])("maps structured HTTP %s errors to actionable Chinese text", async (status, expected) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: { code: status === 400 ? "AI_VALIDATION_ERROR" : status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM_UNAVAILABLE", message: "结构化错误" } }) }));
    const session = new AgentSession(project, { mode: "conservative" });
    await expect(session.run("地图小一点")).resolves.toMatchObject({ kind: "failed", error: expect.stringContaining(expected) });
  });

  it("aborts a hung round after the client timeout", async () => {
    vi.useFakeTimers();
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const session = new AgentSession(project, { mode: "conservative" });
    const running = session.run("地图小一点");
    await vi.runOnlyPendingTimersAsync();
    await expect(running).resolves.toMatchObject({ kind: "failed", error: "AI 请求超时，请稍后重试。" });
  });

  it("does not append orphan tool messages after a server-side tool rejection", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-rejected", error: "工具无效", assistantMessage: { role: "assistant", content: "模型工具调用未通过校验" } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已纠正" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
    const request = JSON.parse(String((fetchMock.mock.calls[1] as unknown[])[1] && ((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body));
    expect(request.messages.some((entry: { role: string }) => entry.role === "tool")).toBe(false);
    expect(request.messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("compacts a 13-round conversation without isolating tools and keeps four complete recent groups", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      if (fetchMock.mock.calls.length <= 13) return response({ kind: "tool-call", calls: [{ id: `round-${fetchMock.mock.calls.length}`, name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `round-${fetchMock.mock.calls.length}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      const ids = body.messages.filter((entry) => entry.role === "assistant" && entry.tool_calls).flatMap((entry) => entry.tool_calls!.map((call) => call.id));
      expect(ids).toEqual(expect.arrayContaining(["round-10", "round-11", "round-12", "round-13"]));
      for (let index = 0; index < body.messages.length; index += 1) if (body.messages[index]?.role === "tool") expect(body.messages[index - 1]?.role).toBe("assistant");
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new AgentSession(project, { mode: "conservative" }).run("继续");
  });

  it("compacts older conversation entries before exceeding the history cap", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      const callNumber = fetchMock.mock.calls.length;
      if (callNumber < 13) return response({ kind: "tool-call", calls: [{ id: `c${callNumber}`, name: "update_map", arguments: { patch: { width: 640 + callNumber } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `c${callNumber}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      expect(body.messages.length).toBeLessThanOrEqual(24);
      expect(body.messages.some((message) => message.content?.includes("会话摘要"))).toBe(true);
      expect(body.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "c12"))).toBe(true);
      for (let index = 0; index < body.messages.length; index += 1) {
        const message = body.messages[index];
        if (message.role !== "tool") continue;
        expect(body.messages[index - 1]?.role).toBe("assistant");
        expect(body.messages[index - 1]?.tool_calls?.some((call) => call.id === message.tool_call_id)).toBe(true);
      }
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
  });

  it("compacts a long user-only continuation history and keeps at most 24 messages", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string }> };
      expect(body.messages.length).toBeLessThanOrEqual(24);
      if (fetchMock.mock.calls.length <= 81) return response({ kind: "finish", summary: "本轮完成" });
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("第 1 次");
    for (let index = 2; index <= 81; index += 1) await session.continue(`第 ${index} 次`);

    const lastRequest = JSON.parse(String((fetchMock.mock.calls.at(-1) as unknown[])[1] && ((fetchMock.mock.calls.at(-1) as unknown[])[1] as RequestInit).body)) as { messages: Array<{ role: string; content?: string }> };
    expect(lastRequest.messages).toHaveLength(24);
    expect(lastRequest.messages.some((message) => message.content?.includes("会话摘要"))).toBe(true);
    expect(lastRequest.messages.filter((message) => message.role === "user").length).toBeGreaterThan(0);
  });

  it("keeps the latest complete assistant/tool group when compacting history", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      const callNumber = fetchMock.mock.calls.length;
      if (callNumber <= 12) {
        return response({ kind: "tool-call", calls: [{ id: `group-${callNumber}`, name: "update_map", arguments: { patch: { width: 640 + callNumber } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `group-${callNumber}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      }
      const assistantIndex = body.messages.findIndex((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "group-12"));
      expect(body.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "group-11"))).toBe(true);
      expect(assistantIndex).toBeGreaterThan(-1);
      expect(body.messages[assistantIndex + 1]).toMatchObject({ role: "tool", tool_call_id: "group-12" });
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
  });

  it("rejects empty, non-string, null, and overlong client-side update_fact values", async () => {
    for (const value of ["", "   ", 1, {}, null, "a".repeat(201)]) {
      const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: value } } }], assistantMessage: { role: "assistant", content: null } }))
        .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
      const session = new AgentSession(project, { mode: "conservative" });
      await session.run("修改事实");
      expect(session.shadowProject.students[0]?.city).toBe("广州");
      expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
    }
  });

  it("rejects client-side update_fact fields and does not mutate the shadow", async () => {
    const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { province: "北京" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("修改事实");
    expect(session.shadowProject.students[0]?.province).toBe("广东");
    expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
  });

  it.each([
    { tool: "update_text", args: { id: "text-missing", patch: { content: "新标题" } } },
    { tool: "update_asset", args: { id: "asset-missing", patch: { x: 10 } } },
  ])("rejects a hallucinated $tool target without touching the shadow", async ({ tool, args }) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: tool, arguments: args }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("改一个不存在的元素");

    expect(session.steps[0]?.result.ok).toBe(false);
    expect(session.steps[0]?.result.content).toContain("TARGET_NOT_FOUND");
    expect(session.steps[0]?.result.content).toContain("availableIds");
    expect(session.shadowProject.textElements).toEqual(project.textElements);
    expect(session.shadowProject.assetElements).toEqual(project.assetElements);
  });

  it("rejects an unknown province instead of writing an unrenderable province style", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_province", arguments: { province: "梦游省", patch: { fill: "#ff0000" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把梦游省涂红");

    expect(session.steps[0]?.result.ok).toBe(false);
    expect(session.steps[0]?.result.content).toContain("availableProvinces");
    expect(session.shadowProject.map.provinceStyles?.["梦游省"]).toBeUndefined();
  });

  it("writes a province style under its canonical map name", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_province", arguments: { province: "广东", patch: { fill: "#ff0000" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把广东涂红");

    expect(session.steps[0]?.result.ok).toBe(true);
    expect(session.shadowProject.map.provinceStyles?.["广东省"]?.fill).toBe("#ff0000");
  });

  it("reads scene values that the digest does not project", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const source = { ...project, cards: { ...project.cards, padding: 17, connectorColor: "#123456" } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "c1", name: "inspect_project", arguments: { path: "cards.padding" } },
        { id: "c2", name: "inspect_project", arguments: { path: "cards.connectorColor" } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(source, { mode: "conservative" });
    await session.run("卡片内边距是多少");

    expect(JSON.parse(session.steps[0]!.result.content)).toMatchObject({ ok: true, path: "cards.padding", value: 17 });
    expect(JSON.parse(session.steps[1]!.result.content)).toMatchObject({ value: "#123456" });
  });

  it("keeps binary asset sources out of inspect results", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const source = {
      ...project,
      assetElements: [{
        id: "asset-element-1", assetId: "asset-1", label: "校徽", src: `data:image/png;base64,${"a".repeat(5_000)}`,
        kind: "decoration" as const, x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 30, visibility: true,
      }],
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "inspect_project", arguments: { path: "assetElements.0.src" } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(source, { mode: "conservative" });
    await session.run("看看贴图");

    expect(JSON.parse(session.steps[0]!.result.content).value).toBe("<asset:asset-element-1>");
  });

  it("reports the normalized value that a scene write actually landed on", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { scale: 9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图放到最大");

    expect(session.shadowProject.map.scale).toBe(3);
    expect(JSON.parse(session.steps[0]!.result.content).applied).toEqual({ scale: 3 });
  });

  it("queries students by province or name and keeps duplicate names apart by id", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true },
        { id: "B", name: "张三", university: "深圳大学", city: "深圳", province: "广东省", visibility: true },
        { id: "C", name: "李四", university: "北京大学", city: "北京", province: "北京市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "c1", name: "query_students", arguments: { province: "广东" } },
        { id: "c2", name: "query_students", arguments: { name: "张三" } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("广东有谁");

    const byProvince = JSON.parse(session.steps[0]!.result.content);
    expect(byProvince).toMatchObject({ ok: true, total: 2, offset: 0, limit: 50 });
    expect(byProvince.students.map((student: { id: string }) => student.id)).toEqual(["A", "B"]);
    expect(byProvince.students[0]).toEqual({ id: "A", name: "张三", province: "广东省", city: "广州", university: "中山大学", visibility: true });
    expect(JSON.parse(session.steps[1]!.result.content).students.map((student: { id: string }) => student.id)).toEqual(["A", "B"]);
    expect(session.landingPreview().steps).toHaveLength(0);
  });

  it("derives the province from a new city when the AI rewrites a fact", async () => {
    const project = createProjectDocument({
      students: [{ id: "s1", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: "杭州" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把张三改到杭州");

    expect(session.shadowProject.students[0]).toMatchObject({ city: "杭州", province: "浙江省" });
  });

  it("warns instead of guessing when a new city cannot be resolved to a province", async () => {
    const project = createProjectDocument({
      students: [{ id: "s1", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: "波士顿" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把张三改到波士顿");

    expect(session.shadowProject.students[0]).toMatchObject({ city: "波士顿", province: "广东省" });
    expect(JSON.parse(session.steps[0]!.result.content).warning).toContain("波士顿");
  });

  it.each([
    { grouping: "province" as const, expected: ["广东省", "浙江省"] },
    { grouping: "city" as const, expected: ["广州市", "杭州市"] },
    { grouping: "university" as const, expected: ["中山大学", "浙江大学"] },
  ])("keys $grouping auto_layout positions with the render layer's group ids", async ({ grouping, expected }) => {
    const base = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "中山大学", city: "广州市", visibility: true },
        { id: "s2", name: "李四", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const project: ProjectDocument = { ...base, cards: { ...base.cards, grouping } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: { mode: "quadrant" } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");

    expect(Object.keys(session.shadowProject.cards.positions ?? {}).sort()).toEqual(expected);
  });

  it("lays out with the measured card heights instead of a people-count estimate", async () => {
    const project = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "清华大学", city: "北京市", visibility: true },
        { id: "s3", name: "王五", university: "复旦大学", city: "上海市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");

    const placements = JSON.parse(session.steps[0]!.result.content).samples as Array<{ id: string; height: number }>;
    const rendered = new Map(buildCardFacts(project).map((fact) => [fact.group.key, fact.height]));
    expect(placements).toHaveLength(2);
    for (const placement of placements) expect(placement.height).toBe(rendered.get(placement.id));
  });

  it("reports occlusion and connector conflicts from the rendered geometry", async () => {
    const base = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "中山大学", city: "广州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const facts = buildCardFacts(base);
    const [first, second] = facts;
    const project: ProjectDocument = {
      ...base,
      cards: {
        ...base.cards,
        connectorStyle: "straight",
        positions: {
          [first!.group.key]: { x: second!.anchorX - first!.width / 2, y: second!.anchorY - first!.height / 2 },
          [second!.group.key]: { x: first!.anchorX - second!.width / 2, y: first!.anchorY - second!.height / 2 },
        },
      },
      textElements: [{
        id: "over-map", role: "custom", content: "压在地图上的标题",
        x: base.map.x + base.map.width / 2, y: base.map.y + base.map.height / 2,
        fontSize: 36, color: "#1c3154", fontWeight: 700, textAlign: "center", maxWidth: 420, visibility: true,
      }],
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "check_health", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("检查版面");

    const issues = JSON.parse(session.steps[0]!.result.content).issues as Array<{ id: string; kind: string }>;
    expect(issues.some((issue) => issue.kind === "occlusion" && issue.id === "map:over-map")).toBe(true);
    expect(issues.some((issue) => issue.kind === "connector-conflict")).toBe(true);
  });

  it("rejects concurrent runs and can continue a completed conversation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(response({ kind: "finish", summary: "完成" })); }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const first = session.run("完成");
    await expect(session.run("重复")).rejects.toThrow(/进行中/);
    release();
    await first;
    expect((await session.continue("继续")).kind).toBe("finish");
  });
});
