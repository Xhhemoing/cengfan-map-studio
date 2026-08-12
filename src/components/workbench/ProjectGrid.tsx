import type { StoredProject } from "../../lib/project-store";
import { ProjectCard } from "./ProjectCard";

export function ProjectGrid({ projects, loading, hasError, openMenuId, formatUpdatedAt, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete }: {
  projects: StoredProject[];
  loading: boolean;
  hasError: boolean;
  openMenuId: string | null;
  formatUpdatedAt: (value: string) => string;
  onOpen: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onRename: (project: StoredProject) => void;
  onDuplicate: (project: StoredProject) => void;
  onExport: (project: StoredProject) => void;
  onDelete: (project: StoredProject) => void;
}) {
  return <section className="workbench-grid" aria-label="项目列表">
    {loading && projects.length === 0 ? <p className="workbench-empty">正在加载项目…</p>
      : projects.length === 0 && !hasError ? <p className="workbench-empty">还没有项目。点击「新建项目」或「导入」开始。</p>
        : projects.map((project) => <ProjectCard key={project.id} project={project} updatedAtLabel={formatUpdatedAt(project.updatedAt)} menuOpen={openMenuId === project.id} onOpen={() => onOpen(project.id)} onToggleMenu={() => onToggleMenu(project.id)} onRename={() => onRename(project)} onDuplicate={() => onDuplicate(project)} onExport={() => onExport(project)} onDelete={() => onDelete(project)} />)}
  </section>;
}