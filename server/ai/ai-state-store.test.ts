// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AI_RUNTIME_STATE_VERSION,
  createFileAiStateStore,
  createMemoryAiStateStore,
  emptyAiRuntimeState,
  type AiRuntimeState,
} from "./ai-state-store";

const stateWith = (taskId: string): AiRuntimeState => ({
  version: AI_RUNTIME_STATE_VERSION,
  budgetLedger: [{
    taskId,
    sequence: 2,
    receiptDigest: "deadbeef",
    usedTokens: 10,
    rounds: 1,
    updatedAt: 100,
    consumed: true,
  }],
  rateLimits: {
    agent: [{ key: "127.0.0.1", startedAt: 100, count: 2 }],
  },
});

describe("AI runtime state store", () => {
  it("starts an empty memory store ready and accepts bounded updates", async () => {
    const store = createMemoryAiStateStore();
    expect(store.mode).toBe("memory");
    expect(store.ready).toBe(false);
    expect(await store.load()).toEqual(emptyAiRuntimeState());
    await store.update((state) => {
      state.budgetLedger.push(stateWith("memory-task").budgetLedger[0]!);
    });
    await store.flush();
    expect(store.ready).toBe(true);
    expect(store.failure).toBe(false);
    expect((await store.load()).budgetLedger).toHaveLength(1);
  });

  it("serializes concurrent updates without losing either mutation", async () => {
    const store = createMemoryAiStateStore();
    await store.load();
    await Promise.all([
      store.update((state) => { state.budgetLedger.push(stateWith("one").budgetLedger[0]!); }),
      store.update((state) => { state.budgetLedger.push(stateWith("two").budgetLedger[0]!); }),
    ]);
    expect((await store.load()).budgetLedger.map((entry) => entry.taskId)).toEqual(["one", "two"]);
  });

  it("writes and reloads a file atomically, creating parent directories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-state-"));
    try {
      const file = join(directory, "nested", "ai-runtime-state.json");
      const store = createFileAiStateStore(file);
      await store.load();
      await store.update(() => stateWith("file-task"));
      await store.flush();

      const reloaded = createFileAiStateStore(file);
      await expect(reloaded.load()).resolves.toMatchObject({ budgetLedger: [{ taskId: "file-task" }] });
      expect(await readFile(file, "utf8")).not.toContain("prompt");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("quarantines corrupt JSON and recovers an empty ready state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-corrupt-"));
    try {
      const file = join(directory, "state.json");
      await writeFile(file, "{not-json", "utf8");
      const store = createFileAiStateStore(file);
      await expect(store.load()).resolves.toEqual(emptyAiRuntimeState());
      expect(store.recovered).toBe(true);
      expect(store.ready).toBe(true);
      expect((await readdir(directory)).some((name) => /^state\.json\.corrupt-\d+$/.test(name))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("cleans up the temporary file when the atomic rename fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-rename-"));
    try {
      const file = join(directory, "state.json");
      const store = createFileAiStateStore(file);
      await store.load();
      // 落盘目标被目录占住：写临时文件成功，rename 必然失败，孤儿 .tmp 就此留在数据目录。
      await mkdir(file);

      const rejection = await store.update(() => stateWith("blocked")).then(() => null, (error: unknown) => error);

      expect((await readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
      expect(rejection).toMatchObject({ code: "AI_STATE_PERSIST_FAILED" });
      // 清理是尽力而为，真正的 rename errno 不能被顶替掉。
      expect((rejection as { cause?: { code?: string } }).cause).toMatchObject({ code: "EISDIR" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps the original errno on cause when the state file cannot be read", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-load-"));
    try {
      const file = join(directory, "state.json");
      // 状态文件位置被目录占住：readFile 抛的是 EISDIR 而不是 ENOENT，属于真正的加载故障。
      await mkdir(file);
      const store = createFileAiStateStore(file);

      const rejection = await store.load().then(() => null, (error: unknown) => error);

      expect(rejection).toMatchObject({ code: "AI_STATE_LOAD_FAILED" });
      // 对外 code 稳定，排障要靠 cause 上的原始 errno 区分是路径被占还是权限不足。
      expect((rejection as { cause?: { code?: string } }).cause).toMatchObject({ code: "EISDIR" });
      expect(store.failure).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("caps quarantined corrupt sidecars at the newest five", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-sidecars-"));
    try {
      const file = join(directory, "state.json");
      for (let index = 1; index <= 7; index += 1) {
        const sidecar = `${file}.corrupt-${index * 1000}`;
        await writeFile(sidecar, "{not-json", "utf8");
        // 显式压时间戳，免得同毫秒创建让「留最新」的判定随机。
        await utimes(sidecar, index, index);
      }
      await writeFile(file, "{not-json", "utf8");

      const store = createFileAiStateStore(file);
      await expect(store.load()).resolves.toEqual(emptyAiRuntimeState());
      expect(store.recovered).toBe(true);

      const sidecars = (await readdir(directory)).filter((name) => name.startsWith("state.json.corrupt-"));
      expect(sidecars).toHaveLength(5);
      expect(sidecars.filter((name) => /^state\.json\.corrupt-[1-7]000$/.test(name)).sort()).toEqual([
        "state.json.corrupt-4000",
        "state.json.corrupt-5000",
        "state.json.corrupt-6000",
        "state.json.corrupt-7000",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails readiness for an unknown version without resetting the file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cengfan-ai-version-"));
    try {
      const file = join(directory, "state.json");
      await writeFile(file, JSON.stringify({ version: 99, budgetLedger: [], rateLimits: {} }), "utf8");
      const store = createFileAiStateStore(file);
      await expect(store.load()).rejects.toMatchObject({ code: "AI_STATE_UNSUPPORTED_VERSION" });
      expect(store.ready).toBe(false);
      expect(store.failure).toBe(true);
      expect(store.error).toMatchObject({ code: "AI_STATE_UNSUPPORTED_VERSION" });
      expect(await readFile(file, "utf8")).toContain("99");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
