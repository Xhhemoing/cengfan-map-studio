import { CheckCircle2, Download, ImageDown, PackageOpen, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { DataIssue } from "../../lib/data-health";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { UserFont } from "../../lib/fonts";
import { describeExportPrintHint } from "../../lib/print-size";
import { PosterCanvas } from "../canvas/PosterCanvas";

export type DeliveryIssue =
  | { kind: "data"; issue: DataIssue }
  | { kind: "layout"; issue: LayoutHealthIssue }
  | { kind: "resource"; issue: ResourceHealthIssue };

export type DeliveryExportState = "idle" | "exporting" | "success" | "error";

export interface DeliveryWorkspaceProps {
  project: ProjectDocument;
  userFonts?: UserFont[];
  posterRef?: RefObject<SVGSVGElement | null>;
  dataIssues: DataIssue[];
  layoutIssues: LayoutHealthIssue[];
  resourceIssues: ResourceHealthIssue[];
  fontIssues: ResourceHealthIssue[];
  pngScale: number;
  transparentExport: boolean;
  includeResources: boolean;
  exportState: DeliveryExportState;
  exportError?: string;
  onPngScaleChange: (scale: number) => void;
  onTransparentExportChange: (value: boolean) => void;
  onIncludeResourcesChange: (value: boolean) => void;
  onLocate: (issue: DeliveryIssue) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportProjectPackage: () => void;
  onRetry: () => void;
}

/** Props for the export stage's right rail: everything except the canvas concerns. */
export type DeliveryRailProps = Omit<DeliveryWorkspaceProps, "posterRef" | "userFonts">;

function issueKey(item: DeliveryIssue, index: number): string {
  if (item.kind === "data") return `data-${item.issue.studentId}-${item.issue.kind}-${index}`;
  if (item.kind === "layout") return `layout-${item.issue.id}-${item.issue.kind}-${index}`;
  return `resource-${item.issue.target}-${item.issue.kind}-${index}`;
}

function CheckSection({
  title,
  issues,
  onLocate,
  children,
}: {
  title: string;
  issues: DeliveryIssue[];
  onLocate: (issue: DeliveryIssue) => void;
  children?: ReactNode;
}) {
  return (
    <section className="delivery-workspace__check" aria-label={title}>
      <header>
        <div><strong>{title}</strong><small>{issues.length} 项</small></div>
        {issues.length === 0 ? <CheckCircle2 size={17} aria-label="检查通过" /> : <TriangleAlert size={17} aria-label="有待处理问题" />}
      </header>
      {issues.length > 0 && <div className="delivery-workspace__issue-list">
        {issues.map((item, index) => (
          <button key={issueKey(item, index)} type="button" onClick={() => onLocate(item)}>
            <span>{item.issue.detail}</span><small>定位</small>
          </button>
        ))}
      </div>}
      {children}
    </section>
  );
}

/**
 * The export stage's unified right rail: 交付检查 checks, 导出设置 controls,
 * the export error state and the PNG/SVG/工程包 action buttons. The shell owns
 * the labelled aside + resizer + mobile drawer chrome.
 */
export function DeliveryRail({
  project,
  dataIssues,
  layoutIssues,
  resourceIssues,
  fontIssues,
  pngScale,
  transparentExport,
  includeResources,
  exportState,
  exportError,
  onPngScaleChange,
  onTransparentExportChange,
  onIncludeResourcesChange,
  onLocate,
  onExportPng,
  onExportSvg,
  onExportProjectPackage,
  onRetry,
}: DeliveryRailProps) {
  return (
    <aside className="delivery-workspace__checks" aria-label="交付检查">
      <h2 className="delivery-workspace__checks-title">交付检查</h2>
      <CheckSection title="数据完整性" issues={dataIssues.map((issue) => ({ kind: "data", issue }))} onLocate={onLocate} />
      <CheckSection title="排版问题" issues={layoutIssues.map((issue) => ({ kind: "layout", issue }))} onLocate={onLocate} />
      <CheckSection title="资源缺失" issues={resourceIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      <CheckSection title="字体问题" issues={fontIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      {exportState === "error" && <div className="delivery-workspace__error" role="alert"><strong>导出失败</strong><span>{exportError ?? "请检查浏览器下载权限后重试"}</span><button type="button" aria-label="重试导出" onClick={onRetry}><RotateCcw size={15} aria-hidden /> 重试</button></div>}
      <section className="delivery-workspace__controls" aria-label="导出设置">
        <label htmlFor="delivery-png-scale">PNG 倍率<select id="delivery-png-scale" aria-label="PNG 导出倍率" value={pngScale} onChange={(event) => onPngScaleChange(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option></select></label>
        <span>最终像素尺寸：{project.canvas.width * pngScale} × {project.canvas.height * pngScale} px</span>
        <span data-export-print-size>{describeExportPrintHint(project.canvas.width, project.canvas.height, pngScale)}</span>
        <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="透明背景" checked={transparentExport} onChange={(event) => onTransparentExportChange(event.target.checked)} />透明背景</label>
        <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="工程包包含资源" checked={includeResources} onChange={(event) => onIncludeResourcesChange(event.target.checked)} />工程包包含资源</label>
      </section>
      <div className="delivery-workspace__actions" role="group" aria-label="导出操作">
        <button type="button" className="primary-button" onClick={onExportPng} disabled={exportState === "exporting"}><ImageDown size={16} aria-hidden />PNG</button>
        <button type="button" className="secondary-button" aria-label="导出 SVG" onClick={onExportSvg} disabled={exportState === "exporting"}><Download size={16} aria-hidden />SVG</button>
        <button type="button" className="secondary-button" aria-label="导出工程包" onClick={onExportProjectPackage} disabled={exportState === "exporting"}><PackageOpen size={16} aria-hidden />工程包</button>
      </div>
    </aside>
  );
}

/**
 * Center content of the export stage: the 最终预览 poster canvas. The
 * 交付检查/导出设置/action buttons live in the unified right rail
 * (`DeliveryRail`).
 */
export function DeliveryWorkspace({
  project,
  userFonts = [],
  posterRef,
}: DeliveryWorkspaceProps) {
  return (
    <main className="delivery-workspace" aria-label="最终导出">
      <div className="delivery-workspace__body">
        <section className="delivery-workspace__preview" aria-label="最终预览">
          <div className="delivery-workspace__preview-heading"><strong>最终预览</strong><span>{project.canvas.width} × {project.canvas.height} px</span></div>
          <div className="delivery-workspace__canvas"><PosterCanvas project={project} posterRef={posterRef} exportMode userFonts={userFonts} /></div>
        </section>
      </div>
    </main>
  );
}
