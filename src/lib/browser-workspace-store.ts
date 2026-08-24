import { restoreProjectPackage, type ProjectPackage } from "./project-package";

const DATABASE_NAME = "cengfan-map-studio";
const DATABASE_VERSION = 2;
const STORE_NAME = "workspace";
// 与 project store 共享同一数据库；升级时补齐该 store，避免另一方随后再升级而触发 blocked。
const PROJECT_STORE_NAME = "projects";
const WORKSPACE_ID = "current";
const MIRROR_KEY = "cengfan-map-studio:workspace-mirror";

export interface WorkspaceWriteOptions {
  /** 上次读到的 exportedAt。传入则以它做 CAS，不传保持后写覆盖（LWW）。 */
  expectedExportedAt?: string;
}

/** CAS 失败：工作区已被其他标签页改写，调用方不应继续覆盖。 */
export class WorkspaceStoreConflictError extends Error {
  readonly scope: "durable" | "mirror";
  readonly expectedExportedAt: string;
  readonly storedExportedAt: string | null;

  constructor(scope: "durable" | "mirror", expectedExportedAt: string, storedExportedAt: string | null) {
    super("工作区已被其他标签页修改");
    this.name = "WorkspaceStoreConflictError";
    this.scope = scope;
    this.expectedExportedAt = expectedExportedAt;
    this.storedExportedAt = storedExportedAt;
  }
}

export interface SyncWorkspaceStore {
  get(): string | null;
  set(value: string): void;
}

export interface AsyncWorkspaceStore {
  get(): Promise<ProjectPackage | null>;
  set(value: ProjectPackage, options?: WorkspaceWriteOptions): Promise<void>;
}

export interface BrowserWorkspaceStores {
  mirror: SyncWorkspaceStore;
  durable: AsyncWorkspaceStore;
}

export interface BrowserWorkspaceSaveResult {
  durable: "saved" | "failed";
  /** skipped：镜像里已有更新的快照，本次不覆盖它。 */
  mirror: "saved" | "failed" | "skipped";
}

function parsePackage(value: unknown): ProjectPackage | null {
  try {
    return restoreProjectPackage(value);
  } catch {
    return null;
  }
}

function packageTime(pack: ProjectPackage): number {
  return timestampOf(pack.exportedAt);
}

function timestampOf(exportedAt: string): number {
  const time = Date.parse(exportedAt);
  return Number.isFinite(time) ? time : 0;
}

function readExportedAt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const exportedAt = (value as Record<string, unknown>).exportedAt;
  return typeof exportedAt === "string" ? exportedAt : null;
}

/** 工作区不存在（首存）视为通过；只有已存在且 exportedAt 不同才算冲突。 */
function conflictFor(
  scope: "durable" | "mirror",
  expectedExportedAt: string | undefined,
  stored: unknown,
): WorkspaceStoreConflictError | null {
  if (expectedExportedAt === undefined || stored === undefined || stored === null) return null;
  const storedExportedAt = readExportedAt(stored);
  if (storedExportedAt === null || storedExportedAt === expectedExportedAt) return null;
  return new WorkspaceStoreConflictError(scope, expectedExportedAt, storedExportedAt);
}

export function createLocalStorageMirror(storage: Storage = localStorage): SyncWorkspaceStore {
  return {
    get: () => storage.getItem(MIRROR_KEY),
    set: (value) => storage.setItem(MIRROR_KEY, value),
  };
}

export function createSafeLocalStorageMirror(): SyncWorkspaceStore {
  return {
    get: () => {
      try {
        return localStorage.getItem(MIRROR_KEY);
      } catch {
        return null;
      }
    },
    set: (value) => localStorage.setItem(MIRROR_KEY, value),
  };
}

function openWorkspaceDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 与 project store 共享同一数据库：先探测版本与 store 情况，按需升级以创建 workspace store，
    // 避免库已被升到更高版本时固定 open(1) 抛 VersionError。
    const probe = factory.open(DATABASE_NAME);
    probe.onsuccess = () => {
      const db = probe.result;
      const version = db.version;
      const hasStore = db.objectStoreNames.contains(STORE_NAME);
      db.close();
      // 目标版本至少为 DATABASE_VERSION；若缺 store 则必须高于当前版本以触发升级。
      let target = Math.max(version, DATABASE_VERSION);
      if (!hasStore) target = Math.max(target, version + 1);
      const request = factory.open(DATABASE_NAME, target);
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains(STORE_NAME)) {
          opened.createObjectStore(STORE_NAME);
        }
        if (!opened.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          opened.createObjectStore(PROJECT_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
      request.onblocked = () => reject(new Error("IndexedDB 被其他标签页占用"));
    };
    probe.onerror = () => reject(probe.error ?? new Error("IndexedDB 打开失败"));
    // 全新库首次 open 也会触发 upgradeneeded（创建空库），无需中止；onsuccess 中会关闭并重新按需 open。
    probe.onupgradeneeded = () => {};
  });
}

