import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { ResizeHandle } from "../../lib/resize";
import { resizeBox, svgLocalPoint } from "../../lib/resize";

export interface ResizeHandleRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface ResizeHandlesProps {
  rect: ResizeHandleRect;
  onChange: (next: ResizeHandleRect) => void;
  onCommit: (next: ResizeHandleRect) => void;
  renderIntervalMs?: number;
  color?: string;
  /** When false, only corner handles render (no edge midpoints). */
  edges?: boolean;
}

const HANDLES: { id: ResizeHandle; cx: number; cy: number; cursor: string }[] = [
  { id: "nw", cx: 0, cy: 0, cursor: "nwse-resize" },
  { id: "n", cx: 0.5, cy: 0, cursor: "ns-resize" },
  { id: "ne", cx: 1, cy: 0, cursor: "nesw-resize" },
  { id: "e", cx: 1, cy: 0.5, cursor: "ew-resize" },
  { id: "se", cx: 1, cy: 1, cursor: "nwse-resize" },
  { id: "s", cx: 0.5, cy: 1, cursor: "ns-resize" },
  { id: "sw", cx: 0, cy: 1, cursor: "nesw-resize" },
  { id: "w", cx: 0, cy: 0.5, cursor: "ew-resize" },
];

const CORNER_IDS = new Set<ResizeHandle>(["nw", "ne", "se", "sw"]);

export function ResizeHandles({
  rect,
  onChange,
  onCommit,
  renderIntervalMs = 0,
  color = "#3b82f6",
  edges = true,
}: ResizeHandlesProps) {
  const dragRef = useRef<{ handle: ResizeHandle; start: ResizeHandleRect } | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<ResizeHandleRect | null>(null);
  const [preview, setPreview] = useState<ResizeHandleRect | null>(null);
  const shown = preview ?? rect;

  const clearScheduledPreview = () => {
    if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = null;
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    pendingPreviewRef.current = null;
  };

  const schedulePreview = (next: ResizeHandleRect) => {
    if (renderIntervalMs <= 0) {
      pendingPreviewRef.current = next;
      if (previewFrameRef.current !== null) return;
      previewFrameRef.current = window.requestAnimationFrame(() => {
        previewFrameRef.current = null;
        const pending = pendingPreviewRef.current;
        pendingPreviewRef.current = null;
        if (!pending) return;
        setPreview(pending);
        onChange(pending);
      });
      return;
    }
    pendingPreviewRef.current = next;
    if (previewTimerRef.current !== null) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      const pending = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (!pending) return;
      setPreview(pending);
      onChange(pending);
    }, renderIntervalMs);
  };

  useEffect(() => () => clearScheduledPreview(), []);

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const transform = `translate(${cx} ${cy}) rotate(${rect.rotation}) translate(${-rect.width / 2} ${-rect.height / 2})`;

  const startDrag = (handle: ResizeHandle) => (event: PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    clearScheduledPreview();
    setPreview(null);
    dragRef.current = { handle, start: rect };
  };

  const moveDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const world = svgLocalPoint(svg, event.clientX, event.clientY);
    if (!world) return;
    const next = resizeBox(drag.start, drag.start.rotation, drag.handle, world);
    const withRotation = { ...next, rotation: drag.start.rotation };
    schedulePreview(withRotation);
  };

  const endDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = event.currentTarget.ownerSVGElement;
    let final: ResizeHandleRect = drag.start;
    if (svg) {
      const world = svgLocalPoint(svg, event.clientX, event.clientY);
      if (world) final = { ...resizeBox(drag.start, drag.start.rotation, drag.handle, world), rotation: drag.start.rotation };
    }
    dragRef.current = null;
    clearScheduledPreview();
    setPreview(null);
    // A plain click on a handle (no size change) must not create a history entry.
    const changed = final.x !== drag.start.x || final.y !== drag.start.y
      || final.width !== drag.start.width || final.height !== drag.start.height;
    if (changed) onCommit(final);
  };

  const cancelDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    clearScheduledPreview();
    setPreview(null);
  };

  const handleSize = 9;
  const half = handleSize / 2;

  return (
    <g
      data-resize-handles
      transform={transform}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelDrag}
    >
      <rect
        data-resize-outline
        x={0}
        y={0}
        width={shown.width}
        height={shown.height}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
      {HANDLES.filter((h) => edges || CORNER_IDS.has(h.id)).map((h) => {
        const hx = h.cx * shown.width;
        const hy = h.cy * shown.height;
        return (
          <rect
            key={h.id}
            data-resize-handle={h.id}
            x={hx - half}
            y={hy - half}
            width={handleSize}
            height={handleSize}
            rx={1.5}
            fill="#fff"
            stroke={color}
            strokeWidth={1.5}
            style={{ cursor: h.cursor }}
            onPointerDown={startDrag(h.id)}
          />
        );
      })}
    </g>
  );
}
