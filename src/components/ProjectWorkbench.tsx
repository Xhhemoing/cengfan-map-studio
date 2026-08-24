import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyProject, createSampleProject, duplicateStoredProject, isCorruptedProject, type ProjectStore, type StoredProject } from "../lib/project-store";
import { downloadProjectPackage, parseProjectPackage, projectPackageDisplayName, type ProjectPackage } from "../lib/project-package";
import { downloadText } from "../lib/export-poster";
import { createId } from "../lib/ids";
import { PROJECT_PACKAGE_IMPORT_LIMIT, checkImportFileSize } from "../lib/import-file-limits";
import { loadLocalWorkspaceEntry, type LocalWorkspaceEntry } from "../lib/local-workspace-entry";
import { loadStudioSkin, loadThemeMode, resolveTheme } from "../lib/theme";
import { ProjectGrid } from "./workbench/ProjectGrid";
import { WorkbenchHeader } from "./workbench/WorkbenchHeader";
import { ContinueEditingCard } from "./workbench/ContinueEditingCard";
import { RenameProjectDialog } from "./workbench/RenameProjectDialog";
import { DeleteProjectDialog } from "./workbench/DeleteProjectDialog";

interface ProjectWorkbenchProps {
  store: ProjectStore;
  navigate?: (hash: string) => void;
}

/** 由卡片菜单发起的对话框请求：带上把焦点还回菜单按钮的回调。 */
interface DialogRequest {
  project: StoredProject;
  restoreFocus: () => void;
}

/**
 * warnings 只描述某一次解析（剥离了哪些超限字体/素材），不是工程包内容。
 * 落进 IndexedDB 会被后续导出原样带走，让下一位使用者看到与自己无关的剥离说明。
 */
function withoutImportWarnings(pack: ProjectPackage): ProjectPackage {
  const { warnings: _warnings, ...stored } = pack;
  return stored;
}

