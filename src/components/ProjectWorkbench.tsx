import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  createEmptyProject,
  createSampleProject,
  duplicateStoredProject,
  ProjectStoreError,
  type ProjectListItem,
  type ProjectStore,
  type ProjectStoreHealth,
  type StoredProject,
} from "../lib/project-store";
import { assertProjectPackageSize, downloadProjectPackage, parseProjectPackage, projectPackageDisplayName } from "../lib/project-package";
import { createId } from "../lib/ids";
import { loadLocalWorkspaceEntry, type LocalWorkspaceEntry } from "../lib/local-workspace-entry";
import { loadStudioSkin, loadThemeMode, resolveTheme } from "../lib/theme";
import { ProjectGrid } from "./workbench/ProjectGrid";
import { WorkbenchHeader } from "./workbench/WorkbenchHeader";
import { ContinueEditingCard } from "./workbench/ContinueEditingCard";

interface ProjectWorkbenchProps {
  store: ProjectStore;
  /** 路由层订阅到的存储健康度；不传时只能依赖挂载与每次刷新后读到的 `store.health`。 */
  health?: ProjectStoreHealth;
  navigate?: (hash: string) => void;
}

const MEMORY_MODE_NOTICE = "本次编辑不会保存到本机，请及时导出工程备份";

/** 存储层已把失败翻译成可直接展示的中文，再套一层通用前缀只会盖掉真正的处置建议。 */
function storeFailureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ProjectStoreError) return reason.message;
  return reason instanceof Error ? `${fallback}：${reason.message}` : fallback;
}

