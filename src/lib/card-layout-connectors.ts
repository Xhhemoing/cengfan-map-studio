/**
 * Connector-aware predicates shared by the candidate builder and the layout
 * scorer. Everything here reasons about the *rendered* leader line, so layout
 * decisions and the canvas agree on what "crossing" means.
 */
import { boundsTouch } from "./card-layout-geometry";
import type { LayoutSpace } from "./card-layout-space";
import type { CardArea, CardLayoutInput, CardPoint } from "./card-layout-types";
import {
  connectorGeometriesIntersect,
  segmentIntersectsRect,
  type ConnectorGeometry,
} from "./connector-geometry";

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

/** Two leader lines closer than `clearance`; AABBs prune the segment test. */
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
 * A leader line that runs through another card's body. `geometryBounds` is the
 * line's cached AABB; recomputing it here would walk every curve sample on a
 * test whose whole job is to reject cheaply.
 */
export function connectorHitsCard(
  geometry: ConnectorGeometry,
  geometryBounds: CardArea,
  card: CardArea,
  clearance: number,
): boolean {
  return boundsTouch(geometryBounds, card, clearance)
    && geometry.segments.some((segment) => segmentIntersectsRect(segment, card, clearance));
}

/**
 * How many provinces a leader line crosses. The province the line starts from
 * is exempt: it always has to leave its own anchor.
 */
export function connectorMapIntersections(
  geometry: ConnectorGeometry,
  anchor: CardPoint,
  space: LayoutSpace,
): number {
  return space.polygonCrossings(geometry.segments, anchor);
}

/**
 * Cards whose anchors are effectively the same province. Splitting such a
 * cluster across sides reads as a mistake, so the scorer penalises it.
 */
export function sameAnchorCluster(left: CardLayoutInput, right: CardLayoutInput): boolean {
  const tolerance = Math.max(24, Math.min(left.width, left.height, right.width, right.height) * 0.35);
  return Math.hypot(left.anchorX - right.anchorX, left.anchorY - right.anchorY) <= tolerance;
}
