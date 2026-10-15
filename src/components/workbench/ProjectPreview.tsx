import { FileImage, LayoutTemplate } from "lucide-react";
import type { ProjectPreviewMetadata } from "../../lib/project-store";
import type { DataViewId } from "../../lib/project-data";
import "./project-preview.css";

const DATA_VIEW_LABELS: Record<DataViewId, string> = {
  province: "省份分组", city: "城市分组", university: "院校分组", pins: "图钉地图", heat: "热力地图",
};

/** Shows saved canvas facts without loading the project or claiming to show its artwork. */
export function ProjectPreview({ preview, id }: { preview?: ProjectPreviewMetadata; id?: string }) {
  if (!preview) {
    return (
      <span id={id} className="project-preview project-preview--unavailable">
        <span className="project-preview__placeholder" aria-hidden="true"><FileImage size={27} /></span>
        <span className="project-preview__facts"><span className="project-preview__eyebrow">项目工程</span><span>打开查看画布</span></span>
      </span>
    );
  }
  const { canvasWidth, canvasHeight, dataView } = preview;
  const ratio = canvasWidth / canvasHeight;
  const orientation = canvasWidth === canvasHeight ? "方形画布" : canvasWidth > canvasHeight ? "横向画布" : "纵向画布";
  // Fit a single CSS paper outline into a fixed box; no SVG map, images or canvas work.
  const paperWidth = Math.min(88, 70 * ratio);

  return (
    <span id={id} className="project-preview">
      <span className="project-preview__frame" aria-hidden="true">
        <span className="project-preview__paper" style={{ width: paperWidth, aspectRatio: `${canvasWidth} / ${canvasHeight}` }}><LayoutTemplate size={20} /></span>
      </span>
      <span className="project-preview__facts">
        <span className="project-preview__eyebrow">画布概览</span>
        <span className="project-preview__view">{DATA_VIEW_LABELS[dataView]}</span>
        <span className="project-preview__size">{canvasWidth} × {canvasHeight} px</span>
        <span className="project-preview__orientation">{orientation}</span>
      </span>
    </span>
  );
}
