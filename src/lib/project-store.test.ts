import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
  type StoredProject,
} from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";

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
    listed[0]!.pack.project.students[0]!.name = "被修改的学生";
    const relisted = await store.list();
    expect(relisted[0]!.name).toBe("示例：2026届毕业去向");
    expect(relisted[0]!.pack.project.students[0]!.name).toBe("林舟");
    expect((await store.get(sample.id))?.name).toBe("示例：2026届毕业去向");
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
