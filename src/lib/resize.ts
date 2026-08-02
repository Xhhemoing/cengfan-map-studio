export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

function rotate(point: Point, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: c * point.x - s * point.y, y: s * point.x + c * point.y };
}

function projectToDiagonal(pointer: Point, anchor: Point, diagonal: Point): number {
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  const denom = diagonal.x * diagonal.x + diagonal.y * diagonal.y;
  if (denom <= 0) return 0;
  return Math.max(0, (dx * diagonal.x + dy * diagonal.y) / denom);
}

function isCorner(handle: ResizeHandle): boolean {
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw";
}

/** Anchor (opposite the handle) and handle positions in local [0,w]x[0,h] space. */
const HANDLE_ANCHORS: Record<ResizeHandle, { anchor: Point; handle: Point }> = {
  se: { anchor: { x: 0, y: 0 }, handle: { x: 1, y: 1 } },
  e: { anchor: { x: 0, y: 0.5 }, handle: { x: 1, y: 0.5 } },
  s: { anchor: { x: 0.5, y: 0 }, handle: { x: 0.5, y: 1 } },
  ne: { anchor: { x: 0, y: 1 }, handle: { x: 1, y: 0 } },
  n: { anchor: { x: 0.5, y: 1 }, handle: { x: 0.5, y: 0 } },
  nw: { anchor: { x: 1, y: 1 }, handle: { x: 0, y: 0 } },
  w: { anchor: { x: 1, y: 0.5 }, handle: { x: 0, y: 0.5 } },
  sw: { anchor: { x: 1, y: 0 }, handle: { x: 0, y: 1 } },
};

/**
 * Resize a rotated rectangle. `initial` is the world-space rect; `pointerWorld`
 * is the drag pointer in world coordinates. The anchor opposite the dragged
 * handle stays fixed in world space. Corner handles lock aspect by default.
 */
export function resizeBox(
  initial: Rect,
  rotation: number,
  handle: ResizeHandle,
  pointerWorld: Point,
  options?: { lockAspect?: boolean },
): Rect {
  const w = initial.width;
  const h = initial.height;
  const cx = initial.x + w / 2;
  const cy = initial.y + h / 2;

  // Pointer in the old local top-left frame [0,w]x[0,h].
  const pointerLocal = rotate({ x: pointerWorld.x - cx, y: pointerWorld.y - cy }, -rotation);
  const p = { x: pointerLocal.x + w / 2, y: pointerLocal.y + h / 2 };

  const { anchor, handle: handleDir } = HANDLE_ANCHORS[handle];
  const lockAspect = options?.lockAspect ?? isCorner(handle);
  const anchorLocal = { x: anchor.x * w, y: anchor.y * h };

  let newW: number;
  let newH: number;

  if (lockAspect) {
    const diag = { x: (handleDir.x - anchor.x) * w, y: (handleDir.y - anchor.y) * h };
    const t = projectToDiagonal(p, anchorLocal, diag);
    newW = Math.max(1, t * w);
    newH = Math.max(1, t * h);
  } else {
    // Per-axis: only the axis the handle moves along changes.
    const alongX = handleDir.x !== anchor.x;
    const alongY = handleDir.y !== anchor.y;
    if (alongX) {
      const sign = handleDir.x > anchor.x ? 1 : -1;
      newW = Math.max(1, sign === 1 ? p.x - anchorLocal.x : anchorLocal.x - p.x);
    } else {
      newW = w;
    }
    if (alongY) {
      const sign = handleDir.y > anchor.y ? 1 : -1;
      newH = Math.max(1, sign === 1 ? p.y - anchorLocal.y : anchorLocal.y - p.y);
    } else {
      newH = h;
    }
  }

  // New anchor in local space (same normalized coords, scaled to new size).
  const anchorNewLocal = { x: anchor.x * newW, y: anchor.y * newH };
  const anchorWorld = {
    x: cx + rotate({ x: anchorLocal.x - w / 2, y: anchorLocal.y - h / 2 }, rotation).x,
    y: cy + rotate({ x: anchorLocal.x - w / 2, y: anchorLocal.y - h / 2 }, rotation).y,
  };
  const newCenterLocalOffset = rotate(
    { x: anchorNewLocal.x - newW / 2, y: anchorNewLocal.y - newH / 2 },
    rotation,
  );
  const newCenter = {
    x: anchorWorld.x - newCenterLocalOffset.x,
    y: anchorWorld.y - newCenterLocalOffset.y,
  };

  return {
    x: newCenter.x - newW / 2,
    y: newCenter.y - newH / 2,
    width: newW,
    height: newH,
  };
}

/** Convert a screen pointer into world coordinates of an SVG. */
export function svgLocalPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point | null {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/** Transform string placing an unrotated local rect into world space. */
export function rectWorldTransform(rect: Rect, rotation: number): string {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return `translate(${cx} ${cy}) rotate(${rotation}) translate(${-rect.width / 2} ${-rect.height / 2})`;
}
