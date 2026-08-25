import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession } from "./agent-session";
import { response, userContents } from "./agent-session-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession conversation history", () => {
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

  it("does not re-append the unanswered request when a transport failure is resumed with the same text", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });

    await expect(session.run("地图小一点")).resolves.toMatchObject({ kind: "failed", reason: "network", retriable: true });
    await expect(session.continue("地图小一点")).resolves.toMatchObject({ kind: "finish" });

    expect(userContents(fetchMock, 1)).toEqual(["地图小一点"]);
    expect(session.exportSnapshot().conversation).toEqual([{ role: "user", content: "地图小一点" }]);
  });

  it("appends a resume text that differs from the unanswered request", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });

    await session.run("地图小一点");
    await expect(session.continue("改成蓝色")).resolves.toMatchObject({ kind: "finish" });

    expect(userContents(fetchMock, 1)).toEqual(["地图小一点", "改成蓝色"]);
  });

  it("appends the same text again when the model already replied to the earlier request", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [], assistantMessage: { role: "assistant", content: "正在规划" } }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });

    await expect(session.run("地图小一点")).resolves.toMatchObject({ kind: "failed", reason: "network" });
    await expect(session.continue("地图小一点")).resolves.toMatchObject({ kind: "finish" });

    expect(userContents(fetchMock, 2)).toEqual(["地图小一点", "地图小一点"]);
  });
});
