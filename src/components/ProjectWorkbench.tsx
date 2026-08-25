import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { projectPackageFileName } from "../lib/project-package-file-name";
import { createId } from "../lib/ids";
import { loadLocalWorkspaceEntry, type LocalWorkspaceEntry } from "../lib/local-workspace-entry";
import { isPublicDemoBuild, PROJECT_SOURCE_URL } from "../lib/public-base-path";
import { loadStudioSkin, loadThemeMode, resolveTheme } from "../lib/theme";
import { ProjectGrid } from "./workbench/ProjectGrid";
import { WorkbenchHeader } from "./workbench/WorkbenchHeader";
import { ContinueEditingCard } from "./workbench/ContinueEditingCard";
import { StorageNotice, StorageNoticeActionError, StorageNoticeExportAction } from "./StorageNotice";

interface ProjectWorkbenchProps {
  store: ProjectStore;
  /** 路由层订阅到的存储健康度；不传时只能依赖挂载与每次刷新后读到的 `store.health`。 */
  health?: ProjectStoreHealth;
  /** 路由层订阅到的最近一次写回失败；配额耗尽的处置建议要和编辑器路由一样出现在横幅里。 */
  recoverError?: ProjectStoreError | null;
  navigate?: (hash: string) => void;
  publicDemo?: boolean;
}

/** 存储层已把失败翻译成可直接展示的中文，再套一层通用前缀只会盖掉真正的处置建议。 */
function storeFailureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof ProjectStoreError) return reason.message;
  return reason instanceof Error ? `${fallback}：${reason.message}` : fallback;
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

export function ProjectWorkbench({ store, health, recoverError, navigate, publicDemo = isPublicDemoBuild() }: ProjectWorkbenchProps) {
  const go = navigate ?? ((hash: string) => { window.location.hash = hash; });
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 横幅里的导出失败单独记:它要回到用户刚点的那个按钮旁边,不能混进页面下方的通用区块。
  const [noticeExportError, setNoticeExportError] = useState("");
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
  const lastHealthRef = useRef<ProjectStoreHealth>(health ?? store.health);
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

  // 内存→持久的恢复换掉了读写通道:内存期读到的列表是另一份数据,
  // 不重读的话要等到用户下一次增删改才纠正,中间一直展示已经失效的视图。
  useEffect(() => {
    const previous = lastHealthRef.current;
    lastHealthRef.current = storeHealth;
    if (previous === "memory" && storeHealth === "persistent") void refresh();
  }, [storeHealth, refresh]);

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
      // 和重命名/删除一样先刷新再跳转:导航被拦下时工作台会留在原地(测试注入 navigate、
      // R6-7 的崩溃返回不再整页重载),不刷新的话降级横幅就少一个刚建项目的导出入口。
      await refresh();
      openProject(project.id);
    } catch (reason) {
      reportFailure(reason, "创建项目失败");
    }
  };

  const loadSampleProject = async () => {
    try {
      await store.put(createSampleProject());
      await refresh();
    } catch (reason) {
      reportFailure(reason, "载入示例项目失败");
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

  const downloadProject = async (project: Pick<ProjectListItem, "id" | "name" | "updatedAt">) => {
    const stored = await store.get(project.id);
    if (!stored) throw new Error("项目不存在");
    downloadProjectPackage(stored.pack, projectPackageFileName(project));
  };

  const exportProject = async (project: Pick<ProjectListItem, "id" | "name" | "updatedAt">) => {
    try {
      await downloadProject(project);
      setOpenMenuId(null);
    } catch (reason) {
      reportFailure(reason, "导出项目失败");
    }
  };

  /** 降级期的备份出口就在横幅里,失败留在横幅内,否则按钮点了没反应、用户以为已经备份好了。 */
  const exportFromNotice = async (project: Pick<ProjectListItem, "id" | "name" | "updatedAt">) => {
    try {
      await downloadProject(project);
      setNoticeExportError("");
    } catch (reason) {
      setNoticeExportError(storeFailureMessage(reason, "导出项目失败"));
      syncHealth();
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

      {/* 降级提示不可关闭:内存模式持续期间用户随时可能关闭标签页,提示消失就等于数据静默丢失。
        * 这里刻意不提供"一键导出全部",逐个项目各给一个按钮 —— 一次点击一份工程包,原因见 StorageNotice。 */}
      {storeHealth === "memory" && (
        <StorageNotice
          recoverError={recoverError}
          exportActions={sorted.length === 0 && !noticeExportError ? null : (
            <>
              {sorted.map((project) => (
                <StorageNoticeExportAction
                  key={project.id}
                  projectId={project.id}
                  ariaLabel={`导出「${project.name}」`}
                  onExport={() => void exportFromNotice(project)}
                >
                  {project.name}（{project.studentCount} 人）
                </StorageNoticeExportAction>
              ))}
              {noticeExportError && <StorageNoticeActionError message={noticeExportError} />}
            </>
          )}
        />
      )}

      {publicDemo && (
        <section className="workbench-notice" role="note">
          这是公开演示站：导入、排版、导出都在你的浏览器完成，名单不会上传。协作房间和智能助手需要自建 Node API，本站未开启。
          {" "}
          <a href={PROJECT_SOURCE_URL} rel="noopener noreferrer" target="_blank">源码（AGPL-3.0）</a>
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
        onLoadSample={() => void loadSampleProject()}
      />
    </main>
  );
}
