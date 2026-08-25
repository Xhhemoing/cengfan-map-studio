import { MapPinned } from "lucide-react";
import type { ProjectListItem } from "../../lib/project-store";
import { ProjectCard } from "./ProjectCard";

/**
 * 列表页只有元数据视图:`store.list()` 不加载工程包本体,卡片需要的字段
 * (名称、更新时间、学生数)都在 `ProjectListItem` 里。用完整的 `StoredProject`
 * 声明属性会逼调用方伪造工程包,所以这里按元数据形状收窄。
 */
export type ProjectGridItem = Pick<ProjectListItem, "id" | "name" | "updatedAt" | "pack">;

export function ProjectGrid({ projects, loading, hasError, openMenuId, formatUpdatedAt, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete }: {
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
        <p>点击「新建项目」或「导入」，做毕业去向、开学合影或校庆班级图。</p>
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