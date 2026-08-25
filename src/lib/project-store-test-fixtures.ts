import type { RecoverScheduler, StoredProject } from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";

export type TransactionHook = (tx: IDBTransaction, db: IDBDatabase) => void;

/** 包装 factory：拿到 store 内部创建的连接与事务，用来注入中止 / 断连等破坏性场景。 */
export function hookedFactory(real: IDBFactory, onTransaction: TransactionHook): IDBFactory {
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
export function abortAfterPut(tx: IDBTransaction): void {
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
export function failingFactory(onOpen: () => void): IDBFactory {
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

/** 前 failures 次 open 直接失败，之后交给真实 factory：模拟瞬时打不开、随后恢复的持久层。 */
export function flakyFactory(real: IDBFactory, failures: number): { factory: IDBFactory; opens: () => number } {
  let remaining = failures;
  let opens = 0;
  const factory = {
    cmp: (a: unknown, b: unknown) => real.cmp(a, b),
    databases: () => real.databases(),
    deleteDatabase: (name: string) => real.deleteDatabase(name),
    open: (name: string, version?: number) => {
      opens += 1;
      if (remaining <= 0) return real.open(name, version);
      remaining -= 1;
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
  };
  return { factory: factory as unknown as IDBFactory, opens: () => opens };
}

export interface ManualRecoverProbe {
  schedule: RecoverScheduler;
  intervalMs: number;
  cancelled: number;
  /** 手动跑一拍探针；取消之后仍可调用，用来断言恢复后再触发是空操作。 */
  tick: () => Promise<void>;
}

/** 用手动 tick 替换 setInterval：测试不必真的等上一个恢复间隔。 */
export function manualRecoverProbe(): ManualRecoverProbe {
  let probe: (() => Promise<void>) | null = null;
  const state: ManualRecoverProbe = {
    intervalMs: 0,
    cancelled: 0,
    schedule: (registered, intervalMs) => {
      probe = registered;
      state.intervalMs = intervalMs;
      return () => { state.cancelled += 1; };
    },
    tick: async () => { await probe?.(); },
  };
  return state;
}

/** 让写事务带着配额错误中止：真实浏览器写满配额时 transaction.error 就是这个 DOMException。 */
export function abortWithQuotaError(tx: IDBTransaction): void {
  (tx as { error: DOMException | null }).error = new DOMException("配额不足", "QuotaExceededError");
  queueMicrotask(() => tx.abort());
}

export function storedProject(id: string, name = id): StoredProject {
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

export function writeRaw(factory: IDBFactory, record: unknown, key: string): Promise<void> {
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
