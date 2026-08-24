export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ConnectorStyle = "straight" | "elbow" | "curve";
export type ConnectorSide = "left" | "right" | "top" | "bottom";

export interface ConnectorPort extends Point {
  side: ConnectorSide;
}

export interface ConnectorSegment {
  start: Point;
  end: Point;
}

export interface ConnectorGeometry {
  port: ConnectorPort;
  pathData: string;
  segments: ConnectorSegment[];
}

const EPSILON = 1e-7;
const CURVE_STEPS = 16;

function format(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function distanceSquared(left: Point, right: Point): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}

export function resolveConnectorPort(
  card: Rect,
  anchor: Point,
  preferredSide?: ConnectorSide,
): ConnectorPort {
  const centerX = card.x + card.width / 2;
  const centerY = card.y + card.height / 2;
  const cardRight = card.x + card.width;
  const cardBottom = card.y + card.height;

  // Resolve the endpoint from the line between the geographic anchor and the
  // card center. Rendering only draws up to this first boundary intersection,
  // so the part of the ideal anchor-to-center line inside the card stays hidden.
  const deltaX = anchor.x - centerX;
  const deltaY = anchor.y - centerY;
  if (Math.abs(deltaX) > EPSILON || Math.abs(deltaY) > EPSILON) {
    const scale = 1 / Math.max(
      Math.abs(deltaX) / (card.width / 2),
      Math.abs(deltaY) / (card.height / 2),
    );
    const x = centerX + deltaX * scale;
    const y = centerY + deltaY * scale;
    if (Math.abs(x - card.x) <= EPSILON) return { x: card.x, y, side: "left" };
    if (Math.abs(x - cardRight) <= EPSILON) return { x: cardRight, y, side: "right" };
    if (Math.abs(y - card.y) <= EPSILON) return { x, y: card.y, side: "top" };
    return { x, y: cardBottom, side: "bottom" };
  }

  // A center anchor has no direction. Retain the layout-side fallback to keep
  // the result deterministic in this degenerate case.
  if (preferredSide === "right") return { x: card.x, y: centerY, side: "left" };
  if (preferredSide === "left") return { x: cardRight, y: centerY, side: "right" };
  if (preferredSide === "bottom") return { x: centerX, y: card.y, side: "top" };
  return { x: centerX, y: cardBottom, side: "bottom" };
}

function curveControls(port: ConnectorPort, anchor: Point, fanChannels: boolean): [Point, Point] {
  // Fan only for smooth curves so dense same-side connectors avoid a shared collinear final
  // segment. Elbows stay axis-aligned for predictable mid-channel routing.
  const fan = fanChannels
    ? Math.min(18, Math.hypot(port.x - anchor.x, port.y - anchor.y) * 0.08)
    : 0;
  if (port.side === "left" || port.side === "right") {
    const middleX = (port.x + anchor.x) / 2;
    const sign = port.y <= anchor.y ? -1 : 1;
    return [
      { x: middleX, y: port.y },
      { x: middleX, y: anchor.y + sign * fan },
    ];
  }
  const middleY = (port.y + anchor.y) / 2;
  const sign = port.x <= anchor.x ? -1 : 1;
  return [
    { x: port.x, y: middleY },
    { x: anchor.x + sign * fan, y: middleY },
  ];
}

function cubicPoint(start: Point, first: Point, second: Point, end: Point, t: number): Point {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * first.x + 3 * inverse * t ** 2 * second.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * first.y + 3 * inverse * t ** 2 * second.y + t ** 3 * end.y,
  };
}

function pointsToSegments(points: Point[]): ConnectorSegment[] {
  const segments: ConnectorSegment[] = [];
  for (let index = 1; index < points.length; index += 1) {
    segments.push({ start: points[index - 1]!, end: points[index]! });
  }
  return segments;
}

export function buildConnectorGeometry({ card, anchor, style, preferredSide }: {
  card: Rect;
  anchor: Point;
  style: ConnectorStyle;
  /** Layout track side (left/right/top/bottom). Forces the port to exit toward the map. */
  preferredSide?: ConnectorSide;
}): ConnectorGeometry {
  const port = resolveConnectorPort(card, anchor, preferredSide);
  if (style === "straight") {
    return {
      port,
      pathData: `M${format(port.x)} ${format(port.y)} L${format(anchor.x)} ${format(anchor.y)}`,
      segments: [{ start: { x: port.x, y: port.y }, end: anchor }],
    };
  }

  const [first, second] = curveControls(port, anchor, style === "curve");
  if (style === "elbow") {
    const start = { x: port.x, y: port.y };
    const points = distanceSquared(port, first) <= EPSILON || distanceSquared(first, second) <= EPSILON
      ? [start, second, anchor]
      : [start, first, second, anchor];
    return {
      port,
      pathData: `M${format(port.x)} ${format(port.y)} L${format(first.x)} ${format(first.y)} L${format(second.x)} ${format(second.y)} L${format(anchor.x)} ${format(anchor.y)}`,
      segments: pointsToSegments(points),
    };
  }

  const start = { x: port.x, y: port.y };
  const points = Array.from({ length: CURVE_STEPS + 1 }, (_, index) =>
    cubicPoint(start, first, second, anchor, index / CURVE_STEPS));
  return {
    port,
    pathData: `M${format(port.x)} ${format(port.y)} C${format(first.x)} ${format(first.y)} ${format(second.x)} ${format(second.y)} ${format(anchor.x)} ${format(anchor.y)}`,
    segments: pointsToSegments(points),
  };
}

/*
 * The predicates below run inside the layout solver's O(n²·s²) connector
 * scoring, so they are written on raw coordinates: no temporary points, rects
 * or edge objects are allocated per test, and every pair is rejected by a
 * scalar bounding-box compare before any orientation arithmetic runs.
 */

