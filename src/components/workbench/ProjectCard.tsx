import { useEffect, useRef } from "react";
import { Copy, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { StoredProject } from "../../lib/project-store";

export function ProjectCard({ project, updatedAtLabel, menuOpen, onOpen, onToggleMenu, onCloseMenu, onRename, onDuplicate, onExport, onDelete }: {
  project: StoredProject;
  updatedAtLabel: string;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const studentCount = project.pack.project.students.length;
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  // 与编辑器 ProjectMenu 同规则：点菜单外或按 Esc 关闭；外部点击只用于关闭，
  // 不得穿透误触下层元素（如其他项目卡片）。
  useEffect(() => {
    if (!menuOpen) return;
    const closeFromOutside = (event: MouseEvent) => {
      const root = menuRootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onCloseMenu();
    };
    document.addEventListener("click", closeFromOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeFromOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, onCloseMenu]);

  return (
    <article className="workbench-card">
      <button type="button" className="workbench-card-main" aria-label={`打开项目 ${project.name}`} onClick={onOpen}>
        <span className="workbench-card-preview" aria-hidden="true">
          <span className="workbench-card-preview__map" />
          <span className="workbench-card-preview__pin" />
        </span>
        <strong>{project.name}</strong>
        <small>
          <span className="workbench-card-count">{studentCount}</span>
          {" "}名学生 · 更新于 {updatedAtLabel}
        </small>
      </button>
      <div className="workbench-card-menu" ref={menuRootRef}>
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
