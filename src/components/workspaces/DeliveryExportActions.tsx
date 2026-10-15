import { CheckCircle2, Download, ImageDown, Info, PackageOpen, RotateCcw } from "lucide-react";
import type { DeliveryRailProps } from "./DeliveryWorkspace";

type DeliveryExportActionsProps = Pick<DeliveryRailProps, "exportState" | "exportError" | "lastExportFileName" | "exportIsStale" | "onExportPng" | "onExportSvg" | "onExportProjectPackage" | "onRetry"> & { formatHelpId: string };

export function DeliveryExportActions({ exportState, exportError, lastExportFileName, exportIsStale = false, onExportPng, onExportSvg, onExportProjectPackage, onRetry, formatHelpId }: DeliveryExportActionsProps) {
  return <section className="delivery-workspace__export" aria-label="文件导出">
    <h3>文件导出</h3>
    <div className="delivery-workspace__actions" role="group" aria-label="导出操作" aria-busy={exportState === "exporting"}>
      <button type="button" className="primary-button" aria-describedby={`${formatHelpId}-png`} title="PNG · 图片分享与打印" onClick={onExportPng} disabled={exportState === "exporting"}><ImageDown size={16} aria-hidden />PNG</button>
      <button type="button" className="secondary-button" aria-label="导出 SVG" aria-describedby={`${formatHelpId}-svg`} title="SVG · 放大与设计软件处理" onClick={onExportSvg} disabled={exportState === "exporting"}><Download size={16} aria-hidden />SVG</button>
      <button type="button" className="secondary-button" aria-label="导出工程包" aria-describedby={`${formatHelpId}-project`} title="工程包 · 备份与继续编辑" onClick={onExportProjectPackage} disabled={exportState === "exporting"}><PackageOpen size={16} aria-hidden />工程包</button>
    </div>
    {exportState === "success" && <div className="delivery-workspace__result" role="status" data-export-stale={exportIsStale}>
      {exportIsStale ? <Info size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
      <span className="delivery-workspace__result-copy">
        {exportIsStale && <strong>当前版本有修改，请重新导出</strong>}
        <span>{lastExportFileName ? `${exportIsStale ? "上次已导出" : "已导出"} ${lastExportFileName}` : "已导出，请到浏览器下载目录查看"}</span>
      </span>
      <button type="button" aria-label="再次导出" onClick={onRetry}><RotateCcw size={15} aria-hidden /> {exportIsStale ? "重新导出" : "再次导出"}</button>
    </div>}
    {exportState === "success" && <p>文件已交给浏览器下载，请检查下载列表；应用不能确认是否已写入磁盘。</p>}
    {exportState === "exporting" && <p role="status">正在导出点击时的预览快照，后续编辑不会写入此文件。</p>}
    {exportState === "error" && <div className="delivery-workspace__error" role="alert"><strong>导出失败</strong><span>{exportError ?? "请检查浏览器下载权限后重试"}</span><button type="button" aria-label="重试导出" onClick={onRetry}><RotateCcw size={15} aria-hidden /> 重试</button></div>}
  </section>;
}
