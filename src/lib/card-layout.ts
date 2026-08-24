/**
 * Card auto-layout for the 蹭饭图 poster.
 *
 * A compact, deterministic replacement for the previous OPRL backtracking
 * solver. Inspired by uni.utities.online/map-creator's four-quadrant isotonic
 * packing, extended with our province-AABB obstacle avoidance and four
 * selectable layout modes.
 *
 * Hard constraints (every mode, every result):
 *   1. Every card stays inside the canvas margin.
 *   2. Cards never overlap (with `gap`).
 *   3. Cards never overlap protected `occupiedAreas`; map overlap is opt-in.
 *   4. The solver never throws; saturation degrades to a contained grid.
 *
 * Soft goals: keep each card near its geographic anchor; deterministic output.
 */

import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  segmentIntersectsRect,
  segmentsCross,
  type ConnectorGeometry,
  type ConnectorStyle,
} from "./connector-geometry";

export type CardSide = "left" | "right" | "top" | "bottom";
export type CardLayoutMode = "quadrant" | "radial" | "right-stack" | "grid";

export interface CardLayoutInput {
  id: string;
  /** Anchor in canvas pixels (projected province center). */
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

export interface CardArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardPoint {
  x: number;
  y: number;
}

/** One projected geographic polygon. The first ring is the shell; later rings are holes. */
export interface CardPolygon {
  rings: CardPoint[][];
  bounds?: CardArea;
}

export interface CardLayoutBounds {
  width: number;
  height: number;
  /** Actual geographic content rect in canvas pixels (province union or image alignment). */
  map: CardArea;
  margin: number;
  gap: number;
  /** Protected canvas areas. Falls back to the map frame when absent. */
  occupiedAreas?: CardArea[];
  /** Projected province geometry used for pixel-accurate vector-map avoidance. */
  occupiedPolygons?: CardPolygon[];
  /** Allow cards to overlap map geometry while preserving other occupied areas. */
  allowMapOverlap?: boolean;
}

export interface CardPlacement extends CardLayoutInput {
  x: number;
  y: number;
  side: CardSide;
}

export type CardLayoutStatus = "solved" | "fallback";

export interface CardLayoutOptions {
  mode?: CardLayoutMode;
  /** Optimize the left/right split line to equalize column heights (quadrant only). */
  autoBalance?: boolean;
  /** Override the vertical band that routes cards to top/bottom instead of left/right. */
  topBottomBandRatio?: number;
  /** Connector geometry used by both layout scoring and the renderer. */
  connectorStyle?: ConnectorStyle;
  /** Clearance used while comparing connector geometry. */
  connectorWidth?: number;
  /** @deprecated no backtracking budget anymore; accepted for back-compat. */
  searchBudget?: number;
}

export interface CardLayoutResult {
  status: CardLayoutStatus;
  placements: CardPlacement[];
  mode: CardLayoutMode;
}

const EPSILON = 1e-7;
const MIN_GAP = 4;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function overlaps(a: CardArea, b: CardArea, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

/*
 * Polygon obstacles are re-tested thousands of times per solve (every grid probe
 * in `containFree`, every candidate rail in `buildCandidates`, every connector in
 * `connectorMapIntersections`). Rings are therefore flattened once into typed
 * coordinate arrays with per-ring bounding boxes, cached on the polygon object,
 * and every predicate below runs on those scalars with a broad-phase reject
 * first. `CardPolygon` itself is unchanged, so callers need no migration.
 */

interface PreparedRing {
  /** Flat `[x0, y0, x1, y1, ...]` coordinates of the ring. */
  points: Float64Array;
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PreparedPolygon {
  rings: PreparedRing[];
  /** `null` for rings that cannot enclose an area (matches the legacy guard). */
  bounds: CardArea | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const preparedPolygons = new WeakMap<CardPolygon, PreparedPolygon>();

function preparePolygon(polygon: CardPolygon): PreparedPolygon {
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

/** Winding/​on-edge test for one flattened ring. */
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

function preparedContainsPoint(prepared: PreparedPolygon, x: number, y: number): boolean {
  const shell = prepared.rings[0];
  if (!shell || !ringContains(shell, x, y)) return false;
  for (let index = 1; index < prepared.rings.length; index += 1) {
    if (ringContains(prepared.rings[index]!, x, y)) return false;
  }
  return true;
}

function polygonBounds(polygon: CardPolygon): CardArea | null {
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

function preparedIntersectsRectangle(
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

function rectangleIntersectsPolygon(card: CardArea, polygon: CardPolygon, gap: number): boolean {
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

function polygonsHitRectangle(
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

function centerOf(area: CardArea): { x: number; y: number } {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

const derivedZones = new WeakMap<CardLayoutBounds, CardArea[]>();
const NO_ZONES: CardArea[] = [];

function protectedZones(bounds: CardLayoutBounds): CardArea[] {
  if (bounds.occupiedAreas !== undefined) return bounds.occupiedAreas;
  if (bounds.occupiedPolygons && bounds.occupiedPolygons.length) return NO_ZONES;
  if (bounds.allowMapOverlap) return NO_ZONES;
  const cached = derivedZones.get(bounds);
  if (cached) return cached;
  const zones = [bounds.map];
  derivedZones.set(bounds, zones);
  return zones;
}

function isInsideCanvas(card: CardArea, bounds: CardLayoutBounds): boolean {
  return card.x >= bounds.margin - EPSILON
    && card.y >= bounds.margin - EPSILON
    && card.x + card.width <= bounds.width - bounds.margin + EPSILON
    && card.y + card.height <= bounds.height - bounds.margin + EPSILON;
}

function hitsProtected(card: CardArea, bounds: CardLayoutBounds): boolean {
  const gap = bounds.gap;
  for (const zone of protectedZones(bounds)) {
    if (overlaps(card, zone, gap)) return true;
  }
  const polygons = bounds.occupiedPolygons;
  if (!polygons || polygons.length === 0) return false;
  return polygonsHitRectangle(
    polygons,
    card.x - gap,
    card.y - gap,
    card.x + card.width + gap,
    card.y + card.height + gap,
  );
}

function hitsPlaced(card: CardArea, placed: CardArea[], gap: number): boolean {
  for (const other of placed) {
    if (overlaps(card, other, gap)) return true;
  }
  return false;
}

/**
 * Uniform-grid broad phase over a fixed set of placed cards. Built once per
 * repair scan so the 12px probe grid stops rescanning every prior placement.
 */
interface RectIndex {
  hits(x: number, y: number, width: number, height: number, gap: number): boolean;
}

function buildRectIndex(rects: readonly CardArea[], bounds: CardLayoutBounds): RectIndex {
  if (rects.length < 12) {
    return {
      hits(x, y, width, height, gap) {
        for (const other of rects) {
          if (x < other.x + other.width + gap
            && x + width + gap > other.x
            && y < other.y + other.height + gap
            && y + height + gap > other.y) return true;
        }
        return false;
      },
    };
  }
  const axis = Math.max(1, Math.min(48, Math.ceil(Math.sqrt(rects.length))));
  const cellWidth = Math.max(1, bounds.width / axis);
  const cellHeight = Math.max(1, bounds.height / axis);
  const lists: number[][] = Array.from({ length: axis * axis }, () => []);
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]!;
    const minColumn = clamp(Math.floor(rect.x / cellWidth), 0, axis - 1);
    const maxColumn = clamp(Math.floor((rect.x + rect.width) / cellWidth), 0, axis - 1);
    const minRow = clamp(Math.floor(rect.y / cellHeight), 0, axis - 1);
    const maxRow = clamp(Math.floor((rect.y + rect.height) / cellHeight), 0, axis - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        lists[row * axis + column]!.push(index);
      }
    }
  }
  const buckets = lists.map((list) => Int32Array.from(list));
  const visited = new Int32Array(rects.length);
  let epoch = 0;
  return {
    hits(x, y, width, height, gap) {
      const minColumn = clamp(Math.floor((x - gap) / cellWidth), 0, axis - 1);
      const maxColumn = clamp(Math.floor((x + width + gap) / cellWidth), 0, axis - 1);
      const minRow = clamp(Math.floor((y - gap) / cellHeight), 0, axis - 1);
      const maxRow = clamp(Math.floor((y + height + gap) / cellHeight), 0, axis - 1);
      epoch += 1;
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          for (const candidate of buckets[row * axis + column]!) {
            if (visited[candidate] === epoch) continue;
            visited[candidate] = epoch;
            const other = rects[candidate]!;
            if (x < other.x + other.width + gap
              && x + width + gap > other.x
              && y < other.y + other.height + gap
              && y + height + gap > other.y) return true;
          }
        }
      }
      return false;
    },
  };
}

/**
 * Forward + backward order-preserving 1D packing (isotonic).
 * Cards keep their sort order; positions are pushed apart to avoid overlap,
 * compressed if they overflow the available span, then centered as a block.
 *
 * `targets[i]` is the preferred primary coordinate for card i (already sorted
 * along the side axis). Returns the final primary coordinate for each card.
 */
function isotonicPack(
  targets: number[],
  sizes: number[],
  gap: number,
  span: { start: number; end: number },
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  const total = sizes.reduce((sum, s) => sum + s, 0) + gap * (n - 1);
  let g = gap;
  // Compress gap if the chain overflows the span (preserve card sizes).
  if (n > 1 && total > span.end - span.start) {
    g = Math.max(MIN_GAP, (span.end - span.start - sizes.reduce((s, x) => s + x, 0)) / (n - 1));
  }

  const pos = targets.slice();
  // Forward: push each card below the previous one's tail.
  for (let i = 1; i < n; i += 1) {
    const minStart = pos[i - 1]! + sizes[i - 1]! + g;
    if (pos[i]! < minStart) pos[i] = minStart;
  }
  // Backward: push each card above the next one's head.
  for (let i = n - 2; i >= 0; i -= 1) {
    const maxStart = pos[i + 1]! - sizes[i]! - g;
    if (pos[i]! > maxStart) pos[i] = maxStart;
  }
  // Clamp into span, then center the whole block.
  for (let i = 0; i < n; i += 1) {
    pos[i] = clamp(pos[i]!, span.start, Math.max(span.start, span.end - sizes[i]!));
  }
  const first = pos[0]!;
  const last = pos[n - 1]! + sizes[n - 1]!;
  const blockStart = first;
  const blockEnd = last;
  const mid = (span.start + span.end) / 2;
  const blockMid = (blockStart + blockEnd) / 2;
  let shift = mid - blockMid;
  // Keep the shifted block inside the span.
  if (blockStart + shift < span.start) shift = span.start - blockStart;
  if (blockEnd + shift > span.end) shift = span.end - blockEnd;
  for (let i = 0; i < n; i += 1) pos[i] = pos[i]! + shift;
  return pos;
}

interface SideAssignment {
  side: CardSide;
  cards: CardLayoutInput[];
}

/** Vertical band (top/bottom) height as a fraction of the content height. */
function bandRatio(options: CardLayoutOptions): number {
  const r = options.topBottomBandRatio;
  return Number.isFinite(r) && r! > 0 && r! < 0.5 ? r! : 0.28;
}

function classifyQuadrant(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions,
): SideAssignment[] {
  const content = bounds.map;
  const cx = options.autoBalance ? autoSplitX(cards, bounds) : content.x + content.width / 2;
  const bandH = content.height * bandRatio(options);
  const topMax = content.y + bandH;
  const bottomMin = content.y + content.height - bandH;
  const horizCenterMin = content.x + content.width * 0.3;
  const horizCenterMax = content.x + content.width * 0.7;

  const sides: Record<CardSide, CardLayoutInput[]> = { left: [], right: [], top: [], bottom: [] };
  for (const card of cards) {
    if (card.anchorY <= topMax && card.anchorX > horizCenterMin && card.anchorX < horizCenterMax) {
      sides.top.push(card);
    } else if (card.anchorY >= bottomMin && card.anchorX > horizCenterMin && card.anchorX < horizCenterMax) {
      sides.bottom.push(card);
    } else if (card.anchorX < cx) {
      sides.left.push(card);
    } else {
      sides.right.push(card);
    }
  }
  return (["left", "right", "top", "bottom"] as CardSide[]).map((side) => ({ side, cards: sides[side] }));
}

/**
 * Choose the vertical split line that minimizes the maximum of the left and
 * right column heights. Scans candidate split lines at the anchors' x values.
 */
function autoSplitX(cards: CardLayoutInput[], bounds: CardLayoutBounds): number {
  const content = bounds.map;
  if (cards.length <= 1) return content.x + content.width / 2;
  const xs = [...new Set(cards.map((c) => Math.round(c.anchorX)))].sort((a, b) => a - b);
  const candidates = [content.x + content.width / 2, ...xs, ...xs.map((x) => x + 1)];
  let best = content.x + content.width / 2;
  let bestCost = Infinity;
  for (const x of candidates) {
    if (x < content.x || x > content.x + content.width) continue;
    let leftH = 0;
    let rightH = 0;
    for (const card of cards) {
      if (card.anchorX < x) leftH += card.height + bounds.gap;
      else rightH += card.height + bounds.gap;
    }
    const cost = Math.max(leftH, rightH);
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

function classifyRadial(cards: CardLayoutInput[], bounds: CardLayoutBounds): SideAssignment[] {
  const c = centerOf(bounds.map);
  const sides: Record<CardSide, CardLayoutInput[]> = { left: [], right: [], top: [], bottom: [] };
  for (const card of cards) {
    const angle = Math.atan2(card.anchorY - c.y, card.anchorX - c.x);
    const deg = ((angle * 180) / Math.PI + 360) % 360;
    if (deg >= 315 || deg < 45) sides.right.push(card);
    else if (deg < 135) sides.bottom.push(card);
    else if (deg < 225) sides.left.push(card);
    else sides.top.push(card);
  }
  return (["left", "right", "top", "bottom"] as CardSide[]).map((side) => ({ side, cards: sides[side] }));
}

function classifyRightStack(cards: CardLayoutInput[]): SideAssignment[] {
  return [{ side: "right", cards }];
}

/** Primary-axis span for a side: the range along which cards are packed. */
function primarySpan(side: CardSide, bounds: CardLayoutBounds): { start: number; end: number } {
  if (side === "left" || side === "right") {
    return { start: bounds.margin, end: bounds.height - bounds.margin };
  }
  return { start: bounds.margin, end: bounds.width - bounds.margin };
}

/** Sort key along a side's primary axis (the axis cards slide along). */
function primaryKey(card: CardLayoutInput, side: CardSide): number {
  return side === "left" || side === "right" ? card.anchorY : card.anchorX;
}

/** Preferred normal (perpendicular) coordinate for a side, just outside content. */
function normalForSide(side: CardSide, bounds: CardLayoutBounds, card: CardLayoutInput): number {
  const m = bounds.map;
  if (side === "right") return m.x + m.width + bounds.gap;
  if (side === "left") return m.x - bounds.gap - card.width;
  if (side === "bottom") return m.y + m.height + bounds.gap;
  return m.y - bounds.gap - card.height;
}

function placeSide(
  assignment: SideAssignment,
  bounds: CardLayoutBounds,
  placed: CardPlacement[],
): CardPlacement[] {
  const { side, cards } = assignment;
  if (cards.length === 0) return [];
  const sorted = [...cards].sort((a, b) => primaryKey(a, side) - primaryKey(b, side));
  const span = primarySpan(side, bounds);
  const targets = sorted.map((c) => {
    const key = primaryKey(c, side);
    const size = side === "left" || side === "right" ? c.height : c.width;
    return clamp(key - size / 2, span.start, span.end - size);
  });
  const sizes = sorted.map((c) => (side === "left" || side === "right" ? c.height : c.width));
  const positions = isotonicPack(targets, sizes, bounds.gap, span);
  const result: CardPlacement[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const card = sorted[i]!;
    const normal = normalForSide(side, bounds, card);
    const x = side === "left" || side === "right" ? normal : positions[i]!;
    const y = side === "left" || side === "right" ? positions[i]! : normal;
    result.push({ ...card, x, y, side });
  }
  // Push cards outward to clear province AABBs and existing placements.
  return result.map((p) => resolveObstacles(p, bounds, placed));
}

/**
 * Move a single placement along its normal axis until it no longer overlaps
 * any province AABB or already-placed card. Keeps the primary coordinate.
 */
function resolveObstacles(
  placement: CardPlacement,
  bounds: CardLayoutBounds,
  placed: CardPlacement[],
): CardPlacement {
  let { x, y } = placement;
  const zones = protectedZones(bounds);
  const allPlaced = [...placed];
  for (let step = 0; step < 24; step += 1) {
    const cur: CardArea = { x, y, width: placement.width, height: placement.height };
    const hitZone = zones.find((z) => overlaps(cur, z, 0));
    const hitCard = allPlaced.some((o) => overlaps(cur, o, 0));
    if (!hitZone && !hitCard) break;
    const away = placement.side === "left" || placement.side === "top" ? -1 : 1;
    if (placement.side === "left" || placement.side === "right") {
      x = clamp(x + away * (bounds.gap + 4), bounds.margin, bounds.width - bounds.margin - placement.width);
    } else {
      y = clamp(y + away * (bounds.gap + 4), bounds.margin, bounds.height - bounds.margin - placement.height);
    }
  }
  return { ...placement, x, y };
}

/** Greedy containment repair: nudge a placement into a free spot, canvas-first. */
function containFree(placement: CardPlacement, bounds: CardLayoutBounds, placed: CardPlacement[]): CardPlacement {
  if (isInsideCanvas(placement, bounds) && !hitsProtected(placement, bounds) && !hitsPlaced(placement, placed, bounds.gap)) {
    return placement;
  }
  const step = 12;
  // Scan a fine grid of candidate anchors, keeping the nearest free one to the
  // original probe so the card lands close to its preferred region. Distance is
  // compared squared and checked *before* any collision test, so once a free
  // spot is known every farther probe (and every farther row) is skipped
  // outright instead of paying for polygon and placement tests.
  const ox = placement.x;
  const oy = placement.y;
  const maxRx = bounds.width - bounds.margin - placement.width;
  const maxRy = bounds.height - bounds.margin - placement.height;
  const occupied = buildRectIndex(placed, bounds);
  const probe: CardArea = { x: 0, y: 0, width: placement.width, height: placement.height };
  let bestX = 0;
  let bestY = 0;
  let bestDistance = Infinity;
  let found = false;
  for (let ry = bounds.margin; ry <= maxRy; ry += step) {
    const dy = ry - oy;
    const rowDistance = dy * dy;
    if (rowDistance >= bestDistance) continue;
    for (let rx = bounds.margin; rx <= maxRx; rx += step) {
      const dx = rx - ox;
      const distance = dx * dx + rowDistance;
      if (!(distance < bestDistance)) continue;
      probe.x = rx;
      probe.y = ry;
      if (!isInsideCanvas(probe, bounds)) continue;
      if (hitsProtected(probe, bounds)) continue;
      if (occupied.hits(rx, ry, placement.width, placement.height, bounds.gap)) continue;
      bestDistance = distance;
      bestX = rx;
      bestY = ry;
      found = true;
    }
  }
  if (found) return { ...placement, x: bestX, y: bestY };
  // Last resort: stack at the margin along y, deduplicating so cards never
  // fully overlap. The card is guaranteed visible; overlaps here only happen
  // under total canvas saturation, reported as `fallback`.
  let y = bounds.margin;
  for (const p of placed) {
    if (p.x < bounds.margin + placement.width && p.y < y + placement.height && p.y + p.height > y) {
      y = p.y + p.height + bounds.gap;
    }
  }
  return { ...placement, x: bounds.margin, y: clamp(y, bounds.margin, bounds.height - bounds.margin - placement.height) };
}

function sideForPlacement(placement: CardArea, bounds: CardLayoutBounds): CardSide {
  const mapCenter = centerOf(bounds.map);
  const cardCenter = centerOf(placement);
  const horizontal = (cardCenter.x - mapCenter.x) / Math.max(1, bounds.map.width / 2);
  const vertical = (cardCenter.y - mapCenter.y) / Math.max(1, bounds.map.height / 2);
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

/**
 * Repack every card from an empty canvas when side packing leaves fragmented
 * holes. Candidate coordinates come from obstacle/card edges, so narrow but
 * valid tracks are not skipped by a fixed-step grid.
 */
function repackAll(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] | null {
  const indexed = cards.map((card, index) => ({ card, index }));
  const candidateOrders = [
    indexed,
    [...indexed].sort((a, b) => b.card.width * b.card.height - a.card.width * a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => Math.max(b.card.width, b.card.height) - Math.max(a.card.width, a.card.height) || a.index - b.index),
    [...indexed].sort((a, b) => b.card.height - a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => b.card.width - a.card.width || a.index - b.index),
  ];
  const zones = protectedZones(bounds);
  const seenOrders = new Set<string>();

  for (const order of candidateOrders) {
    const signature = order.map(({ index }) => index).join(",");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);
    const placed: Array<CardPlacement & { inputIndex: number }> = [];

    for (const { card, index } of order) {
      const maxX = bounds.width - bounds.margin - card.width;
      const maxY = bounds.height - bounds.margin - card.height;
      const xCandidates = new Set<number>([
        bounds.margin,
        maxX,
        clamp(card.anchorX - card.width / 2, bounds.margin, maxX),
      ]);
      const yCandidates = new Set<number>([
        bounds.margin,
        maxY,
        clamp(card.anchorY - card.height / 2, bounds.margin, maxY),
      ]);

      for (const area of [...zones, ...placed]) {
        xCandidates.add(area.x - bounds.gap - card.width);
        xCandidates.add(area.x);
        xCandidates.add(area.x + area.width - card.width);
        xCandidates.add(area.x + area.width + bounds.gap);
        yCandidates.add(area.y - bounds.gap - card.height);
        yCandidates.add(area.y);
        yCandidates.add(area.y + area.height - card.height);
        yCandidates.add(area.y + area.height + bounds.gap);
      }

      let best: (CardPlacement & { inputIndex: number }) | null = null;
      let bestDistance = Infinity;
      for (const x of xCandidates) {
        for (const y of yCandidates) {
          const area = { x, y, width: card.width, height: card.height };
          if (!isInsideCanvas(area, bounds) || hitsProtected(area, bounds) || hitsPlaced(area, placed, bounds.gap)) continue;
          const distance = (x + card.width / 2 - card.anchorX) ** 2 + (y + card.height / 2 - card.anchorY) ** 2;
          if (distance < bestDistance - EPSILON
            || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
            bestDistance = distance;
            best = { ...card, x, y, side: sideForPlacement(area, bounds), inputIndex: index };
          }
        }
      }
      if (!best) break;
      placed.push(best);
    }

    if (placed.length === cards.length) {
      return [...placed]
        .sort((a, b) => a.inputIndex - b.inputIndex)
        .map(({ inputIndex: _inputIndex, ...placement }) => placement);
    }
  }
  return null;
}

function layoutGrid(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] {
  if (cards.length === 0) return [];
  const maxW = Math.max(...cards.map((c) => c.width), 1);
  const maxH = Math.max(...cards.map((c) => c.height), 1);
  const cols = Math.max(1, Math.floor((bounds.width - bounds.margin * 2 + bounds.gap) / (maxW + bounds.gap)));
  const placed: CardPlacement[] = [];
  let col = 0;
  let row = 0;
  for (const card of cards) {
    let placedThis = false;
    for (let attempt = 0; attempt < cols * 40 && !placedThis; attempt += 1) {
      const x = bounds.margin + col * (maxW + bounds.gap);
      const y = bounds.margin + row * (maxH + bounds.gap);
      const side: CardSide = x + card.width / 2 >= bounds.map.x + bounds.map.width / 2 ? "right" : "left";
      const cand: CardPlacement = {
        ...card,
        x: clamp(x, bounds.margin, bounds.width - bounds.margin - card.width),
        y: clamp(y, bounds.margin, bounds.height - bounds.margin - card.height),
        side,
      };
      col += 1;
      if (col >= cols) { col = 0; row += 1; }
      if (!isInsideCanvas(cand, bounds)) continue;
      if (hitsProtected(cand, bounds)) continue;
      if (hitsPlaced(cand, placed, bounds.gap)) continue;
      placed.push(cand);
      placedThis = true;
    }
    if (!placedThis) {
      placed.push({ ...card, x: bounds.margin, y: bounds.margin, side: "left" });
    }
  }
  return placed;
}

function orderResult(cards: CardLayoutInput[], placements: CardPlacement[]): CardPlacement[] {
  // Keeps `find`'s first-match semantics for duplicate ids without the O(n²) scan.
  const byId = new Map<string, CardPlacement>();
  for (const placement of placements) {
    if (!byId.has(placement.id)) byId.set(placement.id, placement);
  }
  return cards.map((card) => byId.get(card.id)!);
}

function validateHard(placements: CardPlacement[], bounds: CardLayoutBounds): boolean {
  for (const card of placements) {
    if (!isInsideCanvas(card, bounds)) return false;
    if (hitsProtected(card, bounds)) return false;
  }
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (overlaps(placements[i]!, placements[j]!, bounds.gap)) return false;
    }
  }
  return true;
}

interface LayoutCandidate {
  placement: CardPlacement;
  geometry: ConnectorGeometry;
  geometryBounds: CardArea;
  mapIntersections: number;
  distance: number;
  sideDeviation: number;
}

const SIDE_ORDER: CardSide[] = ["top", "right", "bottom", "left"];
const MAX_OPTIMIZED_CARDS = 80;
const MAX_CANDIDATES_PER_SIDE = 36;
const DENSE_CANDIDATES_PER_SIDE = 12;
const MAX_RAILS_PER_AXIS = 14;

function connectorBounds(geometry: ConnectorGeometry): CardArea {
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

function boundsTouch(left: CardArea, right: CardArea, clearance: number): boolean {
  return left.x <= right.x + right.width + clearance
    && left.x + left.width + clearance >= right.x
    && left.y <= right.y + right.height + clearance
    && left.y + left.height + clearance >= right.y;
}

function connectorIntersects(
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

function connectorMapIntersections(
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

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return left.length - right.length;
}

function sideDistance(left: CardSide, right: CardSide): number {
  const difference = Math.abs(SIDE_ORDER.indexOf(left) - SIDE_ORDER.indexOf(right));
  return Math.min(difference, SIDE_ORDER.length - difference);
}

function sideAxisSize(card: CardArea, side: CardSide): number {
  return side === "left" || side === "right" ? card.height : card.width;
}

function normalizedSideLoad(load: number, side: CardSide, bounds: CardLayoutBounds): number {
  const capacity = side === "left" || side === "right"
    ? bounds.height - bounds.margin * 2
    : bounds.width - bounds.margin * 2;
  return capacity > EPSILON ? load / capacity : load;
}

function sameAnchorCluster(left: CardLayoutInput, right: CardLayoutInput): boolean {
  const tolerance = Math.max(24, Math.min(left.width, left.height, right.width, right.height) * 0.35);
  return Math.hypot(left.anchorX - right.anchorX, left.anchorY - right.anchorY) <= tolerance;
}

function homeSides(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): Map<string, CardSide> {
  const assignments = mode === "radial"
    ? classifyRadial(cards, bounds)
    : classifyQuadrant(cards, bounds, options);
  return new Map(assignments.flatMap(({ side, cards: assigned }) =>
    assigned.map((card) => [card.id, side] as const)));
}

function addRail(rails: Set<number>, value: number, minimum: number, maximum: number): void {
  if (Number.isFinite(value)) rails.add(clamp(value, minimum, maximum));
}

function nearestRails(rails: Set<number>, target: number): number[] {
  return [...rails]
    .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right)
    .slice(0, MAX_RAILS_PER_AXIS);
}

function buildCandidates(
  card: CardLayoutInput,
  allCards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  homeSide: CardSide,
  style: ConnectorStyle,
): LayoutCandidate[] {
  const maxX = bounds.width - bounds.margin - card.width;
  const maxY = bounds.height - bounds.margin - card.height;
  const preferredX = card.anchorX - card.width / 2;
  const preferredY = card.anchorY - card.height / 2;
  const xRails = new Set<number>();
  const yRails = new Set<number>();
  const zones = protectedZones(bounds);
  const map = bounds.map;

  for (const x of [
    bounds.margin,
    maxX,
    preferredX,
    map.x - bounds.gap - card.width,
    map.x,
    map.x + map.width - card.width,
    map.x + map.width + bounds.gap,
  ]) addRail(xRails, x, bounds.margin, maxX);
  for (const y of [
    bounds.margin,
    maxY,
    preferredY,
    map.y - bounds.gap - card.height,
    map.y,
    map.y + map.height - card.height,
    map.y + map.height + bounds.gap,
  ]) addRail(yRails, y, bounds.margin, maxY);

  for (const area of zones) {
    for (const x of [
      area.x - bounds.gap - card.width,
      area.x,
      area.x + area.width - card.width,
      area.x + area.width + bounds.gap,
    ]) addRail(xRails, x, bounds.margin, maxX);
    for (const y of [
      area.y - bounds.gap - card.height,
      area.y,
      area.y + area.height - card.height,
      area.y + area.height + bounds.gap,
    ]) addRail(yRails, y, bounds.margin, maxY);
  }
  for (const polygon of bounds.occupiedPolygons ?? []) {
    const area = polygonBounds(polygon);
    if (!area) continue;
    for (const x of [
      area.x - bounds.gap - card.width,
      area.x + area.width + bounds.gap,
    ]) addRail(xRails, x, bounds.margin, maxX);
    for (const y of [
      area.y - bounds.gap - card.height,
      area.y + area.height + bounds.gap,
    ]) addRail(yRails, y, bounds.margin, maxY);
  }
  for (const input of allCards) {
    addRail(xRails, input.anchorX - card.width / 2, bounds.margin, maxX);
    addRail(yRails, input.anchorY - card.height / 2, bounds.margin, maxY);
  }

  const candidateX = nearestRails(xRails, preferredX);
  const candidateY = nearestRails(yRails, preferredY);

  const raw = new Map<string, CardPlacement>();
  const addCandidate = (x: number, y: number) => {
    const area = {
      x: clamp(x, bounds.margin, maxX),
      y: clamp(y, bounds.margin, maxY),
      width: card.width,
      height: card.height,
    };
    if (!isInsideCanvas(area, bounds) || hitsProtected(area, bounds)) return;
    raw.set(`${area.x.toFixed(3)}:${area.y.toFixed(3)}`, {
      ...card,
      x: area.x,
      y: area.y,
      side: sideForPlacement(area, bounds),
    });
  };

  addCandidate(preferredX, preferredY);
  for (const x of candidateX) {
    addCandidate(x, preferredY);
    for (const y of candidateY) addCandidate(x, y);
  }
  for (const y of candidateY) {
    addCandidate(preferredX, y);
    for (const x of candidateX) addCandidate(x, y);
  }

  const placementsBySide = new Map<CardSide, CardPlacement[]>(
    SIDE_ORDER.map((side) => [side, []]),
  );
  for (const placement of raw.values()) {
    placementsBySide.get(placement.side)!.push(placement);
  }

  const candidateLimit = allCards.length > 36 ? DENSE_CANDIDATES_PER_SIDE : MAX_CANDIDATES_PER_SIDE;
  const candidatesBySide = new Map<CardSide, LayoutCandidate[]>(
    SIDE_ORDER.map((side) => [side, []]),
  );
  for (const side of SIDE_ORDER) {
    const shortlisted = placementsBySide.get(side)!
      .sort((left, right) => compareScores(
        [
          sideDistance(left.side, homeSide),
          Math.hypot(left.x + left.width / 2 - left.anchorX, left.y + left.height / 2 - left.anchorY),
          left.y,
          left.x,
        ],
        [
          sideDistance(right.side, homeSide),
          Math.hypot(right.x + right.width / 2 - right.anchorX, right.y + right.height / 2 - right.anchorY),
          right.y,
          right.x,
        ],
      ))
      .slice(0, candidateLimit);
    for (const placement of shortlisted) {
    const geometry = buildConnectorGeometry({
      card: placement,
      anchor: { x: card.anchorX, y: card.anchorY },
      preferredSide: placement.side,
      style,
    });
    const geometryBounds = connectorBounds(geometry);
    const candidate: LayoutCandidate = {
      placement,
      geometry,
      geometryBounds,
      mapIntersections: connectorMapIntersections(
        geometry,
        geometryBounds,
        { x: card.anchorX, y: card.anchorY },
        bounds.occupiedPolygons ?? [],
      ),
      distance: Math.hypot(
        placement.x + placement.width / 2 - placement.anchorX,
        placement.y + placement.height / 2 - placement.anchorY,
      ),
      sideDeviation: sideDistance(placement.side, homeSide),
    };
    candidatesBySide.get(placement.side)!.push(candidate);
    }
  }

  return SIDE_ORDER.flatMap((side) => candidatesBySide.get(side)!
    .sort((left, right) => compareScores(
      [left.mapIntersections, left.sideDeviation, left.distance, left.placement.y, left.placement.x],
      [right.mapIntersections, right.sideDeviation, right.distance, right.placement.y, right.placement.x],
    ))
    .slice(0, candidateLimit));
}

/**
 * Callers already carry the connector's bounding box (candidates cache it,
 * scoring precomputes it), so it is threaded in instead of recomputed per card.
 */
function connectorHitsCard(
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

function angularOrder(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardLayoutInput[] {
  const center = centerOf(bounds.map);
  return [...cards].sort((left, right) => {
    const leftAngle = Math.atan2(left.anchorY - center.y, left.anchorX - center.x);
    const rightAngle = Math.atan2(right.anchorY - center.y, right.anchorX - center.x);
    return leftAngle - rightAngle
      || Math.hypot(left.anchorX - center.x, left.anchorY - center.y)
        - Math.hypot(right.anchorX - center.x, right.anchorY - center.y)
      || left.id.localeCompare(right.id);
  });
}

function scoreLayout(
  placements: CardPlacement[],
  assignedSides: Map<string, CardSide>,
  style: ConnectorStyle,
  clearance: number,
  polygons: CardPolygon[],
  bounds: CardLayoutBounds,
): number[] {
  const geometries = placements.map((placement) => buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style,
  }));
  const geometryBounds = geometries.map(connectorBounds);
  let crossings = 0;
  let throughCards = 0;
  let throughMap = 0;
  let splitClusters = 0;
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      if (connectorIntersects(
        geometries[left]!,
        geometryBounds[left]!,
        geometries[right]!,
        geometryBounds[right]!,
        clearance,
      )) crossings += 1;
      if (connectorHitsCard(geometries[left]!, geometryBounds[left]!, placements[right]!, clearance)) throughCards += 1;
      if (connectorHitsCard(geometries[right]!, geometryBounds[right]!, placements[left]!, clearance)) throughCards += 1;
      if (sameAnchorCluster(placements[left]!, placements[right]!)
        && placements[left]!.side !== placements[right]!.side) splitClusters += 1;
    }
  }
  let sideDeviation = 0;
  let distance = 0;
  const sideLoads = new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0]));
  for (const placement of placements) {
    sideDeviation += sideDistance(placement.side, assignedSides.get(placement.id) ?? placement.side);
    distance += Math.hypot(
      placement.x + placement.width / 2 - placement.anchorX,
      placement.y + placement.height / 2 - placement.anchorY,
    );
    sideLoads.set(
      placement.side,
      sideLoads.get(placement.side)! + sideAxisSize(placement, placement.side) + bounds.gap,
    );
  }
  for (let index = 0; index < geometries.length; index += 1) {
    throughMap += connectorMapIntersections(
      geometries[index]!,
      geometryBounds[index]!,
      { x: placements[index]!.anchorX, y: placements[index]!.anchorY },
      polygons,
    );
  }
  const sideLoad = SIDE_ORDER.reduce((sum, side) => {
    const load = normalizedSideLoad(sideLoads.get(side)!, side, bounds);
    return sum + load * load;
  }, 0);
  return [splitClusters, crossings, throughCards, throughMap, sideDeviation, sideLoad, distance];
}

function optimizedLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): CardPlacement[] | null {
  const style = options.connectorStyle ?? "curve";
  const clearance = Math.max(0, options.connectorWidth ?? 1.5);
  const assignedSides = homeSides(cards, bounds, mode, options);
  const candidates = new Map(cards.map((card) => [
    card.id,
    buildCandidates(card, cards, bounds, assignedSides.get(card.id)!, style),
  ]));
  if ([...candidates.values()].some((items) => items.length === 0)) return null;

  const ordered = angularOrder(cards, bounds);
  const orders: CardLayoutInput[][] = [];
  const starts = Math.min(ordered.length, cards.length > 36 ? 3 : 6);
  for (let index = 0; index < starts; index += 1) {
    const start = Math.floor(index * ordered.length / starts);
    orders.push([...ordered.slice(start), ...ordered.slice(0, start)]);
  }
  orders.push([...ordered].reverse());
  orders.push([...cards].sort((left, right) =>
    candidates.get(left.id)!.length - candidates.get(right.id)!.length
    || left.id.localeCompare(right.id)));

  let best: CardPlacement[] | null = null;
  let bestScore: number[] | null = null;
  const seenOrders = new Set<string>();
  for (const order of orders) {
    const signature = order.map((card) => card.id).join("\0");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);
    const placed: CardPlacement[] = [];
    const geometries: ConnectorGeometry[] = [];
    const geometryBounds: CardArea[] = [];
    const sideLoads = new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0]));

    for (const card of order) {
      let selected: LayoutCandidate | null = null;
      let selectedScore: number[] | null = null;
      for (const candidate of candidates.get(card.id)!) {
        if (hitsPlaced(candidate.placement, placed, bounds.gap)) continue;
        let crossings = 0;
        let throughCards = 0;
        let splitClusters = 0;
        for (let index = 0; index < placed.length; index += 1) {
          if (connectorIntersects(
            candidate.geometry,
            candidate.geometryBounds,
            geometries[index]!,
            geometryBounds[index]!,
            clearance,
          )) crossings += 1;
          if (connectorHitsCard(candidate.geometry, candidate.geometryBounds, placed[index]!, clearance)) throughCards += 1;
          if (connectorHitsCard(geometries[index]!, geometryBounds[index]!, candidate.placement, clearance)) throughCards += 1;
          if (sameAnchorCluster(candidate.placement, placed[index]!)
            && candidate.placement.side !== placed[index]!.side) splitClusters += 1;
        }
        const score = [
          splitClusters,
          crossings,
          throughCards,
          candidate.mapIntersections,
          candidate.sideDeviation,
          normalizedSideLoad(
            sideLoads.get(candidate.placement.side)!,
            candidate.placement.side,
            bounds,
          ),
          candidate.distance,
          candidate.placement.y,
          candidate.placement.x,
        ];
        if (!selectedScore || compareScores(score, selectedScore) < 0) {
          selected = candidate;
          selectedScore = score;
        }
      }
      if (!selected) break;
      placed.push(selected.placement);
      geometries.push(selected.geometry);
      geometryBounds.push(selected.geometryBounds);
      sideLoads.set(
        selected.placement.side,
        sideLoads.get(selected.placement.side)!
          + sideAxisSize(selected.placement, selected.placement.side)
          + bounds.gap,
      );
    }

    if (placed.length !== cards.length || !validateHard(placed, bounds)) continue;
    const score = scoreLayout(
      placed,
      assignedSides,
      style,
      clearance,
      bounds.occupiedPolygons ?? [],
      bounds,
    );
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = placed;
      bestScore = score;
    }
  }
  return best ? orderResult(cards, best) : null;
}

