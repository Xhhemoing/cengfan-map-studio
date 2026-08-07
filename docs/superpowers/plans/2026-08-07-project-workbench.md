# 项目工作台(Project Workbench)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将产品从"单项目编辑器"改造为"多项目管理工作台":打开网站见项目列表,支持新建/复制/重命名/删除/导出/导入,删除 admin 面板,hash 路由区分列表与编辑页。

**Architecture:** 前端新增 IndexedDB 多项目存储层(键从固定 `"current"` 变为项目 ID),新增项目列表工作台组件,`main.tsx` 用 hash 路由分发(`#/` 列表、`#/project/<id>` 编辑);`App` 接收可选 `projectId` 保持向后兼容。服务端删除 admin/visits 相关代码但保留 `clientIp`(AI 限流共用)。

**Tech Stack:** React 19、TypeScript、Vite、Vitest(jsdom)、IndexedDB、现有 `project-package`/`project-document` 工具。

## Global Constraints

- 遵循 TDD:先写失败测试,再最小实现,重跑同一测试。
- 组件 `PascalCase`,函数/变量 `camelCase`,文件名 `kebab-case`。
- `App` 组件签名改为 `App({ projectId }: { projectId?: string })`,不传时保持现有行为(全部现有测试不破坏)。
- `clientIp`/`trustProxy`/`hasApiToken` 必须保留(AI 限流与 workspace 认证使用)。
- 仅删除 admin 相关代码,探针 `/api/live|ready|health` 保留。
- 中文 UI 文案,沿用现有 `setStatusMessage`/`aria-label` 可访问性风格。
- 提交信息用现有惯例:`feat:`/`refactor:`/`docs:` 前缀。

---

### Task 1: 多项目存储层 `src/lib/project-store.ts`

**Files:**
- Create: `src/lib/project-store.ts`
- Create: `src/lib/project-store.test.ts`

**Interfaces:**
- Consumes: `ProjectPackage`(`./project-package`)、`restoreProjectPackage`、`createProjectPackage`、`ProjectDocument`/`createProjectDocument`(`./project-document`)、`sampleStudents`(`./project-data`)、`createId`(`./ids`)
- Produces(后续任务依赖):
  - `interface StoredProject { id: string; name: string; createdAt: string; updatedAt: string; pack: ProjectPackage }`
  - `interface ProjectStore { list(): Promise<StoredProject[]>; get(id: string): Promise<StoredProject | null>; put(project: StoredProject): Promise<void>; remove(id: string): Promise<void> }`
  - `createMemoryProjectStore(): ProjectStore`(测试用,内存 Map)
  - `createIndexedDbProjectStore(factory?: IDBFactory): ProjectStore`
  - `createSampleProject(): StoredProject`(名为"示例：2026届毕业去向",students=sampleStudents,12 人)
  - `createEmptyProject(): StoredProject`(名为"未命名项目",空学生)
  - `duplicateStoredProject(source: StoredProject, name?: string): StoredProject`(深拷贝新 id)

- [ ] **Step 1: 写失败测试 `src/lib/project-store.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
} from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";

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
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/project-store.test.ts`
Expected: FAIL("Cannot find module './project-store'")

- [ ] **Step 3: 实现 `src/lib/project-store.ts`**

```ts
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
      return [...records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
      async put() {},
      async remove() {},
    };
  }
  let ready: Promise<IDBDatabase> | null = null;
  const ensure = () => {
    ready ??= openDatabase(factory, (db) => {
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
              targets.put({
                id: createId("proj"),
                name: "迁移的项目",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                pack: restoreProjectPackage(legacyPack),
              });
            } catch {
              // 损坏的旧工作区直接丢弃
            }
          };
        };
      }
    });
    return ready!;
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/project-store.test.ts`
Expected: PASS(6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/project-store.ts src/lib/project-store.test.ts
git commit -m "feat: multi-project IndexedDB store with sample/empty/duplicate helpers"
```

---

### Task 2: 项目工作台组件 `src/components/ProjectWorkbench.tsx`

**Files:**
- Create: `src/components/ProjectWorkbench.tsx`
- Create: `src/components/ProjectWorkbench.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `ProjectStore`、`createMemoryProjectStore`、`createSampleProject`、`createEmptyProject`、`duplicateStoredProject`、`StoredProject`;`downloadProjectPackage`/`parseProjectPackage`(`../lib/project-package`)
- Produces:
  - `export function ProjectWorkbench({ store, navigate }: { store: ProjectStore; navigate: (hash: string) => void })`
  - `navigate` 由调用方注入(默认 `(hash) => { window.location.hash = hash; }`),便于测试
  - **首启样例逻辑**:store 为空时自动写入 `createSampleProject()`(产品要求"打开即有样例")

- [ ] **Step 1: 写失败测试 `src/components/ProjectWorkbench.test.tsx`**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectWorkbench } from "./ProjectWorkbench";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { serializeProjectPackage } from "../lib/project-package";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function renderWorkbench(store: ReturnType<typeof createMemoryProjectStore>, navigate = vi.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} />));
  return { container, navigate };
}

