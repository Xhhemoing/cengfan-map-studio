/**
 * Manual (dragged) card placement.
 *
 * Auto-layout owns where cards go by default; this module only guarantees that
 * a human-chosen position stays legal — inside the canvas margin and off real
 * occupied geography. Map-frame whitespace stays coverable.
 *
 * This runs once per pointer-move frame, so the search is written to finish in
 * roughly the number of positions a human would actually consider rather than
 * in the number the geometry technically admits.
 */
import {
  clamp,
  finiteOr,
  overlaps,
  polygonBounds,
  rectangleIntersectsPolygon,
} from "./card-layout-geometry";
import { normalizeBounds, protectedZones, RectIndex } from "./card-layout-space";
import {
  EPSILON,
  type CardArea,
  type CardLayoutBounds,
  type CardPolygon,
} from "./card-layout-types";

/**
 * Ceiling on positions tested per call.
 *
 * A full-detail province map contributes two candidate coordinates per outline
 * part on each axis, and their product runs to hundreds of thousands of pairs —
 * far more than a drag frame can afford. The scan below visits them nearest
 * first and prunes everything the incumbent already beats, so it normally stops
 * after a few dozen; the budget only bites when the canvas is so covered that
 * no free position exists near the pointer, and there the honest answer is the
 * pointer's own clamped position anyway.
 */
const MAX_PROBES = 4096;

/**
 * Polygon AABBs, memoized per polygon object.
 *
 * A drag rebuilds the bounds object on every frame but keeps handing back the
 * same province outlines, and recomputing an AABB walks every ring point. The
 * outlines are derived, immutable projection output, so caching on identity is
 * safe — the same assumption {@link polygonBounds} already makes about its own
 * `bounds` field.
 */
const cachedBounds = new WeakMap<CardPolygon, CardArea | null>();

function boundsOf(polygon: CardPolygon): CardArea | null {
  const known = cachedBounds.get(polygon);
  if (known !== undefined) return known;
  const area = polygonBounds(polygon);
  cachedBounds.set(polygon, area);
  return area;
}

/** A rectangle that rejects a card, plus the outline to test it against. */
interface Obstacle {
  area: CardArea;
  /** `null` for plain rectangles, where the AABB test is already exact. */
  polygon: CardPolygon | null;
}

function collectObstacles(bounds: CardLayoutBounds): Obstacle[] {
  const rectangles = bounds.allowMapOverlap ? (bounds.occupiedAreas ?? []) : protectedZones(bounds);
  const obstacles: Obstacle[] = rectangles.map((area) => ({ area, polygon: null }));
  if (bounds.allowMapOverlap) return obstacles;
  for (const polygon of bounds.occupiedPolygons ?? []) {
    const area = boundsOf(polygon);
    // A polygon with no finite AABB can never reject anything, and dropping it
    // here also keeps it from contributing candidate coordinates.
    if (area) obstacles.push({ area, polygon });
  }
  return obstacles;
}

export function clampCardPosition(
  position: { x: number; y: number; width: number; height: number },
  rawBounds: CardLayoutBounds,
): { x: number; y: number } {
  const bounds = normalizeBounds(rawBounds);
  const width = Math.max(0, finiteOr(position.width, 0));
  const height = Math.max(0, finiteOr(position.height, 0));
  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin - width;
  const maxY = bounds.height - bounds.margin - height;
  const origin = {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };

  const obstacles = collectObstacles(bounds);
  // Grid cell sized like the solver's: a card touches a handful of cells, so a
  // probe tests the obstacles beside it rather than every province on the map.
  const index = new RectIndex<Obstacle>(clamp(Math.max(bounds.width, bounds.height) / 12, 48, 320));
  for (const obstacle of obstacles) index.insert(obstacle.area, obstacle);

  const probe: CardArea = { x: 0, y: 0, width, height };
  const rejects = (obstacle: Obstacle, area: CardArea): boolean => overlaps(probe, area)
    && (obstacle.polygon === null || rectangleIntersectsPolygon(probe, obstacle.polygon, 0, area));
  const isFree = (x: number, y: number): boolean => {
    probe.x = x;
    probe.y = y;
    return index.find(probe, 0, rejects) === null;
  };
  if (isFree(origin.x, origin.y)) return origin;

  const xCandidates = new Set([origin.x, minX, maxX]);
  const yCandidates = new Set([origin.y, minY, maxY]);
  for (const { area } of obstacles) {
    xCandidates.add(clamp(area.x - width, minX, maxX));
    xCandidates.add(clamp(area.x + area.width, minX, maxX));
    yCandidates.add(clamp(area.y - height, minY, maxY));
    yCandidates.add(clamp(area.y + area.height, minY, maxY));
  }
  // Nearest first on each axis, so the first free position found bounds the
  // search: every later candidate is further away and can be skipped outright.
  const xs = [...xCandidates].sort((left, right) => Math.abs(left - origin.x) - Math.abs(right - origin.x) || left - right);
  const ys = [...yCandidates].sort((left, right) => Math.abs(left - origin.y) - Math.abs(right - origin.y) || left - right);

  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  let probes = 0;
  for (const x of xs) {
    const dx = (x - origin.x) ** 2;
    if (dx > bestDistance + EPSILON) break;
    for (const y of ys) {
      const distance = dx + (y - origin.y) ** 2;
      if (distance > bestDistance + EPSILON) break;
      probes += 1;
      if (probes > MAX_PROBES) return best ?? origin;
      if (!isFree(x, y)) continue;
      if (distance < bestDistance - EPSILON
        || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best ?? origin;
}
