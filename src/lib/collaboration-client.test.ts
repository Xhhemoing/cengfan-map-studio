import { describe, expect, it, vi } from "vitest";
import {
  CollaborationClientError,
  createRoom,
  fetchRoom,
  leaveRoom,
  retryInitializingRoom,
  setRoomAccess,
  subscribeRoom,
  type RoomMember,
} from "./collaboration-client";
import { FakeEventSource, ok } from "./collaboration-client-test-fixtures";

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

  it("creates an initializing room without serializing an initial snapshot", async () => {
    const request = vi.fn(() => ok({ room: { id: "FAST01", version: 0, ready: false }, access: { accessToken: "owner-token" } }, 201));

    await expect(createRoom({ clientId: "c1", displayName: "创建者", request })).resolves.toMatchObject({ room: { id: "FAST01", ready: false } });
    expect(request).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      body: JSON.stringify({ clientId: "c1", displayName: "创建者" }),
    }));
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
