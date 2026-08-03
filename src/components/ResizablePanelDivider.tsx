import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PanelSide } from "../lib/editor-layout";

type ResizablePanelDividerProps = {
  side: PanelSide;
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startValue: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function ResizablePanelDivider({
  side,
  value,
  min,
  max,
  ariaLabel,
  onChange,
  onResizeStart,
  onResizeEnd,
}: ResizablePanelDividerProps) {
  const dragRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const step = 8;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
    setIsDragging(true);
    onResizeStart?.();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = side === "sidebar" ? event.clientX - drag.startX : drag.startX - event.clientX;
    onChange(clamp(drag.startValue + delta, min, max));
  };

  const finishPointerDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
    onResizeEnd?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let nextValue: number | null = null;
    if (event.key === "Home") nextValue = min;
    if (event.key === "End") nextValue = max;
    if (event.key === "ArrowLeft") nextValue = side === "sidebar" ? value - step : value + step;
    if (event.key === "ArrowRight") nextValue = side === "sidebar" ? value + step : value - step;
    if (nextValue === null) return;
    event.preventDefault();
    onChange(clamp(nextValue, min, max));
  };

  return (
    <button
      className={`panel-resizer panel-resizer--${side}${isDragging ? " is-dragging" : ""}`}
      type="button"
      role="separator"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
    />
  );
}
