import { useEffect, useRef, useState, type ReactNode } from "react";
import "./WorkbenchDialog.css";

export type WorkbenchDialogProps = {
  titleId: string;
  describedBy?: string;
  /** 追加在根节点上的类名，供沿用旧皮肤的调用方（如保存模板）保留自己的样式钩子。 */
  className?: string;
  onCancel: () => void;
  /** 传入即把面板渲染成表单，回车与提交按钮都走这里。 */
  onSubmit?: () => void;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
].join(",");

function focusableItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute("disabled") && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * 工作台对话框外壳，与 `SaveTemplateDialog` 同一套交互：遮罩点击取消、
 * Esc 取消、面板承载具体内容。取代 `window.prompt` / `window.confirm`，
 * 后者在沙箱化的 iframe 里会被直接抑制并返回 null。
 *
 * `aria-modal` 只是给辅助技术的声明，键盘行为得自己兜住：Tab 在面板内回绕，
 * Esc 挂在 document 捕获阶段（焦点被点到遮罩上也仍然生效），关闭后把焦点还给打开它的控件。
 */
export function WorkbenchDialog({ titleId, describedBy, className, onCancel, onSubmit, children }: WorkbenchDialogProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  // 首次渲染时取，而不是在 effect 里取：子组件的 effect 先跑，等轮到这里
  // activeElement 已经是对话框内部的输入框了。
  const [previouslyFocused] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    const panel = panelRef.current;
    // 子组件（确认框的「取消」、重命名的输入框）已经在自己的 effect 里放好焦点，
    // 只有没人认领时才退回面板本身，免得焦点留在背后的页面上。
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    return () => {
      const active = document.activeElement;
      // 调用方可能已经自己把焦点还给了触发控件，这时不要抢回来。
      const stranded = !active || active === document.body || (panel?.contains(active) ?? false);
      if (stranded && previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [previouslyFocused]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 输入法候选框里的 Esc 属于候选框，别把整个对话框收掉。
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        // 阻止冒泡，避免工作台的文档级 Esc 兜底监听重复处理这次按键。
        event.stopPropagation();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      const items = focusableItems(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active || !panel.contains(active) || active === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey ? active === first : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const panelProps = {
    className: "workbench-dialog__panel",
    tabIndex: -1,
    ref: (node: HTMLElement | null) => {
      panelRef.current = node;
    },
  };

  return (
    <div
      className={className ? `workbench-dialog ${className}` : "workbench-dialog"}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
    >
      <div className="workbench-dialog__backdrop" onClick={onCancel} />
      {onSubmit ? (
        <form
          {...panelProps}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      ) : (
        <div {...panelProps}>{children}</div>
      )}
    </div>
  );
}