export function solveCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const mode: CardLayoutMode = options.mode ?? "quadrant";
  if (cards.length === 0) return { status: "solved", placements: [], mode };

  if (mode === "grid") {
    const grid = layoutGrid(cards, bounds);
    const orderedGrid = orderResult(cards, grid);
    if (validateHard(orderedGrid, bounds)) return { status: "solved", placements: orderedGrid, mode };
    const repacked = repackAll(cards, bounds);
    return repacked
      ? { status: "solved", placements: repacked, mode }
      : { status: "fallback", placements: orderedGrid, mode };
  }

  if ((mode === "quadrant" || mode === "radial")
    && cards.length <= MAX_OPTIMIZED_CARDS
    && ((bounds.occupiedAreas?.length ?? 0) > 0
      || (bounds.occupiedPolygons?.length ?? 0) > 0)) {
    const optimized = optimizedLayout(cards, bounds, mode, options);
    if (optimized) return { status: "solved", placements: optimized, mode };
  }

  const assignments = mode === "radial"
    ? classifyRadial(cards, bounds)
    : mode === "right-stack"
      ? classifyRightStack(cards)
      : classifyQuadrant(cards, bounds, options);

  // Pack each side once, collecting only cards that land in a valid,
  // non-overlapping spot. Cards that don't fit their side overflow to a
  // neighbor side and are re-packed there next round.
  const order: CardSide[] = ["right", "left", "top", "bottom"];
  let placed: CardPlacement[] = [];
  let pending = assignments.map((a) => ({ ...a, cards: [...a.cards] }));
  for (let round = 0; round < 4 && pending.some((a) => a.cards.length > 0); round += 1) {
    for (const side of order) {
      const assignment = pending.find((a) => a.side === side);
      if (!assignment || assignment.cards.length === 0) continue;
      const packed = placeSide(assignment, bounds, placed);
      const accepted: CardPlacement[] = [];
      const rejected: CardLayoutInput[] = [];
      // Accept packed cards in order while they stay valid; once one fails,
      // reject the rest so the side stays a contiguous block.
      let blockBroken = false;
      for (let i = 0; i < packed.length; i += 1) {
        const p = packed[i]!;
        const valid = isInsideCanvas(p, bounds) && !hitsProtected(p, bounds) && !hitsPlaced(p, placed, bounds.gap)
          && !accepted.some((a) => overlaps(a, p, bounds.gap));
        if (valid && !blockBroken) {
          accepted.push(p);
        } else {
          blockBroken = true;
          rejected.push(assignment.cards[i]!);
        }
      }
      placed = placed.concat(accepted);
      const neighbor: CardSide = side === "right" ? "bottom" : side === "left" ? "top" : side === "top" ? "left" : "right";
      pending = pending.map((a) => {
        if (a.side === side) return { ...a, cards: [] };
        if (a.side === neighbor) return { ...a, cards: [...a.cards, ...rejected] };
        return a;
      });
    }
  }

  // Any cards still unplaced get a contained free spot (non-overlapping scan).
  const placedIds = new Set(placed.map((p) => p.id));
  for (const card of cards) {
    if (placedIds.has(card.id)) continue;
    const probe: CardPlacement = { ...card, x: bounds.margin, y: bounds.margin, side: "right" };
    const free = containFree(probe, bounds, placed);
    placed.push(free);
    placedIds.add(card.id);
  }

  const ordered = orderResult(cards, placed);
  if (validateHard(ordered, bounds)) return { status: "solved", placements: ordered, mode };
  const repacked = repackAll(cards, bounds);
  return repacked
    ? { status: "solved", placements: repacked, mode }
    : { status: "fallback", placements: ordered, mode };
}

