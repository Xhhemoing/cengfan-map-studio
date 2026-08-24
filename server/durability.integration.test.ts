// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { attachServerLifecycle, createReadyAiServer } from "./index";
import { MAX_PERSISTED_ROOM_BYTES, type RoomPersistOutcome } from "./collaboration";

/** index.ts 里的 MAX_ROOM_SNAPSHOT_SIDECARS 没有导出，这里按同一个值断言隔离文件上限。 */
const MAX_ROOM_SNAPSHOT_SIDECARS = 5;

// 复制自 server/index.test.ts：这条旅程要跑真实 HTTP + 真实落盘，不能改那份测试。
async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function roomHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { "X-Cengfan-Room-Token": accessToken, ...headers };
}

async function createCollaborationRoom(origin: string, snapshot: unknown, clientId = "client-a") {
  const response = await fetch(`${origin}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, displayName: clientId, ...(snapshot === undefined ? {} : { snapshot }) }),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{
    room: { id: string; version: number; ready: boolean };
    access: { accessToken: string };
    persistedAtLastFlush?: boolean;
  }>;
}

async function createEventsTicket(origin: string, roomId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${origin}/api/rooms/${roomId}/events-ticket`, {
    method: "POST",
    headers: roomHeaders(accessToken),
  });
  expect(response.status).toBe(201);
  return (await response.json() as { ticket: string }).ticket;
}

