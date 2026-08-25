import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession } from "./agent-session";
import { response } from "./agent-session-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession transport and run control", () => {
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
