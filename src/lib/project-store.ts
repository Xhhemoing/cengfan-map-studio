import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createProjectPackage, restoreProjectPackage, type ProjectPackage } from "./project-package";
import { sampleStudents } from "./project-data";
import { createId } from "./ids";

/** 解析失败的记录降级后挂上的原始值：卡片照常显示，原样导出后再由用户决定删不删。 */
export interface CorruptedProjectRecord {
  /** 库里存的原始值，导出时原样写出——它可能是这份数据仅剩的一份。 */
  raw: unknown;
  reason: string;
}

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pack: ProjectPackage;
  /** 有值表示这条记录解析失败，pack 只是占位，不能编辑也不能写回。 */
  corrupted?: CorruptedProjectRecord;
}

export function isCorruptedProject(project: StoredProject): boolean {
  return project.corrupted !== undefined;
}

export interface ProjectPutOptions {
  /** 上次读到的 updatedAt。传入则以它做 CAS，不传保持后写覆盖（LWW）。 */
  expectedUpdatedAt?: string;
}

/** CAS 失败：记录已被其他标签页（或其他写入方）改写，调用方不应继续覆盖。 */
export class ProjectStoreConflictError extends Error {
  readonly projectId: string;
  readonly expectedUpdatedAt: string;
  readonly storedUpdatedAt: string | null;

  constructor(projectId: string, expectedUpdatedAt: string, storedUpdatedAt: string | null) {
    super("项目已被其他标签页修改");
    this.name = "ProjectStoreConflictError";
    this.projectId = projectId;
    this.expectedUpdatedAt = expectedUpdatedAt;
    this.storedUpdatedAt = storedUpdatedAt;
  }
}

export interface ProjectStore {
  list(): Promise<StoredProject[]>;
  /** 库里的记录条数，包含解析失败的那些：判断“空库”只能看它，不能看 list().length。 */
  count(): Promise<number>;
  get(id: string): Promise<StoredProject | null>;
  put(project: StoredProject, options?: ProjectPutOptions): Promise<void>;
  remove(id: string): Promise<void>;
}

function readUpdatedAt(value: unknown): string | null {
  const updatedAt = asRecord(value)?.updatedAt;
  return typeof updatedAt === "string" ? updatedAt : null;
}

/**
 * 降级条目的 pack 是占位空工程，写回等于用空工程盖掉唯一一份原始数据，
 * 因此在存储层就拦下来，UI 漏判也不会造成静默丢数据。
 */
function assertWritable(project: StoredProject): void {
  if (project.corrupted) throw new Error("项目记录已损坏，请先导出原始数据再删除，不能覆盖写回");
}

/** 记录不存在（首存）视为通过；只有已存在且时间戳不同才算冲突。 */
function conflictFor(project: StoredProject, expectedUpdatedAt: string | undefined, stored: unknown): ProjectStoreConflictError | null {
  if (expectedUpdatedAt === undefined || stored === undefined || stored === null) return null;
  const storedUpdatedAt = readUpdatedAt(stored);
  if (storedUpdatedAt === null || storedUpdatedAt === expectedUpdatedAt) return null;
  return new ProjectStoreConflictError(project.id, expectedUpdatedAt, storedUpdatedAt);
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
    async count() {
      return records.size;
    },
    async get(id) {
      const record = records.get(id);
      return record ? structuredClone(record) : null;
    },
    async put(project, options) {
      assertWritable(project);
      const conflict = conflictFor(project, options?.expectedUpdatedAt, records.get(project.id));
      if (conflict) throw conflict;
      records.set(project.id, structuredClone(project));
    },
    async remove(id) {
      records.delete(id);
    },
  };
}

const EPOCH = new Date(0).toISOString();

type StoredProjectParse =
  | { ok: true; project: StoredProject }
  | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseStoredProjectResult(value: unknown): StoredProjectParse {
  const record = asRecord(value);
  if (!record) return { ok: false, reason: "记录不是对象" };
  if (typeof record.id !== "string" || typeof record.name !== "string") return { ok: false, reason: "记录缺少 id 或名称" };
  try {
    return {
      ok: true,
      project: {
        id: record.id,
        name: record.name,
        createdAt: typeof record.createdAt === "string" ? record.createdAt : EPOCH,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : EPOCH,
        pack: restoreProjectPackage(record.pack),
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "工程包无法还原" };
  }
}

/** `get()` 对损坏记录仍返回 null：编辑器拿到占位工程会在下一次自动保存时盖掉原始数据。 */
function parseStoredProject(value: unknown): StoredProject | null {
  const parsed = parseStoredProjectResult(value);
  return parsed.ok ? parsed.project : null;
}

/**
 * 解析失败的记录降级成一张只读卡片，而不是从列表里消失：
 * 名称与时间尽量沿用原记录，pack 用空工程占位，原始值挂在 corrupted 上供导出。
 * 身份用库里的键而不是记录里的 id——删除要按键走，损坏记录的 id 本身可能就是坏的。
 */
function corruptedStoredProject(key: IDBValidKey, value: unknown, reason: string): StoredProject {
  const record = asRecord(value) ?? {};
  const name = typeof record.name === "string" && record.name.trim() !== "" ? record.name : "未命名项目";
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : EPOCH;
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
  const placeholder = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return {
    id: String(key),
    name: `${name}（无法读取）`,
    createdAt,
    updatedAt,
    pack: projectToPack(placeholder, Number.isFinite(Date.parse(updatedAt)) ? new Date(updatedAt) : new Date(0)),
    corrupted: { raw: value, reason },
  };
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
      async count() { return 0; },
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
      // 用游标而不是 getAll：解析失败的记录要降级保留，降级条目的身份得用它在库里的键。
      return new Promise<StoredProject[]>((resolve, reject) => {
        const items: StoredProject[] = [];
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
            return;
          }
          const parsed = parseStoredProjectResult(cursor.value);
          items.push(parsed.ok ? parsed.project : corruptedStoredProject(cursor.key, cursor.value, parsed.reason));
          cursor.continue();
        };
        // 读失败时不能装作空库：调用方会据此播种示例项目，把真实数据挡在后面。
        request.onerror = () => reject(request.error ?? new Error("读取项目列表失败"));
      });
    },
    async count() {
      const db = await ensure();
      return new Promise<number>((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).count();
        request.onsuccess = () => resolve(request.result ?? 0);
        request.onerror = () => reject(request.error ?? new Error("读取项目数量失败"));
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
    async put(project, options) {
      assertWritable(project);
      const db = await ensure();
      const expectedUpdatedAt = options?.expectedUpdatedAt;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        let conflict: ProjectStoreConflictError | null = null;
        const fail = () => reject(conflict ?? tx.error ?? new Error("IndexedDB 写入失败"));
        if (expectedUpdatedAt === undefined) {
          store.put(structuredClone(project), project.id);
        } else {
          // 读改写必须在同一个 readwrite 事务里完成，否则两个标签页仍可能交错。
          const existing = store.get(project.id);
          existing.onsuccess = () => {
            conflict = conflictFor(project, expectedUpdatedAt, existing.result);
            if (conflict) {
              tx.abort();
              return;
            }
            store.put(structuredClone(project), project.id);
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = fail;
        tx.onabort = fail;
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
