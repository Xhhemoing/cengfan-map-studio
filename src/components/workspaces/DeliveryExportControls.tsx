import { describeExportPrintHint } from "../../lib/print-size";
import type { DeliveryRailProps } from "./DeliveryWorkspace";

type DeliveryExportControlsProps = Pick<DeliveryRailProps, "project" | "pngScale" | "transparentExport" | "includeResources" | "onPngScaleChange" | "onTransparentExportChange" | "onIncludeResourcesChange"> & { formatHelpId: string };

export function DeliveryExportControls({ project, pngScale, transparentExport, includeResources, onPngScaleChange, onTransparentExportChange, onIncludeResourcesChange, formatHelpId }: DeliveryExportControlsProps) {
  const scaleId = `${formatHelpId}-scale`;
  return <>
    <section className="delivery-workspace__controls" aria-label="导出设置">
      <h3>导出设置</h3>
      <label htmlFor={scaleId}>PNG 倍率<select id={scaleId} aria-label="PNG 导出倍率" value={pngScale} onChange={(event) => onPngScaleChange(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option></select></label>
      <span>最终像素尺寸：{project.canvas.width * pngScale} × {project.canvas.height * pngScale} px</span>
      <span data-export-print-size>{describeExportPrintHint(project.canvas.width, project.canvas.height, pngScale)}</span>
      <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="透明背景" checked={transparentExport} onChange={(event) => onTransparentExportChange(event.target.checked)} />透明背景</label>
      <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="工程包包含资源" checked={includeResources} onChange={(event) => onIncludeResourcesChange(event.target.checked)} />工程包包含资源</label>
    </section>
    <details className="delivery-workspace__format-help" aria-label="导出格式说明">
      <summary>选择合适的导出格式</summary>
      <dl>
        <div><dt>PNG</dt><dd id={`${formatHelpId}-png`}>用于图片分享和打印，清晰度由倍率与最终像素尺寸决定。</dd></div>
        <div><dt>SVG</dt><dd id={`${formatHelpId}-svg`}>用于放大与设计软件处理；图片素材仍有分辨率限制。</dd></div>
        <div><dt>工程包</dt><dd id={`${formatHelpId}-project`}>用于备份与继续编辑，保存完整名单、模板和设置。</dd></div>
      </dl>
    </details>
  </>;
}
