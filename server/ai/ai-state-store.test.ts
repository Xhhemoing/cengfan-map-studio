// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
