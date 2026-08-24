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

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
  studentCount: number;
  assetCount: number;
  fontCount: number;
  customTemplateCount: number;
}

/**
 * 项目卡片仍通过 pack.exportedAt / pack.project.students.length 展示已有信息。
 * 这里是只含时间与计数的兼容视图，不是完整工程包；需要工程包的操作必须调用 get(id)。
 */
export interface ProjectListItem extends ProjectMetadata {
  pack: {
    exportedAt: string;
    project: {
      students: { readonly length: number };
    };
  };
}

/** `"memory"` 表示本次会话的改动不会落到本机磁盘，调用方应提示用户导出备份。 */
export type ProjectStoreHealth = "persistent" | "memory";

export type ProjectStoreErrorCode =
  | "unsupported"
  | "quota-exceeded"
  | "write-aborted"
  | "delete-aborted"
  | "open-failed";

/** 分类过的存储失败：调用方按 code 决定文案与后续动作，message 已是可直接展示的中文。 */
export class ProjectStoreError extends Error {
  readonly code: ProjectStoreErrorCode;

  constructor(code: ProjectStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProjectStoreError";
    this.code = code;
  }
}

const QUOTA_MESSAGE = "本机存储空间不足，请清理浏览器数据或删除不再需要的项目后重试。";
const UNSUPPORTED_MESSAGE = "当前浏览器不支持 IndexedDB";
const OPEN_FAILED_MESSAGE = "无法打开本机项目数据库";

export interface ProjectStore {
  /** 快照值：降级发生在打开数据库失败之后，需要响应式通知请用 `onHealthChange`。 */
  readonly health: ProjectStoreHealth;
  list(): Promise<ProjectListItem[]>;
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

function projectMetadata(project: StoredProject): ProjectMetadata {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    exportedAt: project.pack.exportedAt,
    studentCount: project.pack.project.students.length,
    assetCount: project.pack.assets.length,
    fontCount: project.pack.fonts.length,
    customTemplateCount: project.pack.customTemplates.length,
  };
}

function projectListItem(metadata: ProjectMetadata): ProjectListItem {
  return {
    ...metadata,
    pack: {
      exportedAt: metadata.exportedAt,
      project: { students: { length: metadata.studentCount } },
    },
  };
}

export function createMemoryProjectStore(): ProjectStore {
  const records = new Map<string, StoredProject>();
  return {
    health: "memory",
    async list() {
      return [...records.values()]
        .map((record) => projectListItem(projectMetadata(record)))
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

function timestampOrEpoch(value: unknown): string {
  return typeof value === "string" ? value : new Date(0).toISOString();
}

function parseCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseProjectMetadata(value: unknown): ProjectMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.exportedAt !== "string") return null;
  const studentCount = parseCount(record.studentCount);
  const assetCount = parseCount(record.assetCount);
  const fontCount = parseCount(record.fontCount);
  const customTemplateCount = parseCount(record.customTemplateCount);
  if (studentCount === null || assetCount === null || fontCount === null || customTemplateCount === null) return null;
  return {
    id: record.id,
    name: record.name,
    createdAt: timestampOrEpoch(record.createdAt),
    updatedAt: timestampOrEpoch(record.updatedAt),
    exportedAt: record.exportedAt,
    studentCount,
    assetCount,
    fontCount,
    customTemplateCount,
  };
}

/** 旧版 projects 记录的轻量解析：升级时不反序列化其中可能很大的 base64 资源。 */
function metadataFromStoredValue(value: unknown): ProjectMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const pack = record.pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return null;
  const packageRecord = pack as Record<string, unknown>;
  const project = packageRecord.project;
  if (packageRecord.kind !== "cengfan-project-package" || !project || typeof project !== "object" || Array.isArray(project)) return null;
  const projectRecord = project as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || !Array.isArray(projectRecord.students)) return null;
  return {
    id: record.id,
    name: record.name,
    createdAt: timestampOrEpoch(record.createdAt),
    updatedAt: timestampOrEpoch(record.updatedAt),
    exportedAt: timestampOrEpoch(packageRecord.exportedAt),
    studentCount: projectRecord.students.length,
    assetCount: Array.isArray(packageRecord.assets) ? packageRecord.assets.length : 0,
    fontCount: Array.isArray(packageRecord.fonts) ? packageRecord.fonts.length : 0,
    customTemplateCount: Array.isArray(packageRecord.customTemplates) ? packageRecord.customTemplates.length : 0,
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
      createdAt: timestampOrEpoch(record.createdAt),
      updatedAt: timestampOrEpoch(record.updatedAt),
      pack: restoreProjectPackage(record.pack),
    };
  } catch {
    return null;
  }
}

