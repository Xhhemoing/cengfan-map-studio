import { useCallback, useId, useRef } from "react";
import { SourceProjectNotice } from "../SourceProjectNotice";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import { useModalFocus } from "../../lib/use-modal-focus";
import "./export-project-dialog.css";

export interface ExportProjectDialogProps {
  posterExport: UsePosterExportResult;
}

/**
 * 导出工程确认弹层:背景遮罩 + 资源包开关 + 取消/确认。
 * 开关与可见性状态仍由 App 持有的 `posterExport` 接缝提供,这里只负责渲染;
 * 初始聚焦标题，让键盘与读屏用户先了解工程内容和分享提醒；关闭后返回导出入口。
 * 确认按钮在导出在途时置灰:两次导出互相打断会毁掉正在写的那一份文件,
 * 顶栏与侧栏的导出入口已经这么做了,这里是同一道闸的最后一段。
 */
export function ExportProjectDialog({ posterExport }: ExportProjectDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { setShowProjectExportDialog } = posterExport;
  const closeDialog = useCallback(() => setShowProjectExportDialog(false), [setShowProjectExportDialog]);
  useModalFocus(posterExport.showProjectExportDialog, dialogRef, closeDialog, titleRef);

  if (!posterExport.showProjectExportDialog) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={closeDialog}>
      <section
        ref={dialogRef}
        className="export-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出工程确认"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 ref={titleRef} id={titleId} tabIndex={-1}>确认导出工程</h2>
            <p id={descriptionId}>工程文件会保存当前画布、名单、模板和渲染设置。</p>
          </div>
          <button type="button" aria-label="关闭导出工程确认" title="关闭导出工程确认" onClick={closeDialog}>×</button>
        </header>
        <SourceProjectNotice />
        <label className="export-resource-option boolean-control checkbox-row">
          <input
            type="checkbox"
            aria-label="导出时包含资源包"
            checked={posterExport.includeResourcesInProjectExport}
            onChange={(event) => posterExport.setIncludeResourcesInProjectExport(event.target.checked)}
          />
          <span>
            <strong>包含资源包</strong>
            <small>一并打包地图背景、地图贴图、素材和字体；导入后会立刻同步到画布与素材库。</small>
          </span>
        </label>
        {!posterExport.includeResourcesInProjectExport && (
          <p className="export-resource-warning">未包含资源包时，其他设备可能缺少素材库条目和自定义字体。</p>
        )}
        <footer>
          <button type="button" className="secondary-button" onClick={closeDialog}>取消</button>
          <button type="button" className="primary-button" aria-label="确认导出工程" onClick={posterExport.exportProjectPackage} disabled={posterExport.exportState === "exporting"}>确认导出</button>
        </footer>
      </section>
    </div>
  );
}
