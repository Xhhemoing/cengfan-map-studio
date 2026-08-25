/**
 * Connector geometry predicates and the scalar scoring primitives built on top
 * of them. Everything here is called from inside the solver's O(n²) scoring
 * loops, so each predicate opens with a bounding-box reject.
 */

import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  segmentIntersectsRect,
  segmentsCross,
  type ConnectorGeometry,
  type ConnectorStyle,
} from "./connector-geometry";
import { preparePolygon, preparedContainsPoint, type PreparedPolygon } from "./card-layout-polygons";
import {
  EPSILON,
  SIDE_ORDER,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
  type CardPoint,
  type CardPolygon,
  type CardSide,
} from "./card-layout-types";

export function connectorBounds(geometry: ConnectorGeometry): CardArea {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of geometry.segments) {
    minX = Math.min(minX, segment.start.x, segment.end.x);
    minY = Math.min(minY, segment.start.y, segment.end.y);
    maxX = Math.max(maxX, segment.start.x, segment.end.x);
    maxY = Math.max(maxY, segment.start.y, segment.end.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The connector a placement would draw under `style`, anchored at its own anchor. */
export function placementGeometry(placement: CardPlacement, style: ConnectorStyle): ConnectorGeometry {
  return buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style,
  });
}

export function boundsTouch(left: CardArea, right: CardArea, clearance: number): boolean {
  return left.x <= right.x + right.width + clearance
    && left.x + left.width + clearance >= right.x
    && left.y <= right.y + right.height + clearance
    && left.y + left.height + clearance >= right.y;
}

export function connectorIntersects(
  left: ConnectorGeometry,
  leftBounds: CardArea,
  right: ConnectorGeometry,
  rightBounds: CardArea,
  clearance: number,
): boolean {
  return boundsTouch(leftBounds, rightBounds, clearance)
    && connectorGeometriesIntersect(left, right, clearance);
}

/**
 * Does any part of the connector polyline touch the polygon? Equivalent to
 * testing each segment individually, but the polygon's edges are walked once
 * with a bounding-box reject against the whole connector instead of once per
 * segment.
 */
function connectorIntersectsPolygon(
  geometry: ConnectorGeometry,
  geometryBounds: CardArea,
  prepared: PreparedPolygon,
): boolean {
  const segments = geometry.segments;
  const minX = geometryBounds.x;
  const minY = geometryBounds.y;
  const maxX = geometryBounds.x + geometryBounds.width;
  const maxY = geometryBounds.y + geometryBounds.height;
  for (const segment of segments) {
    if (preparedContainsPoint(prepared, segment.start.x, segment.start.y)) return true;
    if (preparedContainsPoint(prepared, segment.end.x, segment.end.y)) return true;
  }
  for (const ring of prepared.rings) {
    if (ring.count === 0) continue;
    if (ring.maxX < minX - EPSILON || ring.minX > maxX + EPSILON
      || ring.maxY < minY - EPSILON || ring.minY > maxY + EPSILON) continue;
    const { points, count } = ring;
    let ax = points[(count - 1) * 2]!;
    let ay = points[(count - 1) * 2 + 1]!;
    for (let index = 0; index < count; index += 1) {
      const bx = ax;
      const by = ay;
      ax = points[index * 2]!;
      ay = points[index * 2 + 1]!;
      const edgeMinX = Math.min(ax, bx);
      const edgeMaxX = Math.max(ax, bx);
      const edgeMinY = Math.min(ay, by);
      const edgeMaxY = Math.max(ay, by);
      if (edgeMaxX < minX - EPSILON || edgeMinX > maxX + EPSILON
        || edgeMaxY < minY - EPSILON || edgeMinY > maxY + EPSILON) continue;
      for (const segment of segments) {
        const sx = segment.start.x;
        const sy = segment.start.y;
        const ex = segment.end.x;
        const ey = segment.end.y;
        if (Math.max(sx, ex) < edgeMinX - EPSILON || Math.min(sx, ex) > edgeMaxX + EPSILON
          || Math.max(sy, ey) < edgeMinY - EPSILON || Math.min(sy, ey) > edgeMaxY + EPSILON) continue;
        if (segmentsCross(sx, sy, ex, ey, ax, ay, bx, by)) return true;
      }
    }
  }
  return false;
}

export function connectorMapIntersections(
  geometry: ConnectorGeometry,
  geometryBounds: CardArea,
  anchor: CardPoint,
  polygons: CardPolygon[],
): number {
  let intersections = 0;
  for (const polygon of polygons) {
    const prepared = preparePolygon(polygon);
    if (!prepared.bounds || !boundsTouch(geometryBounds, prepared.bounds, 0)) continue;
    if (preparedContainsPoint(prepared, anchor.x, anchor.y)) continue;
    if (connectorIntersectsPolygon(geometry, geometryBounds, prepared)) intersections += 1;
  }
  return intersections;
}

/**
 * Callers already carry the connector's bounding box (candidates cache it,
 * scoring precomputes it), so it is threaded in instead of recomputed per card.
 */
export function connectorHitsCard(
  geometry: ConnectorGeometry,
  geometryBounds: CardArea,
  card: CardArea,
  clearance: number,
): boolean {
  if (!boundsTouch(geometryBounds, card, clearance)) return false;
  for (const segment of geometry.segments) {
    if (segmentIntersectsRect(segment, card, clearance)) return true;
  }
  return false;
}

export function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return left.length - right.length;
}

export function sideDistance(left: CardSide, right: CardSide): number {
  const difference = Math.abs(SIDE_ORDER.indexOf(left) - SIDE_ORDER.indexOf(right));
  return Math.min(difference, SIDE_ORDER.length - difference);
}

export function sideAxisSize(card: CardArea, side: CardSide): number {
  return side === "left" || side === "right" ? card.height : card.width;
}

export function normalizedSideLoad(load: number, side: CardSide, bounds: CardLayoutBounds): number {
  const capacity = side === "left" || side === "right"
    ? bounds.height - bounds.margin * 2
    : bounds.width - bounds.margin * 2;
  return capacity > EPSILON ? load / capacity : load;
}

export function sameAnchorCluster(left: CardLayoutInput, right: CardLayoutInput): boolean {
  const tolerance = Math.max(24, Math.min(left.width, left.height, right.width, right.height) * 0.35);
  return Math.hypot(left.anchorX - right.anchorX, left.anchorY - right.anchorY) <= tolerance;
}

/**
 * Crossing connectors are a hard constraint whenever the caller declares a
 * connector style; without one there is no line to cross.
 */
export function crossingsEnforced(options: CardLayoutOptions): boolean {
  return options.forbidConnectorCrossing !== false && options.connectorStyle !== undefined;
}

/** Clearance used when comparing two connectors, shared by scoring and repair. */
export function connectorClearance(options: CardLayoutOptions): number {
  return Math.max(0, options.connectorWidth ?? 1.5);
}

export function countConnectorCrossings(
  placements: CardPlacement[],
  style: ConnectorStyle,
  clearance: number,
): number {
  const geometries = placements.map((placement) => placementGeometry(placement, style));
  const geometryBounds = geometries.map(connectorBounds);
  let crossings = 0;
  for (let left = 0; left < geometries.length; left += 1) {
    for (let right = left + 1; right < geometries.length; right += 1) {
      if (connectorIntersects(
        geometries[left]!,
        geometryBounds[left]!,
        geometries[right]!,
        geometryBounds[right]!,
        clearance,
      )) crossings += 1;
    }
  }
  return crossings;
}
