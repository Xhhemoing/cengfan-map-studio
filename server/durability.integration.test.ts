// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { attachServerLifecycle, createReadyAiServer } from "./index";
import { MAX_PERSISTED_ROOM_BYTES } from "./collaboration";

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

/** 快照信封在磁盘上的形状：这条旅程只关心恢复了谁、上次关停丢了谁。 */
interface PersistedEnvelope {
  version: number;
  rooms: { room: { id: string } }[];
  skippedRoomCount?: number;
  skippedRoomIds?: string[];
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
});
