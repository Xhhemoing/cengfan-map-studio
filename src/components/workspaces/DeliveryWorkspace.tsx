import { CheckCircle2, Download, ImageDown, PackageOpen, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { DataIssue } from "../../lib/data-health";
import { posterPngExportSize } from "../../lib/export-poster";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import {
  cropMarkPathData,
  normalizePrintBleedMm,
  resolvePrintBleedGeometry,
  type PrintBleedGeometry,
} from "../../lib/print-bleed";
import type { PrintPreflightIssue, PrintPreflightResult } from "../../lib/print-preflight";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { UserFont } from "../../lib/fonts";
import { PosterCanvas } from "../canvas/PosterCanvas";

export type DeliveryIssue =
  | { kind: "data"; issue: DataIssue }
  | { kind: "layout"; issue: LayoutHealthIssue }
  | { kind: "resource"; issue: ResourceHealthIssue }
  | { kind: "print"; issue: PrintPreflightIssue };

export type DeliveryExportState = "idle" | "exporting" | "success" | "error";

export interface DeliveryWorkspaceProps {
  project: ProjectDocument;
  userFonts?: UserFont[];
  posterRef?: RefObject<SVGSVGElement | null>;
  dataIssues: DataIssue[];
  layoutIssues: LayoutHealthIssue[];
  /** 印刷检查清单（如 object-in-bleed 出血风险）；旧调用方可省略，默认视为无问题。 */
  printIssues?: LayoutHealthIssue[];
  /** 印前体检（分辨率 / 透明出血 / 导出倍率）；旧调用方可省略。 */
  printPreflight?: PrintPreflightResult;
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
  if (item.kind === "print") return `print-${item.issue.kind}-${item.issue.target}-${index}`;
  return `resource-${item.issue.target}-${item.issue.kind}-${index}`;
}

function issueSeverityLabel(item: DeliveryIssue): string {
  if (item.issue.severity === "error") return "错误";
  if (item.issue.severity === "warning") return "警告";
  return "提示";
}

/** target 为 "export" 的印前问题（如 export-resolution）指向导出参数本身，画布上没有可跳转的对象。 */
function issueLocatable(item: DeliveryIssue): boolean {
  return !(item.kind === "print" && item.issue.target === "export");
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
  const passed = issues.length === 0;
  return (
    <section className="delivery-workspace__check" aria-label={title}>
      <header>
        <div><strong>{title}</strong><small>{issues.length} 项</small></div>
        {/* Status is announced as text; the icon is decorative so the state never relies on color alone. */}
        {passed ? <CheckCircle2 size={17} aria-hidden /> : <TriangleAlert size={17} aria-hidden />}
        <span className="sr-only">{passed ? "检查通过" : "有待处理问题"}</span>
      </header>
      {issues.length > 0 && (
        <ul className="delivery-workspace__issue-list" style={{ listStyle: "none", padding: 0, marginBottom: 0 }} aria-label={`${title}问题列表`}>
          {issues.map((item, index) => {
            const locatable = issueLocatable(item);
            return (
              <li key={issueKey(item, index)} style={{ display: "grid" }}>
                {/* 不可定位的问题保留按钮语义并标记 aria-disabled，动作文字改成指路提示，而非无解释地 disabled。 */}
                <button
                  type="button"
                  aria-label={locatable
                    ? `定位${issueSeverityLabel(item)}：${item.issue.detail}`
                    : `${issueSeverityLabel(item)}：${item.issue.detail}，见导出设置`}
                  aria-disabled={locatable ? undefined : true}
                  onClick={() => { if (locatable) onLocate(item); }}
                >
                  <span>{item.issue.detail}</span><small aria-hidden="true">{locatable ? "定位" : "见导出设置"}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
  printIssues = [],
  printPreflight,
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
  const bleedMm = normalizePrintBleedMm(project.canvas.printBleedMm);
  // trim = 成品裁切框（画布 × 倍率）；media = 实际导出的媒体框（出血 + 裁切标记）。
  const trimSize = posterPngExportSize(project.canvas, { scale: pngScale });
  const mediaSize = posterPngExportSize(project.canvas, { scale: pngScale, printBleedMm: bleedMm });
  const printDeliveryIssues: DeliveryIssue[] = [
    ...printIssues.map((issue) => ({ kind: "layout" as const, issue })),
    ...(printPreflight?.issues ?? [])
      .filter((issue) => issue.kind !== "missing-font")
      .map((issue) => ({ kind: "print" as const, issue })),
  ];
  return (
    <aside className="delivery-workspace__checks" aria-label="交付检查">
      <h2 className="delivery-workspace__checks-title">交付检查</h2>
      <CheckSection title="数据完整性" issues={dataIssues.map((issue) => ({ kind: "data", issue }))} onLocate={onLocate} />
      <CheckSection title="排版问题" issues={layoutIssues.map((issue) => ({ kind: "layout", issue }))} onLocate={onLocate} />
      <CheckSection title="资源缺失" issues={resourceIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      <CheckSection title="字体问题" issues={fontIssues.map((issue) => ({ kind: "resource", issue }))} onLocate={onLocate} />
      <CheckSection title="印刷检查" issues={printDeliveryIssues} onLocate={onLocate}>
        {/* 出血状态用文字说明，与 sr-only 的通过/待处理文案一致地不依赖颜色。 */}
        <p className="delivery-workspace__print-note" style={{ margin: "10px 0 0" }}>
          <small>
            {bleedMm > 0
              ? `已设置 ${bleedMm}mm 印刷出血，导出将扩出出血区并绘制裁切标记；请确认重要内容留在安全边距内。`
              : "未设置印刷出血：屏幕分享或自行打印可直接导出；送印请先在画布属性填写出血。"}
          </small>
        </p>
        {printPreflight && printPreflight.unmeasured.length > 0 && (
          <p className="delivery-workspace__print-note" style={{ margin: "6px 0 0" }}>
            <small>
              有 {printPreflight.unmeasured.length} 处位图无法读取原图像素尺寸（远程链接或未知格式），送印请人工确认分辨率。
            </small>
          </p>
        )}
      </CheckSection>
      {exportState === "error" && (
        <div id="delivery-export-error" className="delivery-workspace__error" role="alert">
          <strong>导出失败</strong>
          <span>{exportError ?? "请检查浏览器下载权限后重试"}</span>
          <button type="button" aria-label="重试导出" aria-describedby="delivery-export-error" onClick={onRetry}>
            <RotateCcw size={15} aria-hidden /> 重试
          </button>
        </div>
      )}
      <section className="delivery-workspace__controls" aria-label="导出设置">
        {/* 可见文字与 aria-label 保持一字不差（WCAG 2.5.3 Label in Name）；aria-label 被 App 级测试钉住，故统一为「PNG 导出倍率」。 */}
        <label htmlFor="delivery-png-scale">PNG 导出倍率<select id="delivery-png-scale" aria-label="PNG 导出倍率" value={pngScale} onChange={(event) => onPngScaleChange(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option></select></label>
        {bleedMm > 0 ? (
          <>
            {/* 出血 > 0 时导出的是媒体框（出血 + 裁切标记），只报一个尺寸会低估实际文件，成品与导出尺寸都要给。 */}
            <span>成品尺寸（裁切后）：{trimSize.width} × {trimSize.height} px</span>
            <span>导出尺寸（含 {bleedMm}mm 出血与裁切标记）：{mediaSize.width} × {mediaSize.height} px</span>
          </>
        ) : (
          <span>最终像素尺寸：{trimSize.width} × {trimSize.height} px</span>
        )}
        <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="透明背景" checked={transparentExport} onChange={(event) => onTransparentExportChange(event.target.checked)} />透明背景</label>
        <label className="boolean-control checkbox-row"><input type="checkbox" aria-label="工程包包含资源" checked={includeResources} onChange={(event) => onIncludeResourcesChange(event.target.checked)} />工程包包含资源</label>
      </section>
      <div
        className="delivery-workspace__actions"
        role="group"
        aria-label="导出操作"
        aria-describedby={exportState === "error" ? "delivery-export-error" : undefined}
      >
        <button type="button" className="primary-button" aria-label="导出 PNG" onClick={onExportPng} disabled={exportState === "exporting"}><ImageDown size={16} aria-hidden />PNG</button>
        <button type="button" className="secondary-button" aria-label="导出 SVG" onClick={onExportSvg} disabled={exportState === "exporting"}><Download size={16} aria-hidden />SVG</button>
        <button type="button" className="secondary-button" aria-label="导出工程包" onClick={onExportProjectPackage} disabled={exportState === "exporting"}><PackageOpen size={16} aria-hidden />工程包</button>
      </div>
      {/* The buttons only disable while exporting; announce progress and completion for screen readers. */}
      <span className="sr-only" role="status" aria-live="polite" data-export-status>
        {exportState === "exporting" ? "正在导出，请稍候" : exportState === "success" ? "导出完成" : ""}
      </span>
    </aside>
  );
}

/**
 * 出血示意舞台：按导出用的真实几何（`resolvePrintBleedGeometry` /
 * `cropMarkPathData`）在成品画布四周画出出血环与裁切标记。导出时才由
 * `applyPrintBleedToSvg` 在 SVG 副本上真正扩框，这里只叠加示意层：
 * 叠加 SVG 纯装饰（aria-hidden、指针穿透），成品画布保持 trim viewBox。
 */
function BleedPreviewStage({ geometry, children }: { geometry: PrintBleedGeometry; children: ReactNode }) {
  const { trim, bleed, media } = geometry;
  const padPx = geometry.bleedPx + geometry.cropMarkLengthPx;
  // evenodd 挖洞：外圈铺到出血框、内圈挖掉成品框，色带只盖出血区，不压画面。
  const bleedRingPath =
    `M ${bleed.x} ${bleed.y} h ${bleed.width} v ${bleed.height} h ${-bleed.width} Z ` +
    `M ${trim.x} ${trim.y} h ${trim.width} v ${trim.height} h ${-trim.width} Z`;
  return (
    <div className="delivery-workspace__bleed-stage" data-print-bleed-stage>
      {/* 舞台全部布局规则集中在这份注入样式里（jsdom 的 CSSOM 解析不了 min()，内联会被静默丢弃）：
          1) 舞台宽度以媒体框为上限、可缩到 0；
          2) 移动端样式会把 .poster 固定为 760px，必须让画布精确填满成品占位框，否则示意层错位；
          3) 叠加 SVG 的固有宽度（媒体框）会把画布网格的 auto 轨道撑到媒体宽，min(100%, …) 便永远
             收不小、窄屏只能横向滚动甚至被 overflow: hidden 裁掉；把轨道钉成 minmax(0, 1fr) 后
             舞台整体缩小，成品与裁切标记始终完整可见。 */}
      <style>{
        `.delivery-workspace__bleed-stage { position: relative; width: min(100%, ${media.width}px); min-width: 0; }` +
        ".delivery-workspace__bleed-stage .poster { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; }" +
        ".delivery-workspace__canvas:has(> .delivery-workspace__bleed-stage) { grid-template-columns: minmax(0, 1fr); }"
      }</style>
      {/* 成品画布占位：媒体框内按 trim/media 比例定位，先于叠加层渲染，preview 里第一个 svg 仍是海报本身。 */}
      <div
        style={{
          position: "absolute",
          left: `${(padPx / media.width) * 100}%`,
          top: `${(padPx / media.height) * 100}%`,
          width: `${(trim.width / media.width) * 100}%`,
          height: `${(trim.height / media.height) * 100}%`,
        }}
      >
        {children}
      </div>
      {/* 在流内撑起舞台尺寸（媒体框纵横比），同时晚于画布绘制，裁切线可压在画面边缘上。 */}
      <svg
        data-print-bleed-overlay
        aria-hidden="true"
        focusable="false"
        viewBox={`${media.x} ${media.y} ${media.width} ${media.height}`}
        width={media.width}
        height={media.height}
        style={{ position: "relative", display: "block", width: "100%", height: "auto", pointerEvents: "none" }}
      >
        <path d={bleedRingPath} fill="rgba(215, 141, 72, 0.24)" fillRule="evenodd" />
        <rect x={bleed.x} y={bleed.y} width={bleed.width} height={bleed.height} fill="none" stroke="rgba(163, 99, 40, 0.55)" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <rect x={trim.x} y={trim.y} width={trim.width} height={trim.height} fill="none" stroke="#2e5d66" strokeWidth={1} strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
        <path data-print-crop-marks-preview d={cropMarkPathData(geometry)} fill="none" stroke={geometry.cropMarkColor} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
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
  const bleedMm = normalizePrintBleedMm(project.canvas.printBleedMm);
  const geometry = bleedMm > 0
    ? resolvePrintBleedGeometry(
        { x: 0, y: 0, width: project.canvas.width, height: project.canvas.height },
        { printBleedMm: bleedMm },
      )
    : null;
  const poster = <PosterCanvas project={project} posterRef={posterRef} exportMode userFonts={userFonts} />;
  return (
    <main className="delivery-workspace" aria-label="最终导出">
      <div className="delivery-workspace__body">
        <section className="delivery-workspace__preview" aria-label="最终预览">
          <div className="delivery-workspace__preview-heading">
            <strong>最终预览</strong>
            <span>{bleedMm > 0 ? `成品尺寸 ${project.canvas.width} × ${project.canvas.height} px` : `${project.canvas.width} × ${project.canvas.height} px`}</span>
          </div>
          {geometry && (
            /* 预览画布始终按成品（trim）显示，出血只在导出时向外扩；不加说明会让「导出比预览大」像 bug。 */
            <p className="delivery-workspace__preview-note" style={{ margin: "-6px 0 10px", color: "var(--editor-ink-muted, #536970)" }}>
              <small>预览四周的浅色环与角上短线为出血区、裁切标记示意；导出将向外扩出 {bleedMm}mm 出血并绘制裁切标记，实际导出尺寸更大，精确像素见右侧「导出设置」。</small>
            </p>
          )}
          <div className="delivery-workspace__canvas">
            {geometry ? <BleedPreviewStage geometry={geometry}>{poster}</BleedPreviewStage> : poster}
          </div>
        </section>
      </div>
    </main>
  );
}
