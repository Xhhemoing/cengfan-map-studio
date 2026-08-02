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
  return left.segments.some((first) => right.segments.some((second) => segmentDistance(first, second) <= clearance + EPSILON));
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
