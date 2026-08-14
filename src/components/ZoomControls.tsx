import { ZoomIn, ZoomOut } from "lucide-react";
import { ToolbarButton } from "./StudioUi";

export type ZoomControlsProps = {
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset?: () => void;
  min?: number;
  max?: number;
  step?: number;
};

export function ZoomControls({
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onReset,
  min = 25,
  max = 300,
  step = 10,
}: ZoomControlsProps) {
  const handleZoomOut = () => {
    const next = Math.max(min, zoomPercent - step);
    if (next !== zoomPercent) onZoomOut();
  };

  const handleZoomIn = () => {
    const next = Math.min(max, zoomPercent + step);
    if (next !== zoomPercent) onZoomIn();
  };

  return (
    <div className="topbar-action-group" aria-label="缩放控制">
      <span className="zoom-label" aria-label="当前缩放">
        {zoomPercent}%
      </span>
      <ToolbarButton
        label="缩小"
        icon={<ZoomOut size={17} aria-hidden />}
        onClick={handleZoomOut}
        disabled={zoomPercent <= min}
      />
      <ToolbarButton
        label="放大"
        icon={<ZoomIn size={17} aria-hidden />}
        onClick={handleZoomIn}
        disabled={zoomPercent >= max}
      />
      {onReset && (
        <ToolbarButton
          label="重置缩放"
          icon={<span aria-hidden>1:1</span>}
          onClick={onReset}
        />
      )}
    </div>
  );
}
