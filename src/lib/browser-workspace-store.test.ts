import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import {
  createIndexedDbWorkspaceStore,
  loadBrowserWorkspaceMirror,
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
  type AsyncWorkspaceStore,
  type SyncWorkspaceStore,
} from "./browser-workspace-store";

type StoreRequestMethod = "get" | "put";

/** 包装 factory：拿到 store 内部创建的事务，用来注入中止场景。 */
function hookedFactory(real: IDBFactory, onTransaction: (tx: IDBTransaction) => void): IDBFactory {
  const patch = (db: IDBDatabase) => {
    const marked = db as IDBDatabase & { __hooked?: boolean };
    if (marked.__hooked) return;
    marked.__hooked = true;
    const openTransaction = db.transaction.bind(db);
    db.transaction = ((...args: Parameters<IDBDatabase["transaction"]>) => {
      const tx = openTransaction(...args);
      onTransaction(tx);
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

/** 请求成功后、事务提交前中止：此时只有 abort 事件，没有 request error。 */
function abortAfterRequest(tx: IDBTransaction, method: StoreRequestMethod): void {
  const openStore = tx.objectStore.bind(tx);
  tx.objectStore = ((name: string) => {
    const store = openStore(name);
    const original = store[method].bind(store) as (...args: never[]) => IDBRequest;
    (store as unknown as Record<string, unknown>)[method] = (...args: never[]) => {
      const request = original(...args);
      request.addEventListener("success", () => tx.abort());
      return request;
    };
    return store;
  }) as IDBTransaction["objectStore"];
}

function openAtVersion(factory: IDBFactory, version: number): Promise<{ db: IDBDatabase; blocked: number }> {
  return new Promise((resolve, reject) => {
    let blocked = 0;
    const request = factory.open("cengfan-map-studio", version);
    request.onupgradeneeded = () => {};
    request.onblocked = () => { blocked += 1; };
    request.onsuccess = () => resolve({ db: request.result, blocked });
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

function packageAt(name: string, exportedAt: string): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({
      students: [{ id: "student-1", name, university: "测试大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode: "normal", fixedFps: 20 },
    now: new Date(exportedAt),
  });
}

function memorySyncStore(initial: string | null = null): SyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((next) => { value = next; }),
  };
}

function memoryAsyncStore(initial: ProjectPackage | null = null): AsyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (next) => { value = structuredClone(next); }),
  };
}

describe("browser workspace store", () => {
  it("writes a complete workspace to the durable store and synchronous mirror", async () => {
    const pack = packageAt("双副本", "2026-07-27T10:00:00.000Z");
    const mirror = memorySyncStore();
    const durable = memoryAsyncStore();

    const result = await saveBrowserWorkspaceSnapshot(pack, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "saved" });
    expect(await durable.get()).toEqual(pack);
    expect(JSON.parse(mirror.get()!)).toEqual(pack);
  });

  it("keeps the durable copy when the synchronous mirror exceeds quota", async () => {
    const pack = packageAt("容量降级", "2026-07-27T11:00:00.000Z");
    const mirror: SyncWorkspaceStore = {
      get: () => null,
      set: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); },
    };
    const durable = memoryAsyncStore();

    const result = await saveBrowserWorkspaceSnapshot(pack, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "failed" });
    expect((await durable.get())?.project.students[0]?.name).toBe("容量降级");
  });

  it("loads the newest valid copy and ignores a damaged mirror", async () => {
    const older = packageAt("旧副本", "2026-07-27T09:00:00.000Z");
    const newer = packageAt("新副本", "2026-07-27T12:00:00.000Z");
    const durable = memoryAsyncStore(older);
    const mirror = memorySyncStore(JSON.stringify(newer));

    await expect(loadLatestBrowserWorkspace({ mirror, durable })).resolves.toEqual(newer);

    const damagedMirror = memorySyncStore("not-json");
    await expect(loadLatestBrowserWorkspace({ mirror: damagedMirror, durable })).resolves.toEqual(older);
  });

  it("restores the complete synchronous mirror before asynchronous hydration", () => {
    const pack = packageAt("首屏恢复", "2026-07-27T13:00:00.000Z");

    expect(loadBrowserWorkspaceMirror(memorySyncStore(JSON.stringify(pack)))).toEqual(pack);
    expect(loadBrowserWorkspaceMirror(memorySyncStore("damaged"))).toBeNull();
  });
});

describe("IndexedDB workspace store lifecycle", () => {
  it("round-trips a workspace and releases the connection for later upgrades", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbWorkspaceStore(factory);
    const pack = packageAt("持久副本", "2026-07-27T14:00:00.000Z");

    await store.set(pack);
    expect((await store.get())?.project.students[0]?.name).toBe("持久副本");

    const { db, blocked } = await openAtVersion(factory, 5);
    expect(blocked).toBe(0);
    db.close();
  });

  it("rejects set when the write transaction aborts after the request succeeded", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbWorkspaceStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      abortAfterRequest(tx, "put");
    }));
    await store.set(packageAt("首次写入", "2026-07-27T15:00:00.000Z"));

    armed = true;
    await expect(store.set(packageAt("中止写入", "2026-07-27T16:00:00.000Z"))).rejects.toThrow("IndexedDB 写入中止");
    expect((await store.get())?.project.students[0]?.name).toBe("首次写入");
  });

  it("rejects an in-flight get when the read transaction aborts instead of hanging", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbWorkspaceStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readonly") return;
      armed = false;
      queueMicrotask(() => tx.abort());
    }));
    await store.set(packageAt("可读副本", "2026-07-27T17:00:00.000Z"));

    armed = true;
    const failure = await store.get().then(() => null, (error: unknown) => error);
    expect((failure as { name?: string } | null)?.name).toBe("AbortError");
  });

  it("reports a failed durable write while keeping the synchronous mirror", async () => {
    const real = new IDBFactory();
    let armed = true;
    const durable = createIndexedDbWorkspaceStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      abortAfterRequest(tx, "put");
    }));
    const mirror = memorySyncStore();
    const pack = packageAt("降级写入", "2026-07-27T18:00:00.000Z");

    const result = await saveBrowserWorkspaceSnapshot(pack, { mirror, durable });

    expect(result).toEqual({ durable: "failed", mirror: "saved" });
    expect(JSON.parse(mirror.get()!)).toEqual(pack);
  });
});
