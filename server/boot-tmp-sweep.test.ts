// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type http from "node:http";
import { emptyAiRuntimeState, type AiStateStore } from "./ai/ai-state-store";
import { createReadyAiServer } from "./index";

/**
 * Boot-order pin for R10-2: the sweep must run before the first reader touches `dataDir`.
 * Lives here rather than in `index.test.ts` so that allowlisted file does not grow.
 */
describe("boot-time atomic-write temporary sweep", () => {
  const servers: http.Server[] = [];
  const directories: string[] = [];

  afterEach(async () => {
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

  it("sweeps orphaned atomic-write temporaries before the first reader touches the data directory", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-boot-sweep-"));
    directories.push(dataDir);
    // 上一次进程崩在 write 与 rename 之间留下的三份孤儿，本进程谁都不认领。
    for (const name of ["workspace.json.12345.tmp", "collaboration-rooms.json.999.tmp", "ai-state.json.4.tmp"]) {
      await writeFile(join(dataDir, name), "half-written", "utf8");
    }
    const seenAtLoad: string[][] = [];
    // AI 状态是启动路径上第一个碰磁盘的读者：它看到的目录里就必须已经没有孤儿了，
    // 否则扫地排在了写者上膛之后，本次启动照样可能把新的临时文件一起收掉。
    const aiStateStore: AiStateStore = {
      mode: "memory",
      ready: true,
      recovered: false,
      failure: false,
      load: async () => {
        seenAtLoad.push((await readdir(dataDir)).filter((name) => name.endsWith(".tmp")));
        return emptyAiRuntimeState();
      },
      update: async () => undefined,
      flush: async () => undefined,
    };

    servers.push(await createReadyAiServer({ dataDir, aiStateStore }));

    expect(seenAtLoad).toEqual([[]]);
    expect((await readdir(dataDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("sweeps the state file's own orphaned temporaries when it is configured outside the data directory", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "cengfan-boot-sweep-data-"));
    const stateDir = await mkdtemp(join(tmpdir(), "cengfan-boot-sweep-state-"));
    directories.push(dataDir, stateDir);
    const stateFile = join(stateDir, "ai-runtime-state.json");
    // 上一次进程崩在状态文件的 write 与 rename 之间；这份孤儿不在 dataDir 里，扫 dataDir 的那一轮够不着。
    await writeFile(`${stateFile}.4.tmp`, "half-written", "utf8");
    // 运维完全可能把状态文件指进一个共享目录：同样形状但不是我们文件名的临时文件是别人的，一根汗毛都不能动。
    await writeFile(join(stateDir, "someone-elses.json.4.tmp"), "not ours", "utf8");
    const seenAtLoad: string[][] = [];
    const aiStateStore: AiStateStore = {
      mode: "memory",
      ready: true,
      recovered: false,
      failure: false,
      load: async () => {
        seenAtLoad.push((await readdir(stateDir)).filter((name) => name.endsWith(".tmp")).sort());
        return emptyAiRuntimeState();
      },
      update: async () => undefined,
      flush: async () => undefined,
    };

    const previous = process.env.AI_STATE_FILE;
    process.env.AI_STATE_FILE = stateFile;
    try {
      servers.push(await createReadyAiServer({ dataDir, aiStateStore }));
    } finally {
      if (previous === undefined) delete process.env.AI_STATE_FILE;
      else process.env.AI_STATE_FILE = previous;
    }

    // 状态文件的读者也排在扫地之后，而邻居的临时文件必须原样留着。
    expect(seenAtLoad).toEqual([["someone-elses.json.4.tmp"]]);
    expect((await readdir(stateDir)).filter((name) => name.endsWith(".tmp"))).toEqual(["someone-elses.json.4.tmp"]);
  });
});
