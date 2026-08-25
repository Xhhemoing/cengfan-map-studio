import type { PointerEvent } from "react";

/** Convert a pointer event into poster canvas coordinates. Falls back to a
 *  bounding-rect estimate when the SVG geometry APIs are unavailable (jsdom). */
export function canvasPointFromEvent(
  event: PointerEvent<SVGGElement>,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } | null {
  const svg = event.currentTarget.ownerSVGElement;
  if (!svg) return null;
  if (typeof svg.createSVGPoint !== "function") {
    const rect = svg.getBoundingClientRect();
    const width = rect.width || canvasWidth;
    const height = rect.height || canvasHeight;
    return {
      x: (event.clientX - rect.left) * canvasWidth / width,
      y: (event.clientY - rect.top) * canvasHeight / height,
    };
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()?.inverse());
}
