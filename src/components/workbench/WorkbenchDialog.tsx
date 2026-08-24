import type { KeyboardEvent, ReactNode } from "react";
import "./WorkbenchDialog.css";

export type WorkbenchDialogProps = {
  titleId: string;
  describedBy?: string;
  onCancel: () => void;
  /** 传入即把面板渲染成表单，回车与提交按钮都走这里。 */
  onSubmit?: () => void;
  children: ReactNode;
};

/**
 * 工作台对话框外壳，与 `SaveTemplateDialog` 同一套交互：遮罩点击取消、
 * Esc 取消、面板承载具体内容。取代 `window.prompt` / `window.confirm`，
 * 后者在沙箱化的 iframe 里会被直接抑制并返回 null。
 */
export function WorkbenchDialog({ titleId, describedBy, onCancel, onSubmit, children }: WorkbenchDialogProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    // 阻止冒泡，避免工作台的文档级 Esc 兜底监听重复处理这次按键。
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <div className="workbench-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy}>
      <div className="workbench-dialog__backdrop" onClick={onCancel} />
      {onSubmit ? (
        <form
          className="workbench-dialog__panel"
          onKeyDown={handleKeyDown}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      ) : (
        <div className="workbench-dialog__panel" onKeyDown={handleKeyDown}>
          {children}
        </div>
      )}
    </div>
  );
}
