import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
  ProjectStoreError,
  type ProjectStoreHealth,
  type StoredProject,
} from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, createProjectPackageEnvelope } from "./project-package";

type TransactionHook = (tx: IDBTransaction, db: IDBDatabase) => void;

/** 包装 factory：拿到 store 内部创建的连接与事务，用来注入中止 / 断连等破坏性场景。 */
function hookedFactory(real: IDBFactory, onTransaction: TransactionHook): IDBFactory {
  const patch = (db: IDBDatabase) => {
    const marked = db as IDBDatabase & { __hooked?: boolean };
    if (marked.__hooked) return;
    marked.__hooked = true;
    const openTransaction = db.transaction.bind(db);
    db.transaction = ((...args: Parameters<IDBDatabase["transaction"]>) => {
      const tx = openTransaction(...args);
      onTransaction(tx, db);
      return tx;
    }) as IDBDatabase["transaction"];
  };
  return {
    cmp: (a: unknown, b: unknown) => real.cmp(a, b),
    databases: () => real.databases(),
    deleteDatabase: (name: string) => real.deleteDatabase(name),
    open: (name: string, version?: number) => {
      const request = real.open(name, version);
      const capture = () => { if (request.result) patch(request.result); };
      request.addEventListener("upgradeneeded", capture);
      request.addEventListener("success", capture);
      return request;
    },
  } as unknown as IDBFactory;
}

/** 让 put 请求成功后、事务提交前中止：此时不会有 request error，只有 abort 事件。 */
function abortAfterPut(tx: IDBTransaction): void {
  const openStore = tx.objectStore.bind(tx);
  tx.objectStore = ((name: string) => {
    const store = openStore(name);
    const put = store.put.bind(store);
    store.put = ((value: unknown, key?: IDBValidKey) => {
      const request = put(value, key);
      request.addEventListener("success", () => tx.abort());
      return request;
    }) as IDBObjectStore["put"];
    return store;
  }) as IDBTransaction["objectStore"];
}

/** 每次 open 都异步失败的 factory：模拟隐私模式 / 数据库损坏导致的持久层不可用。 */
function failingFactory(onOpen: () => void): IDBFactory {
  return {
    cmp: () => 0,
    databases: async () => [],
    deleteDatabase: () => { throw new Error("不支持删除"); },
    open: () => {
      onOpen();
      const request = {
        result: undefined,
        error: new DOMException("模拟打开失败", "UnknownError"),
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null,
        onblocked: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

/** 让写事务带着配额错误中止：真实浏览器写满配额时 transaction.error 就是这个 DOMException。 */
function abortWithQuotaError(tx: IDBTransaction): void {
  (tx as { error: DOMException | null }).error = new DOMException("配额不足", "QuotaExceededError");
  queueMicrotask(() => tx.abort());
}

function storedProject(id: string, name = id): StoredProject {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pack: createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 },
    }),
  };
}

