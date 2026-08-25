// @vitest-environment node
// 存活/就绪探针、SIGTERM 关停排空，以及启动时的房间恢复统计。
import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { attachServerLifecycle, createAiServer, createReadyAiServer, type PersistableRoomStore } from "./index";
import { createRoomStore } from "./collaboration";
import { captureProcessFailures, createCollaborationRoom, openEventStream, rawGet, roomHeaders, startServer, useServerFixture, wait } from "./index-test-fixtures";

const { servers, directories } = useServerFixture();

describe("unified application server — health probes and lifecycle", () => {
  it("serves live and ready probes without exposing runtime paths or secrets", async () => {
    const server = createAiServer({ budgetReceiptSecret: "probe-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const live = await rawGet(origin, "/api/live");
    const ready = await rawGet(origin, "/api/ready");
    expect(live).toEqual({ status: 200, body: '{"ok":true}' });
    expect(ready.status).toBe(200);
    expect(ready.body).toContain('"state":"ready"');
    expect(ready.body).not.toContain("probe-secret");
    expect(ready.body).not.toContain("ai-runtime-state.json");
  });

  it("reports process receipt persistence without exposing the receipt secret", async () => {
    const server = createAiServer({ budgetReceiptSecret: "health-secret" });
    servers.push(server);
    const origin = await startServer(server);
    const body = await fetch(`${origin}/api/health`).then((response) => response.text());
    expect(body).toContain('"receiptPersistence":"memory"');
    expect(body).not.toContain("health-secret");
  });

  it("ends live SSE streams, flushes the room store, and frees the port on SIGTERM", async () => {
    const monitor = captureProcessFailures();
    const persisted: unknown[] = [];
    const flushes: string[] = [];
    const server = createAiServer({
      roomHeartbeatIntervalMs: 60_000,
      persistRooms: (snapshot) => { persisted.push(snapshot); },
      // 真实房间存储 + flush 探针：只观测关停是否落了一次快照，不改写快照语义。
      roomStoreFactory: (storeOptions) => {
        const store = createRoomStore(storeOptions);
        return { ...store, flush: async () => { flushes.push("rooms"); await store.flush(); } };
      },
    });
    servers.push(server);
    const origin = await startServer(server);
    const created = await createCollaborationRoom(origin, { title: "初始" });
    const stream = await openEventStream(origin, created.room.id, created.access.accessToken);
    const applied = await fetch(`${origin}/api/rooms/${created.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(created.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ txId: "shutdown-1", clientId: "client-a", baseVersion: 0, snapshot: { title: "编辑中" } }),
    });
    expect(applied.status).toBe(200);
    const frames: string[] = [];
    frames.push((await stream.read()) ?? "");
    expect(frames[0]).toContain("event: snapshot");
    expect(server.roomStreamStats!().openStreams).toBe(1);

    const lifecycle = attachServerLifecycle(server, { timeoutMs: 3_000 });
    const startedAt = Date.now();
    await lifecycle.shutdown("SIGTERM");
    const elapsedMs = Date.now() - startedAt;

    try {
      for (let chunk = await stream.read(); chunk !== null; chunk = await stream.read()) frames.push(chunk);
      // 房间会随快照活过重启，所以关停只结束连接，绝不能借用 closed 帧告诉客户端房间没了。
      expect(frames.join("")).not.toContain("event: closed");
      expect(flushes).toEqual(["rooms"]);
      expect(persisted).toHaveLength(1);
      expect(server.roomStreamStats!().openStreams).toBe(0);
      // 远早于 3s 截止时间：关停靠主动排空收敛，而不是靠超时兜底。
      expect(elapsedMs).toBeLessThan(1_000);
      await expect(fetch(`${origin}/api/live`)).rejects.toThrow();
      expect(monitor.failures).toEqual([]);
    } finally {
      monitor.restore();
      await stream.close();
    }
  });

  it("bounds an in-flight request by the shutdown deadline instead of hanging the exit", async () => {
    const server = createAiServer();
    servers.push(server);
    const origin = await startServer(server);
    const target = new URL(origin);
    // 只发一半请求体：处理函数会一直等剩余字节，连接因此始终处于「在途」状态。
    const hung = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: "/api/rooms",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": 64 },
    });
    hung.on("error", () => undefined);
    let requestClosed = false;
    hung.on("close", () => { requestClosed = true; });
    hung.write("{\"clientId\":");
    await wait(50);

    const lifecycle = attachServerLifecycle(server, { timeoutMs: 300 });
    const startedAt = Date.now();
    await lifecycle.shutdown("SIGTERM");
    const elapsedMs = Date.now() - startedAt;

    try {
      expect(elapsedMs).toBeGreaterThanOrEqual(250);
      expect(elapsedMs).toBeLessThan(3_000);
      // 截止时间到就切断仍未收完的请求，否则一个半截请求能把进程钉在关停里。
      await wait(50);
      expect(requestClosed).toBe(true);
      await expect(fetch(`${origin}/api/live`)).rejects.toThrow();
    } finally {
      hung.destroy();
    }
  });

  it("restores a previously created room from the persisted snapshot on boot", async () => {
    let snapshot: unknown;
    const first = createAiServer({
      persistRooms: (value) => { snapshot = value; },
    });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const created = await createCollaborationRoom(firstOrigin, { title: "重启前" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");
    expect(snapshot).toBeDefined();

    const restored = createAiServer({ roomSnapshot: snapshot });
    servers.push(restored);
    const restoredOrigin = await startServer(restored);
    const response = await fetch(`${restoredOrigin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: created.room.id, snapshot: { title: "重启前" } });
  });

  it("reports how many rooms the boot snapshot handed back", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let snapshot: unknown;
    const first = createAiServer({ persistRooms: (value) => { snapshot = value; } });
    servers.push(first);
    const origin = await startServer(first);
    await createCollaborationRoom(origin, { title: "计数" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    info.mockClear();
    const restored = createAiServer({ roomSnapshot: snapshot });
    servers.push(restored);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("restored 1 collaboration room(s)"));

    // 没有快照就没有「恢复」可言：报一句 restored 0 会让日志读者以为读到过一份空快照。
    info.mockClear();
    const cold = createAiServer();
    servers.push(cold);
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("collaboration room(s)"));

    // 形状不对的快照同样按 0 计：房间存储会整份丢弃它。
    info.mockClear();
    const bogus = createAiServer({ roomSnapshot: { version: 2, rooms: "nope" } });
    servers.push(bogus);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("restored 0 collaboration room(s)"));
  });

  it("reports the restored count only for a snapshot that actually came off disk", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-provenance-"));
    directories.push(dataDir);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const cold = await createReadyAiServer({ dataDir });
    servers.push(cold);
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("collaboration room(s)"));

    const origin = await startServer(cold);
    await createCollaborationRoom(origin, { title: "有据可查" });
    await attachServerLifecycle(cold, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    info.mockClear();
    servers.push(await createReadyAiServer({ dataDir }));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("restored 1 collaboration room(s)"));
  });

  it("surfaces rooms the previous shutdown dropped at the persistence cap", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // 旧信封只有计数（R5-1 之前落盘的快照），此时只能报计数。
    const server = createAiServer({ roomSnapshot: { version: 1, rooms: [], skippedRoomCount: 3 } });
    servers.push(server);

    expect(info).toHaveBeenCalledWith(expect.stringContaining("restored 0 collaboration room(s)"));
    // 上一次关停丢掉的房间只在那一刻的日志里出现过，重启后没人再提就等于没发生。
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("上次关停有 3 个房间超过持久化上限，未恢复"));
  });

  it("names the rooms the previous shutdown dropped, not just how many", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const server = createAiServer({
      roomSnapshot: { version: 1, rooms: [], skippedRoomCount: 2, skippedRoomIds: ["ROOMB", "ROOMA"] },
    });
    servers.push(server);

    const message = warn.mock.calls.map((call) => String(call[0])).find((line) => line.includes("未恢复"));
    expect(message).toBeDefined();
    expect(message).toContain("2 个房间");
    // 只报数量的话，运维知道「丢了两个」却不知道该去补哪两个房间。
    expect(message).toContain("ROOMA");
    expect(message).toContain("ROOMB");
    // 排序稳定，便于跨重启比对日志。
    expect(message!.indexOf("ROOMA")).toBeLessThan(message!.indexOf("ROOMB"));
  });

  it("reports boot restore facts and skipped room ids on /api/health", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let snapshot: unknown;
    const first = createAiServer({ persistRooms: (value) => { snapshot = value; } });
    servers.push(first);
    const firstOrigin = await startServer(first);
    await createCollaborationRoom(firstOrigin, { title: "健康检查" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    const restored = createAiServer({
      roomSnapshot: { ...(snapshot as Record<string, unknown>), skippedRoomCount: 2, skippedRoomIds: ["ROOMB", "ROOMA"] },
    });
    servers.push(restored);
    const origin = await startServer(restored);

    const health = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      ok: boolean;
      rooms: unknown;
      ai: unknown;
    };
    // 既有载荷保持不变，rooms 是新增块。
    expect(health.ok).toBe(true);
    expect(health.ai).toBeDefined();
    expect(health.rooms).toEqual({
      restoredAtBoot: 1,
      skippedAtLastShutdown: { count: 2, ids: ["ROOMA", "ROOMB"] },
      lastFlush: null,
    });
  });

  it("reports a cold boot and the live flush outcome on /api/health", async () => {
    const server = createAiServer({ persistRooms: () => undefined });
    servers.push(server);
    const origin = await startServer(server);

    const cold = await fetch(`${origin}/api/health`).then((response) => response.json()) as { rooms: unknown };
    // 冷启动没有快照可谈，恢复数按 0 报，且还没有落过盘。
    expect(cold.rooms).toEqual({
      restoredAtBoot: 0,
      skippedAtLastShutdown: { count: 0, ids: [] },
      lastFlush: null,
    });

    await createCollaborationRoom(origin, { title: "落盘一次" });
    await server.flushRooms!();

    const flushed = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      rooms: { lastFlush: { skippedIds: string[]; trimmedIds: string[]; at: number } | null };
    };
    expect(flushed.rooms.lastFlush).toEqual({ skippedIds: [], trimmedIds: [], at: expect.any(Number) });
  });

  it("keeps /api/health answering when the injected room store has no persist outcome", async () => {
    const server = createAiServer({
      roomStoreFactory: (storeOptions) => {
        const { lastPersistOutcome: _omitted, ...withoutOutcome } = createRoomStore(storeOptions);
        return withoutOutcome as PersistableRoomStore;
      },
    });
    servers.push(server);
    const origin = await startServer(server);

    const health = await fetch(`${origin}/api/health`).then((response) => response.json()) as {
      rooms: { lastFlush: unknown };
    };
    expect(health.rooms.lastFlush).toBeNull();
    const created = await createCollaborationRoom(origin, { title: "无落盘结论" });
    expect(created.persistedAtLastFlush).toBe(true);
  });
});
