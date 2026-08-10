import { restoreProjectPackage, type ProjectPackage } from "./project-package";

const DATABASE_NAME = "cengfan-map-studio";
const DATABASE_VERSION = 2;
const STORE_NAME = "workspace";
// 与 project store 共享同一数据库；升级时补齐该 store，避免另一方随后再升级而触发 blocked。
const PROJECT_STORE_NAME = "projects";
const WORKSPACE_ID = "current";
const MIRROR_KEY = "cengfan-map-studio:workspace-mirror";

export interface SyncWorkspaceStore {
  get(): string | null;
  set(value: string): void;
}

export interface AsyncWorkspaceStore {
  get(): Promise<ProjectPackage | null>;
  set(value: ProjectPackage): Promise<void>;
}

export interface BrowserWorkspaceStores {
  mirror: SyncWorkspaceStore;
  durable: AsyncWorkspaceStore;
}

export interface BrowserWorkspaceSaveResult {
  durable: "saved" | "failed";
  mirror: "saved" | "failed";
}

function parsePackage(value: unknown): ProjectPackage | null {
  try {
    return restoreProjectPackage(value);
  } catch {
    return null;
  }
}

function packageTime(pack: ProjectPackage): number {
  const time = Date.parse(pack.exportedAt);
  return Number.isFinite(time) ? time : 0;
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
    async set(value) {
      const database = await openWorkspaceDatabase(factory);
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readwrite");
          transaction.objectStore(STORE_NAME).put(structuredClone(value), WORKSPACE_ID);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 写入失败"));
          transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 写入中止"));
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

export async function saveBrowserWorkspaceSnapshot(
  pack: ProjectPackage,
  stores: BrowserWorkspaceStores = createBrowserWorkspaceStores(),
): Promise<BrowserWorkspaceSaveResult> {
  let mirror: BrowserWorkspaceSaveResult["mirror"] = "saved";
  let durable: BrowserWorkspaceSaveResult["durable"] = "saved";
  try {
    stores.mirror.set(JSON.stringify(pack));
  } catch {
    mirror = "failed";
  }
  try {
    await stores.durable.set(pack);
  } catch {
    durable = "failed";
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