const DATABASE_NAME = "cengfan-map-studio";
const DATABASE_VERSION = 2;
const STORE_NAME = "projects";
const METADATA_STORE_NAME = "project-metadata";
const LEGACY_WORKSPACE_STORE = "workspace";
const LEGACY_WORKSPACE_KEY = "current";
/** 迁移完成标记，与迁移写入同一个事务，保证多标签页/多实例只迁移一次。 */
const LEGACY_MIGRATION_MARKER_KEY = "legacy-migrated";
/** blocked 后留给其他连接响应 versionchange 并关闭的窗口。 */
const BLOCKED_GRACE_MS = 3000;

/** 连接已失效（被关闭 / store 被其他标签页删除），重开一次即可恢复。 */
function isStaleConnectionError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return name === "InvalidStateError" || name === "NotFoundError";
}

/** 让路给其他标签页的升级请求：不关闭连接对方会永远 blocked。 */
function releaseOnVersionChange(db: IDBDatabase): void {
  db.onversionchange = () => db.close();
}

function openDatabase(factory: IDBFactory): Promise<{ db: IDBDatabase; legacyV1: boolean }> {
  return new Promise((resolve, reject) => {
    // 先探测当前版本与 store 情况，再决定是否需要升级版本：
    // 固定版本号在共享同一数据库的 workspace 模块先升过版本时会抛 VersionError。
    const probe = factory.open(DATABASE_NAME);
    probe.onsuccess = () => {
      const db = probe.result;
      const version = db.version;
      const hasProjects = db.objectStoreNames.contains(STORE_NAME);
      const hasMetadata = db.objectStoreNames.contains(METADATA_STORE_NAME);
      // 只有真正的 v1 旧库（有 workspace、无 projects）才需要迁移数据；
      // workspace 模块新建的 v2 库不应触发迁移。
      const legacyV1 = version === 1 && !hasProjects;
      db.close();
      // 目标版本至少为 DATABASE_VERSION；若缺 store 则必须高于当前版本以触发升级。
      let target = Math.max(version, DATABASE_VERSION);
      if (!hasProjects || !hasMetadata) target = Math.max(target, version + 1);
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
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    let abandoned = false;
    const clearBlockedTimer = () => {
      if (blockedTimer === null) return;
      clearTimeout(blockedTimer);
      blockedTimer = null;
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      // upgradeneeded 内只允许同步 schema 变更；数据迁移必须在打开成功后进行，
      // 否则版本变更事务 active 期间创建新事务并访问 objectStore 会抛 InvalidStateError，
      // 导致“Version change transaction was aborted in upgradeneeded event handler”。
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
        const metadataStore = db.createObjectStore(METADATA_STORE_NAME);
        // 旧版项目只在首次创建元数据 store 时投影一次；升级事务保证 pack 与投影不会出现半迁移状态。
        const projects = request.transaction?.objectStore(STORE_NAME);
        const cursorRequest = projects?.openCursor();
        if (cursorRequest) {
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const metadata = metadataFromStoredValue(cursor.value);
            if (metadata) metadataStore.put(metadata, metadata.id);
            cursor.continue();
          };
        }
      }
      // 同时确保 workspace store 存在：迁移与 workspace 模块共用此库，
      // 双方升级时都补齐全部 store，避免另一方随后再升级而触发 blocked。
      if (!db.objectStoreNames.contains(LEGACY_WORKSPACE_STORE)) db.createObjectStore(LEGACY_WORKSPACE_STORE);
    };
    request.onsuccess = () => {
      clearBlockedTimer();
      // 已按“被占用”失败返回过，迟到的连接必须关闭，否则会挡住后续升级。
      if (abandoned) {
        request.result.close();
        return;
      }
      releaseOnVersionChange(request.result);
      resolve(request.result);
    };
    request.onerror = () => {
      clearBlockedTimer();
      reject(request.error ?? new Error("IndexedDB 打开失败"));
    };
    request.onblocked = () => {
      // 其他连接收到 versionchange 后会主动关闭，blocked 只是过渡态；
      // 给出宽限窗口，超时才判定为被旧标签页真正占用。
      if (blockedTimer !== null) return;
      blockedTimer = setTimeout(() => {
        blockedTimer = null;
        abandoned = true;
        reject(new Error("IndexedDB 被其他标签页占用"));
      }, BLOCKED_GRACE_MS);
      (blockedTimer as unknown as { unref?: () => void }).unref?.();
    };
  });
}

