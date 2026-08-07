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
      try {
        await refresh();
        if (cancelled || seededRef.current) return;
        seededRef.current = true;
        const list = await store.list();
        if (list.length === 0) {
          await store.put(createSampleProject());
          await refresh();
        }
      } catch (reason) {
        setError(reason instanceof Error ? `初始化项目失败：${reason.message}` : "初始化项目失败：浏览器存储不可用");
      }
    })();
    return () => { cancelled = true; };
  }, [refresh, store]);

  const openProject = (id: string) => go(`#/project/${encodeURIComponent(id)}`);

  const createProject = async () => {
    try {
      const project = createEmptyProject();
      await store.put(project);
      openProject(project.id);
    } catch (reason) {
      setError(reason instanceof Error ? `创建项目失败：${reason.message}` : "创建项目失败");
    }
  };

  const renameProject = async (project: StoredProject) => {
    const name = window.prompt("请输入新项目名称", project.name);
    if (name === null || !name.trim()) return;
    try {
      await store.put({ ...project, name: name.trim(), updatedAt: new Date().toISOString() });
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `重命名项目失败：${reason.message}` : "重命名项目失败");
    }
  };

  const duplicateProject = async (project: StoredProject) => {
    try {
      const copy = duplicateStoredProject(project);
      await store.put(copy);
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `复制项目失败：${reason.message}` : "复制项目失败");
    }
  };

  const deleteProject = async (project: StoredProject) => {
    if (!window.confirm(`删除项目「${project.name}」？此操作不可恢复。`)) return;
    try {
      await store.remove(project.id);
      setOpenMenuId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `删除项目失败：${reason.message}` : "删除项目失败");
    }
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
