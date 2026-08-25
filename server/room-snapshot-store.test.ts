// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { attachServerLifecycle, createReadyAiServer } from "./index";

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** 创建/加入/快照三个响应上的落盘三态兄弟字段；`at` 为 null 表示还没有成功落过盘。 */
interface RoomPersistenceField {
  outcome: "persisted" | "trimmed" | "skipped";
  at: number | null;
  /** 最近一次落盘失败的时刻；当前没有失败连击时这个键不出现。 */
  lastFailureAt?: number;
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
    persistence?: RoomPersistenceField;
  }>;
}

function roomHeaders(accessToken: string, headers: Record<string, string> = {}): Record<string, string> {
  return { "X-Cengfan-Room-Token": accessToken, ...headers };
}

describe("room snapshot store", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections?.();
          }),
      ),
    );
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
    servers.length = 0;
    directories.length = 0;
  });

  it("writes the room snapshot into the data directory and reloads it on the next boot", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-"));
    directories.push(dataDir);
    const first = await createReadyAiServer({ dataDir });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const created = await createCollaborationRoom(firstOrigin, { title: "落盘" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    const restarted = await createReadyAiServer({ dataDir });
    servers.push(restarted);
    const restartedOrigin = await startServer(restarted);
    const response = await fetch(`${restartedOrigin}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: created.room.id, snapshot: { title: "落盘" } });
  });

  it("quarantines a corrupt room snapshot and keeps the sidecar across the next flush", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-corrupt-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    // 半截 JSON：进程在落盘途中被杀掉时磁盘上就是这种内容。
    const corrupt = "{\"version\":1,\"rooms\":[{\"room\":";
    await writeFile(snapshotFile, corrupt, "utf8");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const server = await createReadyAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);

    // 坏文件必须离开正常路径，否则下一次成功落盘会把事故现场覆盖掉。
    await expect(readFile(snapshotFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${snapshotFile}.bad`, "utf8")).resolves.toBe(corrupt);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${snapshotFile}.bad`));
    expect((await fetch(`${origin}/api/live`)).status).toBe(200);

    const created = await createCollaborationRoom(origin, { title: "坏快照之后" });
    await attachServerLifecycle(server, { timeoutMs: 2_000 }).shutdown("SIGTERM");

    const rewritten = JSON.parse(await readFile(snapshotFile, "utf8")) as { version: number; rooms: Array<{ room: { id: string } }> };
    expect(rewritten.version).toBe(1);
    expect(rewritten.rooms.map((entry) => entry.room.id)).toEqual([created.room.id]);
    await expect(readFile(`${snapshotFile}.bad`, "utf8")).resolves.toBe(corrupt);
  });

  it("keeps the earlier sidecar by timestamping a second corrupt boot", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-corrupt-twice-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await writeFile(snapshotFile, "first-corrupt", "utf8");
    servers.push(await createReadyAiServer({ dataDir }));
    await writeFile(snapshotFile, "second-corrupt", "utf8");
    servers.push(await createReadyAiServer({ dataDir }));

    await expect(readFile(snapshotFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    // 第一次隔离出来的证据不能被第二次坏启动顶掉。
    await expect(readFile(`${snapshotFile}.bad`, "utf8")).resolves.toBe("first-corrupt");
    const sidecars = (await readdir(dataDir)).filter((name) => name.endsWith(".bad"));
    expect(sidecars).toHaveLength(2);
    const timestamped = sidecars.find((name) => name !== "collaboration-rooms.json.bad")!;
    expect(timestamped).toMatch(/^collaboration-rooms\.json\.\d+(?:\.\d+)?\.bad$/);
    await expect(readFile(join(dataDir, timestamped), "utf8")).resolves.toBe("second-corrupt");
  });

  it("quarantines a snapshot that parses but carries an unusable envelope", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-envelope-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    // 合法 JSON、但信封不是 version 1 + rooms 数组：房间存储会整份丢弃它。
    const unusable = JSON.stringify({ version: 2, rooms: "nope" });
    await writeFile(snapshotFile, unusable, "utf8");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const server = await createReadyAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);

    // 无法使用的信封同样是事故现场，留在正常路径上会被下一次成功落盘覆盖。
    await expect(readFile(snapshotFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(`${snapshotFile}.bad`, "utf8")).resolves.toBe(unusable);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${snapshotFile}.bad`));
    expect(info).not.toHaveBeenCalledWith(expect.stringContaining("collaboration room(s)"));
    expect((await fetch(`${origin}/api/live`)).status).toBe(200);
  });

  it("keeps only the newest quarantined sidecars instead of letting them pile up", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-sidecar-cap-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let index = 0; index < 6; index += 1) {
      const sidecar = index === 0 ? `${snapshotFile}.bad` : `${snapshotFile}.${1_700_000_000_000 + index}.bad`;
      await writeFile(sidecar, `old-${index}`, "utf8");
      const modifiedAt = new Date(Date.now() - (6 - index) * 60_000);
      await utimes(sidecar, modifiedAt, modifiedAt);
    }
    await writeFile(snapshotFile, "latest-corrupt", "utf8");

    servers.push(await createReadyAiServer({ dataDir }));

    const sidecars = (await readdir(dataDir)).filter((name) => name.endsWith(".bad"));
    expect(sidecars).toHaveLength(5);
    const contents = await Promise.all(sidecars.map((name) => readFile(join(dataDir, name), "utf8")));
    expect(contents).toContain("latest-corrupt");
    // 超出上限时先丢最旧的证据，近期的坏启动现场必须留住。
    expect(contents).not.toContain("old-0");
    expect(contents).not.toContain("old-1");
    expect(contents).toEqual(expect.arrayContaining(["old-2", "old-3", "old-4", "old-5"]));
  });

  it("removes the room snapshot temp file when the rename fails, and still reports the rename error", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-rename-"));
    directories.push(dataDir);
    // 快照的最终路径被一个同名目录占住：写临时文件仍然成功，rename(2) 撞上目录给出真实 EISDIR。
    await mkdir(join(dataDir, "collaboration-rooms.json"));
    const server = await createReadyAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);
    await createCollaborationRoom(origin, { title: "改名失败" });

    // 清理临时文件不能顶掉原始失败：关停路径和健康检查都靠这个 errno 说清事故。
    await expect(server.flushRooms!()).rejects.toThrow(/EISDIR/);
    // 落盘按固定间隔重试，每失败一次就多一份 <file>.<pid>.tmp 的话，数据目录会被慢慢填满。
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("sweeps atomic-write temporaries orphaned by a crashed previous boot", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-orphan-tmp-"));
    directories.push(dataDir);
    // 上一次进程在 write 与 rename 之间被 SIGKILL：这三份 <file>.<pid>.tmp 谁也收不掉，
    // 因为 R9-1 的清理只在本进程的 rename 失败路径上跑。
    const orphans = ["workspace.json.12345.tmp", "collaboration-rooms.json.999.tmp", "ai-state.json.4.tmp"];
    for (const name of orphans) await writeFile(join(dataDir, name), "half-written", "utf8");

    servers.push(await createReadyAiServer({ dataDir }));

    expect((await readdir(dataDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("sweeps the temporary left under this process's own pid, which can only be a previous boot's", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-own-pid-tmp-"));
    directories.push(dataDir);
    // 启动那一刻还没有任何写者上膛，所以哪怕名字里的 pid 正是本进程，也只可能是上一次启动留下的。
    const ownPid = join(dataDir, `collaboration-rooms.json.${process.pid}.tmp`);
    await writeFile(ownPid, "half-written", "utf8");

    servers.push(await createReadyAiServer({ dataDir }));

    await expect(readFile(ownPid, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves sidecars, live data files, and non-pid .tmp names alone while sweeping", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-sweep-scope-"));
    directories.push(dataDir);
    const survivors = [
      // 事故现场：R9-7 的 .bad 与 R10-1 的 .corrupt-*，扫临时文件时一份都不能顺手带走。
      "collaboration-rooms.json.bad",
      "collaboration-rooms.json.1700000000000.bad",
      "ai-runtime-state.json.corrupt-1700000000000",
      // 正常数据文件。
      "workspace.json",
      // 名字形状不对：既不是 `<file>.<pid>.tmp`，就不是原子写留下的，来历不明不动它。
      "workspace.json.abc.tmp",
      "scratch.tmp",
      ".tmp",
    ];
    for (const name of survivors) await writeFile(join(dataDir, name), `keep-${name}`, "utf8");
    await writeFile(join(dataDir, "workspace.json.777.tmp"), "half-written", "utf8");

    servers.push(await createReadyAiServer({ dataDir }));

    const remaining = (await readdir(dataDir)).filter((name) => survivors.includes(name) || name.endsWith(".tmp"));
    expect(remaining.sort()).toEqual([...survivors].sort());
  });

  it("keeps the good envelope from the previous boot while sweeping that boot's orphaned temporaries", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-sweep-envelope-"));
    directories.push(dataDir);
    const first = await createReadyAiServer({ dataDir });
    servers.push(first);
    const created = await createCollaborationRoom(await startServer(first), { title: "扫过之后还在" });
    await attachServerLifecycle(first, { timeoutMs: 2_000 }).shutdown("SIGTERM");
    // 落盘成功的信封与崩溃留下的孤儿躺在同一个目录里，扫地的只准带走后者。
    await writeFile(join(dataDir, "collaboration-rooms.json.999.tmp"), "half-written", "utf8");

    const restarted = await createReadyAiServer({ dataDir });
    servers.push(restarted);
    const response = await fetch(`${await startServer(restarted)}/api/rooms/${created.room.id}`, {
      headers: roomHeaders(created.access.accessToken),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ snapshot: { title: "扫过之后还在" } });
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("boots anyway when a leftover temporary cannot be removed", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-sweep-fail-"));
    directories.push(dataDir);
    // 名字对上了却是个非空目录：rm 不带 recursive 会失败，扫地失败不能把启动挡下来。
    await mkdir(join(dataDir, "workspace.json.42.tmp"));
    await writeFile(join(dataDir, "workspace.json.42.tmp", "inner"), "x", "utf8");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const server = await createReadyAiServer({ dataDir });
    servers.push(server);

    expect((await fetch(`${await startServer(server)}/api/live`)).status).toBe(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("workspace.json.42.tmp"), expect.anything());
  });

  it("writes the room snapshot as a private file", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-rooms-mode-"));
    directories.push(dataDir);
    const server = await createReadyAiServer({ dataDir });
    servers.push(server);
    const origin = await startServer(server);
    await createCollaborationRoom(origin, { title: "私有" });
    await server.flushRooms!();

    // 快照里带着房间凭证：改名之后躺在正常路径上的那份仍必须只有属主可读。
    const info = await stat(join(dataDir, "collaboration-rooms.json"));
    expect(info.mode & 0o777).toBe(0o600);
  });
});