/**
 * 迁移旧版 workspace 库（键 "current"）为第一个项目。
 * 必须在数据库打开成功之后执行——事务需要正常激活，不能在 upgradeneeded 事件处理器内。
 * 读取判定与写入放在同一个 readwrite 事务里，并落一个完成标记：
 * 两个 store 实例（或两个标签页）并发打开时只会有一方真正迁移，不会产生重复项目。
 */
function migrateLegacyWorkspace(db: IDBDatabase): Promise<void> {
  if (
    !db.objectStoreNames.contains(LEGACY_WORKSPACE_STORE)
    || !db.objectStoreNames.contains(STORE_NAME)
    || !db.objectStoreNames.contains(METADATA_STORE_NAME)
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, METADATA_STORE_NAME, LEGACY_WORKSPACE_STORE], "readwrite");
    const workspace = tx.objectStore(LEGACY_WORKSPACE_STORE);
    const projects = tx.objectStore(STORE_NAME);
    const metadataStore = tx.objectStore(METADATA_STORE_NAME);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 迁移失败"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 迁移中止"));

    const markerRequest = workspace.get(LEGACY_MIGRATION_MARKER_KEY);
    markerRequest.onsuccess = () => {
      if (markerRequest.result) return;
      const legacyRequest = workspace.get(LEGACY_WORKSPACE_KEY);
      legacyRequest.onsuccess = () => {
        const legacyPack = legacyRequest.result;
        if (!legacyPack) {
          workspace.put(true, LEGACY_MIGRATION_MARKER_KEY);
          return;
        }
        const keysRequest = projects.getAllKeys();
        keysRequest.onsuccess = () => {
          const occupied = (keysRequest.result ?? []).length > 0;
          const migrated = occupied ? null : buildMigratedProject(legacyPack);
          if (migrated) {
            projects.put(migrated, migrated.id);
            metadataStore.put(projectMetadata(migrated), migrated.id);
          }
          // 迁移完成（或旧数据损坏/已有项目而放弃）后清掉旧键并落标记，保证幂等。
          workspace.delete(LEGACY_WORKSPACE_KEY);
          workspace.put(true, LEGACY_MIGRATION_MARKER_KEY);
        };
      };
    };
  });
}

/**
 * 打开连接后补齐缺失的元数据边车行。
 * 旧标签页（R2-6 之前的代码）只写 projects，不写 project-metadata，这些项目会从列表里消失；
 * 键集合比对很便宜，只有确实缺边车的行才会被完整读出来投影一次。
 */
