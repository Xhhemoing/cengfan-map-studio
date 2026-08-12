import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyProject, createSampleProject, duplicateStoredProject, type ProjectStore, type StoredProject } from "../lib/project-store";
import { downloadProjectPackage, parseProjectPackage } from "../lib/project-package";
import { createId } from "../lib/ids";
import { ProjectGrid } from "./workbench/ProjectGrid";
import { WorkbenchHeader } from "./workbench/WorkbenchHeader";

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
        const list = await store.list();
        if (list.length === 0) {
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
      <WorkbenchHeader importInputRef={importInputRef} onCreateProject={() => void createProject()} onImportProject={(file) => void importProject(file)} />

      {error && <section className="workbench-error" role="alert">{error}</section>}

      <ProjectGrid projects={sorted} loading={loading} hasError={Boolean(error)} openMenuId={openMenuId} formatUpdatedAt={formatUpdatedAt} onOpen={openProject} onToggleMenu={(id) => setOpenMenuId((current) => current === id ? null : id)} onRename={(project) => void renameProject(project)} onDuplicate={(project) => void duplicateProject(project)} onExport={exportProject} onDelete={(project) => void deleteProject(project)} />
    </main>
  );
}
