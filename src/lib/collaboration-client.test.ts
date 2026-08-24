import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLLABORATION_GET_RETRY_DELAYS,
  COLLABORATION_REQUEST_TIMEOUT_MS,
  CollaborationClientError,
  createRoom,
  fetchRoom,
  fetchRoomOperations,
  isCollaborationAbortError,
  isCollaborationTransportError,
  isOwnRoomAcknowledgement,
  joinRoom,
  leaveRoom,
  retryInitializingRoom,
  setRoomAccess,
  submitRoomOperations,
  submitRoomSnapshot,
  subscribeRoom,
  type RoomMember,
} from "./collaboration-client";

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("collaboration client", () => {
  it("creates and reads rooms through the typed API", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0, snapshot: { project: 1 } }, access: { accessToken: "owner-token" } }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 } }));
    await expect(createRoom({ clientId: "c1", displayName: "创建者", snapshot: { project: 1 }, request })).resolves.toMatchObject({ room: { id: "ABC123" } });
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.toMatchObject({ id: "ABC123" });
    expect(request).toHaveBeenLastCalledWith("/api/rooms/ABC123", expect.objectContaining({
      headers: { "X-Cengfan-Room-Token": "owner-token" },
    }));
  });

  it("carries the additive persistence flag out of create, join and snapshot responses", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: false }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: false }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 }, persistedAtLastFlush: false }));

    const created = await createRoom({ clientId: "c1", displayName: "创建者", request });
    const joined = await joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request });
    const room = await fetchRoom("abc123", "member-token", request);

    // 兄弟字段(不在 room 里面)与快照上的房间字段是两处不同的位置,两处都要落到调用方手上。
    expect(created.persistedAtLastFlush).toBe(false);
    expect(joined.persistedAtLastFlush).toBe(false);
    expect(room.persistedAtLastFlush).toBe(false);
  });

  it("reports a healthy room as persisted and stays silent when the server says nothing", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: true }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: true }))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" } }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0 }));

    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.toMatchObject({ persistedAtLastFlush: true });
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.toMatchObject({ persistedAtLastFlush: true });
    // 旧服务端不带这个字段:必须是"没有说法",而不是任何一种说法。
    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
  });

  it("only trusts a JSON boolean for the persistence flag", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "owner-token" }, persistedAtLastFlush: "false" }, 201))
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0 }, access: { accessToken: "member-token" }, persistedAtLastFlush: null }, 200))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: "true" }))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, persistedAtLastFlush: 0 }));

    // 字符串 "false" 是真值,数字 0 是假值:任何一种漏过去,面板都会凭形状变化而不是服务端的判断说话。
    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(joinRoom({ roomId: "abc123", inviteToken: "invite", clientId: "c2", displayName: "成员", request })).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
    await expect(fetchRoom("abc123", "member-token", request)).resolves.not.toHaveProperty("persistedAtLastFlush");
  });

  it("creates an initializing room without serializing an initial snapshot", async () => {
    const request = vi.fn(() => ok({ room: { id: "FAST01", version: 0, ready: false }, access: { accessToken: "owner-token" } }, 201));

    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.toMatchObject({ room: { id: "FAST01", ready: false } });
    expect(request).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      body: JSON.stringify({ clientId: "c1", displayName: "创建者" }),
    }));
  });

  it("surfaces version conflicts with the server version", async () => {
    const request = vi.fn(() => ok({ error: { code: "VERSION_CONFLICT", message: "冲突", currentVersion: 3 } }, 409));
    await expect(submitRoomSnapshot("ABC123", "owner-token", { txId: "tx-1", clientId: "c1", baseVersion: 2, snapshot: {} }, request)).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 3 });
  });

  it("requests a metadata-only acknowledgement for uploaded snapshots", async () => {
    const request = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-2" }));

    await submitRoomSnapshot("ABC123", "owner-token", { txId: "tx-2", clientId: "c1", baseVersion: 1, snapshot: { large: true } }, request);

    expect(request).toHaveBeenCalledWith("/api/rooms/ABC123/transactions", expect.objectContaining({
      headers: { "Content-Type": "application/json", Prefer: "return=minimal", "X-Cengfan-Room-Token": "owner-token" },
    }));
  });

  it("submits incremental operations without serializing a full snapshot", async () => {
    let submittedInit: RequestInit | undefined;
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      submittedInit = init;
      return ok({ id: "ABC123", version: 2, ready: true, updatedBy: "c1", lastTxId: "tx-op" });
    });

    await submitRoomOperations("ABC123", "owner-token", {
      txId: "tx-op",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.2 }],
    }, request);

    expect(JSON.parse(String(submittedInit?.body))).toEqual({
      txId: "tx-op",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["project", "map", "scale"], value: 1.2 }],
    });
    expect(String(submittedInit?.body)).not.toContain("snapshot");
  });

  it("recognizes acknowledgements for the client's pending transaction", () => {
    expect(isOwnRoomAcknowledgement({ updatedBy: "c1", lastTxId: "tx-1" }, "c1", "tx-1")).toBe(true);
    expect(isOwnRoomAcknowledgement({ updatedBy: "c2", lastTxId: "tx-1" }, "c1", "tx-1")).toBe(false);
    expect(isOwnRoomAcknowledgement({ updatedBy: "c1", lastTxId: "tx-2" }, "c1", "tx-1")).toBe(false);
  });

  it("retries an initializing room with bounded backoff", async () => {
    const initializing = new CollaborationClientError("ROOM_INITIALIZING", "上传中");
    const load = vi.fn()
      .mockRejectedValueOnce(initializing)
      .mockRejectedValueOnce(initializing)
      .mockResolvedValue({ id: "FAST01", version: 1, ready: true });
    const wait = vi.fn((_delayMs: number) => Promise.resolve());

    await expect(retryInitializingRoom(load, { delays: [100, 250, 500], wait })).resolves.toMatchObject({ ready: true });
    expect(load).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([100, 250]);
  });

  it("does not retry unrelated room errors", async () => {
    const error = new CollaborationClientError("ROOM_NOT_FOUND", "不存在");
    const load = vi.fn().mockRejectedValue(error);
    const wait = vi.fn((_delayMs: number) => Promise.resolve());

    await expect(retryInitializingRoom(load, { delays: [100, 250], wait })).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("announces a member leaving through the leave endpoint", async () => {
    const request = vi.fn(() => ok({ id: "ABC123", version: 3, members: [{ clientId: "c1", role: "owner", joinedAt: "t0", lastSeenAt: "t1" }] }));

    const result = await leaveRoom("abc123", "owner-token", "c1", request);

    expect(request).toHaveBeenCalledWith("/api/rooms/ABC123/leave", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-Cengfan-Room-Token": "owner-token" }),
      body: JSON.stringify({ clientId: "c1" }),
    }));
    expect(result.members).toHaveLength(1);
  });

  it("sets room access and surfaces owner-only and closed errors", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, readonly: true, closed: false }))
      .mockImplementationOnce(() => ok({ error: { code: "FORBIDDEN", message: "只有创建者" } }, 403))
      .mockImplementationOnce(() => ok({ error: { code: "ROOM_CLOSED", message: "已关闭" } }, 409));

    await expect(setRoomAccess("ABC123", "owner-token", "c1", "set-readonly", request)).resolves.toMatchObject({ readonly: true, closed: false });
    await expect(setRoomAccess("ABC123", "editor-token", "e1", "close", request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setRoomAccess("ABC123", "owner-token", "c1", "close", request)).rejects.toMatchObject({ code: "ROOM_CLOSED" });
    expect(request).toHaveBeenLastCalledWith("/api/rooms/ABC123/access", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ clientId: "c1", action: "close" }),
    }));
  });

  it("fetches incremental operations after a version and maps conflict errors", async () => {
    const operations = [{ type: "set", path: ["title"], value: "乙" }];
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 2, afterVersion: 1, operations }))
      .mockImplementationOnce(() => ok({ error: { code: "VERSION_CONFLICT", message: "历史裁剪", currentVersion: 2 } }, 409))
      .mockImplementationOnce(() => ok({ error: { code: "VALIDATION_ERROR", message: "参数错误" } }, 400));

    await expect(fetchRoomOperations("ABC123", "owner-token", 1, request)).resolves.toMatchObject({ version: 2, afterVersion: 1, operations });
    await expect(fetchRoomOperations("ABC123", "owner-token", 0, request)).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 2 });
    await expect(fetchRoomOperations("ABC123", "owner-token", -1, request)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(request).toHaveBeenNthCalledWith(1, "/api/rooms/ABC123/operations?afterVersion=1", expect.objectContaining({
      headers: expect.objectContaining({ "X-Cengfan-Room-Token": "owner-token" }),
    }));
  });

  it("dispatches members and closed events through subscribeRoom", async () => {
    const original = globalThis.EventSource;
    vi.stubGlobal("EventSource", FakeEventSource);
    try {
      const onSnapshot = vi.fn();
      const onMembers = vi.fn();
      const onClosed = vi.fn();
      const members: RoomMember[] = [{ clientId: "c1", role: "owner", joinedAt: "t0", lastSeenAt: "t1" }];
      const unsubscribe = subscribeRoom("ABC123", "owner-token", onSnapshot, () => {}, {
        version: 2,
        createTicket: (id, token) => Promise.resolve(`ticket-${id}-${token}`),
        onMembers,
        onClosed,
      });

      await vi.waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
      const source = FakeEventSource.instances[0]!;
      expect(source.url).toContain("/api/rooms/ABC123/events?ticket=ticket-ABC123-owner-token");
      expect(source.url).toContain("version=2");

      source.emit("members", members);
      expect(onMembers).toHaveBeenCalledWith(members);

      source.emit("closed", { id: "ABC123", version: 3, readonly: false, closed: true });
      expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ closed: true }));
      expect(source.closed).toBe(true);

      unsubscribe();
    } finally {
      vi.unstubAllGlobals();
      globalThis.EventSource = original;
    }
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  fail(): void {
    this.onerror?.();
  }
}