function reconcileMissingMetadata(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains(STORE_NAME) || !db.objectStoreNames.contains(METADATA_STORE_NAME)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, METADATA_STORE_NAME], "readwrite");
    const projects = tx.objectStore(STORE_NAME);
    const metadataStore = tx.objectStore(METADATA_STORE_NAME);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 元数据校正中止"));

    const metadataKeys = metadataStore.getAllKeys();
    metadataKeys.onsuccess = () => {
      const projected = new Set((metadataKeys.result ?? []).map((key) => String(key)));
      const projectKeys = projects.getAllKeys();
      projectKeys.onsuccess = () => {
        for (const key of projectKeys.result ?? []) {
          if (projected.has(String(key))) continue;
          const valueRequest = projects.get(key);
          valueRequest.onsuccess = () => {
            // 无法解析的行只是不进列表，不删除：用户的数据留在 projects 里等待人工导出。
            const metadata = metadataFromStoredValue(valueRequest.result);
            if (metadata) metadataStore.put(metadata, key);
          };
        }
      };
    };
  });
}

function buildMigratedProject(legacyPack: unknown): StoredProject | null {
  try {
    const now = new Date().toISOString();
    return {
      id: createId("proj"),
      name: "迁移的项目",
      createdAt: now,
      updatedAt: now,
      pack: restoreProjectPackage(legacyPack),
    };
  } catch {
    // 损坏的旧工作区直接丢弃
    return null;
  }
}

type TransactionRunner = <T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  execute: (tx: IDBTransaction) => Promise<T>,
) => Promise<T>;

/**
 * 缓存单个连接，但连接失效后不会毒化缓存：
 * versionchange / close 会立刻作废缓存，创建事务时发现连接已关闭则重开一次再重试。
 */
function createConnectionPool(open: () => Promise<IDBDatabase>): { run: TransactionRunner } {
  let ready: Promise<IDBDatabase> | null = null;
  const invalidate = (pending: Promise<IDBDatabase>) => {
    if (ready === pending) ready = null;
  };
  const ensure = (): Promise<IDBDatabase> => {
    const cached = ready;
    if (cached) return cached;
    const pending: Promise<IDBDatabase> = open().then((db) => {
      db.onversionchange = () => {
        db.close();
        invalidate(pending);
      };
      db.onclose = () => invalidate(pending);
      return db;
    });
    pending.catch(() => invalidate(pending));
    ready = pending;
    return pending;
  };
  const run: TransactionRunner = async (stores, mode, execute) => {
    for (let attempt = 0; ; attempt += 1) {
      const pending = ensure();
      const db = await pending;
      let tx: IDBTransaction;
      try {
        tx = db.transaction(stores, mode);
      } catch (error) {
        invalidate(pending);
        if (attempt === 0 && isStaleConnectionError(error)) continue;
        throw error;
      }
      return execute(tx);
    }
  };
  return { run };
}

/** 配额耗尽在各浏览器里的名字不同，Safari/旧 Firefox 只给出 code 22。 */
function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22;
}

/** 事务中止的分类：配额耗尽要给用户可执行的提示，其余保持通用的中止说明。 */
function abortFailure(
  tx: IDBTransaction,
  requestError: unknown,
  code: ProjectStoreErrorCode,
  message: string,
): ProjectStoreError {
  const cause = tx.error ?? requestError;
  if (isQuotaError(tx.error) || isQuotaError(requestError)) {
    return new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE, { cause });
  }
  return new ProjectStoreError(code, message, { cause });
}

function requestErrorOf(event: Event): unknown {
  return (event.target as { error?: unknown } | null)?.error ?? null;
}

const RETRY_DELAY_MS = 120;

export interface IndexedDbProjectStoreOptions {
  /** 打开失败后的额外重试次数；重试用尽才进入内存降级模式。 */
  openRetries?: number;
  retryDelayMs?: number;
  onHealthChange?: (health: ProjectStoreHealth) => void;
}

