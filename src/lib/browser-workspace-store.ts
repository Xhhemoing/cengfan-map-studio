import { restoreProjectPackage, type ProjectPackage } from "./project-package";

const DATABASE_NAME = "cengfan-map-studio";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
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

function openWorkspaceDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
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
    mirror: createLocalStorageMirror(),
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
