import { Copy, FolderOpen, MapPinned, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { StoredProject } from "../../lib/project-store";

export function ProjectCard({ project, updatedAtLabel, menuOpen, onOpen, onToggleMenu, onRename, onDuplicate, onExport, onDelete }: {
  project: StoredProject;
  updatedAtLabel: string;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="workbench-card">
      <button type="button" className="workbench-card-main" aria-label={`打开项目 ${project.name}`} onClick={onOpen}>
        <span className="workbench-card-preview" aria-hidden><MapPinned size={28} /></span>
        <strong>{project.name}</strong>
        <small>{project.pack.project.students.length} 名学生 · 更新于 {updatedAtLabel}</small>
      </button>
      <div className="workbench-card-menu">
        <button type="button" aria-label="项目菜单" aria-expanded={menuOpen} onClick={onToggleMenu}><MoreHorizontal size={16} /></button>
        {menuOpen && <div className="workbench-menu" role="menu">
          <button type="button" role="menuitem" onClick={onRename}><Pencil size={14} /> 重命名</button>
          <button type="button" role="menuitem" onClick={onDuplicate}><Copy size={14} /> 复制</button>
          <button type="button" role="menuitem" onClick={onExport}><FolderOpen size={14} /> 导出工程包</button>
          <button type="button" role="menuitem" onClick={onDelete}><Trash2 size={14} /> 删除</button>
        </div>}
      </div>
    </article>
  );
}