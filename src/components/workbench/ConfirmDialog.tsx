import { useEffect, useId, useRef, type ReactNode } from "react";
import { WorkbenchDialog } from "./WorkbenchDialog";

export type ConfirmDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` 用于删除、替换这类不可逆动作，主按钮转成红色。 */
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 通用二选一确认框，取代 `window.confirm`：
 * 后者在沙箱化的 iframe 里会被直接抑制并返回 false，用户点不到「确定」；
 * 即便可用，它也会阻塞主线程并且无法本地化按钮文案。
 *
 * 默认焦点落在「取消」，破坏性动作需要用户主动移动焦点或点击才会发生。
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  tone = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const hintId = `${instanceId}-hint`;
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <WorkbenchDialog titleId={titleId} describedBy={description ? hintId : undefined} onCancel={onCancel}>
      <strong id={titleId}>{title}</strong>
      {description && <p className="workbench-dialog__hint" id={hintId}>{description}</p>}
      <div className="workbench-dialog__actions">
        <button ref={cancelRef} type="button" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={tone === "danger" ? "danger-button" : "primary-button"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </WorkbenchDialog>
  );
}