async function openEventStream(origin: string, roomId: string, accessToken: string, version = 0) {
  const ticket = await createEventsTicket(origin, roomId, accessToken);
  const controller = new AbortController();
  const response = await fetch(
    `${origin}/api/rooms/${roomId}/events?ticket=${encodeURIComponent(ticket)}&version=${version}`,
    { signal: controller.signal },
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  return {
    read: async () => {
      const chunk = await reader.read();
      return chunk.done ? null : decoder.decode(chunk.value, { stream: true });
    },
    close: async () => {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

/** 快照信封在磁盘上的形状：这两条旅程关心恢复了谁、上次关停丢了谁、谁被裁掉了历史。 */
interface PersistedEnvelope {
  version: number;
  rooms: {
    room: { id: string; version?: number; snapshot?: unknown };
    operationHistory?: { version: number }[];
  }[];
  skippedRoomCount?: number;
  skippedRoomIds?: string[];
  trimmedRoomIds?: string[];
}

async function readEnvelope(file: string): Promise<PersistedEnvelope> {
  return JSON.parse(await readFile(file, "utf8")) as PersistedEnvelope;
}

const lines = (spy: { mock: { calls: unknown[][] } }): string[] => spy.mock.calls.map((call) => String(call[0]));

describe("collaboration room durability across restarts", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.closeAllConnections?.();
      server.close(() => resolve());
    })));
    await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true })));
    vi.restoreAllMocks();
  });

  it("carries a small room through shutdown, restart, corruption and recovery on real files", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-durability-journey-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // 1. 冷启动：数据目录里还没有快照，日志因此不该出现「restored N」。
    // 心跳调到 60s：这条旅程只想观察关停时的帧，不想被心跳插进来。
    const first = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(first);
    expect(lines(info).some((line) => line.includes("collaboration room(s)"))).toBe(false);
    const firstOrigin = await startServer(first);

    // 2. 一个正常大小的房间：它要活过后面每一次重启。
    const small = await createCollaborationRoom(firstOrigin, { title: "小房间" }, "small-owner");
    expect(small.persistedAtLastFlush).toBe(true);

    // 3. 一个 API 收得下、落盘收不下的房间。请求体上限与单房间持久化上限同为 8 MiB，
    //    所以把请求体顶到上限：磁盘记录还要再包一层房间元数据与凭证，必然越过 8 MiB。
    const oversizedOwner = "oversized-owner";
    const envelopeBytes = Buffer.byteLength(JSON.stringify({
      clientId: oversizedOwner,
      displayName: oversizedOwner,
      snapshot: { payload: "" },
    }), "utf8");
    const payload = "x".repeat(MAX_PERSISTED_ROOM_BYTES - envelopeBytes);
    const oversizedBody = JSON.stringify({
      clientId: oversizedOwner,
      displayName: oversizedOwner,
      snapshot: { payload },
    });
    expect(Buffer.byteLength(oversizedBody, "utf8")).toBeLessThanOrEqual(MAX_PERSISTED_ROOM_BYTES);
    const oversizedResponse = await fetch(`${firstOrigin}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedBody,
    });
    expect(oversizedResponse.status).toBe(201);
    const oversized = await oversizedResponse.json() as {
      room: { id: string };
      access: { accessToken: string };
    };
    // 活着的房间照常可读：落盘上限是关停时的降级，不是运行期的拒绝。
    const liveOversized = await fetch(`${firstOrigin}/api/rooms/${oversized.room.id}`, {
      headers: roomHeaders(oversized.access.accessToken),
    });
    expect(liveOversized.status).toBe(200);

    // 4. SIGTERM：排空 SSE、落一次盘，然后检查磁盘上真正写下了什么。
    const stream = await openEventStream(firstOrigin, small.room.id, small.access.accessToken);
    const edited = await fetch(`${firstOrigin}/api/rooms/${small.room.id}/transactions`, {
      method: "POST",
      headers: roomHeaders(small.access.accessToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        txId: "journey-1",
        clientId: "small-owner",
        baseVersion: 0,
        snapshot: { title: "小房间", edited: true },
      }),
    });
    expect(edited.status).toBe(200);
    const frames: string[] = [];
    frames.push((await stream.read()) ?? "");
    expect(frames[0]).toContain("event: snapshot");

    warn.mockClear();
    await attachServerLifecycle(first, { timeoutMs: 3_000 }).shutdown("SIGTERM");
    for (let chunk = await stream.read(); chunk !== null; chunk = await stream.read()) frames.push(chunk);
    await stream.close();
    // 房间会随快照活过重启，关停不能借用 closed 帧告诉客户端房间没了。
    expect(frames.join("")).not.toContain("event: closed");

    const afterShutdown = await readEnvelope(snapshotFile);
    expect(afterShutdown.version).toBe(1);
    expect(afterShutdown.rooms.map(({ room }) => room.id)).toEqual([small.room.id]);
    expect(afterShutdown.skippedRoomIds).toContain(oversized.room.id);
    expect(afterShutdown.skippedRoomCount).toBeGreaterThanOrEqual(1);
    // 少了几个是量，少了哪几个才是能拿去补救的信息。
    const flushWarning = lines(warn).find((line) => line.includes("skipped"));
    expect(flushWarning).toBeDefined();
    expect(flushWarning).toContain(oversized.room.id);

    // 5. 重启（同一个数据目录，等价于新进程）：小房间回来，超限房间没回来，且启动就说清楚。
    info.mockClear();
    warn.mockClear();
    const second = await createReadyAiServer({ dataDir });
    servers.push(second);
    expect(lines(info)).toContainEqual(expect.stringContaining("restored 1 collaboration room(s)"));
    const priorSkipWarning = lines(warn).find((line) => line.includes("未恢复"));
    expect(priorSkipWarning).toBeDefined();
    expect(priorSkipWarning).toContain("1 个房间");
    expect(priorSkipWarning).toContain(oversized.room.id);

    const secondOrigin = await startServer(second);
    const restoredSmall = await fetch(`${secondOrigin}/api/rooms/${small.room.id}`, {
      headers: roomHeaders(small.access.accessToken),
    });
    expect(restoredSmall.status).toBe(200);
    await expect(restoredSmall.json()).resolves.toMatchObject({ snapshot: { title: "小房间" } });
    const restoredOversized = await fetch(`${secondOrigin}/api/rooms/${oversized.room.id}`, {
      headers: roomHeaders(oversized.access.accessToken),
    });
    expect(restoredOversized.status).toBe(404);

    // 6. 干净关停之后再把磁盘上的快照弄坏：模拟半截写入 / 文件系统损坏。
    await attachServerLifecycle(second, { timeoutMs: 3_000 }).shutdown("SIGTERM");
    expect((await readEnvelope(snapshotFile)).rooms.map(({ room }) => room.id)).toEqual([small.room.id]);
    const corruptions = ["corrupt-boot-0"];
    await writeFile(snapshotFile, corruptions[0]!, "utf8");

    // 7. 坏快照启动：隔离到 .bad，冷启动保持沉默（没读到快照就没有「恢复」可言），服务照常起来。
    info.mockClear();
    warn.mockClear();
    const third = await createReadyAiServer({ dataDir });
    servers.push(third);
    await expect(readFile(snapshotFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${snapshotFile}.bad`, "utf8")).resolves.toBe(corruptions[0]);
    expect(lines(warn)).toContainEqual(expect.stringContaining(`${snapshotFile}.bad`));
    expect(lines(info).some((line) => line.includes("collaboration room(s)"))).toBe(false);
    const thirdOrigin = await startServer(third);
    expect((await fetch(`${thirdOrigin}/api/live`)).status).toBe(200);
    await attachServerLifecycle(third, { timeoutMs: 3_000 }).shutdown("SIGTERM");

    // 8. 坏启动会反复发生：隔离文件只留最近的 5 份，最旧的证据先被丢掉。
    //    真实 mtime 在同一次测试里可能撞到同一毫秒，按 index.test.ts 的做法用 utimes 拉开顺序。
    const sidecarNames = async () => (await readdir(dataDir)).filter((name) => name.endsWith(".bad"));
    const ageBase = Date.now() - 100 * 60_000;
    const ageSidecar = async (name: string, index: number) => {
      const at = new Date(ageBase + index * 60_000);
      await utimes(join(dataDir, name), at, at);
    };
    await ageSidecar((await sidecarNames())[0]!, 0);
    for (let boot = 1; boot <= MAX_ROOM_SNAPSHOT_SIDECARS + 1; boot += 1) {
      const known = new Set(await sidecarNames());
      const content = `corrupt-boot-${boot}`;
      corruptions.push(content);
      await writeFile(snapshotFile, content, "utf8");
      servers.push(await createReadyAiServer({ dataDir }));
      const fresh = (await sidecarNames()).find((name) => !known.has(name));
      expect(fresh).toBeDefined();
      await ageSidecar(fresh!, boot);
    }

    const sidecars = await sidecarNames();
    expect(sidecars).toHaveLength(MAX_ROOM_SNAPSHOT_SIDECARS);
    const kept = await Promise.all(sidecars.map((name) => readFile(join(dataDir, name), "utf8")));
    // 保留最近的 5 次事故现场，更早的两次让位。
    expect(kept.sort()).toEqual(corruptions.slice(-MAX_ROOM_SNAPSHOT_SIDECARS).sort());

    // 9. 坏快照被清出正常路径之后，下一次启动重新写出一份可用的快照。
    const final = await createReadyAiServer({ dataDir });
    servers.push(final);
    const finalOrigin = await startServer(final);
    const revived = await createCollaborationRoom(finalOrigin, { title: "重建" }, "revived-owner");
    await attachServerLifecycle(final, { timeoutMs: 3_000 }).shutdown("SIGTERM");

    const recovered = await readEnvelope(snapshotFile);
    expect(recovered.version).toBe(1);
    expect(recovered.rooms.map(({ room }) => room.id)).toEqual([revived.room.id]);
    expect(recovered.skippedRoomIds).toBeUndefined();
  }, 120_000);

  // 上一条旅程走的是「跳过」档：房间整条落不下去，重启后就没了。裁剪档的后果完全不同——快照连版本一起活过重启，
  // 掉的只有增量历史，落后的客户端因此补不回增量、必须重新取快照。404 与 409 的分野只有真实 HTTP + 真实文件能证。
  it("keeps a trimmed near-limit room serving its snapshot across restart while the incremental history is gone", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-durability-trim-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // 快照本身离单房间上限还有 320 KiB，落盘收得下；把这条记录顶过上限的只有随后累积的增量历史，
    // 于是持久化只能在「裁掉历史」和「整条丢掉」之间选，而它必须选前者。
    const headroomBytes = 320 * 1024;
    const payload = "x".repeat(MAX_PERSISTED_ROOM_BYTES - headroomBytes);
    const historyPaddingBytes = 64 * 1024;
    const operationCount = 5;
    const owner = "trim-owner";

    const first = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(first);
    const firstOrigin = await startServer(first);

    const createBody = JSON.stringify({ clientId: owner, displayName: owner, snapshot: { payload } });
    expect(Buffer.byteLength(createBody, "utf8")).toBeLessThanOrEqual(MAX_PERSISTED_ROOM_BYTES);
    const createResponse = await fetch(
      `${firstOrigin}/api/rooms`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: createBody },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { room: { id: string; version: number }; access: { accessToken: string } };
    const roomId = created.room.id;
    const token = created.access.accessToken;

    /** 一串带填充的增量事务：每条都走真实 HTTP，返回最小响应以免把 8 MiB 快照来回搬 5 次。 */
    const editWithHistory = async (origin: string, fromVersion: number, tag: string): Promise<number> => {
      let version = fromVersion;
      for (let index = 0; index < operationCount; index += 1) {
        const response = await fetch(`${origin}/api/rooms/${roomId}/transactions`, {
          method: "POST",
          headers: roomHeaders(token, { "Content-Type": "application/json", Prefer: "return=minimal" }),
          body: JSON.stringify({
            txId: `${tag}-${index}`,
            clientId: owner,
            baseVersion: version,
            operations: [{ type: "set", path: ["historyPadding"], value: `${tag}-${index}-`.padEnd(historyPaddingBytes, "h") }],
          }),
        });
        expect(response.status).toBe(200);
        version = (await response.json() as { version: number }).version;
      }
      return version;
    };

    // 1. 攒够历史：快照仍在上限之内，加上历史之后整条记录越界。
    const editedVersion = await editWithHistory(firstOrigin, created.room.version, "trim-boot1");
    expect(editedVersion).toBe(created.room.version + operationCount);

    // 2. SIGTERM 落盘：房间必须留在信封里，被丢下的只有 operationHistory。
    warn.mockClear();
    await attachServerLifecycle(first, { timeoutMs: 3_000 }).shutdown("SIGTERM");

    const afterShutdown = await readEnvelope(snapshotFile);
    expect(afterShutdown.trimmedRoomIds).toEqual([roomId]);
    expect(afterShutdown.skippedRoomIds).toBeUndefined();
    expect(afterShutdown.rooms.map(({ room }) => room.id)).toEqual([roomId]);
    expect(afterShutdown.rooms[0]).toMatchObject({ room: { version: editedVersion }, operationHistory: [] });
    // 裁剪和跳过后果不同，警告也不能混为一谈：这次没有房间被跳过（句尾固定说明里也有 "skipped rooms"，只能断言结论小句）。
    const trimWarning = lines(warn).find((line) => line.includes("trimmed operation history"));
    expect(trimWarning).toBeDefined();
    expect(trimWarning).toContain(roomId);
    expect(trimWarning).not.toContain("room(s) from persistence");

    // 3. 重启（同一个数据目录）：房间回来了，因此启动不该把它算进「上次关停未恢复」的损失里。
    info.mockClear();
    warn.mockClear();
    const second = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(second);
    expect(lines(info)).toContainEqual(expect.stringContaining("restored 1 collaboration room(s)"));
    expect(lines(warn).some((line) => line.includes("未恢复"))).toBe(false);

    const secondOrigin = await startServer(second);
    const restored = await fetch(`${secondOrigin}/api/rooms/${roomId}`, { headers: roomHeaders(token) });
    // 被裁剪的房间不是 404：快照连版本一起还在，凭证也照旧认。
    expect(restored.status).toBe(200);
    const restoredRoom = await restored.json() as {
      version: number;
      snapshot: { payload: string; historyPadding: string };
      persistence: { outcome: string; at: number | null };
    };
    expect(restoredRoom.version).toBe(editedVersion);
    expect(restoredRoom.snapshot.payload).toHaveLength(payload.length);
    expect(restoredRoom.snapshot.payload).toBe(payload);
    expect(restoredRoom.snapshot.historyPadding).toHaveLength(historyPaddingBytes);
    // 新进程还没落过盘，此刻没有落盘结论可报，不能拿上一个进程的裁剪去吓客户端。
    expect(restoredRoom.persistence).toEqual({ outcome: "persisted", at: null });

    // 4. 代价在增量接口上兑现：落后的客户端补不回 0 → 5，只能重新取一份完整快照。
    const gap = await fetch(`${secondOrigin}/api/rooms/${roomId}/operations?afterVersion=0`, { headers: roomHeaders(token) });
    expect(gap.status).toBe(409);
    await expect(gap.json()).resolves.toMatchObject({
      error: { code: "VERSION_CONFLICT", message: "增量历史已被裁剪，请重新获取完整快照", currentVersion: editedVersion },
    });
    // 已经跟到最新版本的客户端不受影响：裁剪掉的是历史，不是当前状态。
    const upToDate = await fetch(
      `${secondOrigin}/api/rooms/${roomId}/operations?afterVersion=${editedVersion}`,
      { headers: roomHeaders(token) },
    );
    expect(upToDate.status).toBe(200);
    await expect(upToDate.json()).resolves.toMatchObject({ version: editedVersion, operations: [] });

    // 5. 恢复编辑会把历史重新堆过上限，下一次落盘因此再次裁剪——运行中的服务要如实报出这个结论。
    const resumedVersion = await editWithHistory(secondOrigin, editedVersion, "trim-boot2");
    expect(resumedVersion).toBe(editedVersion + operationCount);
    warn.mockClear();
    await second.flushRooms!();

    const afterFlush = await fetch(`${secondOrigin}/api/rooms/${roomId}`, { headers: roomHeaders(token) });
    expect(afterFlush.status).toBe(200);
    const flushed = await afterFlush.json() as { persistedAtLastFlush: boolean; persistence: { outcome: string; at: number | null } };
    expect(flushed.persistence.outcome).toBe("trimmed");
    // 布尔字段只说得出「不是完整落盘」，裁剪与跳过的区别只在同级的 persistence.outcome 里。
    expect(flushed.persistedAtLastFlush).toBe(false);
    expect(flushed.persistence.at).toBeGreaterThan(0);

    const health = await fetch(`${secondOrigin}/api/health`)
      .then((response) => response.json()) as { rooms: { lastFlush: RoomPersistOutcome | null } };
    expect(health.rooms.lastFlush).toMatchObject({ trimmedIds: [roomId], skippedIds: [] });

    const afterFlushEnvelope = await readEnvelope(snapshotFile);
    expect(afterFlushEnvelope.trimmedRoomIds).toEqual([roomId]);
    expect(afterFlushEnvelope.skippedRoomIds).toBeUndefined();
    expect(afterFlushEnvelope.rooms[0]).toMatchObject({ room: { version: resumedVersion }, operationHistory: [] });
  }, 120_000);
});
