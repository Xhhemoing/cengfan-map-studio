import { useEffect, useId, useRef } from "react";
import { WorkbenchDialog } from "./WorkbenchDialog";

export type DeleteProjectDialogProps = {
  projectName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 删除项目确认框：默认焦点落在「取消」，正文明示删除不可恢复。 */
export function DeleteProjectDialog({ projectName, onCancel, onConfirm }: DeleteProjectDialogProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const hintId = `${instanceId}-hint`;
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <WorkbenchDialog titleId={titleId} describedBy={hintId} onCancel={onCancel}>
      <strong id={titleId}>删除项目「{projectName}」？</strong>
      <p className="workbench-dialog__hint" id={hintId}>
        删除后不可恢复：项目内的学生名单、地图与版式设置会一并从本机移除，回收站里也找不回来。需要留档请先「导出工程包」。
      </p>
      <div className="workbench-dialog__actions">
        <button ref={cancelRef} type="button" onClick={onCancel}>取消</button>
        <button type="button" className="danger-button" onClick={onConfirm}>删除</button>
      </div>
    </WorkbenchDialog>
  );
}
