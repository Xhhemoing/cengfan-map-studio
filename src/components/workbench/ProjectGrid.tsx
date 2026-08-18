import { MapPinned } from "lucide-react";
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
    {loading && projects.length === 0 ? (
      <div className="workbench-empty" role="status">
        <span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} /></span>
        <strong>正在加载项目…</strong>
        <p>稍候，正在读取本机项目列表。</p>
      </div>
    ) : projects.length === 0 && !hasError ? (
      <div className="workbench-empty">
        <span className="workbench-empty__mark" aria-hidden="true"><MapPinned size={22} /></span>
        <strong>还没有项目</strong>
        <p>点击「新建项目」或「导入」开始制作毕业去向图。</p>
      </div>
    ) : projects.map((project) => (
      <ProjectCard
        key={project.id}
        project={project}
        updatedAtLabel={formatUpdatedAt(project.updatedAt)}
        menuOpen={openMenuId === project.id}
        onOpen={() => onOpen(project.id)}
        onToggleMenu={() => onToggleMenu(project.id)}
        onRename={() => onRename(project)}
        onDuplicate={() => onDuplicate(project)}
        onExport={() => onExport(project)}
        onDelete={() => onDelete(project)}
      />
    ))}
  </section>;
}