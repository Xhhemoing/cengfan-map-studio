import { useId, useState, type CSSProperties, type RefObject } from "react";
import type { DataIssue } from "../../lib/data-health";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { UserFont } from "../../lib/fonts";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { DeliveryChecks } from "./DeliveryChecks";
import { DeliveryExportActions } from "./DeliveryExportActions";
import { DeliveryExportControls } from "./DeliveryExportControls";
import { SourceProjectNotice } from "../SourceProjectNotice";
import "./delivery-preview.css";

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
  /** File name of the most recent successful export, when the pipeline knows it. */
  lastExportFileName?: string;
  /** Whether the current project differs from the last successful export snapshot. */
  exportIsStale?: boolean;
  onEditRoster?: () => void;
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

/**
 * The export stage's unified right rail: 交付检查 checks, 导出设置 controls,
 * the export error state and the PNG/SVG/工程包 action buttons. The shell owns
 * the labelled aside + resizer + mobile drawer chrome.
 */
export function DeliveryRail(props: DeliveryRailProps) {
  const formatHelpId = useId();
  const hiddenCount = props.project.students.filter((student) => student.visibility === false).length;
  return (
    <aside className="delivery-workspace__checks" aria-label="交付检查">
      <h2 className="delivery-workspace__checks-title">交付检查</h2>
      <DeliveryChecks {...props} />
      <SourceProjectNotice total={props.project.students.length} hidden={hiddenCount} />
      <DeliveryExportActions {...props} formatHelpId={formatHelpId} />
      <DeliveryExportControls {...props} formatHelpId={formatHelpId} />
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
  const [previewMode, setPreviewMode] = useState<"fit" | "actual">("fit");
  const previewHintId = useId();
  return (
    <main className="delivery-workspace" aria-label="交付">
      <div className="delivery-workspace__body">
        <section className="delivery-workspace__preview" aria-label="最终预览">
          <div className="delivery-workspace__preview-heading"><strong>最终预览</strong><span>{project.canvas.width} × {project.canvas.height} px</span></div>
          <div className="delivery-workspace__preview-tools" role="group" aria-label="预览缩放">
            <button type="button" className="secondary-button" aria-pressed={previewMode === "fit"} onClick={() => setPreviewMode("fit")}>完整预览</button>
            <button type="button" className="secondary-button" aria-pressed={previewMode === "actual"} onClick={() => setPreviewMode("actual")}>原始尺寸</button>
          </div>
          <p className="delivery-workspace__preview-hint" id={previewHintId}>{previewMode === "fit" ? "完整查看海报；切换原始尺寸可检查细节。" : "按画布原始尺寸查看，可滚动检查细节；导出尺寸不变。"}</p>
          <div
            className="delivery-workspace__canvas"
            data-preview-mode={previewMode}
            role="region"
            aria-label={previewMode === "actual" ? "原始尺寸海报" : "完整海报预览"}
            aria-describedby={previewHintId}
            tabIndex={previewMode === "actual" ? 0 : undefined}
            style={{ "--delivery-poster-width": `${project.canvas.width}px`, "--delivery-poster-height": `${project.canvas.height}px` } as CSSProperties}
          ><PosterCanvas project={project} posterRef={posterRef} exportMode userFonts={userFonts} /></div>
        </section>
      </div>
    </main>
  );
}