export function createIndexedDbProjectStore(
  factory: IDBFactory = globalThis.indexedDB,
  options: IndexedDbProjectStoreOptions = {},
): ProjectStore {
  if (!factory) {
    return {
      health: "memory",
      async list() { return []; },
      async get() { return null; },
      async put() { throw new ProjectStoreError("unsupported", UNSUPPORTED_MESSAGE); },
      async remove() { throw new ProjectStoreError("unsupported", UNSUPPORTED_MESSAGE); },
    };
  }
  const { openRetries = 1, retryDelayMs = RETRY_DELAY_MS, onHealthChange } = options;
  const { run } = createConnectionPool(async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= openRetries; attempt += 1) {
      if (attempt > 0 && retryDelayMs > 0) await new Promise((wake) => setTimeout(wake, retryDelayMs));
      try {
        const { db, legacyV1 } = await openDatabase(factory);
        // 迁移/校正失败不应让整个 store 不可用：连接照常返回，用户仍能读写项目。
        if (legacyV1) await migrateLegacyWorkspace(db).catch(() => {});
        await reconcileMissingMetadata(db).catch(() => {});
        return db;
      } catch (error) {
        lastError = error;
      }
    }
    throw new ProjectStoreError("open-failed", OPEN_FAILED_MESSAGE, { cause: lastError });
  });

  // 持久层彻底打不开（隐私模式、数据库损坏）时降级到内存：编辑仍可继续，health 变为 "memory"。
  let fallback: ProjectStore | null = null;
  const degrade = (): ProjectStore => {
    if (!fallback) {
      fallback = createMemoryProjectStore();
      onHealthChange?.("memory");
    }
    return fallback;
  };
  const withFallback = async <T>(
    persistent: () => Promise<T>,
    degraded: (store: ProjectStore) => Promise<T>,
  ): Promise<T> => {
    if (fallback) return degraded(fallback);
    try {
      return await persistent();
    } catch (error) {
      if (!(error instanceof ProjectStoreError) || error.code !== "open-failed") throw error;
      return degraded(degrade());
    }
  };

  return {
    get health(): ProjectStoreHealth {
      return fallback ? "memory" : "persistent";
    },
    async list() {
      return withFallback(() => run(METADATA_STORE_NAME, "readonly", (tx) => new Promise<ProjectListItem[]>((resolve) => {
        const request = tx.objectStore(METADATA_STORE_NAME).getAll();
        request.onsuccess = () => {
          // 单条元数据损坏只丢弃该条，其余项目必须照常列出。
          const items = (request.result ?? [])
            .map(parseProjectMetadata)
            .filter((item): item is ProjectMetadata => item !== null)
            .map(projectListItem);
          resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        };
        request.onerror = () => resolve([]);
        tx.onabort = () => resolve([]);
      })), (store) => store.list());
    },
    async get(id) {
      return withFallback(() => run(STORE_NAME, "readonly", (tx) => new Promise<StoredProject | null>((resolve) => {
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(parseStoredProject(request.result));
        request.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      })), (store) => store.get(id));
    },
    async put(project) {
      await withFallback(() => run([STORE_NAME, METADATA_STORE_NAME], "readwrite", (tx) => new Promise<void>((resolve, reject) => {
        let requestError: unknown = null;
        tx.objectStore(STORE_NAME).put(structuredClone(project), project.id);
        tx.objectStore(METADATA_STORE_NAME).put(projectMetadata(project), project.id);
        tx.oncomplete = () => resolve();
        // request error 会先于事务的 terminal abort 触发；只记下原因（配额耗尽在这里可见），
        // 由 onabort 统一报告，避免多 store 写入误报为已完成。
        tx.onerror = (event) => { requestError ??= requestErrorOf(event); };
        tx.onabort = () => reject(abortFailure(tx, requestError, "write-aborted", "IndexedDB 写入中止"));
      })), (store) => store.put(project));
    },
    async remove(id) {
      await withFallback(() => run([STORE_NAME, METADATA_STORE_NAME], "readwrite", (tx) => new Promise<void>((resolve, reject) => {
        let requestError: unknown = null;
        tx.objectStore(STORE_NAME).delete(id);
        tx.objectStore(METADATA_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (event) => { requestError ??= requestErrorOf(event); };
        tx.onabort = () => reject(abortFailure(tx, requestError, "delete-aborted", "IndexedDB 删除中止"));
      })), (store) => store.remove(id));
    },
  };
}
