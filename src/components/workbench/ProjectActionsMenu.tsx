import { Copy, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";

export function ProjectActionsMenu({ name, open, onToggle, onRename, onDuplicate, onExport, onDelete }: {
  name: string;
  open: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const items = () => Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    const buttons = Array.from(wrapper.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    (initialFocus.current === "last" ? buttons.at(-1) : buttons[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) onToggle();
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, onToggle]);

  const closeWithFocus = () => {
    onToggle();
    trigger.current?.focus();
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
        onToggle();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeWithFocus();
      return;
    }
    const buttons = items();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
    else if (event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
  };
  const runAction = (action: () => void) => {
    closeWithFocus();
    action();
  };

  return (
    <div ref={wrapper} className="workbench-card-menu" onKeyDown={handleKey} onBlur={(event) => {
      if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) onToggle();
    }}>
      <button ref={trigger} type="button" aria-label="项目菜单" title={`管理项目：${name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => {
        initialFocus.current = "first";
        onToggle();
      }}><MoreHorizontal size={16} aria-hidden="true" /></button>
      {open && <div id={id} className="workbench-menu" role="menu" aria-label={`管理项目 ${name}`}>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => runAction(onRename)}><Pencil size={14} aria-hidden="true" /> 重命名</button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => runAction(onDuplicate)}><Copy size={14} aria-hidden="true" /> 复制</button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => runAction(onExport)}><FolderOpen size={14} aria-hidden="true" /> 导出工程包</button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => runAction(onDelete)}><Trash2 size={14} aria-hidden="true" /> 删除</button>
      </div>}
    </div>
  );
}
