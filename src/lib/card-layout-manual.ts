/**
 * Manual (dragged) card placement.
 *
 * Auto-layout owns where cards go by default; this module only guarantees that
 * a human-chosen position stays legal — inside the canvas margin and off real
 * occupied geography. Map-frame whitespace stays coverable.
 */
import {
  clamp,
  overlaps,
  polygonBounds,
  rectangleIntersectsPolygon,
} from "./card-layout-geometry";
import { normalizeBounds, protectedZones } from "./card-layout-space";
import { EPSILON, type CardArea, type CardLayoutBounds } from "./card-layout-types";

export function clampCardPosition(
  position: { x: number; y: number; width: number; height: number },
  rawBounds: CardLayoutBounds,
): { x: number; y: number } {
  const bounds = normalizeBounds(rawBounds);
  const blockers = bounds.allowMapOverlap
    ? [...(bounds.occupiedAreas ?? [])]
    : [...protectedZones(bounds)];
  const polygons = bounds.allowMapOverlap ? [] : (bounds.occupiedPolygons ?? []);
  const polygonAreas = polygons.map((polygon) => polygonBounds(polygon));
  const width = Math.max(0, position.width);
  const height = Math.max(0, position.height);
  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin - width;
  const maxY = bounds.height - bounds.margin - height;
  const origin = {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
  const isFree = (x: number, y: number) => {
    const card = { x, y, width, height };
    return !blockers.some((blocker) => overlaps(card, blocker))
      && !polygons.some((polygon, index) => rectangleIntersectsPolygon(card, polygon, 0, polygonAreas[index]));
  };
  if (isFree(origin.x, origin.y)) return origin;

  const xCandidates = new Set([origin.x, minX, maxX]);
  const yCandidates = new Set([origin.y, minY, maxY]);
  const addRectCandidates = (rect: CardArea) => {
    xCandidates.add(clamp(rect.x - width, minX, maxX));
    xCandidates.add(clamp(rect.x + rect.width, minX, maxX));
    yCandidates.add(clamp(rect.y - height, minY, maxY));
    yCandidates.add(clamp(rect.y + rect.height, minY, maxY));
  };
  for (const blocker of blockers) addRectCandidates(blocker);
  for (const area of polygonAreas) {
    if (area) addRectCandidates(area);
  }

  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xCandidates) {
    for (const y of yCandidates) {
      if (!isFree(x, y)) continue;
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (distance < bestDistance - EPSILON
        || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best ?? origin;
}
