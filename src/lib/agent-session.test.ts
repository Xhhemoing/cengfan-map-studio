import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession, compactAgentToolResult } from "./agent-session";

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession", () => {
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
