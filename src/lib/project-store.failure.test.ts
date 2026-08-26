import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  ProjectStoreError,
  type ProjectStoreHealth,
} from "./project-store";
import {
  abortWithQuotaError,
  failingFactory,
  hookedFactory,
  storedProject,
} from "./project-store-test-fixtures";

describe("project store failure taxonomy", () => {
  it("reports a healthy IndexedDB store as persistent and a memory store as memory", async () => {
    const store = createIndexedDbProjectStore(new IDBFactory());
    await store.put(storedProject("proj-healthy"));
    expect(store.health).toBe("persistent");
    expect(createMemoryProjectStore().health).toBe("memory");
  });

  it("falls back to memory after the open retries are exhausted", async () => {
    let opens = 0;
    const changes: ProjectStoreHealth[] = [];
    const store = createIndexedDbProjectStore(failingFactory(() => { opens += 1; }), {
      openRetries: 1,
      retryDelayMs: 0,
      onHealthChange: (health) => changes.push(health),
    });
    expect(store.health).toBe("persistent");

    await store.put(storedProject("proj-degraded", "降级项目"));

    expect(store.health).toBe("memory");
    // 只有重试用尽才降级：一次开库失败不能立刻放弃持久化。
    expect(opens).toBeGreaterThan(1);
    expect(changes).toEqual(["memory"]);
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-degraded"]);
    expect((await store.get("proj-degraded"))?.name).toBe("降级项目");
    await store.remove("proj-degraded");
    expect(await store.list()).toEqual([]);
    expect(changes).toEqual(["memory"]);
  });

  it("serves reads from the fallback when the very first call cannot open the database", async () => {
    const store = createIndexedDbProjectStore(failingFactory(() => undefined), { openRetries: 0, retryDelayMs: 0 });

    expect(await store.list()).toEqual([]);
    expect(await store.get("anything")).toBeNull();
    expect(store.health).toBe("memory");
  });

  it("maps a quota-exceeded abort to a typed, user-readable message", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      abortWithQuotaError(tx);
    }));
    await store.list();

    armed = true;
    const failure = await store.put(storedProject("proj-quota")).then(() => null, (error: unknown) => error);

    expect(failure).toBeInstanceOf(ProjectStoreError);
    expect((failure as ProjectStoreError).code).toBe("quota-exceeded");
    expect((failure as ProjectStoreError).message).toContain("本机存储空间不足");
    // 配额失败不是持久层失效，不应降级。
    expect(store.health).toBe("persistent");
  });

  it("keeps the generic abort message for non-quota write failures", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      queueMicrotask(() => tx.abort());
    }));
    await store.list();

    armed = true;
    const failure = await store.put(storedProject("proj-plain")).then(() => null, (error: unknown) => error);

    expect((failure as ProjectStoreError).code).toBe("write-aborted");
    expect((failure as ProjectStoreError).message).toBe("IndexedDB 写入中止");
  });

  it("types the unsupported-browser failure without pretending to persist", async () => {
    const store = createIndexedDbProjectStore(null as unknown as IDBFactory);
    const failure = await store.put(createSampleProject()).then(() => null, (error: unknown) => error);

    expect((failure as ProjectStoreError).code).toBe("unsupported");
    expect(store.health).toBe("memory");
  });

  it("rejects list() when a read transaction aborts instead of pretending the library is empty", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readonly") return;
      armed = false;
      queueMicrotask(() => tx.abort());
    }));
    await store.put(storedProject("proj-still-there", "还在盘上"));
    armed = true;
    const failure = await store.list().then(() => null, (error: unknown) => error);

    expect(failure).toBeInstanceOf(ProjectStoreError);
    expect((failure as ProjectStoreError).code).toBe("read-aborted");
    expect((failure as ProjectStoreError).message).toBe("IndexedDB 读取中止");
    expect(store.health).toBe("persistent");
  });

  it("does not reopen the database once it degraded to memory", async () => {
    const open = vi.fn();
    const store = createIndexedDbProjectStore(failingFactory(open), { openRetries: 0, retryDelayMs: 0 });
    await store.list();
    const attempts = open.mock.calls.length;

    await store.put(storedProject("proj-after-degrade"));
    await store.list();

    expect(open.mock.calls.length).toBe(attempts);
  });
});
