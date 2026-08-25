import type { UsePosterExportResult } from "../../lib/usePosterExport";

/**
 * 经典编辑器的「确认导出工程」对话框（原 App.tsx 内联 JSX 抽出，行为不变）。
 * 开关状态由 usePosterExport 持有；未打开时不渲染任何节点。
 */
export function LegacyProjectExportDialog({ posterExport }: { posterExport: UsePosterExportResult }) {
  if (!posterExport.showProjectExportDialog) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={() => posterExport.setShowProjectExportDialog(false)}>
      <section
        className="export-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出工程确认"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>确认导出工程</h2>
            <p>工程文件会保存当前画布、名单、模板和渲染设置。</p>
          </div>
          <button type="button" aria-label="关闭导出工程确认" onClick={() => posterExport.setShowProjectExportDialog(false)}>×</button>
        </header>
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
          <button type="button" className="secondary-button" onClick={() => posterExport.setShowProjectExportDialog(false)}>取消</button>
          <button type="button" className="primary-button" aria-label="确认导出工程" onClick={posterExport.exportProjectPackage}>确认导出</button>
        </footer>
      </section>
    </div>
  );
}