function orientationOf(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointTouchesSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): boolean {
  if (Math.abs(orientationOf(ax, ay, bx, by, px, py)) > EPSILON) return false;
  return px >= Math.min(ax, bx) - EPSILON
    && px <= Math.max(ax, bx) + EPSILON
    && py >= Math.min(ay, by) - EPSILON
    && py <= Math.max(ay, by) + EPSILON;
}

/** Shared by connector-vs-connector and connector-vs-rectangle tests. */
export function segmentsCross(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  dx: number, dy: number,
): boolean {
  const a = orientationOf(ax, ay, bx, by, cx, cy);
  const b = orientationOf(ax, ay, bx, by, dx, dy);
  const c = orientationOf(cx, cy, dx, dy, ax, ay);
  const d = orientationOf(cx, cy, dx, dy, bx, by);
  if (((a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON))
    && ((c > EPSILON && d < -EPSILON) || (c < -EPSILON && d > EPSILON))) return true;
  return pointTouchesSegment(cx, cy, ax, ay, bx, by)
    || pointTouchesSegment(dx, dy, ax, ay, bx, by)
    || pointTouchesSegment(ax, ay, cx, cy, dx, dy)
    || pointTouchesSegment(bx, by, cx, cy, dx, dy);
}

function pointSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function segmentDistance(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    pointSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointSegmentDistance(bx, by, cx, cy, dx, dy),
    pointSegmentDistance(cx, cy, ax, ay, bx, by),
    pointSegmentDistance(dx, dy, ax, ay, bx, by),
  );
}

export function connectorGeometriesIntersect(left: ConnectorGeometry, right: ConnectorGeometry, clearance = 0): boolean {
  const leftSegments = left.segments;
  const rightSegments = right.segments;
  if (leftSegments.length === 0 || rightSegments.length === 0) return false;
  const leftTail = leftSegments[leftSegments.length - 1]!;
  const rightTail = rightSegments[rightSegments.length - 1]!;
  // 两条连接线共享地理锚点（anchor 端重合）时，它们在锚点附近的会合区不算交叉；
  // 同锚点多卡片呈「花束」状散开，只有远离锚点的中段真正相交才算。
  const sharedAnchor = distanceSquared(leftTail.end, rightTail.end) <= (clearance + EPSILON) ** 2;
  // 豁免半径需覆盖曲线采样的最长尾段（curve 用 16 段折线，锚点距离可达 ~24px）；
  // 同时豁免段必须是「整段都落在锚点半径内」的尾段——一段从远处穿入锚点区
  // （start 远离锚点）仍可能穿过另一条线的中段，不能豁免。
  const anchorRadius = Math.max(clearance * 4, 10, 24);
  const anchorRadiusSquared = anchorRadius * anchorRadius;
  const nearAnchorEnd = (segment: ConnectorSegment, tail: ConnectorSegment) =>
    distanceSquared(segment.end, tail.end) <= anchorRadiusSquared
    && distanceSquared(segment.start, tail.end) <= anchorRadiusSquared;

  const reach = clearance + EPSILON;
  for (const first of leftSegments) {
    const firstMinX = Math.min(first.start.x, first.end.x) - reach;
    const firstMaxX = Math.max(first.start.x, first.end.x) + reach;
    const firstMinY = Math.min(first.start.y, first.end.y) - reach;
    const firstMaxY = Math.max(first.start.y, first.end.y) + reach;
    const firstExempt = sharedAnchor && nearAnchorEnd(first, leftTail);
    for (const second of rightSegments) {
      // Broad phase: segments whose inflated boxes are disjoint are farther
      // apart than `clearance`, so the exact distance test cannot succeed.
      if (Math.max(second.start.x, second.end.x) < firstMinX
        || Math.min(second.start.x, second.end.x) > firstMaxX
        || Math.max(second.start.y, second.end.y) < firstMinY
        || Math.min(second.start.y, second.end.y) > firstMaxY) continue;
      if (firstExempt && nearAnchorEnd(second, rightTail)) continue;
      if (segmentDistance(
        first.start.x, first.start.y, first.end.x, first.end.y,
        second.start.x, second.start.y, second.end.x, second.end.y,
      ) <= reach) return true;
    }
  }
  return false;
}

export function segmentIntersectsRect(segment: ConnectorSegment, rect: Rect, clearance = 0): boolean {
  const minX = rect.x - clearance;
  const minY = rect.y - clearance;
  const maxX = rect.x + rect.width + clearance;
  const maxY = rect.y + rect.height + clearance;
  const ax = segment.start.x;
  const ay = segment.start.y;
  const bx = segment.end.x;
  const by = segment.end.y;
  // Broad phase: a segment whose box misses the expanded rectangle can neither
  // be contained by it nor cross one of its edges.
  if (Math.max(ax, bx) < minX - EPSILON
    || Math.min(ax, bx) > maxX + EPSILON
    || Math.max(ay, by) < minY - EPSILON
    || Math.min(ay, by) > maxY + EPSILON) return false;
  if (ax >= minX - EPSILON && ax <= maxX + EPSILON && ay >= minY - EPSILON && ay <= maxY + EPSILON) return true;
  if (bx >= minX - EPSILON && bx <= maxX + EPSILON && by >= minY - EPSILON && by <= maxY + EPSILON) return true;
  return segmentsCross(ax, ay, bx, by, minX, minY, maxX, minY)
    || segmentsCross(ax, ay, bx, by, maxX, minY, maxX, maxY)
    || segmentsCross(ax, ay, bx, by, maxX, maxY, minX, maxY)
    || segmentsCross(ax, ay, bx, by, minX, maxY, minX, minY);
}
