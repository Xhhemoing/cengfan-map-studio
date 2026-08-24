import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentSession } from "./agent-session";

function project() {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** A partitioned network: the request neither settles nor reacts to `signal`, so only a deadline ends it. */
function neverSettlingFetch() {
  return vi.fn(() => new Promise<never>(() => {}));
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  const init = (fetchMock.mock.calls[index] as unknown[] | undefined)?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as { budget: { usedTokens: number; rounds: number }; taskId?: string; budgetReceipt?: string };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession request deadlines", () => {
  it("fails a never-settling request at the deadline and leaves the session retriable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", neverSettlingFetch());
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const running = session.run("地图小一点");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(running).resolves.toEqual({ kind: "failed", error: "AI 请求超时，请稍后重试。", reason: "timeout", retriable: true });
    expect(session.canContinue).toBe(true);
    expect(session.metrics.rounds).toBe(0);
  });

  it("aborts the in-flight request when the deadline fires", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<never>(() => {});
    }));
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const running = session.run("地图小一点");
    await vi.advanceTimersByTimeAsync(1_000);
    await running;

    expect(signal?.aborted).toBe(true);
  });

  it("defaults to a 90s deadline that model calls can use in full", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", neverSettlingFetch());
    const session = new AgentSession(project(), { mode: "conservative" });

    const running = session.run("地图小一点");
    let settled = false;
    void running.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(89_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(running).resolves.toMatchObject({ reason: "timeout" });
  });

  it("keeps the deadline armed while the response body stalls after the headers arrive", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise<never>(() => {}) })));
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const running = session.run("地图小一点");
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(running).resolves.toMatchObject({ kind: "failed", reason: "timeout" });
  });

  it("reports a dropped connection with a network-specific message, not the raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const session = new AgentSession(project(), { mode: "conservative" });

    const outcome = await session.run("地图小一点");

    expect(outcome).toEqual({ kind: "failed", error: "网络连接中断，AI 请求未完成，请检查网络后重试。", reason: "network", retriable: true });
    expect(session.canContinue).toBe(true);
  });

  it("distinguishes a deadline failure from a user cancel", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const session = new AgentSession(project(), { mode: "conservative" });

    const running = session.run("地图小一点");
    session.cancel();

    await expect(running).resolves.toEqual({ kind: "cancelled" });
    expect(session.canContinue).toBe(false);
  });

  it("prefers the user cancel when it races a deadline on a request that ignores abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", neverSettlingFetch());
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const running = session.run("地图小一点");
    session.cancel();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(running).resolves.toEqual({ kind: "cancelled" });
  });

  it("does not mistake a malformed response body for a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token < in JSON"); } })));
    const session = new AgentSession(project(), { mode: "conservative" });

    const outcome = await session.run("地图小一点");

    expect(outcome).toMatchObject({ kind: "failed", error: "Unexpected token < in JSON" });
    expect(outcome).not.toHaveProperty("reason");
  });

  it("resumes after a deadline with the granted budget and task identity intact", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        kind: "tool-call",
        calls: [{ id: "call-inspect", name: "inspect_project", arguments: { path: "map.scale" } }],
        assistantMessage: { role: "assistant", content: null },
        taskId: "task-1",
        budgetReceipt: "receipt-1",
        budget: { usedTokens: 1_200, maxTokens: 60_000, rounds: 1, maxRounds: 20 },
        meta: { usage: { totalTokens: 1_200 } },
      }))
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const running = session.run("地图小一点");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(running).resolves.toMatchObject({ kind: "failed", reason: "timeout" });
    expect(session.metrics.rounds).toBe(1);
    expect(session.metrics.usedTokens).toBe(1_200);

    await expect(session.continue("继续")).resolves.toMatchObject({ kind: "finish" });

    const resumed = requestBody(fetchMock, 2);
    expect(resumed.budget).toMatchObject({ usedTokens: 1_200, rounds: 1 });
    expect(resumed.taskId).toBe("task-1");
    expect(resumed.budgetReceipt).toBe("receipt-1");
  });

  it("clears the retriable flag once a fresh run starts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockImplementationOnce(() => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 1_000 });

    const first = session.run("地图小一点");
    await vi.advanceTimersByTimeAsync(1_000);
    await first;
    expect(session.canContinue).toBe(true);

    const second = session.run("再试一次");
    expect(session.canContinue).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(second).resolves.toMatchObject({ reason: "timeout" });
    expect(session.canContinue).toBe(true);
  });

  it("falls back to the default deadline for a non-positive injected value", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", neverSettlingFetch());
    const session = new AgentSession(project(), { mode: "conservative", requestTimeoutMs: 0 });

    const running = session.run("地图小一点");
    let settled = false;
    void running.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(89_000);
    await expect(running).resolves.toMatchObject({ reason: "timeout" });
  });
});
