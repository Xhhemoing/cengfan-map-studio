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
    }
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
