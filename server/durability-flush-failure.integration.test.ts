// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type http from "node:http";
import { attachServerLifecycle, createReadyAiServer } from "./index";
import type { RoomPersistOutcome } from "./collaboration";
import {
  applyRoomTransaction,
  createCollaborationRoom,
  lines,
  orphanedTempFiles,
  readEnvelope,
  readRoomSnapshot,
  roomHeaders,
  startServer,
} from "./durability-helpers";

async function readLastFlush(origin: string): Promise<RoomPersistOutcome | null> {
  const health = await fetch(`${origin}/api/health`)
    .then((response) => response.json()) as { rooms: { lastFlush: RoomPersistOutcome | null } };
  return health.rooms.lastFlush;
}

// R7-1 的失败留痕此前只被「注入一个会抛的 persist」证过。抛异常的替身证不了两件事：
// 报出来的 message 是不是内核给的真 errno，以及真磁盘写不动时关停与下一次启动会怎样。
describe("collaboration room durability when the snapshot path cannot be written", () => {
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

  it("reports the real errno on health, contains the shutdown flush failure and reboots from the last good envelope", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-durability-flush-failure-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // 1. 冷启动 + 一次干净落盘：这一份就是后面必须活下来的「最后一份好信封」。
    //    心跳调到 60s：这条旅程只想观察落盘失败与关停的帧。
    const first = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const room = await createCollaborationRoom(firstOrigin, { title: "写不动之前" }, "flush-failure-owner");
    const createdVersion = room.room.version;
    await first.flushRooms!();

    const good = await readEnvelope(snapshotFile);
    expect(good.rooms.map(({ room: persisted }) => persisted.id)).toEqual([room.room.id]);
    const goodBytes = await readFile(snapshotFile, "utf8");
    const healthy = await readLastFlush(firstOrigin);
    expect(healthy).toMatchObject({ skippedIds: [], trimmedIds: [] });
    expect(healthy!.lastFailure).toBeUndefined();
    const succeededAt = healthy!.at;
    expect(succeededAt).toBeGreaterThan(0);

    // 2. 让磁盘真的写不动。写快照的两步是「写 <file>.<pid>.tmp」再「rename 到 <file>」，
    //    这里在那个临时路径上放一个同名目录：open(2) 撞上目录，内核给出真实 EISDIR。
    //    选它而不是 chmod 数据目录，有三个理由：
    //    a) root 身份下目录权限位形同虚设（容器里跑测试很常见），撞目录对任何 uid 都成立；
    //    b) 最后一份好信封原地不动，「重启后恢复的是它」才是产品行为而不是测试自己写回去的；
    //    c) 只挡住房间快照这一条路径，AI 状态照常落盘，关停里的失败因此只可能来自房间落盘。
    //    临时路径的命名与 index.ts 的 writer 耦合：命名一旦变了，下面的 rejects 断言会立刻变红，
    //    不会静默地退化成「落盘其实成功了」。占位目录在 finally 里删除。
    const temporaryPath = `${snapshotFile}.${process.pid}.tmp`;
    await mkdir(temporaryPath);
    try {
      // 3. 磁盘写不动期间照常有人编辑房间：运行期的读写不该被落盘故障挡住。
      const edited = await fetch(`${firstOrigin}/api/rooms/${room.room.id}/transactions`, {
        method: "POST",
        headers: roomHeaders(room.access.accessToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          txId: "flush-failure-1",
          clientId: "flush-failure-owner",
          baseVersion: createdVersion,
          snapshot: { title: "写不动之前", edited: true },
        }),
      });
      expect(edited.status).toBe(200);
      const editedVersion = (await edited.json() as { version: number }).version;
      expect(editedVersion).toBeGreaterThan(createdVersion);

      // 4. 显式落盘必须失败，而且是带着内核 errno 失败——不能被吞成一次「成功」。
      await expect(first.flushRooms!()).rejects.toThrow(/EISDIR/);

      // 5. 健康检查是这段事故期唯一的外部观测点：新的失败留痕 + 上一次成功的时刻，
      //    两者同时在场才说得清「最后一次写成功是什么时候、之后一直在失败」。
      const degraded = await readLastFlush(firstOrigin);
      expect(degraded).toMatchObject({
        skippedIds: [],
        trimmedIds: [],
        at: succeededAt,
        lastFailure: { at: expect.any(Number), message: expect.stringContaining("EISDIR") },
      });
      // 真 errno 而不是我们编的字符串：内核把出错的路径也一并写进 message。
      expect(degraded!.lastFailure!.message).toContain(temporaryPath);
      expect(degraded!.lastFailure!.at).toBeGreaterThanOrEqual(succeededAt);
      // 落盘失败不该顺手毁掉盘上那份还能用的信封。
      expect(await readFile(snapshotFile, "utf8")).toBe(goodBytes);

      // 6. R4-5 的containment：关停时的落盘再失败一次，进程必须走完关停并留下记录，而不是崩掉。
      error.mockClear();
      const shutdown = attachServerLifecycle(first, { timeoutMs: 3_000 }).shutdown("SIGTERM");
      await expect(shutdown).resolves.toBeUndefined();
      const reported = error.mock.calls.find((call) => String(call[0]).includes("[shutdown] 状态落盘失败"));
      expect(reported).toBeDefined();
      expect(String((reported![1] as Error).message)).toContain("EISDIR");
      // 关停失败是有声的，但退出码仍是 0：这条旅程要的是「没崩」，不是「没事」。
      expect(await readFile(snapshotFile, "utf8")).toBe(goodBytes);
      expect((await readdir(dataDir)).filter((name) => name.endsWith(".bad"))).toEqual([]);
    } finally {
      // 还原：删掉占位目录，数据目录回到普通可写状态。快照文件全程没被测试碰过。
      await rm(temporaryPath, { recursive: true, force: true });
    }

    // 7. 磁盘恢复之后重启：读到的就是那份最后的好信封，写不动期间的编辑本来就没落盘，
    //    因此不该凭空出现；能解析的信封也不该被当成坏快照隔离到 .bad。
    info.mockClear();
    warn.mockClear();
    const second = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(second);
    expect(lines(info)).toContainEqual(expect.stringContaining("restored 1 collaboration room(s)"));
    expect(lines(warn).some((line) => line.includes("未恢复"))).toBe(false);
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".bad"))).toEqual([]);

    const secondOrigin = await startServer(second);
    const restored = await fetch(`${secondOrigin}/api/rooms/${room.room.id}`, {
      headers: roomHeaders(room.access.accessToken),
    });
    expect(restored.status).toBe(200);
    const restoredRoom = await restored.json() as { version: number; snapshot: { title: string; edited?: boolean } };
    expect(restoredRoom.snapshot).toEqual({ title: "写不动之前" });
    expect(restoredRoom.version).toBe(createdVersion);

    // 8. 新进程的落盘重新走通：事故期的失败留痕属于上一个进程，不能挂在这里吓人。
    await second.flushRooms!();
    const recovered = await readLastFlush(secondOrigin);
    expect(recovered).toMatchObject({ skippedIds: [], trimmedIds: [] });
    expect(recovered!.lastFailure).toBeUndefined();
    expect(recovered!.at).toBeGreaterThan(succeededAt);
    expect((await readEnvelope(snapshotFile)).rooms.map(({ room: persisted }) => persisted.id)).toEqual([room.room.id]);
  }, 120_000);

  // 上面那条旅程占的是**临时**路径：writeFile 在 open(2) 就撞墙，临时文件压根没被创建过，
  // 所以它证不了 R9-1——「rename 失败后把已经写出来的临时文件收掉」这条清理路径它一次也没走。
  // 这条旅程把占位挪到**最终**路径上，正好是它的反面：write 成功、rename 撞上目录拿到真 EISDIR，
  // 磁盘上于是真的出现过一个 `<file>.<pid>.tmp`，「事后数据目录里没有孤儿」才第一次成为断言。
  // 顺带把 R9-2 的失败留痕从注入替身挪到内核 errno 上：ack 与快照两个响应都得带着它。
  it("cleans up the leaked .tmp when rename hits a real EISDIR and reports it on the ack, the snapshot and health", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-durability-rename-failure-"));
    directories.push(dataDir);
    const snapshotFile = join(dataDir, "collaboration-rooms.json");
    const temporaryPath = `${snapshotFile}.${process.pid}.tmp`;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // 1. 冷启动 + 一次干净落盘，先把那份好信封的字节留在手上。
    const first = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(first);
    const firstOrigin = await startServer(first);
    const room = await createCollaborationRoom(firstOrigin, { title: "改名之前" }, "rename-failure-owner");
    const createdVersion = room.room.version;
    await first.flushRooms!();
    const goodBytes = await readFile(snapshotFile, "utf8");
    const healthy = await readLastFlush(firstOrigin);
    expect(healthy!.lastFailure).toBeUndefined();
    const succeededAt = healthy!.at;
    expect(succeededAt).toBeGreaterThan(0);
    // 干净落盘之后临时文件必须已经不在：后面「有孤儿」的结论才只能来自那次失败。
    expect(await orphanedTempFiles(dataDir)).toEqual([]);

    // 2. 让 rename 写不动而 write 写得动：把最终路径换成同名目录。
    //    rename(2) 把文件改名到一个已存在的目录上会拿到 EISDIR，而临时路径仍是普通可写路径。
    //    选目录占位而不是 chmod：容器里测试常以 root 跑，权限位对 root 形同虚设，撞目录对任何 uid 都成立。
    //    代价是那份好信封得先删掉——所以先存字节，finally 里原样写回去（写回的就是产品自己写出来的字节）。
    await rm(snapshotFile);
    await mkdir(snapshotFile);
    try {
      // 3. 磁盘写不动期间照常有人编辑。失败还没发生，ack 此刻就该干干净净。
      const before = await applyRoomTransaction(firstOrigin, room.room.id, room.access.accessToken, {
        txId: "rename-failure-1",
        clientId: "rename-failure-owner",
        baseVersion: createdVersion,
        snapshot: { title: "改名之前", edited: true },
      });
      expect(before.version).toBeGreaterThan(createdVersion);
      expect(before.persistence).toEqual({ outcome: "persisted", at: succeededAt });

      // 4. 显式落盘必须带着内核 errno 失败。这里不看 message 里有没有 "EISDIR" 就算数：
      //    syscall 是 rename 而不是 open、path 是临时文件、dest 是最终路径，
      //    三者合起来才说明「临时文件确实写出来过，倒在了改名这一步」——这正是 R8-8 到不了的那一帧。
      const failure = await first.flushRooms!().then(
        () => undefined,
        (reason: unknown) => reason as NodeJS.ErrnoException,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toMatchObject({ code: "EISDIR", syscall: "rename", path: temporaryPath, dest: snapshotFile });

      // 5. R9-1：改名失败之后数据目录里不许留下孤儿临时文件。
      //    落盘故障会一直重复，不收掉就是每个失败周期堆一份，最后把数据目录撑爆。
      expect(await orphanedTempFiles(dataDir)).toEqual([]);
      // 产品也没往占位目录里写进任何东西。
      expect(await readdir(snapshotFile)).toEqual([]);

      // 6. 健康检查上是真 errno，而不是我们编的字符串；上一次成功的时刻原地不动。
      const degraded = await readLastFlush(firstOrigin);
      expect(degraded).toMatchObject({
        skippedIds: [],
        trimmedIds: [],
        at: succeededAt,
        lastFailure: { at: expect.any(Number), message: expect.stringContaining("EISDIR") },
      });
      expect(degraded!.lastFailure!.message).toContain(`rename '${temporaryPath}' -> '${snapshotFile}'`);
      const failedAt = degraded!.lastFailure!.at;
      expect(failedAt).toBeGreaterThanOrEqual(succeededAt);

      // 7. R9-2：同一个真 errno 得沿着 HTTP 走到编辑者面前。
      //    稳态下编辑者只反复收到事务 ack，创建/加入那两个报落盘的响应他一次也不会再取；
      //    而 persistedAtLastFlush 这个老布尔仍是 true——它说的是上一次成功，磁盘正在坏掉它一个字也不改。
      const after = await applyRoomTransaction(firstOrigin, room.room.id, room.access.accessToken, {
        txId: "rename-failure-2",
        clientId: "rename-failure-owner",
        baseVersion: before.version,
        snapshot: { title: "改名之前", edited: true, again: true },
      });
      expect(after.persistedAtLastFlush).toBe(true);
      expect(after.persistence).toEqual({ outcome: "persisted", at: succeededAt, lastFailureAt: failedAt });
      // 快照响应必须讲同一件事，否则换个入口进来的客户端看到的是一片太平。
      const snapshot = await readRoomSnapshot(firstOrigin, room.room.id, room.access.accessToken);
      expect(snapshot.persistence).toEqual({ outcome: "persisted", at: succeededAt, lastFailureAt: failedAt });

      // 8. R4-5 的 containment：关停时再失败一次，进程走完关停并留下记录，而且仍然不留孤儿。
      error.mockClear();
      const shutdown = attachServerLifecycle(first, { timeoutMs: 3_000 }).shutdown("SIGTERM");
      await expect(shutdown).resolves.toBeUndefined();
      const reported = error.mock.calls.find((call) => String(call[0]).includes("[shutdown] 状态落盘失败"));
      expect(reported).toBeDefined();
      expect(String((reported![1] as Error).message)).toContain("EISDIR");
      expect(await orphanedTempFiles(dataDir)).toEqual([]);
    } finally {
      // 还原：撤掉占位目录，把第 1 步存下来的那份好信封原样写回最终路径。
      await rm(snapshotFile, { recursive: true, force: true });
      await writeFile(snapshotFile, goodBytes, "utf8");
    }

    // 9. 磁盘恢复之后重启：恢复的是那份好信封，写不动期间的两次编辑本来就没落盘，不该凭空出现。
    info.mockClear();
    warn.mockClear();
    const second = await createReadyAiServer({ dataDir, roomHeartbeatIntervalMs: 60_000 });
    servers.push(second);
    expect(lines(info)).toContainEqual(expect.stringContaining("restored 1 collaboration room(s)"));
    expect(lines(warn).some((line) => line.includes("未恢复"))).toBe(false);
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".bad"))).toEqual([]);

    const secondOrigin = await startServer(second);
    const restored = await readRoomSnapshot(secondOrigin, room.room.id, room.access.accessToken);
    expect(restored.snapshot).toEqual({ title: "改名之前" });
    expect(restored.version).toBe(createdVersion);
    // 新进程没有失败连击可报：事故属于上一个进程。
    expect(restored.persistence.lastFailureAt).toBeUndefined();

    await second.flushRooms!();
    const recovered = await readLastFlush(secondOrigin);
    expect(recovered!.lastFailure).toBeUndefined();
    expect(recovered!.at).toBeGreaterThan(succeededAt);
    expect(await orphanedTempFiles(dataDir)).toEqual([]);
  }, 120_000);
});
