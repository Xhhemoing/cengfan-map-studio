import { MapPinned } from "lucide-react";
import type { ProjectListItem } from "../../lib/project-store";
import { ProjectCard } from "./ProjectCard";

/** Cards consume list metadata, not the full stored project payload. */
export type ProjectGridItem = Pick<ProjectListItem, "id" | "name" | "updatedAt" | "pack">;

export function ProjectGrid({ projects, loading, hasError, openMenuId, formatUpdatedAt, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete, onLoadSample }: {
  projects: ProjectGridItem[];
  loading: boolean;
  hasError: boolean;
  openMenuId: string | null;
  formatUpdatedAt: (value: string) => string;
  onOpen: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onRename: (project: ProjectGridItem) => void;
  onDuplicate: (project: ProjectGridItem) => void;
  onExport: (project: ProjectGridItem) => void;
  onDelete: (project: ProjectGridItem) => void;
  onLoadSample: () => void;
}) {
  return <>
    <header className="workbench-section-heading">
      <div>
        <h1>我的项目</h1>
        <p>继续编辑，或从一张新地图开始。</p>
      </div>
      {!loading && !hasError && <span className="workbench-project-count">{projects.length} 个项目</span>}
    </header>
    <section className="workbench-grid" aria-label="项目列表" aria-busy={loading}>
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
          <p>点击「新建项目」或「导入」，做毕业去向、开学合影或校庆班级图。</p>
          <button type="button" className="secondary-button" aria-label="载入示例项目" onClick={onLoadSample}>载入示例项目</button>
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
    </section>
  </>;
}