function writeRaw(factory: IDBFactory, record: unknown, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open("cengfan-map-studio");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(record, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

describe("project store", () => {
  it("lists, gets, puts, and removes projects", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    expect((await store.list()).map((p) => p.id)).toEqual([sample.id]);
    expect((await store.get(sample.id))?.name).toBe("示例：2026届毕业去向");
    await store.remove(sample.id);
    expect(await store.list()).toEqual([]);
  });

  it("returns null for a missing project", async () => {
    const store = createMemoryProjectStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("sample project contains the 12 built-in students", () => {
    const sample = createSampleProject();
    expect(sample.pack.project.students).toHaveLength(12);
    expect(sample.pack.project.students[0]?.name).toBe("林舟");
  });

  it("empty project has no students", () => {
    expect(createEmptyProject().pack.project.students).toEqual([]);
  });

  it("duplicates a project with a fresh id", () => {
    const sample = createSampleProject();
    const copy = duplicateStoredProject(sample, "复制项目");
    expect(copy.id).not.toBe(sample.id);
    expect(copy.name).toBe("复制项目");
    expect(copy.pack.project.students).toHaveLength(12);
    expect(copy.pack).not.toBe(sample.pack);
  });

  it("keeps server-side package valid through the round trip", async () => {
    const store = createMemoryProjectStore();
    const pack = createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 },
    });
    await store.put({ id: "p1", name: "x", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", pack });
    expect((await store.get("p1"))?.pack.project).toBeDefined();
  });

  it("list() returns clones so caller mutations do not pollute the store", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const listed = await store.list();
    listed[0]!.name = "被修改的名字";
    listed[0]!.studentCount = 0;
    const relisted = await store.list();
    expect(relisted[0]!.name).toBe("示例：2026届毕业去向");
    expect(relisted[0]!.studentCount).toBe(12);
    expect((await store.get(sample.id))?.name).toBe("示例：2026届毕业去向");
    expect((await store.get(sample.id))?.pack.project.students[0]!.name).toBe("林舟");
  });

  it("throws when the IndexedDB factory is unavailable", async () => {
    const store = createIndexedDbProjectStore(null as unknown as IDBFactory);
    await expect(store.put(createSampleProject())).rejects.toThrow("当前浏览器不支持 IndexedDB");
    await expect(store.remove("any-id")).rejects.toThrow("当前浏览器不支持 IndexedDB");
    expect(await store.list()).toEqual([]);
    expect(await store.get("any-id")).toBeNull();
  });
});

describe("IndexedDB project store lifecycle", () => {
  it("lists only projected metadata while get returns the complete package", async () => {
    const real = new IDBFactory();
    let armed = false;
    const transactionStores: string[][] = [];
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (armed) transactionStores.push(Array.from(tx.objectStoreNames));
    }));
    const project = storedProject("proj-metadata", "元数据项目");
    project.pack.project.students.push({
      id: "student-1",
      name: "测试学生",
      university: "测试大学",
      city: "杭州市",
      visibility: true,
    });
    project.pack.assets.push({
      id: "asset-1",
      label: "测试素材",
      kind: "background",
      src: "data:image/png;base64,AAAA",
      provinceIds: [],
      source: "user",
    });
    await store.put(project);

    armed = true;
    const [listed] = await store.list();
    armed = false;

    expect(transactionStores).toEqual([["project-metadata"]]);
    expect(listed).toMatchObject({
      id: "proj-metadata",
      name: "元数据项目",
      studentCount: 1,
      assetCount: 1,
      fontCount: 0,
      customTemplateCount: 0,
    });
    expect(listed?.pack).not.toHaveProperty("assets");
    expect((await store.get("proj-metadata"))?.pack.assets[0]?.id).toBe("asset-1");
  });

  it("persists the package and its metadata in one write transaction", async () => {
    const real = new IDBFactory();
    let armed = false;
    let writeStores: string[] = [];
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (armed && tx.mode === "readwrite") writeStores = Array.from(tx.objectStoreNames);
    }));
    await store.list();

    armed = true;
    await store.put(storedProject("proj-atomic"));

    expect(writeStores.sort()).toEqual(["project-metadata", "projects"]);
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-atomic"]);
    expect(await store.get("proj-atomic")).not.toBeNull();
  });

  it("rejects put when the write transaction aborts after the request succeeded", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      abortAfterPut(tx);
    }));
    // 先建立连接，避免 hook 命中打开阶段的事务。
    await store.list();

    armed = true;
    await expect(store.put(storedProject("proj-aborted"))).rejects.toThrow("IndexedDB 写入中止");
    expect(await store.list()).toEqual([]);
  });

  it("rejects remove when the delete transaction aborts", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      queueMicrotask(() => tx.abort());
    }));
    await store.put(storedProject("proj-keep"));

    armed = true;
    await expect(store.remove("proj-keep")).rejects.toThrow(/IndexedDB 删除(失败|中止)/);
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-keep"]);
  });

  it("rejects a put whose connection drops mid-transaction and recovers on the next put", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx, db) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      queueMicrotask(() => {
        tx.abort();
        db.close();
      });
    }));
    await store.list();

    armed = true;
    await expect(store.put(storedProject("proj-dropped"))).rejects.toThrow(/IndexedDB 写入(失败|中止)/);

    // 缓存的连接已关闭，但不能永久毒化：下一次写入必须自动重连成功。
    await store.put(storedProject("proj-recovered", "恢复后的项目"));
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-recovered"]);
    expect((await store.get("proj-recovered"))?.name).toBe("恢复后的项目");
  });

  it("keeps listing healthy projects when one stored record is corrupted", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("proj-good", "完好项目"));
    await writeRaw(factory, { id: "proj-corrupt", name: "损坏项目", pack: { kind: "not-a-package" } }, "proj-corrupt");
    await writeRaw(factory, "彻底不是记录", "proj-garbage");

    const listed = await store.list();

    expect(listed.map((project) => project.id)).toEqual(["proj-good"]);
    expect(await store.get("proj-corrupt")).toBeNull();
  });

  it("resolves when removing an id that does not exist", async () => {
    const store = createIndexedDbProjectStore(new IDBFactory());
    await expect(store.remove("missing-project")).resolves.toBeUndefined();
  });
});

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

describe.skipIf(process.env.PROJECT_LIST_BENCH !== "1")("project list benchmark", () => {
  it("reports five-run list medians for 5 MiB project packs", async () => {
    const count = Number(process.env.PROJECT_LIST_BENCH_COUNT ?? "10");
    const payload = "A".repeat(5 * 1024 * 1024);
    const store = createIndexedDbProjectStore(new IDBFactory());
    for (let index = 0; index < count; index += 1) {
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      await store.put({
        id: `bench-${index}`,
        name: `Benchmark ${index}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        pack: createProjectPackageEnvelope({
          project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
          assets: [{
            id: `asset-${index}`,
            label: "5 MiB benchmark asset",
            kind: "background",
            src: `data:application/octet-stream;base64,${payload}`,
            provinceIds: [],
            source: "user",
          }],
          fonts: [],
          customTemplates: [],
          renderSettings: { mode: "normal", fixedFps: 20 },
          now: new Date(timestamp),
        }),
      });
    }

    await store.list();
    const runs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      expect(await store.list()).toHaveLength(count);
      runs.push(performance.now() - started);
    }
    const sorted = [...runs].sort((a, b) => a - b);
    console.info("PROJECT_LIST_BENCH", JSON.stringify({
      count,
      runsMs: runs.map((value) => Number(value.toFixed(3))),
      medianMs: Number(sorted[2]!.toFixed(3)),
    }));
  }, 120_000);
});