/** 手动时钟:请求截止与重试退避都走注入的 schedule,延迟序列可断言且不留真实定时器。 */
function createManualClock() {
  const tasks = new Map<number, () => void>();
  let nextId = 0;
  const delays: number[] = [];
  const clock = {
    delays,
    get pending(): number {
      return tasks.size;
    },
    schedule(handler: () => void, delayMs: number): () => void {
      const id = nextId++;
      delays.push(delayMs);
      tasks.set(id, handler);
      return () => {
        tasks.delete(id);
      };
    },
    /** 触发最早排入的定时器(截止时间先于其后的退避排入),模拟"这段时间过去了"。 */
    async fireNext(): Promise<void> {
      const first = tasks.entries().next();
      if (first.done) throw new Error("没有待触发的定时器");
      const [id, handler] = first.value;
      tasks.delete(id);
      handler();
      await Promise.resolve();
    },
  };
  return clock;
}

/** 网络分区:TCP 连上了,响应永远不来。没有截止时间的客户端会永久挂起。 */
const neverSettles = (): Promise<Response> => new Promise<Response>(() => {});

describe("collaboration HTTP partition handling", () => {
  it("rejects a never-settling GET at the abort deadline instead of hanging forever", async () => {
    vi.useFakeTimers();
    try {
      const signals: (AbortSignal | undefined)[] = [];
      const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return neverSettles();
      });

      const pending = fetchRoom("ABC123", "owner-token", request);
      const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(
        (COLLABORATION_GET_RETRY_DELAYS.length + 1) * COLLABORATION_REQUEST_TIMEOUT_MS + 10_000,
      );
      await settled;

      // 有界重试:超时不是无限重连,尝试次数 = 退避序列长度 + 1。
      expect(request).toHaveBeenCalledTimes(COLLABORATION_GET_RETRY_DELAYS.length + 1);
      expect(signals.every((signal) => signal?.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries an idempotent GET with jittered backoff and recovers on the next attempt", async () => {
    const clock = createManualClock();
    let attempts = 0;
    const request = vi.fn(() => {
      attempts += 1;
      return attempts < 3 ? neverSettles() : ok({ id: "ABC123", version: 5, afterVersion: 4, operations: [] });
    });

    const pending = fetchRoomOperations("ABC123", "owner-token", 4, {
      request,
      timeoutMs: 5_000,
      retryDelays: [400, 800],
      random: () => 0.5,
      schedule: clock.schedule,
    });

    await vi.waitFor(() => expect(clock.pending).toBe(1));
    await clock.fireNext();
    // equal jitter:400/2 + 400/2*0.5 = 300。
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300]));
    await clock.fireNext();
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300, 5_000]));
    await clock.fireNext();
    await vi.waitFor(() => expect(clock.delays).toEqual([5_000, 300, 5_000, 600]));
    await clock.fireNext();

    await expect(pending).resolves.toMatchObject({ version: 5, operations: [] });
    expect(request).toHaveBeenCalledTimes(3);
    expect(clock.pending).toBe(0);
  });

  it("keeps every jittered retry delay inside [delay/2, delay]", async () => {
    for (const random of [0, 0.25, 1]) {
      const clock = createManualClock();
      const request = vi.fn(() => neverSettles());
      const pending = fetchRoom("ABC123", "owner-token", {
        request,
        timeoutMs: 1_000,
        retryDelays: [800],
        random: () => random,
        schedule: clock.schedule,
      });
      const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

      await vi.waitFor(() => expect(clock.pending).toBe(1));
      await clock.fireNext();
      await vi.waitFor(() => expect(clock.delays).toHaveLength(2));
      const backoff = clock.delays[1]!;
      expect(backoff).toBeGreaterThanOrEqual(400);
      expect(backoff).toBeLessThanOrEqual(800);
      await clock.fireNext();
      await vi.waitFor(() => expect(clock.pending).toBe(1));
      await clock.fireNext();
      await settled;
      expect(clock.pending).toBe(0);
    }
  });

  it("retries a 503 on an idempotent GET but never a client error", async () => {
    const clock = createManualClock();
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ error: { code: "UPSTREAM", message: "网关错误" } }, 503))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 2, ready: true }));

    const recovered = fetchRoom("ABC123", "owner-token", { request, retryDelays: [300], schedule: clock.schedule });
    await vi.waitFor(() => expect(clock.delays).toHaveLength(2));
    await clock.fireNext();
    await expect(recovered).resolves.toMatchObject({ version: 2 });
    expect(request).toHaveBeenCalledTimes(2);

    const conflicting = vi.fn(() => ok({ error: { code: "VERSION_CONFLICT", message: "历史裁剪", currentVersion: 9 } }, 409));
    await expect(fetchRoomOperations("ABC123", "owner-token", 1, {
      request: conflicting,
      retryDelays: [300],
      schedule: clock.schedule,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 9 });
    expect(conflicting).toHaveBeenCalledTimes(1);
  });

  it("never replays a non-idempotent transaction, but still bounds it by a deadline", async () => {
    const clock = createManualClock();
    const request = vi.fn(() => neverSettles());

    const pending = submitRoomOperations("ABC123", "owner-token", {
      txId: "tx-1",
      clientId: "c1",
      baseVersion: 1,
      operations: [{ type: "set", path: ["title"], value: "甲" }],
    }, { request, timeoutMs: 2_000, schedule: clock.schedule });
    const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });

    await vi.waitFor(() => expect(clock.pending).toBe(1));
    await clock.fireNext();
    await settled;

    expect(request).toHaveBeenCalledTimes(1);
    expect(clock.pending).toBe(0);
  });

  it("honours an external abort signal without retrying and without issuing new requests", async () => {
    const clock = createManualClock();
    const controller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const request = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return neverSettles();
    });

    const pending = fetchRoom("ABC123", "owner-token", {
      request,
      signal: controller.signal,
      retryDelays: [300],
      schedule: clock.schedule,
    });
    const settled = expect(pending).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    controller.abort();
    await settled;
    expect(seen[0]?.aborted).toBe(true);
    expect(clock.pending).toBe(0);

    // 已取消的信号不再发起任何请求。
    await expect(fetchRoom("ABC123", "owner-token", { request, signal: controller.signal }))
      .rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("classifies transport failures apart from protocol failures", async () => {
    const failing = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await fetchRoom("ABC123", "owner-token", { request: failing, retryDelays: [] })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(CollaborationClientError);
    expect(isCollaborationTransportError(error)).toBe(true);
    expect(isCollaborationAbortError(error)).toBe(false);
    expect(isCollaborationTransportError(new CollaborationClientError("ROOM_CLOSED", "已关闭"))).toBe(false);
    expect(isCollaborationAbortError(new CollaborationClientError("REQUEST_ABORTED", "已取消"))).toBe(true);
  });
});

/** Manually driven timers so backoff is observable and leaks are assertable. */
function createTimeline() {
  const pending = new Map<number, { delay: number; handler: () => void }>();
  let nextId = 0;
  return {
    pending,
    delays: [] as number[],
    schedule(handler: () => void, delayMs: number): () => void {
      const id = nextId++;
      this.delays.push(delayMs);
      pending.set(id, { delay: delayMs, handler });
      return () => pending.delete(id);
    },
    async runNext(): Promise<void> {
      const entry = pending.entries().next();
      if (entry.done) return;
      const [id, task] = entry.value;
      pending.delete(id);
      task.handler();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

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
