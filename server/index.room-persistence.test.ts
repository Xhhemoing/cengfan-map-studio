// @vitest-environment node
// 创建/加入/快照响应上的落盘三态与时刻。
import { describe, expect, it } from "vitest";
import { createAiServer, type PersistableRoomStore } from "./index";
import { createRoomStore, type RoomPersistOutcome } from "./collaboration";
import { createCollaborationRoom, roomHeaders, startServer, useServerFixture, type RoomPersistenceField, type PersistenceEnvelope } from "./index-test-fixtures";

const { servers } = useServerFixture();

describe("unified application server — room persistence reporting", () => {
  it("marks a freshly created room as persisted at the last flush", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);

    // 还没落过盘的小房间不该被说成「上次落盘丢了」：滞后最多一个持久化周期。
    const created = await createCollaborationRoom(origin, { title: "小房间" });
    expect(created.persistedAtLastFlush).toBe(true);

    const snapshot = await fetch(`${origin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    }).then((response) => response.json()) as { id: string; persistedAtLastFlush?: boolean };
    expect(snapshot.id).toBe(created.room.id);
    expect(snapshot.persistedAtLastFlush).toBe(true);

    const invitation = await fetch(`${origin}/api/rooms/${created.room.id}/invitations`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "editor" }),
    }).then((response) => response.json()) as { token: string };
    const joined = await fetch(`${origin}/api/rooms/${created.room.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: invitation.token, clientId: "client-b", displayName: "client-b" }),
    });
    expect(joined.status).toBe(200);
    await expect(joined.json()).resolves.toMatchObject({ persistedAtLastFlush: true });
  });

  it("marks rooms the last flush skipped or trimmed as not persisted", async () => {
    let outcome: RoomPersistOutcome | undefined;
    const roomIds = ["SKIPPEDA", "SKIPPEDB"];
    let nextRoomId = 0;
    const server = createAiServer({
      // 真实房间存储 + 可控的落盘结论：不用造 8 MiB 房间就能观察降级路径。
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore({ ...storeOptions, generateId: () => roomIds[nextRoomId++] ?? "EXTRA" });
        return { ...store, lastPersistOutcome: () => outcome };
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const created = await createCollaborationRoom(origin, { title: "会被跳过" });
    expect(created.room.id).toBe("SKIPPEDA");
    expect(created.persistedAtLastFlush).toBe(true);

    // 房间 id 是大写的，落盘结论里的大小写不该改变判断。
    outcome = { skippedIds: ["skippeda", "skippedb"], trimmedIds: [], at: 1_700_000_000_000 };

    const snapshot = await fetch(`${origin}/api/rooms/SKIPPEDA`, {
      headers: roomHeaders(created.access.accessToken),
    }).then((response) => response.json()) as { persistedAtLastFlush?: boolean };
    expect(snapshot.persistedAtLastFlush).toBe(false);

    const invitation = await fetch(`${origin}/api/rooms/SKIPPEDA/invitations`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "editor" }),
    }).then((response) => response.json()) as { token: string };
    const joined = await fetch(`${origin}/api/rooms/SKIPPEDA/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: invitation.token, clientId: "client-b", displayName: "client-b" }),
    });
    expect(joined.status).toBe(200);
    await expect(joined.json()).resolves.toMatchObject({ persistedAtLastFlush: false });

    const second = await createCollaborationRoom(origin, { title: "也会被跳过" }, "client-c");
    expect(second.room.id).toBe("SKIPPEDB");
    expect(second.persistedAtLastFlush).toBe(false);

    // 被裁掉历史的房间同样不算「上次落盘完整写下」。
    outcome = { skippedIds: [], trimmedIds: ["SKIPPEDA"], at: 1_700_000_000_001 };
    const trimmed = await fetch(`${origin}/api/rooms/SKIPPEDA`, {
      headers: roomHeaders(created.access.accessToken),
    }).then((response) => response.json()) as { persistedAtLastFlush?: boolean };
    expect(trimmed.persistedAtLastFlush).toBe(false);

    const untouched = await fetch(`${origin}/api/rooms/SKIPPEDB`, {
      headers: roomHeaders(second.access.accessToken),
    }).then((response) => response.json()) as { persistedAtLastFlush?: boolean };
    expect(untouched.persistedAtLastFlush).toBe(true);

    const health = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      rooms: { lastFlush: RoomPersistOutcome | null };
    };
    expect(health.rooms.lastFlush).toEqual({ skippedIds: [], trimmedIds: ["SKIPPEDA"], at: 1_700_000_000_001 });
  });

  it("tells a trimmed room apart from a skipped one on create, join and snapshot", async () => {
    const flushedAt = 1_700_000_000_500;
    const roomIds = ["KEEPROOM", "TRIMROOM", "SKIPROOM"];
    let nextRoomId = 0;
    // 房间 id 统一大写，落盘结论里的写法未必：匹配必须忽略大小写。
    const outcome: RoomPersistOutcome = { skippedIds: ["skiproom"], trimmedIds: ["trimroom"], at: flushedAt };
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore({ ...storeOptions, generateId: () => roomIds[nextRoomId++] ?? "EXTRA" });
        return { ...store, lastPersistOutcome: () => outcome };
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const expected: Record<string, { persistence: RoomPersistenceField; persistedAtLastFlush: boolean }> = {
      KEEPROOM: { persistence: { outcome: "persisted", at: flushedAt }, persistedAtLastFlush: true },
      // 裁剪与跳过的后果不同：裁剪的房间重启后还在，跳过的房间已经没了。
      TRIMROOM: { persistence: { outcome: "trimmed", at: flushedAt }, persistedAtLastFlush: false },
      SKIPROOM: { persistence: { outcome: "skipped", at: flushedAt }, persistedAtLastFlush: false },
    };

    for (const [index, roomId] of roomIds.entries()) {
      const created = await createCollaborationRoom(origin, { title: roomId }, `client-${index}`);
      const accessToken = created.access.accessToken;
      expect(created.room.id).toBe(roomId);
      expect(created.persistence).toEqual(expected[roomId]!.persistence);
      expect(created.persistedAtLastFlush).toBe(expected[roomId]!.persistedAtLastFlush);

      const snapshot = await fetch(`${origin}/api/rooms/${roomId}`, {
        headers: roomHeaders(accessToken),
      }).then((response) => response.json()) as PersistenceEnvelope;
      expect(snapshot.persistence).toEqual(expected[roomId]!.persistence);
      expect(snapshot.persistedAtLastFlush).toBe(expected[roomId]!.persistedAtLastFlush);

      const invitation = await fetch(`${origin}/api/rooms/${roomId}/invitations`, {
        method: "POST",
        headers: roomHeaders(accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ role: "editor" }),
      }).then((response) => response.json()) as { token: string };
      const joined = await fetch(`${origin}/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: invitation.token, clientId: `guest-${index}`, displayName: `guest-${index}` }),
      });
      expect(joined.status).toBe(200);
      await expect(joined.json()).resolves.toMatchObject({
        persistence: expected[roomId]!.persistence,
        persistedAtLastFlush: expected[roomId]!.persistedAtLastFlush,
      });
    }
  });

  it("reports no flush timestamp before the first successful persist", async () => {
    // at: 0 是「从未成功落过盘」，把它当时间戳发出去就是 1970 年的假事实。
    const outcome: RoomPersistOutcome = {
      skippedIds: [],
      trimmedIds: ["NEVERSAVED"],
      at: 0,
      lastFailure: { at: 1_700_000_000_900, message: "EROFS: read-only file system" },
    };
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore({ ...storeOptions, generateId: () => "NEVERSAVED" });
        return { ...store, lastPersistOutcome: () => outcome };
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const created = await createCollaborationRoom(origin, { title: "从未落盘" });
    // 从未成功落过盘、且当前正在失败连击中：没有时刻可报，但失败本身要报。
    expect(created.persistence).toEqual({ outcome: "trimmed", at: null, lastFailureAt: 1_700_000_000_900 });
    expect(created.persistedAtLastFlush).toBe(false);
  });

  it("reports a persisted outcome with no timestamp when the store has no persist accessor", async () => {
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const { lastPersistOutcome: _omitted, ...withoutOutcome } = createRoomStore(storeOptions);
        return withoutOutcome as PersistableRoomStore;
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    // 没有落盘结论可读时不该造出降级结论：兼容旧存储替身，报「已落盘 + 无时刻」。
    const created = await createCollaborationRoom(origin, { title: "无落盘结论" });
    expect(created.persistence).toEqual({ outcome: "persisted", at: null });
    expect(created.persistedAtLastFlush).toBe(true);

    const snapshot = await fetch(`${origin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    }).then((response) => response.json()) as PersistenceEnvelope;
    expect(snapshot.persistence).toEqual({ outcome: "persisted", at: null });
  });
});
