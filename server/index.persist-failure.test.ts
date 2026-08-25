// @vitest-environment node
// 落盘失败连击在健康检查、房间响应与事务 ack 上的可见性。
import { describe, expect, it } from "vitest";
import { createAiServer } from "./index";
import { createRoomStore, type RoomPersistOutcome } from "./collaboration";
import { createCollaborationRoom, postRoomTransaction, roomHeaders, startServer, useServerFixture, type RoomPersistenceField, type PersistenceEnvelope } from "./index-test-fixtures";

const { servers } = useServerFixture();

describe("unified application server — persist failure streaks", () => {
  it("keeps the persist failure streak visible on /api/health.rooms.lastFlush", async () => {
    let failing = false;
    const server = createAiServer({
      persistRooms: () => {
        if (failing) throw new Error("EROFS: read-only file system");
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    await createCollaborationRoom(origin, { title: "先成功一次" });
    await server.flushRooms!();
    const healthy = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      rooms: { lastFlush: RoomPersistOutcome | null };
    };
    expect(healthy.rooms.lastFlush).toEqual({ skippedIds: [], trimmedIds: [], at: expect.any(Number) });
    const succeededAt = healthy.rooms.lastFlush!.at;

    failing = true;
    await createCollaborationRoom(origin, { title: "之后全失败" }, "client-b");
    await expect(server.flushRooms!()).rejects.toThrow(/read-only file system/);

    // 磁盘坏掉的整段时间里，健康检查只报上一次成功就是把事故说成正常。
    const degraded = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      rooms: { lastFlush: RoomPersistOutcome | null };
    };
    expect(degraded.rooms.lastFlush).toEqual({
      skippedIds: [],
      trimmedIds: [],
      at: succeededAt,
      lastFailure: { at: expect.any(Number), message: "EROFS: read-only file system" },
    });
  });

  it("carries an active persist failure streak into create, join and snapshot", async () => {
    const succeededAt = 1_700_000_001_000;
    const failedAt = 1_700_000_002_000;
    const roomIds = ["GOODROOM", "STREAKRM"];
    let nextRoomId = 0;
    let outcome: RoomPersistOutcome = { skippedIds: [], trimmedIds: [], at: succeededAt };
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore({ ...storeOptions, generateId: () => roomIds[nextRoomId++] ?? "EXTRA" });
        return { ...store, lastPersistOutcome: () => outcome };
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    // 没有失败连击时不写这个键：只认 outcome/at 的客户端看到的响应形状一个字都不变。
    const healthy = await createCollaborationRoom(origin, { title: "磁盘还好" });
    expect(healthy.room.id).toBe("GOODROOM");
    expect(healthy.persistence).toEqual({ outcome: "persisted", at: succeededAt });

    outcome = { ...outcome, lastFailure: { at: failedAt, message: "EROFS: read-only file system" } };
    // 连击期间三态与时刻照旧——最近一次**成功**落盘确实还是那一次——但只报这两项就是
    // 把正在丢数据的一段时间说成正常，房间的成员看不到任何异样。
    const streaking: RoomPersistenceField = { outcome: "persisted", at: succeededAt, lastFailureAt: failedAt };

    const created = await createCollaborationRoom(origin, { title: "磁盘坏了" }, "client-b");
    expect(created.room.id).toBe("STREAKRM");
    expect(created.persistence).toEqual(streaking);
    // 布尔兼容位看的是上一次成功落盘的处置，不因失败连击翻面。
    expect(created.persistedAtLastFlush).toBe(true);

    const snapshot = await fetch(`${origin}/api/rooms/GOODROOM`, {
      headers: roomHeaders(healthy.access.accessToken),
    }).then((response) => response.json()) as PersistenceEnvelope;
    expect(snapshot.persistence).toEqual(streaking);
    expect(snapshot.persistedAtLastFlush).toBe(true);

    const invitation = await fetch(`${origin}/api/rooms/GOODROOM/invitations`, {
      method: "POST",
      headers: roomHeaders(healthy.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ role: "editor" }),
    }).then((response) => response.json()) as { token: string };
    const joined = await fetch(`${origin}/api/rooms/GOODROOM/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: invitation.token, clientId: "guest-a", displayName: "guest-a" }),
    });
    expect(joined.status).toBe(200);
    await expect(joined.json()).resolves.toMatchObject({ persistence: streaking, persistedAtLastFlush: true });
  });

  it("drops the failure trace from room responses after the next successful flush", async () => {
    let failing = false;
    const server = createAiServer({
      persistRooms: () => {
        if (failing) throw new Error("EROFS: read-only file system");
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const created = await createCollaborationRoom(origin, { title: "真落一次盘" });
    const readSnapshot = async (): Promise<PersistenceEnvelope> => {
      const response = await fetch(`${origin}/api/rooms/${created.room.id}`, {
        headers: roomHeaders(created.access.accessToken),
      });
      return await response.json() as PersistenceEnvelope;
    };

    await server.flushRooms!();
    expect((await readSnapshot()).persistence).toEqual({ outcome: "persisted", at: expect.any(Number) });

    failing = true;
    await expect(server.flushRooms!()).rejects.toThrow(/read-only file system/);
    const degraded = await readSnapshot();
    expect(degraded.persistence).toEqual({
      outcome: "persisted",
      at: expect.any(Number),
      lastFailureAt: expect.any(Number),
    });
    expect(degraded.persistence!.lastFailureAt!).toBeGreaterThanOrEqual(degraded.persistence!.at!);

    failing = false;
    await server.flushRooms!();
    // 磁盘恢复后连击结束：再报失败就是把一个已经不成立的事故一直贴在响应上。
    expect((await readSnapshot()).persistence).toEqual({ outcome: "persisted", at: expect.any(Number) });
  });

  it("carries an active persist failure streak into the transaction acknowledgement", async () => {
    const succeededAt = 1_700_000_003_000;
    const failedAt = 1_700_000_004_000;
    let outcome: RoomPersistOutcome = { skippedIds: [], trimmedIds: [], at: succeededAt };
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore({ ...storeOptions, generateId: () => "ACKROOM" });
        return { ...store, lastPersistOutcome: () => outcome };
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const token = created.access.accessToken;

    // 没有连击时整个 lastFailureAt 键不出现：ack 的既有形状一个字都不变。
    const healthy = await postRoomTransaction(origin, "ACKROOM", token, {
      txId: "ack-healthy", clientId: "client-a", baseVersion: 0, snapshot: { title: "磁盘还好" },
    });
    expect(healthy.persistence).toEqual({ outcome: "persisted", at: succeededAt });
    expect(healthy.persistedAtLastFlush).toBe(true);

    outcome = { ...outcome, lastFailure: { at: failedAt, message: "EROFS: read-only file system" } };
    const streaking: RoomPersistenceField = { outcome: "persisted", at: succeededAt, lastFailureAt: failedAt };

    // 正在编辑的成员稳态下只会反复收到 ack，SSE 对落盘一言不发，创建/加入/快照
    // 那三个报落盘的响应他一次也不会再取：ack 不报，中途开始的失败连击就永远追不上他。
    const full = await postRoomTransaction(origin, "ACKROOM", token, {
      txId: "ack-full", clientId: "client-a", baseVersion: 1, snapshot: { title: "磁盘坏了" },
    });
    expect(full.persistence).toEqual(streaking);
    // 布尔兼容位说的仍是上一次成功落盘的处置，不因失败连击翻面。
    expect(full.persistedAtLastFlush).toBe(true);

    const minimal = await postRoomTransaction(origin, "ACKROOM", token, {
      txId: "ack-minimal", clientId: "client-a", baseVersion: 2, snapshot: { title: "还是坏的" },
    }, true);
    // 最小 ack 省的是快照，不是事故。
    expect(minimal.snapshot).toBeUndefined();
    expect(minimal.persistence).toEqual(streaking);
    expect(minimal.persistedAtLastFlush).toBe(true);
  });

  it("drops the failure trace from the transaction acknowledgement after the next successful flush", async () => {
    let failing = false;
    const server = createAiServer({
      persistRooms: () => {
        if (failing) throw new Error("EROFS: read-only file system");
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "真落一次盘" });
    let baseVersion = 0;
    const acknowledge = async (txId: string): Promise<PersistenceEnvelope> => (
      await postRoomTransaction(origin, created.room.id, created.access.accessToken, {
        txId, clientId: "client-a", baseVersion: baseVersion++, snapshot: { title: txId },
      })
    );

    await server.flushRooms!();
    expect((await acknowledge("ack-after-success")).persistence).toEqual({ outcome: "persisted", at: expect.any(Number) });

    failing = true;
    await expect(server.flushRooms!()).rejects.toThrow(/read-only file system/);
    const degraded = await acknowledge("ack-during-streak");
    expect(degraded.persistence).toEqual({
      outcome: "persisted",
      at: expect.any(Number),
      lastFailureAt: expect.any(Number),
    });
    expect(degraded.persistence!.lastFailureAt!).toBeGreaterThanOrEqual(degraded.persistence!.at!);

    failing = false;
    await server.flushRooms!();
    // 磁盘恢复后连击结束：ack 上再报失败，就是把一个已经不成立的事故一直贴给正在编辑的人。
    expect((await acknowledge("ack-after-heal")).persistence).toEqual({ outcome: "persisted", at: expect.any(Number) });
  });

  it("reports no flush timestamp on /api/health before the first successful persist", async () => {
    let failing = true;
    const server = createAiServer({
      persistRooms: () => {
        if (failing) throw new Error("EROFS: read-only file system");
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const readLastFlush = async () => (
      await fetch(`${origin}/api/health`).then((response) => response.json()) as {
        rooms: { lastFlush: { skippedIds: string[]; trimmedIds: string[]; at: number | null; lastFailure?: { at: number; message: string } } | null };
      }
    ).rooms.lastFlush;

    await createCollaborationRoom(origin, { title: "从未落盘" });
    await expect(server.flushRooms!()).rejects.toThrow(/read-only file system/);

    // at: 0 是「从未成功落过盘」，原样发出去在朴素解析器眼里就是 1970 年的假事实。
    expect(await readLastFlush()).toEqual({
      skippedIds: [],
      trimmedIds: [],
      at: null,
      // 失败连击原样透传：健康检查改写的只有那个假时刻。
      lastFailure: { at: expect.any(Number), message: "EROFS: read-only file system" },
    });

    failing = false;
    await server.flushRooms!();
    // 只有 0 会被改写：真成功过的时刻必须原样发出去。
    expect(await readLastFlush()).toEqual({ skippedIds: [], trimmedIds: [], at: expect.any(Number) });
  });
});
