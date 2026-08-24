import { useEffect, useId, useRef, useState } from "react";
import { WorkbenchDialog } from "./WorkbenchDialog";

export type RenameProjectDialogProps = {
  currentName: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
};

/** 重命名项目对话框：预填原名并全选，空名不可提交。 */
export function RenameProjectDialog({ currentName, onCancel, onSubmit }: RenameProjectDialogProps) {
  const [name, setName] = useState(currentName);
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const trimmed = name.trim();

  return (
    <WorkbenchDialog
      titleId={titleId}
      onCancel={onCancel}
      onSubmit={() => {
        if (!trimmed) return;
        onSubmit(trimmed);
      }}
    >
      <strong id={titleId}>重命名项目</strong>
      <label className="workbench-dialog__field">
        <span>项目名称</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          aria-label="项目名称"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="workbench-dialog__actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-button" disabled={!trimmed}>保存</button>
      </div>
    </WorkbenchDialog>
  );
}