export function createIndexedDbWorkspaceStore(factory: IDBFactory = indexedDB): AsyncWorkspaceStore {
  return {
    async get() {
      const database = await openWorkspaceDatabase(factory);
      try {
        return await new Promise<ProjectPackage | null>((resolve, reject) => {
          const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(WORKSPACE_ID);
          request.onsuccess = () => resolve(parsePackage(request.result));
          request.onerror = () => reject(request.error ?? new Error("IndexedDB 读取失败"));
        });
      } finally {
        database.close();
      }
    },
    async set(value, options) {
      const database = await openWorkspaceDatabase(factory);
      const expectedExportedAt = options?.expectedExportedAt;
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          let conflict: WorkspaceStoreConflictError | null = null;
          const fail = () => reject(conflict ?? transaction.error ?? new Error("IndexedDB 写入失败"));
          if (expectedExportedAt === undefined) {
            store.put(structuredClone(value), WORKSPACE_ID);
          } else {
            // 读改写必须在同一个 readwrite 事务里完成，否则两个标签页仍可能交错。
            const existing = store.get(WORKSPACE_ID);
            existing.onsuccess = () => {
              conflict = conflictFor("durable", expectedExportedAt, existing.result);
              if (conflict) {
                transaction.abort();
                return;
              }
              store.put(structuredClone(value), WORKSPACE_ID);
            };
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = fail;
          transaction.onabort = fail;
        });
      } finally {
        database.close();
      }
    },
  };
}

export function createBrowserWorkspaceStores(): BrowserWorkspaceStores {
  const factory = globalThis.indexedDB;
  return {
    mirror: createSafeLocalStorageMirror(),
    durable: factory
      ? createIndexedDbWorkspaceStore(factory)
      : {
          get: async () => null,
          set: async () => { throw new Error("当前浏览器不支持 IndexedDB"); },
        },
  };
}

export function loadBrowserWorkspaceMirror(
  mirror: SyncWorkspaceStore = createLocalStorageMirror(),
): ProjectPackage | null {
  try {
    const raw = mirror.get();
    return raw ? parsePackage(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * 写入工作区快照。
 * 传入 `expectedExportedAt` 时按 CAS 语义写入：durable 在同一事务内读-比-写，
 * 镜像里若已有比 expected 更新的快照（另一标签页刚保存过）则先于任何写入抛冲突。
 * 省略 expected 时保持旧的后写覆盖（LWW），只是镜像仍不会被更旧的包盖掉。
 */
export async function saveBrowserWorkspaceSnapshot(
  pack: ProjectPackage,
  stores: BrowserWorkspaceStores = createBrowserWorkspaceStores(),
  options: WorkspaceWriteOptions = {},
): Promise<BrowserWorkspaceSaveResult> {
  const { expectedExportedAt } = options;
  const storedMirror = loadBrowserWorkspaceMirror(stores.mirror);
  // 镜像落后于 expected 属于正常降级（上次镜像写失败），不算冲突；只有更新的镜像才代表别的标签页抢先写过。
  if (
    expectedExportedAt !== undefined &&
    storedMirror &&
    packageTime(storedMirror) > timestampOf(expectedExportedAt)
  ) {
    throw new WorkspaceStoreConflictError("mirror", expectedExportedAt, storedMirror.exportedAt);
  }

  let durable: BrowserWorkspaceSaveResult["durable"] = "saved";
  try {
    await stores.durable.set(pack, { expectedExportedAt });
  } catch (error) {
    if (error instanceof WorkspaceStoreConflictError) throw error;
    durable = "failed";
  }

  if (storedMirror && packageTime(storedMirror) > packageTime(pack)) {
    return { durable, mirror: "skipped" };
  }
  let mirror: BrowserWorkspaceSaveResult["mirror"] = "saved";
  try {
    stores.mirror.set(JSON.stringify(pack));
  } catch {
    mirror = "failed";
  }
  return { durable, mirror };
}

export async function loadLatestBrowserWorkspace(
  stores: BrowserWorkspaceStores = createBrowserWorkspaceStores(),
): Promise<ProjectPackage | null> {
  const mirror = loadBrowserWorkspaceMirror(stores.mirror);
  const durable = await stores.durable.get().catch(() => null);
  if (!mirror) return durable;
  if (!durable) return mirror;
  return packageTime(mirror) >= packageTime(durable) ? mirror : durable;
}
