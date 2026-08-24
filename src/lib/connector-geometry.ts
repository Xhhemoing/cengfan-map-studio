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
  return points.slice(1).map((point, index) => ({ start: points[index]!, end: point }));
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

function orientation(first: Point, second: Point, third: Point): number {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function pointOnSegment(point: Point, segment: ConnectorSegment): boolean {
  return Math.abs(orientation(segment.start, segment.end, point)) <= EPSILON
    && point.x >= Math.min(segment.start.x, segment.end.x) - EPSILON
    && point.x <= Math.max(segment.start.x, segment.end.x) + EPSILON
    && point.y >= Math.min(segment.start.y, segment.end.y) - EPSILON
    && point.y <= Math.max(segment.start.y, segment.end.y) + EPSILON;
}

function segmentsIntersect(left: ConnectorSegment, right: ConnectorSegment): boolean {
  const a = orientation(left.start, left.end, right.start);
  const b = orientation(left.start, left.end, right.end);
  const c = orientation(right.start, right.end, left.start);
  const d = orientation(right.start, right.end, left.end);
  if (((a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON))
    && ((c > EPSILON && d < -EPSILON) || (c < -EPSILON && d > EPSILON))) return true;
  return pointOnSegment(right.start, left)
    || pointOnSegment(right.end, left)
    || pointOnSegment(left.start, right)
    || pointOnSegment(left.end, right);
}

function pointSegmentDistance(point: Point, segment: ConnectorSegment): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON) return Math.sqrt(distanceSquared(point, segment.start));
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (segment.start.x + t * dx), point.y - (segment.start.y + t * dy));
}

function segmentDistance(left: ConnectorSegment, right: ConnectorSegment): number {
  if (segmentsIntersect(left, right)) return 0;
  return Math.min(
    pointSegmentDistance(left.start, right),
    pointSegmentDistance(left.end, right),
    pointSegmentDistance(right.start, left),
    pointSegmentDistance(right.end, left),
  );
}

export function connectorGeometriesIntersect(left: ConnectorGeometry, right: ConnectorGeometry, clearance = 0): boolean {
  const leftTail = left.segments[left.segments.length - 1];
  const rightTail = right.segments[right.segments.length - 1];
  // 两条连接线共享地理锚点（anchor 端重合）时，它们在锚点附近的会合区不算交叉；
  // 同锚点多卡片呈「花束」状散开，只有远离锚点的中段真正相交才算。
  const sharedAnchor = Boolean(leftTail && rightTail)
    && distanceSquared(leftTail!.end, rightTail!.end) <= (clearance + EPSILON) ** 2;
  // 豁免半径需覆盖曲线采样的最长尾段（curve 用 16 段折线，锚点距离可达 ~24px）；
  // 同时豁免段必须是「整段都落在锚点半径内」的尾段——一段从远处穿入锚点区
  // （start 远离锚点）仍可能穿过另一条线的中段，不能豁免。
  const anchorRadius = Math.max(clearance * 4, 10, 24);
  const nearAnchorEnd = (segment: ConnectorSegment, tail: ConnectorSegment) =>
    distanceSquared(segment.end, tail.end) <= anchorRadius * anchorRadius
    && distanceSquared(segment.start, tail.end) <= anchorRadius * anchorRadius;
  // A curve is 16 sampled segments, so a naive pass costs 256 segment-distance
  // computations per pair of leader lines. Two segments can only be within
  // `reach` if their bounding boxes are, and four comparisons settle that.
  const reach = clearance + EPSILON;
  for (const first of left.segments) {
    const minX = Math.min(first.start.x, first.end.x) - reach;
    const maxX = Math.max(first.start.x, first.end.x) + reach;
    const minY = Math.min(first.start.y, first.end.y) - reach;
    const maxY = Math.max(first.start.y, first.end.y) + reach;
    const firstNearAnchor = sharedAnchor && leftTail !== undefined && nearAnchorEnd(first, leftTail);
    for (const second of right.segments) {
      if (minX > Math.max(second.start.x, second.end.x) || maxX < Math.min(second.start.x, second.end.x)) continue;
      if (minY > Math.max(second.start.y, second.end.y) || maxY < Math.min(second.start.y, second.end.y)) continue;
      if (firstNearAnchor && rightTail && nearAnchorEnd(second, rightTail)) continue;
      if (segmentDistance(first, second) <= reach) return true;
    }
  }
  return false;
}