export function layoutCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardPlacement[] {
  return solveCardLayout(cards, bounds, options).placements;
}

/**
 * Clamp a manually dragged card position so it stays inside the canvas margin
 * and outside protected areas. Only actual occupied geography is blocked;
 * map-frame whitespace is coverable unless `bounds.map` is the sole fallback.
 */
export function clampCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  const blockers = bounds.allowMapOverlap
    ? [...(bounds.occupiedAreas ?? [])]
    : [...protectedZones(bounds)];
  const polygons = bounds.allowMapOverlap ? [] : (bounds.occupiedPolygons ?? []);
  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin - position.width;
  const maxY = bounds.height - bounds.margin - position.height;
  const origin = {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
  const isFree = (x: number, y: number) => {
    const card = { x, y, width: position.width, height: position.height };
    return !blockers.some((blocker) => overlaps(card, blocker))
      && !polygons.some((polygon) => rectangleIntersectsPolygon(card, polygon, 0));
  };
  if (isFree(origin.x, origin.y)) return origin;

  const xCandidates = new Set([origin.x, minX, maxX]);
  const yCandidates = new Set([origin.y, minY, maxY]);
  const addRectCandidates = (rect: CardArea) => {
    xCandidates.add(clamp(rect.x - position.width, minX, maxX));
    xCandidates.add(clamp(rect.x + rect.width, minX, maxX));
    yCandidates.add(clamp(rect.y - position.height, minY, maxY));
    yCandidates.add(clamp(rect.y + rect.height, minY, maxY));
  };
  for (const blocker of blockers) addRectCandidates(blocker);
  for (const polygon of polygons) {
    const rect = polygonBounds(polygon);
    if (rect) addRectCandidates(rect);
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

// ----- Back-compat aliases (drop-in for the previous destination-layout API) -----

export interface DestinationCardInput extends CardLayoutInput {}
export interface DestinationCardArea extends CardArea {}
export interface DestinationCardBounds extends CardLayoutBounds {}
export type DestinationCardSide = CardSide;
export interface DestinationCardPlacement extends CardPlacement {}
/** Legacy status vocabulary (maps the new {@link CardLayoutStatus} back). */
export type DestinationLayoutStatus = "solved" | "crossing-fallback" | "search-budget-exhausted";
export interface DestinationLayoutResult {
  status: DestinationLayoutStatus;
  placements: CardPlacement[];
}
export interface DestinationLayoutOptions extends CardLayoutOptions {}

function legacyStatus(status: CardLayoutStatus): DestinationLayoutStatus {
  return status === "solved" ? "solved" : "crossing-fallback";
}

/** Previous solve signature, now delegating to {@link solveCardLayout}. */
export function solveDestinationCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): DestinationLayoutResult {
  const result = solveCardLayout(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
  return { status: legacyStatus(result.status), placements: result.placements };
}

export function layoutDestinationCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): CardPlacement[] {
  return layoutCards(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
}

export function clampDestinationCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  return clampCardPosition(position, bounds);
}