/** 损坏记录只允许「导出原始数据」和「删除」，其余入口都会拿占位工程去覆盖它。 */
const CORRUPTED_ACTION_HINT = "这个项目的记录已损坏，无法打开或修改。请先从卡片菜单「导出工程包」保存原始数据，再决定是否删除。";

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
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameRequest, setRenameRequest] = useState<DialogRequest | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DialogRequest | null>(null);
  const [localEntry, setLocalEntry] = useState<LocalWorkspaceEntry | null>(null);
  const [skin] = useState(() => loadStudioSkin());
  const [themeMode] = useState(() => loadThemeMode());
  const [prefersDark] = useState(() => typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const seededRef = useRef(false);
  const resolvedTheme = resolveTheme(themeMode, prefersDark);

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
        // 只有库里一条记录都没有才播种。拿列表长度当依据的话，读取失败或记录损坏
        // 都会被当成新用户，示例项目播下去正好把出问题的数据盖在后面。
        if (await store.count() === 0) {
          await store.put(createSampleProject());
          await refresh();
        }
        // 播种成功后才置位:若 put 失败(见 catch),seededRef 保持 false,
        // 下次进入工作台(重新挂载)会自动重试播种。
        seededRef.current = true;
      } catch (reason) {
        setError(reason instanceof Error ? `初始化项目失败：${reason.message}` : "初始化项目失败：浏览器存储不可用");
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, store]);

  // 卡片菜单打开时才挂文档级监听：点到菜单外或按 Esc 就关闭。
  // 焦点回退由 ProjectCard 处理（它会 stopPropagation，这里的 Esc 只是兜底）。
  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".workbench-card-menu")) return;
      setOpenMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("click", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  const openProject = (id: string) => {
    const target = projects.find((project) => project.id === id);
    if (target && isCorruptedProject(target)) {
      setError(CORRUPTED_ACTION_HINT);
      return;
    }
    go(`#/project/${encodeURIComponent(id)}`);
  };

  const continueEditing = async () => {
    if (!localEntry) return;
    try {
      // 降级条目的 pack 是占位工程，拿它去比对会把本地内容错认成已入库的项目。
      const existing = projects.find((project) => !isCorruptedProject(project) && project.pack.exportedAt === localEntry.pack.exportedAt);
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
        pack: withoutImportWarnings(localEntry.pack),
      };
      await store.put(created);
      openProject(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? `继续编辑失败：${reason.message}` : "继续编辑失败");
    }
  };

  const createProject = async () => {
    try {
      const project = createEmptyProject();
      await store.put(project);
      openProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? `创建项目失败：${reason.message}` : "创建项目失败");
    }
  };

  // 菜单项只负责开对话框：对话框挂载后菜单收起，避免两层浮层争焦点。
  const requestRename = (project: StoredProject, restoreFocus: () => void) => {
    setOpenMenuId(null);
    if (isCorruptedProject(project)) {
      setError(CORRUPTED_ACTION_HINT);
      restoreFocus();
      return;
    }
    setRenameRequest({ project, restoreFocus });
  };

  const closeRenameDialog = () => {
    renameRequest?.restoreFocus();
    setRenameRequest(null);
  };

  const renameProject = async (name: string) => {
    const request = renameRequest;
    if (!request) return;
    closeRenameDialog();
    try {
      await store.put({ ...request.project, name, updatedAt: new Date().toISOString() });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `重命名项目失败：${reason.message}` : "重命名项目失败");
    }
  };

  const duplicateProject = async (project: StoredProject) => {
    if (isCorruptedProject(project)) {
      setOpenMenuId(null);
      setError(CORRUPTED_ACTION_HINT);
      return;
    }
    try {
      const copy = duplicateStoredProject(project);
      await store.put(copy);
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `复制项目失败：${reason.message}` : "复制项目失败");
    }
  };

  const requestDelete = (project: StoredProject, restoreFocus: () => void) => {
    setOpenMenuId(null);
    setDeleteRequest({ project, restoreFocus });
  };

  const closeDeleteDialog = () => {
    deleteRequest?.restoreFocus();
    setDeleteRequest(null);
  };

  const deleteProject = async () => {
    const request = deleteRequest;
    if (!request) return;
    // 卡片随删除一起卸载，焦点还给已移除的按钮没有意义，这里只收起对话框。
    setDeleteRequest(null);
    try {
      await store.remove(request.project.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `删除项目失败：${reason.message}` : "删除项目失败");
      request.restoreFocus();
    }
  };

  const exportProject = (project: StoredProject) => {
    setOpenMenuId(null);
    const corrupted = project.corrupted;
    if (corrupted) {
      // 损坏记录导出的是库里的原始值而不是占位工程：用户手里可能只剩这一份，
      // 留着 JSON 才有机会人工修好或者找我们排查。
      try {
        downloadText(`${JSON.stringify(corrupted.raw, null, 2)}\n`, `${project.name}-原始记录.json`, "application/json;charset=utf-8");
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? `导出原始记录失败：${reason.message}` : "导出原始记录失败");
      }
      return;
    }
    downloadProjectPackage(project.pack, `${project.name}-${project.updatedAt.slice(0, 10)}.json`);
  };

  const importProject = async (file: File | null) => {
    if (!file) return;
    setImportWarnings([]);
    try {
      // 先判体积再读盘：`file.text()` 与 `JSON.parse` 都要把整份工程同步装进内存，
      // 超限的文件读进来只会先卡死标签页，再抛一个用户看不懂的解析错误。
      const oversized = checkImportFileSize(file, PROJECT_PACKAGE_IMPORT_LIMIT);
      if (oversized) {
        setError(`导入失败：${oversized}`);
        return;
      }
      const pack = parseProjectPackage(await file.text());
      await store.put({
        id: createId("proj"),
        name: projectPackageDisplayName(file.name),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pack: withoutImportWarnings(pack),
      });
      setError("");
      setImportWarnings(pack.warnings ?? []);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `导入失败：${reason.message}` : "导入失败");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const sorted = useMemo(() => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [projects]);
  const corruptedCount = useMemo(() => projects.filter(isCorruptedProject).length, [projects]);

  return (
    <main
      className="app-shell workbench-shell"
      data-editor-skin={skin}
      data-editor-theme={resolvedTheme}
    >
      <WorkbenchHeader importInputRef={importInputRef} onCreateProject={() => void createProject()} onImportProject={(file) => void importProject(file)} />

      {error && <section className="workbench-error" role="alert">{error}</section>}

      {corruptedCount > 0 && (
        <section className="workbench-error workbench-error--corrupted" role="alert">
          有 {corruptedCount} 个项目记录读不出来，已按「（无法读取）」保留在列表里。
          它们不能打开或修改，请先用卡片菜单里的「导出工程包」把原始数据存下来，再决定是否删除。
        </section>
      )}

      {importWarnings.length > 0 && (
        <section className="workbench-error workbench-error--notice" role="status">
          导入成功，但已剥离超限内容：{importWarnings.join("；")}
        </section>
      )}

      {localEntry && <ContinueEditingCard entry={localEntry} onResume={() => void continueEditing()} />}

      <ProjectGrid projects={sorted} loading={loading} hasError={Boolean(error)} openMenuId={openMenuId} formatUpdatedAt={formatUpdatedAt} onOpen={openProject} onToggleMenu={(id) => setOpenMenuId((current) => current === id ? null : id)} onRename={requestRename} onDuplicate={(project) => void duplicateProject(project)} onExport={exportProject} onDelete={requestDelete} />

      {renameRequest && (
        <RenameProjectDialog
          key={renameRequest.project.id}
          currentName={renameRequest.project.name}
          onCancel={closeRenameDialog}
          onSubmit={(name) => void renameProject(name)}
        />
      )}

      {deleteRequest && (
        <DeleteProjectDialog
          key={deleteRequest.project.id}
          projectName={deleteRequest.project.name}
          onCancel={closeDeleteDialog}
          onConfirm={() => void deleteProject()}
        />
      )}
    </main>
  );
}
