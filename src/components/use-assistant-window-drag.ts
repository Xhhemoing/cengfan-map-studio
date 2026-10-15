import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

type WindowPosition = { x: number; y: number } | null;

export function useAssistantWindowDrag(position: WindowPosition, setPosition: Dispatch<SetStateAction<WindowPosition>>) {
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  useEffect(() => {
    if (!position) return;
    const clamp = () => setPosition((current) => current ? {
      x: Math.max(0, Math.min(current.x, Math.max(0, window.innerWidth - 390))),
      y: Math.max(0, Math.min(current.y, Math.max(0, window.innerHeight - 52))),
    } : current);
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [position, setPosition]);
  const beginDrag = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, label, textarea")) return;
    const panel = event.currentTarget.closest(".agent-assistant-window") as HTMLElement | null;
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    setPosition({ x: Math.max(0, rect.left), y: Math.max(0, rect.top) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = 390;
    const x = Math.max(0, Math.min(event.clientX - drag.offsetX, Math.max(0, window.innerWidth - width)));
    const y = Math.max(0, Math.min(event.clientY - drag.offsetY, Math.max(0, window.innerHeight - 52)));
    setPosition({ x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  return { beginDrag, moveDrag, endDrag };
}
