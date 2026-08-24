import { useId } from "react";
import { WorkbenchDialog } from "./workbench/WorkbenchDialog";
import "./ExportProjectDialog.css";

export type ExportProjectDialogProps = {
  includeResources: boolean;
  onIncludeResourcesChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 导出工程前的确认框，由调用方按开关条件挂载（挂载即为打开）。
 *
 * 遮罩、Esc、焦点圈闭与焦点归还都交给 `WorkbenchDialog`，这里只画内容；
 * 从 `App.tsx` 的旧编辑器分支抽出来，五阶段编辑器与旧编辑器共用同一个挂载点。
 */
export function ExportProjectDialog({ includeResources, onIncludeResourcesChange, onCancel, onConfirm }: ExportProjectDialogProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const hintId = `${instanceId}-hint`;

  return (
    <WorkbenchDialog
      titleId={titleId}
      describedBy={hintId}
      className="export-project-dialog"
      onCancel={onCancel}
      onSubmit={onConfirm}
    >
      <strong id={titleId}>确认导出工程</strong>
      <p className="workbench-dialog__hint" id={hintId}>工程文件会保存当前画布、名单、模板和渲染设置。</p>
      <label className="export-resource-option boolean-control checkbox-row">
        <input
          type="checkbox"
          aria-label="导出时包含资源包"
          checked={includeResources}
          onChange={(event) => onIncludeResourcesChange(event.target.checked)}
        />
        <span>
          <strong>包含资源包</strong>
          <small>一并打包地图背景、地图贴图、素材和字体；导入后会立刻同步到画布与素材库。</small>
        </span>
      </label>
      {!includeResources && (
        <p className="export-resource-warning">未包含资源包时，其他设备可能缺少素材库条目和自定义字体。</p>
      )}
      <div className="workbench-dialog__actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-button" aria-label="确认导出工程">确认导出</button>
      </div>
    </WorkbenchDialog>
  );
}