afterEach(() => {
  roots.forEach(({ root }) => root.unmount());
  roots = [];
  window.localStorage.clear();
});

describe("ProjectWorkbench", () => {
  it("seeds the sample project when the store is empty", async () => {
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });

  it("renders existing projects as cards", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
  });

  it("navigates to the editor when a card is opened", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label^="打开项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label^="打开项目"]')?.click();
    expect(navigate).toHaveBeenCalledWith(`#/project/${sample.id}`);
  });

  it("creates a new empty project and navigates to it", async () => {
    const store = createMemoryProjectStore();
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="新建项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    expect(navigate).toHaveBeenCalled();
    const projects = await store.list();
    expect(projects.some((p) => p.pack.project.students.length === 0)).toBe(true);
  });

  it("renames a project via the card menu", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("重命名"));
    window.prompt = vi.fn(() => "高三3班");
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("重命名"))?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("高三3班"));
  });

  it("deletes a project after confirmation", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    window.confirm = vi.fn(() => true);
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("删除"))?.click();
    await vi.waitFor(async () => expect((await store.list())).toHaveLength(0));
  });

  it("duplicates a project", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))?.click();
    const projects = await store.list();
    expect(projects.some((p) => p.name.includes("副本"))).toBe(true);
  });

  it("imports a project package file", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    const file = new File([serializeProjectPackage(sample.pack)], "project.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const dt = new DataTransfer();
    dt.items.add(file);
    Object.defineProperty(input!, "files", { value: dt.files, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => expect((await store.list()).length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/ProjectWorkbench.test.tsx`
Expected: FAIL("Cannot find module './ProjectWorkbench'")

- [ ] **Step 3: 实现 `src/components/ProjectWorkbench.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, FolderOpen, MapPinned, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { createEmptyProject, createSampleProject, duplicateStoredProject, type ProjectStore, type StoredProject } from "../lib/project-store";
import { downloadProjectPackage, parseProjectPackage } from "../lib/project-package";
import { createId } from "../lib/ids";

interface ProjectWorkbenchProps {
  store: ProjectStore;
  navigate?: (hash: string) => void;
}

function formatUpdatedAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function ProjectWorkbench({ store, navigate }: ProjectWorkbenchProps) {
  const go = navigate ?? ((hash: string) => { window.location.hash = hash; });
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const seededRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await store.list());
      setError("");
    } catch {
      setError("读取项目失败：浏览器存储不可用");
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled || seededRef.current) return;
      seededRef.current = true;
      const list = await store.list();
      if (list.length === 0) {
        await store.put(createSampleProject());
        await refresh();
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, store]);

  const openProject = (id: string) => go(`#/project/${encodeURIComponent(id)}`);

  const createProject = async () => {
    const project = createEmptyProject();
    await store.put(project);
    openProject(project.id);
  };

  const renameProject = async (project: StoredProject) => {
    const name = window.prompt("请输入新项目名称", project.name);
    if (name === null || !name.trim()) return;
    await store.put({ ...project, name: name.trim(), updatedAt: new Date().toISOString() });
    setOpenMenuId(null);
    await refresh();
  };

  const duplicateProject = async (project: StoredProject) => {
    const copy = duplicateStoredProject(project);
    await store.put(copy);
    setOpenMenuId(null);
    await refresh();
  };

  const deleteProject = async (project: StoredProject) => {
    if (!window.confirm(`删除项目「${project.name}」？此操作不可恢复。`)) return;
    await store.remove(project.id);
    setOpenMenuId(null);
    await refresh();
  };

  const exportProject = (project: StoredProject) => {
    downloadProjectPackage(project.pack, `${project.name}-${project.updatedAt.slice(0, 10)}.json`);
    setOpenMenuId(null);
  };

  const importProject = async (file: File | null) => {
    if (!file) return;
    try {
      const pack = parseProjectPackage(await file.text());
      await store.put({
        id: createId("proj"),
        name: file.name.replace(/\.json$/i, "") || "导入的项目",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pack,
      });
      setError("");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `导入失败：${reason.message}` : "导入失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);

  return (
    <main className="workbench-shell">
      <header className="workbench-header">
        <div className="workbench-brand">
          <span className="workbench-brand-mark"><MapPinned size={20} /></span>
          <span><strong>蹭饭地图工作室</strong><small>项目工作台</small></span>
        </div>
        <div className="workbench-actions">
          <button type="button" className="secondary-button" aria-label="导入工程包" onClick={() => importInputRef.current?.click()}>
            <FolderOpen size={16} /> 导入
          </button>
          <button type="button" className="primary-button" aria-label="新建项目" onClick={() => void createProject()}>
            <Plus size={16} /> 新建项目
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="导入工程包文件"
            style={{ display: "none" }}
            onChange={(event) => void importProject(event.target.files?.[0] ?? null)}
          />
        </div>
      </header>

      {error && <section className="workbench-error" role="alert">{error}</section>}

      <section className="workbench-grid" aria-label="项目列表">
        {loading && projects.length === 0 ? (
          <p className="workbench-empty">正在加载项目…</p>
        ) : sorted.length === 0 ? (
          <p className="workbench-empty">还没有项目。点击「新建项目」或「导入」开始。</p>
        ) : (
          sorted.map((project) => (
            <article key={project.id} className="workbench-card">
              <button type="button" className="workbench-card-main" aria-label={`打开项目 ${project.name}`} onClick={() => openProject(project.id)}>
                <span className="workbench-card-preview" aria-hidden>
                  <MapPinned size={28} />
                </span>
                <strong>{project.name}</strong>
                <small>{project.pack.project.students.length} 名学生 · 更新于 {formatUpdatedAt(project.updatedAt)}</small>
              </button>
              <div className="workbench-card-menu">
                <button
                  type="button"
                  aria-label="项目菜单"
                  aria-expanded={openMenuId === project.id}
                  onClick={() => setOpenMenuId((current) => current === project.id ? null : project.id)}
                >
                  <MoreHorizontal size={16} />
                </button>
                {openMenuId === project.id && (
                  <div className="workbench-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void renameProject(project)}><Pencil size={14} /> 重命名</button>
                    <button type="button" role="menuitem" onClick={() => void duplicateProject(project)}><Copy size={14} /> 复制</button>
                    <button type="button" role="menuitem" onClick={() => exportProject(project)}><FolderOpen size={14} /> 导出工程包</button>
                    <button type="button" role="menuitem" onClick={() => void deleteProject(project)}><Trash2 size={14} /> 删除</button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/ProjectWorkbench.test.tsx`
Expected: PASS(8 tests)

- [ ] **Step 5: 在 `src/styles.css` 追加工作台样式**

在文件末尾追加(沿用现有设计 token,`--panel-bg`/`--accent` 等变量已存在):

```css
/* 项目工作台 */
.workbench-shell { min-height: 100vh; padding: 32px clamp(16px, 4vw, 48px); background: var(--app-bg, #f5f6f8); }
.workbench-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 1080px; margin: 0 auto 28px; }
.workbench-brand { display: flex; align-items: center; gap: 12px; }
.workbench-brand-mark { display: grid; place-items: center; width: 40px; height: 40px; border-


---

### Task 3: hash 路由与默认入口 `src/main.tsx`

**Files:**
- Modify: `src/main.tsx`
- Create: `src/main.test.tsx`(路由分发测试)

**Interfaces:**
- Consumes: `ProjectWorkbench`(Task 2)、`App`(现有,`{ projectId?: string }` 由 Task 4 完善)、`createIndexedDbProjectStore`(Task 1)
- Produces:
  - `export function renderApp(container: HTMLElement): void` — 可测试的入口函数,按 `window.location.hash` 分发
  - 共享单例 `export const workbenchStore = createIndexedDbProjectStore()`

- [ ] **Step 1: 写失败测试 `src/main.test.tsx`**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "./main";

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

afterEach(() => {
  document.body.innerHTML = "";
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("app routing", () => {
  it("renders the workbench for the root hash", () => {
    setHash("#/");
    renderApp(document.body);
    expect(document.body.textContent).toContain("项目工作台");
  });

  it("renders the editor for a project hash", () => {
    setHash("#/project/proj-1");
    renderApp(document.body);
    expect(document.body.textContent).toContain("蹭饭地图工作室");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/main.test.tsx`
Expected: FAIL("Cannot find module './main' exports renderApp" 或断言失败)

- [ ] **Step 3: 实现 `src/main.tsx` 路由**

```tsx
import { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { WorkflowPrototype } from "./components/WorkflowPrototype";
import { ProjectWorkbench } from "./components/ProjectWorkbench";
import { createIndexedDbProjectStore } from "./lib/project-store";
import "./styles.css";

export const workbenchStore = createIndexedDbProjectStore();

function projectIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/project\/([A-Za-z0-9-]+)$/);
  return match?.[1] ?? null;
}

let root: Root | null = null;

function renderView(container: HTMLElement, view: ReactElement) {
  if (!root) root = createRoot(container);
  root.render(<StrictMode>{view}</StrictMode>);
}

export function renderApp(container: HTMLElement): void {
  const render = () => {
    if (window.location.pathname === "/prototype") {
      renderView(container, <WorkflowPrototype />);
      return;
    }
    const projectId = projectIdFromHash(window.location.hash);
    if (projectId) {
      renderView(container, <App projectId={projectId} />);
      return;
    }
    renderView(container, <ProjectWorkbench store={workbenchStore} />);
  };
  render();
  window.addEventListener("hashchange", render);
}

const container = document.getElementById("root")!;
renderApp(container);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/main.test.tsx`
Expected: PASS(2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/main.test.tsx
git commit -m "feat: hash routing for workbench and editor entry"
```

---

### Task 4: 编辑器按项目 ID 加载/保存 + 返回列表

**Files:**
- Create: `src/lib/editor-project-store.ts`(独立单例,避免 main.tsx 与 App.tsx 循环依赖)
- Modify: `src/App.tsx`(签名、初始加载、保存目标、返回按钮)
- Modify: `src/App.test.tsx`(补 projectId 场景测试)

**Interfaces:**
- Consumes: `createIndexedDbProjectStore`(Task 1)、`restoreProjectPackage`(已有)、`editorProjectStore`(本任务新建)
- Produces:
  - `export function App({ projectId }: { projectId?: string })` — 传 projectId 时按 ID 加载/保存;不传时行为与现状一致
  - `StudioApp` 内部:`backToWorkbench` 回调 → 设置 `window.location.hash = "#/"`

**设计说明**:`App` 无 projectId 时完全保持现有逻辑(现有测试不受影响)。有 projectId 时:
- 挂载时从 IndexedDB 读取项目,`restoreProjectPackage` 后填充 project/assets/fonts/customTemplates/renderSettings(复用现有 hydrate 逻辑)
- `workspaceSync.saveLocal` 中额外写入 IndexedDB(`editorProjectStore.put({ id: projectId, name, updatedAt, pack })`)
- 渲染顶部返回按钮 `← 返回项目列表`
- 项目不存在时渲染"项目不存在"提示 + 返回列表按钮

- [ ] **Step 1: 写失败测试(追加到 `src/App.test.tsx` 末尾)**

```tsx
it("loads a project by id from the workbench store and shows the back button", async () => {
  const { createMemoryProjectStore, createSampleProject } = await import("./lib/project-store");
  const store = createMemoryProjectStore();
  const sample = createSampleProject();
  await store.put(sample);
  vi.doMock("./lib/editor-project-store", () => ({ editorProjectStore: store }));
  const { default: App } = await import("./App");
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<App projectId={sample.id} />));
  await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
  expect(container.textContent).toContain("林舟");
  root.unmount();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/App.test.tsx -t "loads a project by id"`
Expected: FAIL(无返回按钮或未加载)

- [ ] **Step 3: 实现**

创建 `src/lib/editor-project-store.ts`:

```ts
import { createIndexedDbProjectStore } from "./project-store";
export const editorProjectStore = createIndexedDbProjectStore();
```

修改 `src/App.tsx`:
- 顶部 import 增加:
```ts
import { editorProjectStore } from "./lib/editor-project-store";
```
- `StudioApp` 增加 prop `projectId?: string`;`App` 签名:
```tsx
export function App({ projectId }: { projectId?: string }) {
  return <AssistantConversationProvider><StudioApp projectId={projectId} /></AssistantConversationProvider>;
}
```
- `StudioApp` 内部新增状态与加载 effect(放在现有 `useEffect` 区):
```ts
const [projectMissing, setProjectMissing] = useState(false);
const projectNameRef = useRef<string | null>(null);
useEffect(() => {
  if (!projectId) return;
  let cancelled = false;
  void editorProjectStore.get(projectId).then((record) => {
    if (cancelled) return;
    if (!record) { setProjectMissing(true); return; }
    const restored = restoreProjectPackage(record.pack);
    projectNameRef.current = record.name;
    workspaceHydratedRef.current = true;
    skipNextWorkspacePendingRef.current = true;
    setProject(restored.project);
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    setPreviewCommands([]);
    setStatusMessage(`已打开项目「${record.name}」`);
  }).catch(() => setProjectMissing(true));
  return () => { cancelled = true; };
}, [projectId]);
```
- `workspaceSync` 的 `saveLocal` 回调末尾追加 IndexedDB 写入:
```ts
saveLocal: async (pack) => {
  try {
    localStorage.setItem(DRAFT_KEY, serializeProjectDocument(pack.project));
    localStorage.setItem(DRAFT_SAVED_AT_KEY, pack.exportedAt);
  } catch { /* mirror fallback */ }
  const result = await saveBrowserWorkspaceSnapshot(pack, browserStores);
  if (result.durable === "failed" && result.mirror === "failed") throw new Error("浏览器本地存储不可写");
  if (projectIdRef.current) {
    await editorProjectStore.put({
      id: projectIdRef.current,
      name: projectNameRef.current ?? "未命名项目",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
      pack,
    });
  }
},
```
(`projectIdRef` 为 `useRef<string | null>(projectId ?? null)`,避免闭包过期)
- 顶部工具栏增加返回按钮(仅当 projectId 存在):
```tsx
{projectId && (
  <button type="button" className="secondary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>
    <ArrowLeft size={16} /> 返回列表
  </button>
)}
```
(import `ArrowLeft` from "lucide-react")
- `projectMissing` 渲染(在组件 return 顶部):
```tsx
if (projectMissing) {
  return (
    <main className="workbench-shell">
      <section className="workbench-error" role="alert">
        <strong>项目不存在或已删除</strong>
        <button type="button" className="secondary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>返回列表</button>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/App.test.tsx -t "loads a project by id"` 然后全量 `npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/lib/editor-project-store.ts
git commit -m "feat: load and autosave projects by id with back-to-workbench button"
```


---

### Task 5: 删除 Admin 面板(前端 + 服务端)

**Files:**
- Delete: `src/Admin.tsx`、`src/admin.css`
- Modify: `src/main.tsx`(Task 3 已无 Admin 分支,确认无残留引用)
- Modify: `server/index.ts`(删除 visits 与 admin)
- Modify: `server/index.test.ts`(删除 admin/visits 测试)
- Modify: `.env.example`(移除 ADMIN_PASSWORD 注释)

**Interfaces:**
- 保留:`clientIp`、`trustProxy`、`hasApiToken`、`/api/live|ready|health`、`/api/workspace`、房间、AI 端点
- **重要**:`clientIp` 同时用于 AI 限流(`aiLimiter.check(clientIp(request, trustProxy))`),不可删除

- [ ] **Step 1: 删除前端文件并确认无引用**

Run: `rm src/Admin.tsx src/admin.css` 然后 `npx vitest run src/App.test.tsx`
Expected: PASS(App 不引用 Admin)

- [ ] **Step 2: 修改 `server/index.ts` 删除 visits/admin**

删除项(以当前文件行号为参考,删除后重跑测试校准):
- `VISIT_LOG_LIMIT` 常量(`const VISIT_LOG_LIMIT = 5000;`)
- `createVisitId` 函数
- `VisitRecord` interface 与 `LegacyVisitRecord` interface
- `hasAdminAccess` 函数与 `requestAdminAuth` 函数
- `normalizeVisitRecord`、`parseVisitLog`、`readVisitLog` 函数
- `visitsFile` 常量(`join(dataDir, "visits.json")`)
- `visitWriteChain` 变量与 `recordVisit` 函数
- 服务器回调第一行:`response.once("finish", () => recordVisit(request, response.statusCode));`
- `GET /api/admin/visits` 分支(约 573-586 行)
- `GET /admin` 静态分支(约 1011-1014 行)
- 检查 `createReadStream`/`existsSync`/`statSync`/`readFile`/`mkdir`/`rename`/`writeFile` 是否仍被 workspace/static 使用;visits 专属的不再引用则从 import 中移除(但 `node:fs` 整体仍需保留,workspace 与静态服务在用)

- [ ] **Step 3: 更新 `server/index.test.ts`**

删除:
- `adminRequestInit` 辅助函数
- 三个 visits 测试("records visits with request details and exposes aggregate analytics"、"ignores untrusted X-Forwarded-For when trust proxy is off"、"reads legacy visit records without losing their history")
- 检查 `createVisitId`/`VisitRecord` 相关引用一并清理
- 若 `mkdtemp`/`writeFile`/`join`/`tmpdir` 仅被已删测试使用,保留(其他测试仍用)

- [ ] **Step 4: 运行服务端测试**

Run: `npx vitest run server/index.test.ts`
Expected: PASS

- [ ] **Step 5: 更新 `.env.example` 并验证**

删除行:`# ADMIN_PASSWORD=`(保留 `# WORKSPACE_API_TOKEN=` 注释行)。
Run: `npx tsc -b && npx eslint .`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove admin visits panel and its server endpoints"
```

---

### Task 6: 集成验证与文档

**Files:**
- Modify: `docs/deployment/ai-production.md`(移除 admin 相关)
- Modify: `docs/superpowers/specs/2026-08-07-project-workbench-design.md`(如有偏差则修正)
- Modify: `README.md`(入口说明:打开先见项目工作台)

- [ ] **Step 1: 全量验证**

Run: `npm run lint && npm run build && npx vitest run`
Expected: 全部通过(现有 1024+ 新增 ~15 测试)

- [ ] **Step 2: 手动验收清单**

`npm run dev` 后浏览器验证:
1. 打开 `http://localhost:5173/` → 项目工作台,首次自动出现"示例：2026届毕业去向"
2. 新建 → 进入编辑器 → 编辑学生名单 → 点击"返回列表"(自动保存)
3. 列表出现新项目卡片,再次打开内容仍在
4. 重命名 / 复制 / 导出工程包 / 导入工程包 / 删除(确认弹窗)
5. 刷新 `#/project/<id>` 编辑页 URL 仍在同一项目
6. `#/` 根路径回到工作台
7. `/admin` 不再渲染 Admin(404 或回退工作台)

- [ ] **Step 3: 更新文档并 commit**

```bash
git add docs/deployment/ai-production.md README.md
git commit -m "docs: workbench entry, no admin panel, project autosave"
```

---

## 规格自检记录

1. **占位符扫描**:无 TODO/待定;所有代码块为完整可执行内容。
2. **内部一致性**:Task 3 的 `workbenchStore` 单例与 Task 4 的 `editorProjectStore` 各自独立工厂实例,避免循环依赖;`App` 签名在 Task 4 定义,Task 3 测试使用 `projectId` prop 与其一致。
3. **范围检查**:6 个任务均产生可独立测试的交付物,顺序依赖(1→2→3→4 前端,5 与 4 可并行,6 收尾)。
4. **模糊性检查**:首启样例行为在 Task 2 Step 3 明确(空 store 自动写入样例);`projectMissing` 行为在 Task 4 明确。
5. **已知风险**:
   - jsdom 无原生 IndexedDB,所有 IndexedDB 相关组件测试通过注入 memory store 完成;`main.test.tsx` 渲染真实组件时会触发 `createIndexedDbProjectStore()`(无 factory 时返回空实现,不抛错,工作台测试用注入 store 验证)。若 `main.test.tsx` 因 StrictMode 双渲染或真实 store 失败,允许将其改为渲染注入 store 的轻量断言(仅验证 hash 解析函数导出)。
   - `restoreProjectPackage` 对资源引用有修复逻辑,样例项目无素材,兼容。
