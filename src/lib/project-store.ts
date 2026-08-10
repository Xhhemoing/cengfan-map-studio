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

function openDatabase(factory: IDBFactory): Promise<{ db: IDBDatabase; legacyV1: boolean }> {
  return new Promise((resolve, reject) => {
    // 先探测当前版本与 store 情况，再决定是否需要升级版本：
    // 固定版本号在共享同一数据库的 workspace 模块先升过版本时会抛 VersionError。
    const probe = factory.open(DATABASE_NAME);
    probe.onsuccess = () => {
      const db = probe.result;
      const version = db.version;
      const hasProjects = db.objectStoreNames.contains(STORE_NAME);
      // 只有真正的 v1 旧库（有 workspace、无 projects）才需要迁移数据；
      // workspace 模块新建的 v2 库不应触发迁移。
      const legacyV1 = version === 1 && !hasProjects;
      db.close();
      // 目标版本至少为 DATABASE_VERSION；若缺 store 则必须高于当前版本以触发升级。
      let target = Math.max(version, DATABASE_VERSION);
      if (!hasProjects) target = Math.max(target, version + 1);
      openAtVersion(factory, target)
        .then((opened) => resolve({ db: opened, legacyV1 }), reject);
    };
    probe.onerror = () => reject(probe.error ?? new Error("IndexedDB 打开失败"));
    // 全新库首次 open 也会触发 upgradeneeded（创建空库），无需中止；onsuccess 中会关闭并重新按需 open。
    probe.onupgradeneeded = () => {};
  });
}

function openAtVersion(factory: IDBFactory, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      // upgradeneeded 内只允许同步 schema 变更；数据迁移必须在打开成功后进行，
      // 否则版本变更事务 active 期间创建新事务并访问 objectStore 会抛 InvalidStateError，
      // 导致“Version change transaction was aborted in upgradeneeded event handler”。
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      // 同时确保 workspace store 存在：迁移与 workspace 模块共用此库，
      // 双方升级时都补齐全部 store，避免另一方随后再升级而触发 blocked。
      if (!db.objectStoreNames.contains(LEGACY_WORKSPACE_STORE)) db.createObjectStore(LEGACY_WORKSPACE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 打开失败"));
    request.onblocked = () => reject(new Error("IndexedDB 被其他标签页占用"));
  });
}

/**
 * 迁移旧版 workspace 库（键 "current"）为第一个项目。
 * 必须在数据库打开成功之后执行——事务需要正常激活，不能在 upgradeneeded 事件处理器内。
 */
async function migrateLegacyWorkspace(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains(LEGACY_WORKSPACE_STORE) || !db.objectStoreNames.contains(STORE_NAME)) return;
  const legacyPack = await new Promise<unknown>((resolve) => {
    const request = db.transaction(LEGACY_WORKSPACE_STORE, "readonly").objectStore(LEGACY_WORKSPACE_STORE).get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
  if (!legacyPack) return;
  const existing = await new Promise<IDBValidKey[]>((resolve) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => resolve([]);
  });
  if (existing.length > 0) return;
  let migrated: StoredProject;
  try {
    migrated = {
      id: createId("proj"),
      name: "迁移的项目",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pack: restoreProjectPackage(legacyPack),
    };
  } catch {
    // 损坏的旧工作区直接丢弃
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, LEGACY_WORKSPACE_STORE], "readwrite");
    tx.objectStore(STORE_NAME).put(migrated, migrated.id);
    // 迁移成功即移除旧键，保证幂等（projects 已有数据或旧键不存在时不会重复迁移）
    tx.objectStore(LEGACY_WORKSPACE_STORE).delete("current");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
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
      pending = openDatabase(factory).then(async ({ db, legacyV1 }) => {
        if (legacyV1) await migrateLegacyWorkspace(db);
        return db;
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
