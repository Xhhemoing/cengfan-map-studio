/**
 * Polygon preprocessing and hit testing for the card layout solver.
 *
 * Polygon obstacles are re-tested thousands of times per solve (every grid probe
 * in `containFree`, every candidate rail in `buildCandidates`, every connector in
 * `connectorMapIntersections`). Rings are therefore flattened once into typed
 * coordinate arrays with per-ring bounding boxes, cached on the polygon object,
 * and every predicate below runs on those scalars with a broad-phase reject
 * first. `CardPolygon` itself is unchanged, so callers need no migration.
 */

import { segmentsCross } from "./connector-geometry";
import { clamp, EPSILON, type CardArea, type CardPolygon } from "./card-layout-types";

export interface PreparedRing {
  /** Flat `[x0, y0, x1, y1, ...]` coordinates of the ring. */
  points: Float64Array;
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PreparedPolygon {
  rings: PreparedRing[];
  /** `null` for rings that cannot enclose an area (matches the legacy guard). */
  bounds: CardArea | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const preparedPolygons = new WeakMap<CardPolygon, PreparedPolygon>();

export function preparePolygon(polygon: CardPolygon): PreparedPolygon {
  const cached = preparedPolygons.get(polygon);
  if (cached) return cached;
  const rings: PreparedRing[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let total = 0;
  for (const ring of polygon.rings) {
    const count = ring.length;
    const points = new Float64Array(count * 2);
    let ringMinX = Infinity;
    let ringMinY = Infinity;
    let ringMaxX = -Infinity;
    let ringMaxY = -Infinity;
    for (let index = 0; index < count; index += 1) {
      const point = ring[index]!;
      points[index * 2] = point.x;
      points[index * 2 + 1] = point.y;
      if (point.x < ringMinX) ringMinX = point.x;
      if (point.x > ringMaxX) ringMaxX = point.x;
      if (point.y < ringMinY) ringMinY = point.y;
      if (point.y > ringMaxY) ringMaxY = point.y;
    }
    total += count;
    if (ringMinX < minX) minX = ringMinX;
    if (ringMinY < minY) minY = ringMinY;
    if (ringMaxX > maxX) maxX = ringMaxX;
    if (ringMaxY > maxY) maxY = ringMaxY;
    rings.push({ points, count, minX: ringMinX, minY: ringMinY, maxX: ringMaxX, maxY: ringMaxY });
  }
  const bounds = polygon.bounds
    ?? (total >= 3 ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null);
  const prepared: PreparedPolygon = {
    rings,
    bounds,
    minX: bounds ? bounds.x : minX,
    minY: bounds ? bounds.y : minY,
    maxX: bounds ? bounds.x + bounds.width : maxX,
    maxY: bounds ? bounds.y + bounds.height : maxY,
  };
  preparedPolygons.set(polygon, prepared);
  return prepared;
}

/** Winding/on-edge test for one flattened ring. */
function ringContains(ring: PreparedRing, x: number, y: number): boolean {
  const { points, count } = ring;
  let inside = false;
  for (let index = 0, previous = count - 1; index < count; previous = index, index += 1) {
    const startX = points[previous * 2]!;
    const startY = points[previous * 2 + 1]!;
    const endX = points[index * 2]!;
    const endY = points[index * 2 + 1]!;
    if (Math.abs((endX - startX) * (y - startY) - (endY - startY) * (x - startX)) <= EPSILON
      && x >= Math.min(startX, endX) - EPSILON
      && x <= Math.max(startX, endX) + EPSILON
      && y >= Math.min(startY, endY) - EPSILON
      && y <= Math.max(startY, endY) + EPSILON) return true;
    if ((startY > y) !== (endY > y)) {
      if (startX + (y - startY) * (endX - startX) / (endY - startY) >= x - EPSILON) inside = !inside;
    }
  }
  return inside;
}

export function preparedContainsPoint(prepared: PreparedPolygon, x: number, y: number): boolean {
  const shell = prepared.rings[0];
  if (!shell || !ringContains(shell, x, y)) return false;
  for (let index = 1; index < prepared.rings.length; index += 1) {
    if (ringContains(prepared.rings[index]!, x, y)) return false;
  }
  return true;
}

export function polygonBounds(polygon: CardPolygon): CardArea | null {
  return preparePolygon(polygon).bounds;
}

/** Does any ring edge cross the axis-aligned rectangle's outline? */
function preparedCrossesRectangleEdges(
  prepared: PreparedPolygon,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  for (const ring of prepared.rings) {
    if (ring.count === 0) continue;
    if (ring.maxX < minX - EPSILON || ring.minX > maxX + EPSILON
      || ring.maxY < minY - EPSILON || ring.minY > maxY + EPSILON) continue;
    const { points, count } = ring;
    let ax = points[(count - 1) * 2]!;
    let ay = points[(count - 1) * 2 + 1]!;
    for (let index = 0; index < count; index += 1) {
      // Legacy pairing walked (ring[i], ring[i + 1]); rotating the cursor keeps
      // the same edge set while reading each coordinate once.
      const bx = ax;
      const by = ay;
      ax = points[index * 2]!;
      ay = points[index * 2 + 1]!;
      if (Math.max(ax, bx) < minX - EPSILON || Math.min(ax, bx) > maxX + EPSILON
        || Math.max(ay, by) < minY - EPSILON || Math.min(ay, by) > maxY + EPSILON) continue;
      if (segmentsCross(ax, ay, bx, by, minX, minY, maxX, minY)
        || segmentsCross(ax, ay, bx, by, maxX, minY, maxX, maxY)
        || segmentsCross(ax, ay, bx, by, maxX, maxY, minX, maxY)
        || segmentsCross(ax, ay, bx, by, minX, maxY, minX, minY)) return true;
    }
  }
  return false;
}

export function preparedIntersectsRectangle(
  prepared: PreparedPolygon,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  if (!prepared.bounds) return false;
  if (!(minX < prepared.maxX && maxX > prepared.minX && minY < prepared.maxY && maxY > prepared.minY)) {
    return false;
  }
  const shell = prepared.rings[0];
  if (shell && shell.maxX >= minX - EPSILON && shell.minX <= maxX + EPSILON
    && shell.maxY >= minY - EPSILON && shell.minY <= maxY + EPSILON) {
    const { points, count } = shell;
    for (let index = 0; index < count; index += 1) {
      const x = points[index * 2]!;
      const y = points[index * 2 + 1]!;
      if (x >= minX - EPSILON && x <= maxX + EPSILON && y >= minY - EPSILON && y <= maxY + EPSILON) return true;
    }
  }
  if (preparedCrossesRectangleEdges(prepared, minX, minY, maxX, maxY)) return true;
  return preparedContainsPoint(prepared, minX, minY)
    || preparedContainsPoint(prepared, maxX, minY)
    || preparedContainsPoint(prepared, maxX, maxY)
    || preparedContainsPoint(prepared, minX, maxY);
}

export function rectangleIntersectsPolygon(card: CardArea, polygon: CardPolygon, gap: number): boolean {
  return preparedIntersectsRectangle(
    preparePolygon(polygon),
    card.x - gap,
    card.y - gap,
    card.x + card.width + gap,
    card.y + card.height + gap,
  );
}

/**
 * Uniform-grid broad phase over polygon bounding boxes. A saturated poster
 * carries one polygon per projected province ring (100+ on a China map) and
 * every probe used to test all of them; bucketing turns that into a handful of
 * candidates per query.
 */
interface PolygonIndex {
  prepared: PreparedPolygon[];
  columns: number;
  rows: number;
  originX: number;
  originY: number;
  cellWidth: number;
  cellHeight: number;
  buckets: Int32Array[];
  visited: Int32Array;
  epoch: number;
}

const polygonIndexes = new WeakMap<readonly CardPolygon[], PolygonIndex>();

function buildPolygonIndex(polygons: readonly CardPolygon[]): PolygonIndex {
  const prepared = polygons.map(preparePolygon);
  let originX = Infinity;
  let originY = Infinity;
  let extentX = -Infinity;
  let extentY = -Infinity;
  for (const polygon of prepared) {
    if (!polygon.bounds) continue;
    if (polygon.minX < originX) originX = polygon.minX;
    if (polygon.minY < originY) originY = polygon.minY;
    if (polygon.maxX > extentX) extentX = polygon.maxX;
    if (polygon.maxY > extentY) extentY = polygon.maxY;
  }
  const axis = Math.max(1, Math.min(48, Math.ceil(Math.sqrt(prepared.length))));
  const finite = Number.isFinite(originX) && Number.isFinite(originY)
    && Number.isFinite(extentX) && Number.isFinite(extentY);
  const columns = finite ? axis : 1;
  const rows = finite ? axis : 1;
  const cellWidth = finite ? Math.max(EPSILON, (extentX - originX) / columns) : 1;
  const cellHeight = finite ? Math.max(EPSILON, (extentY - originY) / rows) : 1;
  const lists: number[][] = Array.from({ length: columns * rows }, () => []);
  for (let index = 0; index < prepared.length; index += 1) {
    const polygon = prepared[index]!;
    if (!polygon.bounds || !finite) {
      for (const list of lists) list.push(index);
      continue;
    }
    const minColumn = clamp(Math.floor((polygon.minX - originX) / cellWidth), 0, columns - 1);
    const maxColumn = clamp(Math.floor((polygon.maxX - originX) / cellWidth), 0, columns - 1);
    const minRow = clamp(Math.floor((polygon.minY - originY) / cellHeight), 0, rows - 1);
    const maxRow = clamp(Math.floor((polygon.maxY - originY) / cellHeight), 0, rows - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        lists[row * columns + column]!.push(index);
      }
    }
  }
  return {
    prepared,
    columns,
    rows,
    originX: finite ? originX : 0,
    originY: finite ? originY : 0,
    cellWidth,
    cellHeight,
    buckets: lists.map((list) => Int32Array.from(list)),
    visited: new Int32Array(prepared.length),
    epoch: 0,
  };
}

function polygonIndexFor(polygons: readonly CardPolygon[]): PolygonIndex {
  const cached = polygonIndexes.get(polygons);
  if (cached) return cached;
  const built = buildPolygonIndex(polygons);
  polygonIndexes.set(polygons, built);
  return built;
}

export function polygonsHitRectangle(
  polygons: readonly CardPolygon[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  if (polygons.length === 0) return false;
  if (polygons.length <= 4) {
    for (const polygon of polygons) {
      if (preparedIntersectsRectangle(preparePolygon(polygon), minX, minY, maxX, maxY)) return true;
    }
    return false;
  }
  const index = polygonIndexFor(polygons);
  const minColumn = clamp(Math.floor((minX - index.originX) / index.cellWidth), 0, index.columns - 1);
  const maxColumn = clamp(Math.floor((maxX - index.originX) / index.cellWidth), 0, index.columns - 1);
  const minRow = clamp(Math.floor((minY - index.originY) / index.cellHeight), 0, index.rows - 1);
  const maxRow = clamp(Math.floor((maxY - index.originY) / index.cellHeight), 0, index.rows - 1);
  index.epoch += 1;
  const epoch = index.epoch;
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (const candidate of index.buckets[row * index.columns + column]!) {
        if (index.visited[candidate] === epoch) continue;
        index.visited[candidate] = epoch;
        if (preparedIntersectsRectangle(index.prepared[candidate]!, minX, minY, maxX, maxY)) return true;
      }
    }
  }
  return false;
}