function packageFileName(project: Pick<ProjectListItem, "name" | "updatedAt">): string {
  return `${project.name}-${project.updatedAt.slice(0, 10)}.json`;
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

export function ProjectWorkbench({ store, health, navigate }: ProjectWorkbenchProps) {
  const go = navigate ?? ((hash: string) => { window.location.hash = hash; });
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 降级可能发生在挂载之前(直接读快照)或某次读写过程中(读写后再读一次快照)。
  const [observedHealth, setObservedHealth] = useState<ProjectStoreHealth>(() => store.health);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [localEntry, setLocalEntry] = useState<LocalWorkspaceEntry | null>(null);
  const [skin] = useState(() => loadStudioSkin());
  const [themeMode] = useState(() => loadThemeMode());
  const [prefersDark] = useState(() => typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const seededRef = useRef(false);
  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  // 路由层的订阅值优先:它跟着 onHealthChange 走,内存→持久的恢复也能立刻反映出来。
  const storeHealth = health ?? observedHealth;

  const syncHealth = useCallback(() => setObservedHealth(store.health), [store]);

  const reportFailure = useCallback((reason: unknown, fallback: string) => {
    setError(storeFailureMessage(reason, fallback));
    syncHealth();
  }, [syncHealth]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await store.list());
      setError("");
    } catch {
      setError("读取项目失败：浏览器存储不可用");
    } finally {
      setLoading(false);
      syncHealth();
    }
  }, [store, syncHealth]);

  useEffect(() => {
    let cancelled = false;
    void loadLocalWorkspaceEntry().then((entry) => {
      if (!cancelled) setLocalEntry(entry);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
        if (cancelled || seededRef.current) return;
        const list = await store.list();
        if (list.length === 0) {
          await store.put(createSampleProject());
          await refresh();
        }
        // 播种成功后才置位:若 put 失败(见 catch),seededRef 保持 false,
        // 下次进入工作台(重新挂载)会自动重试播种。
        seededRef.current = true;
      } catch (reason) {
        reportFailure(reason, "初始化项目失败");
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, reportFailure, store]);

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);

  const openProject = (id: string) => go(`#/project/${encodeURIComponent(id)}`);

  const continueEditing = async () => {
    if (!localEntry) return;
    try {
      const existing = projects.find((project) => project.pack.exportedAt === localEntry.pack.exportedAt);
      if (existing) {
        openProject(existing.id);
        return;
      }
      const savedAt = localEntry.pack.exportedAt;
      const time = Date.parse(savedAt);
      const label = Number.isFinite(time)
        ? `本地内容 · ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(time))}`
        : "本地内容";
      const created: StoredProject = {
        id: createId("proj"),
        name: label,
        createdAt: savedAt,
        updatedAt: savedAt,
        pack: localEntry.pack,
      };
      await store.put(created);
      openProject(created.id);
    } catch (reason) {
      reportFailure(reason, "继续编辑失败");
    }
  };

  const createProject = async () => {
    try {
      const project = createEmptyProject();
      await store.put(project);
      openProject(project.id);
    } catch (reason) {
      reportFailure(reason, "创建项目失败");
    }
  };

  const renameProject = async (project: Pick<ProjectListItem, "id" | "name">) => {
    const name = window.prompt("请输入新项目名称", project.name);
    if (name === null || !name.trim()) return;
    try {
      const stored = await store.get(project.id);
      if (!stored) throw new Error("项目不存在");
      await store.put({ ...stored, name: name.trim(), updatedAt: new Date().toISOString() });
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      reportFailure(reason, "重命名项目失败");
    }
  };

  const duplicateProject = async (project: Pick<ProjectListItem, "id">) => {
    try {
      const stored = await store.get(project.id);
      if (!stored) throw new Error("项目不存在");
      const copy = duplicateStoredProject(stored);
      await store.put(copy);
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      reportFailure(reason, "复制项目失败");
    }
  };

  const deleteProject = async (project: Pick<ProjectListItem, "id" | "name">) => {
    if (!window.confirm(`删除项目「${project.name}」？此操作不可恢复。`)) return;
    try {
      await store.remove(project.id);
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      reportFailure(reason, "删除项目失败");
    }
  };

  const exportProject = async (project: Pick<ProjectListItem, "id" | "name" | "updatedAt">) => {
    try {
      const stored = await store.get(project.id);
      if (!stored) throw new Error("项目不存在");
      downloadProjectPackage(stored.pack, packageFileName(project));
      setOpenMenuId(null);
    } catch (reason) {
      reportFailure(reason, "导出项目失败");
    }
  };

  /** 降级模式下的兜底备份：列表里的每个项目各导出一份工程包，沿用现有工程包格式。 */
  const exportBackup = async () => {
    try {
      for (const project of sorted) {
        const stored = await store.get(project.id);
        if (!stored) continue;
        downloadProjectPackage(stored.pack, packageFileName(project));
      }
      setError("");
    } catch (reason) {
      reportFailure(reason, "导出工程备份失败");
    }
  };

  const importProject = async (file: File | null) => {
    if (!file) return;
    try {
      // 先用 File.size 挡掉超限工程包：file.text() 会把整份文本读进内存。
      assertProjectPackageSize(file.size);
      const pack = parseProjectPackage(await file.text());
      await store.put({
        id: createId("proj"),
        name: projectPackageDisplayName(file.name),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pack,
      });
      setError("");
      await refresh();
    } catch (reason) {
      reportFailure(reason, "导入失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <main
      className="app-shell workbench-shell"
      data-editor-skin={skin}
      data-editor-theme={resolvedTheme}
    >
      <WorkbenchHeader importInputRef={importInputRef} onCreateProject={() => void createProject()} onImportProject={(file) => void importProject(file)} />

      {/* 降级提示不可关闭:内存模式持续期间用户随时可能关闭标签页,提示消失就等于数据静默丢失。 */}
      {storeHealth === "memory" && (
        <section className="workbench-resume workbench-storage-notice" role="status" data-store-health="memory">
          <span className="workbench-resume-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
          <span className="workbench-resume-body">
            <strong>{MEMORY_MODE_NOTICE}</strong>
            <small>浏览器本机存储不可用，项目只保留在当前标签页内存中。</small>
          </span>
          <button
            type="button"
            className="workbench-resume-cta"
            aria-label="导出工程备份"
            disabled={sorted.length === 0}
            onClick={() => void exportBackup()}
          >
            导出工程备份
          </button>
        </section>
      )}

      {error && <section className="workbench-error" role="alert">{error}</section>}

      {localEntry && <ContinueEditingCard entry={localEntry} onResume={() => void continueEditing()} />}

      <ProjectGrid
        projects={sorted}
        loading={loading}
        hasError={Boolean(error)}
        openMenuId={openMenuId}
        formatUpdatedAt={formatUpdatedAt}
        onOpen={openProject}
        onToggleMenu={(id) => setOpenMenuId((current) => current === id ? null : id)}
        onRename={(project) => void renameProject(project)}
        onDuplicate={(project) => void duplicateProject(project)}
        onExport={(project) => void exportProject(project)}
        onDelete={(project) => void deleteProject(project)}
      />
    </main>
  );
}
