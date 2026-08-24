import { describe, expect, it, vi } from "vitest";
import {
  CollaborationClientError,
  createRoom,
  fetchRoom,
  fetchRoomOperations,
  isOwnRoomAcknowledgement,
  leaveRoom,
  retryInitializingRoom,
  setRoomAccess,
  submitRoomOperations,
  submitRoomSnapshot,
  subscribeRoom,
  type RoomMember,
} from "./collaboration-client";

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, handler);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  fail(): void {
    this.onerror?.();
  }
}

/**
 * 可控的看门狗定时器:记录每次排期并由测试手动触发,不用等真实的 40s 心跳窗口。
 * 排期函数返回取消句柄,`pending()` 里应始终最多只有一条(重新计时会先取消旧的)。
 */
function fakeWatchdog() {
  const timers: Array<{ delayMs: number; handler: () => void; cancelled: boolean }> = [];
  const schedule = (handler: () => void, delayMs: number) => {
    const timer = { delayMs, handler, cancelled: false };
    timers.push(timer);
    return () => { timer.cancelled = true; };
  };
  const pending = () => timers.filter((timer) => !timer.cancelled);
  const fire = () => {
    const timer = pending().at(-1);
    if (!timer) throw new Error("没有待触发的看门狗定时器");
    timer.cancelled = true;
    timer.handler();
  };
  return { schedule, pending, fire, timers };
}

/** 用假 EventSource 跑一段订阅逻辑,结束后恢复全局实现。 */
async function withFakeEventSource(run: (instances: FakeEventSource[]) => Promise<void>): Promise<void> {
  const original = globalThis.EventSource;
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  try {
    await run(FakeEventSource.instances);
  } finally {
    vi.unstubAllGlobals();
    globalThis.EventSource = original;
  }
}

