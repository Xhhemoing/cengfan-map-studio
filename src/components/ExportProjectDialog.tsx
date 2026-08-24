import { useId } from "react";
import { WorkbenchDialog } from "./workbench/WorkbenchDialog";
import {
  describeExportSize,
  describeExportSizeWarning,
  type ExportSizeEstimate,
} from "../lib/export-size-estimate";
import "./ExportProjectDialog.css";

export type ExportProjectDialogProps = {
  includeResources: boolean;
  onIncludeResourcesChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** 预估导出体积；省略时对话框不展示体积行，其余行为不变。 */
  sizeEstimate?: ExportSizeEstimate;
};

/**
 * 导出工程前的确认框，由调用方按开关条件挂载（挂载即为打开）。
 *
 * 遮罩、Esc、焦点圈闭与焦点归还都交给 `WorkbenchDialog`，这里只画内容；
 * 从 `App.tsx` 的旧编辑器分支抽出来，五阶段编辑器与旧编辑器共用同一个挂载点。
 *
 * 体积行与超限警告读的是导入侧同一个 24MB 闸门：超限的包导出后再也导不回来，
 * 用户必须在按下「确认导出」之前就看到，而不是换台设备导入时才发现。
 */
export function ExportProjectDialog({
  includeResources,
  onIncludeResourcesChange,
  onCancel,
  onConfirm,
  sizeEstimate,
}: ExportProjectDialogProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const hintId = `${instanceId}-hint`;
  const oversizeWarning = sizeEstimate ? describeExportSizeWarning(sizeEstimate, includeResources) : null;

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
      {sizeEstimate && (
        // 勾选状态一变体积就跟着变，用 polite 播报而不是每次都打断读屏。
        <p className="export-size-estimate" aria-live="polite">{describeExportSize(sizeEstimate, includeResources)}</p>
      )}
      {oversizeWarning && (
        <p className="export-size-warning" role="alert">{oversizeWarning}</p>
      )}
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
