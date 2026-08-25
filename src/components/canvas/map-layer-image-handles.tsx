import type { MapImageAlignment } from "../../lib/map-alignment";
import { ResizeHandles } from "./ResizeHandles";

export function MapImageResizeHandles({
  alignment,
  renderIntervalMs,
  onCommit,
}: {
  alignment: MapImageAlignment;
  renderIntervalMs: number;
  onCommit: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
}) {
  return (
    <ResizeHandles
      renderIntervalMs={renderIntervalMs}
      rect={{ x: alignment.x, y: alignment.y, width: alignment.width, height: alignment.height, rotation: alignment.rotation }}
      onChange={() => { /* live preview handled by ResizeHandles internal state */ }}
      onCommit={(next) => onCommit({ x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation })}
      color="#d05a45"
    />
  );
}
