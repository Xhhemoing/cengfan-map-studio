import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollaborationClientError, subscribeRoom } from "./collaboration-client";
import { FakeEventSource, createTimeline, neverSettles } from "./collaboration-client-test-fixtures";

describe("subscribeRoom reconnect loop", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.EventSource = originalEventSource;
  });

  const liveSources = () => FakeEventSource.instances.filter((instance) => !instance.closed);

  it("mints a fresh ticket and resubscribes at the current version after a stream error", async () => {
    const timeline = createTimeline();
    const createTicket = vi.fn((id: string) => Promise.resolve(`ticket-${FakeEventSource.instances.length}-${id}`));
    let version = 4;
    const onError = vi.fn(() => {
      version = 7;
    });

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
      version: () => version,
      createTicket,
      reconnectDelays: [500, 1_000],
      schedule: timeline.schedule.bind(timeline),
    });

    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    expect(FakeEventSource.instances[0]!.url).toContain("version=4");

    FakeEventSource.instances[0]!.fail();
    // The spent ticket must never be retried by the native EventSource.
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);

    await timeline.runNext();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(2));
    expect(createTicket).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances[1]!.url).toContain("ticket-1-ABC123");
    expect(FakeEventSource.instances[1]!.url).toContain("version=7");
    expect(liveSources()).toHaveLength(1);

    unsubscribe();
    expect(liveSources()).toHaveLength(0);
  });

  it("survives a reconnect storm with one live stream, bounded backoff and no leaked timers", async () => {
    const timeline = createTimeline();
    const createTicket = vi.fn(() => Promise.resolve(`ticket-${FakeEventSource.instances.length}`));

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket,
      reconnectDelays: [500, 1_000, 2_000],
      idleReconnectDelayMs: 9_000,
      schedule: timeline.schedule.bind(timeline),
    });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    for (let round = 0; round < 5; round += 1) {
      const live = liveSources();
      expect(live).toHaveLength(1);
      live[0]!.fail();
      // A late duplicate error from the already-closed stream must not fork a second loop.
      live[0]!.fail();
      expect(timeline.pending.size).toBe(1);
      await timeline.runNext();
      await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(round + 2));
    }

    expect(timeline.delays).toEqual([500, 1_000, 2_000, 9_000, 9_000]);
    expect(FakeEventSource.instances).toHaveLength(6);
    expect(liveSources()).toHaveLength(1);
    expect(createTicket).toHaveBeenCalledTimes(6);
    expect(new Set(FakeEventSource.instances.map((instance) => instance.url)).size).toBe(6);

    unsubscribe();
    expect(liveSources()).toHaveLength(0);
    expect(timeline.pending.size).toBe(0);
  });

  it("restarts the backoff sequence once a stream delivers an event again", async () => {
    const timeline = createTimeline();
    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket: () => Promise.resolve("ticket"),
      reconnectDelays: [500, 1_000, 2_000],
      schedule: timeline.schedule.bind(timeline),
    });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    FakeEventSource.instances[0]!.fail();
    await timeline.runNext();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(2));
    FakeEventSource.instances[1]!.fail();
    await timeline.runNext();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(3));
    expect(timeline.delays).toEqual([500, 1_000]);

    FakeEventSource.instances[2]!.emit("snapshot", { id: "ABC123", version: 2 });
    FakeEventSource.instances[2]!.fail();
    expect(timeline.delays).toEqual([500, 1_000, 500]);

    unsubscribe();
  });

  it("terminates the loop when the room closes while a reconnect is pending", async () => {
    const timeline = createTimeline();
    const onClosed = vi.fn();
    let closed = false;
    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket: () => Promise.resolve("ticket"),
      reconnectDelays: [500],
      shouldReconnect: () => !closed,
      onClosed,
      schedule: timeline.schedule.bind(timeline),
    });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    FakeEventSource.instances[0]!.fail();
    expect(timeline.pending.size).toBe(1);
    // The backfill triggered by the same error reports ROOM_CLOSED while the
    // reconnect is still waiting out its backoff: there is nothing left to join.
    closed = true;
    await timeline.runNext();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(liveSources()).toHaveLength(0);

    unsubscribe();
  });

  it("stops reconnecting after a closed event even when the stream errors afterwards", async () => {
    const timeline = createTimeline();
    const onClosed = vi.fn();
    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket: () => Promise.resolve("ticket"),
      reconnectDelays: [500],
      onClosed,
      schedule: timeline.schedule.bind(timeline),
    });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    FakeEventSource.instances[0]!.emit("closed", { id: "ABC123", version: 3, readonly: true, closed: true });
    expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ closed: true }));
    expect(FakeEventSource.instances[0]!.closed).toBe(true);

    FakeEventSource.instances[0]!.fail();
    expect(timeline.pending.size).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(1);

    unsubscribe();
  });

  it("gives up when the ticket endpoint reports a terminal room error", async () => {
    const timeline = createTimeline();
    const onError = vi.fn();
    const createTicket = vi.fn(() => Promise.reject(new CollaborationClientError("ROOM_NOT_FOUND", "共享房间不存在")));

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
      version: () => 1,
      createTicket,
      reconnectDelays: [500],
      schedule: timeline.schedule.bind(timeline),
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(timeline.pending.size).toBe(0);
    expect(createTicket).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("reports the terminal reason before the stream error so the caller can stop promising a reconnect", async () => {
    const timeline = createTimeline();
    const order: string[] = [];
    const onTerminal = vi.fn(() => order.push("terminal"));
    const onError = vi.fn(() => order.push("error"));

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
      version: () => 1,
      createTicket: () => Promise.reject(new CollaborationClientError("ROOM_NOT_FOUND", "共享房间不存在")),
      reconnectDelays: [500],
      onTerminal,
      schedule: timeline.schedule.bind(timeline),
    });

    await vi.waitFor(() => expect(onTerminal).toHaveBeenCalledWith("ROOM_NOT_FOUND"));
    // 终局先于断流:调用方的补齐随后才启动,不会把终局提示又盖回"正在自动重连"。
    expect(order).toEqual(["terminal", "error"]);
    expect(timeline.pending.size).toBe(0);

    unsubscribe();
  });

  it("keeps a transient ticket failure out of the terminal callback", async () => {
    const timeline = createTimeline();
    const onTerminal = vi.fn();
    const createTicket = vi.fn()
      .mockRejectedValueOnce(new CollaborationClientError("REQUEST_TIMEOUT", "协作服务无响应"))
      .mockResolvedValue("ticket-2");

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket,
      reconnectDelays: [500],
      onTerminal,
      schedule: timeline.schedule.bind(timeline),
    });

    await vi.waitFor(() => expect(timeline.pending.size).toBe(1));
    await timeline.runNext();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    expect(onTerminal).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("recovers from an events-ticket request that never settles", async () => {
    const timeline = createTimeline();
    const onError = vi.fn();
    const signals: (AbortSignal | undefined)[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return neverSettles();
    }) as unknown as typeof fetch;
    try {
      const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        version: () => 1,
        reconnectDelays: [500],
        ticketTimeoutMs: 3_000,
        schedule: timeline.schedule.bind(timeline),
      });

      // 分区期间 ticket 请求永不返回:没有截止时间的话 connect() 会永久挂着,既不报错也不重连。
      await vi.waitFor(() => expect(timeline.pending.size).toBe(1));
      await timeline.runNext();
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
      expect(signals[0]?.aborted).toBe(true);
      expect(timeline.delays).toEqual([3_000, 500]);

      unsubscribe();
      expect(timeline.pending.size).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("aborts an in-flight events-ticket request when the subscription stops", async () => {
    const timeline = createTimeline();
    const onError = vi.fn();
    const signals: (AbortSignal | undefined)[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return neverSettles();
    }) as unknown as typeof fetch;
    try {
      const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        version: () => 1,
        reconnectDelays: [500],
        schedule: timeline.schedule.bind(timeline),
      });
      await vi.waitFor(() => expect(signals).toHaveLength(1));

      unsubscribe();

      expect(signals[0]?.aborted).toBe(true);
      // 取消是调用方主动的:既不上报错误,也不排重连。
      await vi.waitFor(() => expect(timeline.pending.size).toBe(0));
      expect(onError).not.toHaveBeenCalled();
      expect(FakeEventSource.instances).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stops the loop when the caller's abort signal fires", async () => {
    const timeline = createTimeline();
    const controller = new AbortController();
    const createTicket = vi.fn(() => Promise.resolve("ticket"));
    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 1,
      createTicket,
      reconnectDelays: [500],
      signal: controller.signal,
      schedule: timeline.schedule.bind(timeline),
    });
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    controller.abort();

    expect(liveSources()).toHaveLength(0);
    FakeEventSource.instances[0]!.fail();
    expect(timeline.pending.size).toBe(0);
    expect(FakeEventSource.instances).toHaveLength(1);

    unsubscribe();
  });

  it("retries a transient ticket failure with backoff", async () => {
    const timeline = createTimeline();
    const createTicket = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("ticket-2");

    const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
      version: () => 3,
      createTicket,
      reconnectDelays: [500],
      schedule: timeline.schedule.bind(timeline),
    });

    await vi.waitFor(() => expect(timeline.pending.size).toBe(1));
    expect(FakeEventSource.instances).toHaveLength(0);
    await timeline.runNext();
    await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    expect(FakeEventSource.instances[0]!.url).toContain("ticket=ticket-2");

    unsubscribe();
  });
});
