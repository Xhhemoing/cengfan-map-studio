import { ProjectActionsMenu } from "./ProjectActionsMenu";
import type { ProjectListItem } from "../../lib/project-store";
import { ProjectPreview } from "./ProjectPreview";
import { useId } from "react";

export function ProjectCard({ project, updatedAtLabel, menuOpen, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete }: {
  /** 元数据视图即可渲染卡片;`StoredProject` 也满足这个形状。 */
  project: Pick<ProjectListItem, "name" | "pack" | "preview">;
  updatedAtLabel: string;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const studentCount = project.pack.project.students.length;
  const previewId = useId();
  return (
    <article className="workbench-card">
      <button type="button" className="workbench-card-main" aria-label={`打开项目 ${project.name}`} aria-describedby={previewId} onClick={onOpen}>
        <ProjectPreview id={previewId} preview={project.preview} />
        <strong title={project.name}>{project.name}</strong>
        <small>
          <span className="workbench-card-count">{studentCount}</span>
          {" "}名学生 · 更新于 {updatedAtLabel}
        </small>
      </button>
      <ProjectActionsMenu name={project.name} open={menuOpen} onToggle={onToggleMenu} onRename={onRename} onDuplicate={onDuplicate} onExport={onExport} onDelete={onDelete} />
    </article>
  );
}