/**
 * 共锚点豁免半径：多张卡的连接线汇入同一个地图锚点时，锚点附近的会合不算冲突。
 * 24px 要同时兜住两件事——curve 采样后靠近锚点的那一段最长可达 ~24px，以及
 * 香港/澳门这类相距约 7px 的邻省锚点仍属同一束。
 */
export const CONNECTOR_ANCHOR_EXEMPT_RADIUS = 24;

function clipPointOnCircle(segment: ConnectorSegment, anchor: Point, radius: number, root: 1 | -1): Point | null {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const fx = segment.start.x - anchor.x;
  const fy = segment.start.y - anchor.y;
  const a = dx * dx + dy * dy;
  if (a <= 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b + root * Math.sqrt(discriminant)) / (2 * a);
  if (t <= 0 || t >= 1) return null;
  return { x: segment.start.x + dx * t, y: segment.start.y + dy * t };
}

/** 把折线在 anchor 半径内的部分裁掉：整段在圈内的丢弃，跨圈的截断到圆周。 */
export function trimSegmentsNearAnchor(
  segments: readonly ConnectorSegment[],
  anchor: Point,
  radius: number,
): ConnectorSegment[] {
  const radiusSquared = radius * radius;
  const inside = (point: Point) => (point.x - anchor.x) ** 2 + (point.y - anchor.y) ** 2 < radiusSquared;
  return segments.flatMap((segment) => {
    const startInside = inside(segment.start);
    const endInside = inside(segment.end);
    if (startInside && endInside) return [];
    if (!startInside && !endInside) return [segment];
    const clipped = endInside
      ? clipPointOnCircle(segment, anchor, radius, -1)
      : clipPointOnCircle(segment, anchor, radius, 1);
    if (!clipped) return [];
    return endInside
      ? [{ start: segment.start, end: clipped }]
      : [{ start: clipped, end: segment.end }];
  });
}

/**
 * 线段落在矩形内部的那一截有多长（Liang–Barsky 参数裁剪）。
 *
 * 求解器只问「碰没碰到」，用 {@link segmentIntersectsRect} 就够；排版体检要区分
 * 「从卡片正身穿过去」和「擦过一个角」，靠的是这个弦长而不是布尔值。共线贴着
 * 边框走会算出完整长度，贴边同样是压在卡上——由调用方决定要不要豁免。
 */
export function segmentRectOverlapLength(segment: ConnectorSegment, rect: Rect): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  let enter = 0;
  let exit = 1;
  const slabs: ReadonlyArray<readonly [number, number]> = [
    [-dx, segment.start.x - rect.x],
    [dx, rect.x + rect.width - segment.start.x],
    [-dy, segment.start.y - rect.y],
    [dy, rect.y + rect.height - segment.start.y],
  ];
  for (const [edge, distance] of slabs) {
    if (Math.abs(edge) <= EPSILON) {
      // 与这条边平行：整段要么在板内要么在板外，没有可裁剪的参数。
      if (distance < 0) return 0;
      continue;
    }
    const t = distance / edge;
    if (edge < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
  }
  return exit <= enter ? 0 : (exit - enter) * Math.hypot(dx, dy);
}

export function segmentIntersectsRect(segment: ConnectorSegment, rect: Rect, clearance = 0): boolean {
  const expanded = {
    x: rect.x - clearance,
    y: rect.y - clearance,
    width: rect.width + clearance * 2,
    height: rect.height + clearance * 2,
  };
  const contains = (point: Point) => point.x >= expanded.x - EPSILON
    && point.x <= expanded.x + expanded.width + EPSILON
    && point.y >= expanded.y - EPSILON
    && point.y <= expanded.y + expanded.height + EPSILON;
  if (contains(segment.start) || contains(segment.end)) return true;
  const topLeft = { x: expanded.x, y: expanded.y };
  const topRight = { x: expanded.x + expanded.width, y: expanded.y };
  const bottomRight = { x: expanded.x + expanded.width, y: expanded.y + expanded.height };
  const bottomLeft = { x: expanded.x, y: expanded.y + expanded.height };
  return [
    { start: topLeft, end: topRight },
    { start: topRight, end: bottomRight },
    { start: bottomRight, end: bottomLeft },
    { start: bottomLeft, end: topLeft },
  ].some((edge) => segmentsIntersect(segment, edge));
}
