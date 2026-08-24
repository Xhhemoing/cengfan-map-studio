/**
 * Pure geometry helpers for the card auto-layout solver.
 *
 * Everything here is side-effect free and independent of the canvas: rectangle
 * math, segment/polygon predicates, side math and the lexicographic score
 * comparator used by the placement strategies.
 */
import {
  EPSILON,
  SIDE_ORDER,
  type CardArea,
  type CardPoint,
  type CardPolygon,
  type CardSide,
} from "./card-layout-types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Finite fallback so malformed input can never poison downstream arithmetic. */
export function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function overlaps(a: CardArea, b: CardArea, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

export function expandArea(area: CardArea, amount: number): CardArea {
  return {
    x: area.x - amount,
    y: area.y - amount,
    width: area.width + amount * 2,
    height: area.height + amount * 2,
  };
}

/** Smallest rectangle covering both inputs. */
export function unionArea(left: CardArea, right: CardArea): CardArea {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  };
}

export function centerOf(area: CardArea): CardPoint {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

/** Inclusive AABB proximity test used to prune expensive geometry work. */
export function boundsTouch(left: CardArea, right: CardArea, clearance: number): boolean {
  return left.x <= right.x + right.width + clearance
    && left.x + left.width + clearance >= right.x
    && left.y <= right.y + right.height + clearance
    && left.y + left.height + clearance >= right.y;
}

/** Corners in clockwise order, the winding the edge walks below assume. */
export function areaCorners(area: CardArea): [CardPoint, CardPoint, CardPoint, CardPoint] {
  return [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height },
    { x: area.x, y: area.y + area.height },
  ];
}

export function pointInArea(point: CardPoint, area: CardArea): boolean {
  return point.x >= area.x - EPSILON
    && point.x <= area.x + area.width + EPSILON
    && point.y >= area.y - EPSILON
    && point.y <= area.y + area.height + EPSILON;
}

export function orientation(a: CardPoint, b: CardPoint, c: CardPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function pointOnSegment(point: CardPoint, start: CardPoint, end: CardPoint): boolean {
  // Bounding-box reject first: it is a few comparisons and discards almost
  // every edge before the cross product, which dominates polygon hit tests.
  return point.x >= Math.min(start.x, end.x) - EPSILON
    && point.x <= Math.max(start.x, end.x) + EPSILON
    && point.y >= Math.min(start.y, end.y) - EPSILON
    && point.y <= Math.max(start.y, end.y) + EPSILON
    && Math.abs(orientation(start, end, point)) <= EPSILON;
}

export function segmentsIntersect(a: CardPoint, b: CardPoint, c: CardPoint, d: CardPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d);
}

/** True when the segment touches `area`, counting a segment fully inside it. */
export function segmentTouchesArea(start: CardPoint, end: CardPoint, area: CardArea): boolean {
  // Bounding-box reject first: on a province outline almost every edge is far
  // from the probe rectangle, and four comparisons beat four segment tests.
  if (Math.min(start.x, end.x) > area.x + area.width + EPSILON
    || Math.max(start.x, end.x) < area.x - EPSILON
    || Math.min(start.y, end.y) > area.y + area.height + EPSILON
    || Math.max(start.y, end.y) < area.y - EPSILON) return false;
  if (pointInArea(start, area) || pointInArea(end, area)) return true;
  const corners = areaCorners(area);
  for (let index = 0; index < corners.length; index += 1) {
    if (segmentsIntersect(start, end, corners[index]!, corners[(index + 1) % corners.length]!)) return true;
  }
  return false;
}

export function pointInRing(point: CardPoint, ring: CardPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]!;
    const end = ring[index]!;
    if (pointOnSegment(point, start, end)) return true;
    if ((start.y > point.y) !== (end.y > point.y)) {
      const x = start.x + (point.y - start.y) * (end.x - start.x) / (end.y - start.y);
      if (x >= point.x - EPSILON) inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(point: CardPoint, polygon: CardPolygon): boolean {
  const [shell, ...holes] = polygon.rings;
  return Boolean(shell && pointInRing(point, shell) && !holes.some((hole) => pointInRing(point, hole)));
}

/**
 * AABB of a polygon. Callers in hot loops should cache the result (see
 * {@link ./card-layout-space}); recomputing walks every ring point.
 */
export function polygonBounds(polygon: CardPolygon): CardArea | null {
  if (polygon.bounds) return polygon.bounds;
  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygon.rings) {
    for (const point of ring) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      count += 1;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  if (count < 3) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Iterate the closed edges of every ring. Rings are implicitly closed, so the
 * last point pairs with the first.
 */
export function forEachPolygonEdge(
  polygon: CardPolygon,
  visit: (start: CardPoint, end: CardPoint) => boolean | void,
): boolean {
  for (const ring of polygon.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index]!;
      const end = ring[(index + 1) % ring.length]!;
      if (visit(start, end) === true) return true;
    }
  }
  return false;
}

/**
 * True when `card` (grown by `gap`) touches the polygon. `cachedBounds` skips
 * the AABB walk; pass it whenever the polygon is tested more than once.
 *
 * Two cases, in cost order: an outline edge cuts the rectangle, or no edge does
 * and the rectangle lies wholly inside or wholly outside the shape — which one
 * costs a single ray cast to settle. Callers with many probes against the same
 * geometry should use the indexed variant in `card-layout-space` instead.
 */
export function rectangleIntersectsPolygon(
  card: CardArea,
  polygon: CardPolygon,
  gap: number,
  cachedBounds?: CardArea | null,
): boolean {
  const expanded = expandArea(card, gap);
  const bounds = cachedBounds === undefined ? polygonBounds(polygon) : cachedBounds;
  if (!bounds || !overlaps(expanded, bounds)) return false;
  const shell = polygon.rings[0] ?? [];
  if (shell.some((point) => point.x >= expanded.x - EPSILON
    && point.x <= expanded.x + expanded.width + EPSILON
    && point.y >= expanded.y - EPSILON
    && point.y <= expanded.y + expanded.height + EPSILON)) return true;
  const corners = areaCorners(expanded);
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  const rectangleEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]!] as const);
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && rectangleEdges.some(([start, end]) => segmentsIntersect(point, next, start, end)));
  }));
}

export function segmentIntersectsPolygon(
  segment: { start: CardPoint; end: CardPoint },
  polygon: CardPolygon,
): boolean {
  if (pointInPolygon(segment.start, polygon) || pointInPolygon(segment.end, polygon)) return true;
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && segmentsIntersect(segment.start, segment.end, point, next));
  }));
}

/** Lexicographic comparison of score vectors; negative means `left` wins. */
export function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return left.length - right.length;
}

/** Cyclic distance between two sides: 0 same, 1 adjacent, 2 opposite. */
export function sideDistance(left: CardSide, right: CardSide): number {
  const difference = Math.abs(SIDE_ORDER.indexOf(left) - SIDE_ORDER.indexOf(right));
  return Math.min(difference, SIDE_ORDER.length - difference);
}

/** Card extent along the axis cards slide on for a given side. */
export function sideAxisSize(card: CardArea, side: CardSide): number {
  return side === "left" || side === "right" ? card.height : card.width;
}

/** Which side of the map a concrete rectangle ended up on. */
export function sideForPlacement(placement: CardArea, map: CardArea): CardSide {
  const mapCenter = centerOf(map);
  const cardCenter = centerOf(placement);
  const horizontal = (cardCenter.x - mapCenter.x) / Math.max(1, map.width / 2);
  const vertical = (cardCenter.y - mapCenter.y) / Math.max(1, map.height / 2);
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}
