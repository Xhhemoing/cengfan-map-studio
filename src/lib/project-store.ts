import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createProjectPackage, restoreProjectPackage, type ProjectPackage } from "./project-package";
import { sampleStudents } from "./project-data";
import { createId } from "./ids";

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pack: ProjectPackage;
}

export interface ProjectStore {
  list(): Promise<StoredProject[]>;
  get(id: string): Promise<StoredProject | null>;
  put(project: StoredProject): Promise<void>;
  remove(id: string): Promise<void>;
}

const SAMPLE_PROJECT_NAME = "示例：2026届毕业去向";

function projectToPack(project: ProjectDocument, now = new Date()): ProjectPackage {
  return createProjectPackage({ project, assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 }, now });
}

export function createSampleProject(now = new Date()): StoredProject {
  const project = createProjectDocument({
    students: sampleStudents,
    templateId: "original",
    dataView: "province",
  });
  return {
    id: createId("proj"),
    name: SAMPLE_PROJECT_NAME,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    pack: projectToPack(project, now),
  };
}

export function createEmptyProject(now = new Date()): StoredProject {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return {
    id: createId("proj"),
    name: "未命名项目",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    pack: projectToPack(project, now),
  };
}

export function duplicateStoredProject(source: StoredProject, name = `${source.name} 副本`, now = new Date()): StoredProject {
  return {
    id: createId("proj"),
    name,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    pack: structuredClone(source.pack),
  };
}

export function createMemoryProjectStore(): ProjectStore {
  const records = new Map<string, StoredProject>();
  return {
    async list() {
      return [...records.values()]
        .map((record) => structuredClone(record))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id) {
      const record = records.get(id);
      return record ? structuredClone(record) : null;
    },
    async put(project) {
      records.set(project.id, structuredClone(project));
    },
    async remove(id) {
      records.delete(id);
    },
  };
}

function parseStoredProject(value: unknown): StoredProject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  try {
    return {
      id: record.id,
      name: record.name,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
      pack: restoreProjectPackage(record.pack),
    };
  } catch {
    return null;
  }
}

const DATABASE_NAME = "cengfan-map-studio";
const DATABASE_VERSION = 2;
const STORE_NAME = "projects";
const LEGACY_WORKSPACE_STORE = "workspace";

function openDatabase(factory: IDBFactory, onUpgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      onUpgrade(db);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
    request.onblocked = () => reject(new Error("IndexedDB 被其他标签页占用"));
  });
}

export function createIndexedDbProjectStore(factory: IDBFactory = globalThis.indexedDB): ProjectStore {
  if (!factory) {
    return {
      async list() { return []; },
      async get() { return null; },
      async put() { throw new Error("当前浏览器不支持 IndexedDB"); },
      async remove() { throw new Error("当前浏览器不支持 IndexedDB"); },
    };
  }
  let ready: Promise<IDBDatabase> | null = null;
  const ensure = () => {
    let pending = ready;
    if (!pending) {
      pending = openDatabase(factory, (db) => {
        // 迁移:旧版 workspace 库(键 "current")合并为第一个项目
        if (db.objectStoreNames.contains(LEGACY_WORKSPACE_STORE)) {
          const legacy = db.transaction(LEGACY_WORKSPACE_STORE, "readonly").objectStore(LEGACY_WORKSPACE_STORE);
          const request = legacy.get("current");
          request.onsuccess = () => {
            const legacyPack = request.result;
            if (!legacyPack) return;
            const targets = db.transaction([STORE_NAME], "readwrite").objectStore(STORE_NAME);
            const existing = targets.getAllKeys();
            existing.onsuccess = () => {
              if (existing.result.length > 0) return;
              try {
                // 必须显式传键:createObjectStore(STORE_NAME) 为 out-of-line key store,
                // put() 不提供键会抛 DataError,导致旧工作区永远不会被迁移。
                const migrated = {
                  id: createId("proj"),
                  name: "迁移的项目",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  pack: restoreProjectPackage(legacyPack),
                };
                targets.put(migrated, migrated.id);
              } catch {
                // 损坏的旧工作区直接丢弃
              }
            };
          };
        }
      });
      pending.catch(() => { ready = null; });
      ready = pending;
    }
    return pending;
  };
  return {
    async list() {
      const db = await ensure();
      return new Promise((resolve) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
        request.onsuccess = () => {
          const items = (request.result ?? []).map(parseStoredProject).filter((item): item is StoredProject => item !== null);
          resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        };
        request.onerror = () => resolve([]);
      });
    },
    async get(id) {
      const db = await ensure();
      return new Promise((resolve) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(parseStoredProject(request.result));
        request.onerror = () => resolve(null);
      });
    },
    async put(project) {
      const db = await ensure();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(structuredClone(project), project.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 写入失败"));
      });
    },
    async remove(id) {
      const db = await ensure();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 删除失败"));
      });
    },
  };
}
