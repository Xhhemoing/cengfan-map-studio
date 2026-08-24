import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Copy, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { StoredProject } from "../../lib/project-store";

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * 卡片下拉菜单。只在打开时挂载，因此高亮项索引每次都从 0 重新开始，
 * 不需要在 effect 里回写状态。
 */
function ProjectCardMenu({ id, labelledBy, items, onClose }: {
  id: string;
  labelledBy: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // 打开后把焦点送进菜单第一项，键盘用户不必再 Tab 一圈才能进入菜单。
  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  const focusItem = (index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // 阻止冒泡，避免工作台的文档级兜底监听重复关闭。
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const count = items.length;
    const focused = itemRefs.current.findIndex((node) => node !== null && node === document.activeElement);
    const current = focused >= 0 ? focused : activeIndex;
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = (current + 1) % count; break;
      case "ArrowUp": next = (current - 1 + count) % count; break;
      case "Home": next = 0; break;
      case "End": next = count - 1; break;
      default: return;
    }
    event.preventDefault();
    focusItem(next);
  };

  return (
    <div className="workbench-menu" role="menu" id={id} aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button
          key={item.key}
          ref={(node) => { itemRefs.current[index] = node; }}
          type="button"
          role="menuitem"
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={item.onSelect}
        >
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  );
}

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
  const studentCount = project.pack.project.students.length;
  // 一屏会渲染多张卡片，静态 id 会在文档里重复，用 useId 保证 aria-controls 唯一。
  const instanceId = useId();
  const menuId = `${instanceId}-menu`;
  const triggerId = `${instanceId}-trigger`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const items: MenuItem[] = [
    { key: "rename", label: "重命名", icon: <Pencil size={14} />, onSelect: onRename },
    { key: "duplicate", label: "复制", icon: <Copy size={14} />, onSelect: onDuplicate },
    { key: "export", label: "导出工程包", icon: <FolderOpen size={14} />, onSelect: onExport },
    { key: "delete", label: "删除", icon: <Trash2 size={14} />, onSelect: onDelete },
  ];

  // Esc 关闭时把焦点还给触发按钮；外点关闭不抢焦点，交给用户点到的那个元素。
  const closeAndRestoreFocus = () => {
    onToggleMenu();
    triggerRef.current?.focus();
  };

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
      <div className="workbench-card-menu">
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          aria-label="项目菜单"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={onToggleMenu}
        >
          <MoreHorizontal size={16} />
        </button>
        {menuOpen && <ProjectCardMenu id={menuId} labelledBy={triggerId} items={items} onClose={closeAndRestoreFocus} />}
      </div>
    </article>
  );
}