describe("collaboration client", () => {
  it("creates and reads rooms through the typed API", async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => ok({ room: { id: "ABC123", version: 0, snapshot: { project: 1 } }, access: { accessToken: "owner-token" } }, 201))
      .mockImplementationOnce(() => ok({ id: "ABC123", version: 0, snapshot: { project: 1 } }));
    await expect(createRoom({ clientId: "c1", displayName: "创建者", snapshot: { project: 1 }, request })).resolves.toMatchObject({ room: { id: "ABC123" } });
    await expect(fetchRoom("abc123", "owner-token", request)).resolves.toMatchObject({ id: "ABC123" });
    expect(request).toHaveBeenLastCalledWith("/api/rooms/ABC123", {
      headers: { "X-Cengfan-Room-Token": "owner-token" },
    });
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
    expect(request).toHaveBeenCalledWith("/api/rooms/ABC123/operations?afterVersion=1", expect.objectContaining({
      headers: expect.objectContaining({ "X-Cengfan-Room-Token": "owner-token" }),
    }));
  });

  it("dispatches members and closed events through subscribeRoom", async () => {
    await withFakeEventSource(async (instances) => {
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

      await vi.waitFor(() => expect(instances.length).toBe(1));
      const source = instances[0]!;
      expect(source.url).toContain("/api/rooms/ABC123/events?ticket=ticket-ABC123-owner-token");
      expect(source.url).toContain("version=2");

      source.emit("members", members);
      expect(onMembers).toHaveBeenCalledWith(members);

      source.emit("closed", { id: "ABC123", version: 3, readonly: false, closed: true });
      expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ closed: true }));
      expect(source.closed).toBe(true);

      unsubscribe();
    });
  });

  it("closes the stream on a kicked event even without a kicked handler", async () => {
    await withFakeEventSource(async (instances) => {
      const onSnapshot = vi.fn();
      const onKicked = vi.fn();
      subscribeRoom("ABC123", "editor-token", onSnapshot, () => {}, {
        createTicket: () => Promise.resolve("ticket-kick"),
        onKicked,
      });
      await vi.waitFor(() => expect(instances.length).toBe(1));
      const kicked = instances[0]!;
      kicked.emit("kicked", { id: "ABC123", version: 4, clientId: "editor" });
      expect(onKicked).toHaveBeenCalledWith(expect.objectContaining({ clientId: "editor" }));
      expect(kicked.closed).toBe(true);

      // 没传回调也要断流:服务端已经 end,留着 EventSource 只会拿失效 ticket 反复重连。
      subscribeRoom("ABC123", "editor-token", onSnapshot, () => {}, { createTicket: () => Promise.resolve("ticket-kick-2") });
      await vi.waitFor(() => expect(instances.length).toBe(2));
      const silent = instances[1]!;
      silent.emit("closed", { id: "ABC123", version: 5, readonly: false, closed: true });
      expect(silent.closed).toBe(true);
    });
  });

  it("rebuilds the stream with a fresh ticket after a disconnect", async () => {
    await withFakeEventSource(async (instances) => {
      const onSnapshot = vi.fn();
      const onError = vi.fn();
      const createTicket = vi.fn(() => Promise.resolve(`ticket-${createTicket.mock.calls.length}`));
      const wait = vi.fn((_delayMs: number) => Promise.resolve());
      let version = 2;

      const unsubscribe = subscribeRoom("ABC123", "owner-token", onSnapshot, onError, {
        version: () => version,
        createTicket,
        reconnectDelays: [10, 20],
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      const first = instances[0]!;
      expect(first.url).toContain("ticket=ticket-1");

      // 断线补齐会把本地版本推进到 5,重连必须从补齐后的版本续传而不是最初的 2。
      onError.mockImplementation(() => { version = 5; });
      first.fail();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(first.closed).toBe(true);
      await vi.waitFor(() => expect(instances.length).toBe(2));
      const second = instances[1]!;
      expect(second.url).toContain("ticket=ticket-2");
      expect(second.url).toContain("version=5");
      expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10]);

      // 新流继续投递远端更新。
      second.emit("snapshot", { id: "ABC123", version: 6 });
      expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ version: 6 }));

      unsubscribe();
      expect(second.closed).toBe(true);
    });
  });

  it("keeps retrying at a long interval once the backoff budget runs out", async () => {
    await withFakeEventSource(async (instances) => {
      const onError = vi.fn();
      const createTicket = vi.fn(() => Promise.resolve("ticket"));
      const wait = vi.fn((_delayMs: number) => Promise.resolve());

      subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        createTicket,
        reconnectDelays: [10, 20],
        idleReconnectDelayMs: 15_000,
        heartbeatTimeoutMs: 0,
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      instances[0]!.fail();
      await vi.waitFor(() => expect(instances.length).toBe(2));
      instances[1]!.fail();
      await vi.waitFor(() => expect(instances.length).toBe(3));
      instances[2]!.fail();
      // 退避序列到这里就用尽了,但断网超过十几秒不该等于永久放弃:改用长间隔继续试。
      await vi.waitFor(() => expect(instances.length).toBe(4));
      instances[3]!.fail();
      await vi.waitFor(() => expect(instances.length).toBe(5));

      expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10, 20, 15_000, 15_000]);
      expect(onError).toHaveBeenCalledTimes(4);
    });
  });

  it("rebuilds the stream with a fresh ticket when no event arrives within the heartbeat window", async () => {
    await withFakeEventSource(async (instances) => {
      const watchdog = fakeWatchdog();
      const onError = vi.fn();
      const createTicket = vi.fn(() => Promise.resolve(`ticket-${createTicket.mock.calls.length}`));
      const wait = vi.fn((_delayMs: number) => Promise.resolve());

      subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        createTicket,
        reconnectDelays: [10, 20],
        heartbeatTimeoutMs: 40_000,
        schedule: watchdog.schedule,
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      expect(watchdog.pending().map((timer) => timer.delayMs)).toEqual([40_000]);

      // 半开连接不会触发 onerror,只能靠一整个心跳窗口的静默判死。
      watchdog.fire();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(instances[0]!.closed).toBe(true);
      await vi.waitFor(() => expect(instances.length).toBe(2));
      expect(instances[1]!.url).toContain("ticket=ticket-2");
      expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10]);
      // 重建后的流重新挂上看门狗,静默失活不会只被救一次。
      expect(watchdog.pending()).toHaveLength(1);

      // 判死后旧流补发的 onerror 不应再拉起第二次重连。
      instances[0]!.fail();
      await Promise.resolve();
      expect(instances.length).toBe(2);
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  it("re-arms the watchdog on every ping heartbeat", async () => {
    await withFakeEventSource(async (instances) => {
      const watchdog = fakeWatchdog();
      const onError = vi.fn();
      const createTicket = vi.fn(() => Promise.resolve("ticket"));

      const unsubscribe = subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        createTicket,
        heartbeatTimeoutMs: 40_000,
        schedule: watchdog.schedule,
        wait: () => Promise.resolve(),
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      const armed = watchdog.pending()[0]!;

      instances[0]!.emit("ping", {});

      // ping 是真实事件而不是 SSE 注释行,所以能重置看门狗:旧计时取消,新计时排上。
      expect(armed.cancelled).toBe(true);
      expect(watchdog.pending()).toHaveLength(1);
      expect(watchdog.pending()[0]).not.toBe(armed);
      expect(onError).not.toHaveBeenCalled();
      expect(instances.length).toBe(1);
      expect(instances[0]!.closed).toBe(false);

      unsubscribe();
      expect(watchdog.pending()).toHaveLength(0);
    });
  });

  it("restarts the backoff budget after the rebuilt stream delivers data", async () => {
    await withFakeEventSource(async (instances) => {
      const wait = vi.fn((_delayMs: number) => Promise.resolve());
      subscribeRoom("ABC123", "owner-token", () => {}, () => {}, {
        createTicket: () => Promise.resolve("ticket"),
        reconnectDelays: [10, 20],
        heartbeatTimeoutMs: 0,
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      instances[0]!.fail();
      await vi.waitFor(() => expect(instances.length).toBe(2));
      instances[1]!.emit("snapshot", { id: "ABC123", version: 7 });
      instances[1]!.fail();
      await vi.waitFor(() => expect(instances.length).toBe(3));

      expect(wait.mock.calls.map(([delay]) => delay)).toEqual([10, 10]);
    });
  });

  it("never reconnects or keeps a watchdog after a terminal kicked or closed event", async () => {
    await withFakeEventSource(async (instances) => {
      const watchdog = fakeWatchdog();
      const onError = vi.fn();
      const createTicket = vi.fn(() => Promise.resolve("ticket"));
      const wait = vi.fn((_delayMs: number) => Promise.resolve());

      subscribeRoom("ABC123", "editor-token", () => {}, onError, {
        createTicket,
        onKicked: () => {},
        reconnectDelays: [10],
        heartbeatTimeoutMs: 40_000,
        schedule: watchdog.schedule,
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      const stream = instances[0]!;
      stream.emit("kicked", { id: "ABC123", version: 4, clientId: "editor" });
      // 终局事件之后房间对本端已经结束:看门狗必须撤掉,否则会在 40s 后凭空重连一条流。
      expect(watchdog.pending()).toHaveLength(0);
      // 服务端 end 之后浏览器会立刻报错,这一次不能再重建流。
      stream.fail();

      await Promise.resolve();
      expect(instances.length).toBe(1);
      expect(wait).not.toHaveBeenCalled();
      expect(createTicket).toHaveBeenCalledTimes(1);
    });
  });

  it("retries the ticket request when it fails before the stream opens", async () => {
    await withFakeEventSource(async (instances) => {
      const onError = vi.fn();
      const createTicket = vi.fn()
        .mockRejectedValueOnce(new CollaborationClientError("ROOM_INITIALIZING", "上传中"))
        .mockResolvedValue("ticket-retry");
      const wait = vi.fn((_delayMs: number) => Promise.resolve());

      subscribeRoom("ABC123", "owner-token", () => {}, onError, {
        createTicket,
        reconnectDelays: [10, 20],
        heartbeatTimeoutMs: 0,
        wait,
      });

      await vi.waitFor(() => expect(instances.length).toBe(1));
      expect(instances[0]!.url).toContain("ticket=ticket-retry");
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});
