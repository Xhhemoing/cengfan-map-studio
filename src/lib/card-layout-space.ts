/**
 * The canvas model shared by every placement strategy.
 *
 * {@link LayoutSpace} normalizes the caller-supplied bounds (finite numbers,
 * non-negative sizes, a margin that can never invert the usable rect) and
 * answers the two questions the solver asks millions of times: "is this
 * rectangle inside the canvas?" and "what blocks it?".
 *
 * Obstacles and placed cards live in a uniform grid index, so a query costs
 * O(obstacles in the touched cells) instead of O(all obstacles). Polygon AABBs
 * are computed once here rather than on every hit test.
 */
import {
  boundsTouch,
  clamp,
  finiteOr,
  forEachPolygonEdge,
  pointInArea,
  pointInPolygon,
  polygonBounds,
  segmentsIntersect,
  segmentTouchesArea,
  sideForPlacement,
} from "./card-layout-geometry";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardPlacement,
  type CardPoint,
  type CardPolygon,
  type CardSide,
} from "./card-layout-types";

/** An obstacle that rejected a candidate rectangle. */
export interface Blocker {
  /** Obstacle AABB. Exact for rectangles, conservative for polygons. */
  area: CardArea;
  /** `true` when a sweep may jump straight past `area` without missing a gap. */
  exact: boolean;
}

interface IndexEntry<T> {
  rect: CardArea;
  item: T;
  stamp: number;
}

/**
 * An item wider than this many cells is kept out of the grid and scanned on
 * every query instead. Bucketing it would cost more cells than it can ever
 * save, and a wildly out-of-canvas polygon would otherwise fill millions.
 */
const MAX_CELLS_PER_ITEM = 256;

/** Uniform grid over the canvas. Duplicate visits are filtered by a query stamp. */
export class RectIndex<T> {
  private readonly cell: number;

  /** Row of cells, keyed by column; nested maps keep the key allocation-free. */
  private readonly rows = new Map<number, Map<number, Array<IndexEntry<T>>>>();

  private readonly oversized: Array<IndexEntry<T>> = [];

  private stamp = 0;

  constructor(cell: number) {
    this.cell = Number.isFinite(cell) && cell > 1 ? cell : 128;
  }

  insert(rect: CardArea, item: T): void {
    const entry: IndexEntry<T> = { rect, item, stamp: 0 };
    const minX = Math.floor(rect.x / this.cell);
    const maxX = Math.floor((rect.x + Math.max(0, rect.width)) / this.cell);
    const minY = Math.floor(rect.y / this.cell);
    const maxY = Math.floor((rect.y + Math.max(0, rect.height)) / this.cell);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
    if ((maxX - minX + 1) * (maxY - minY + 1) > MAX_CELLS_PER_ITEM) {
      this.oversized.push(entry);
      return;
    }
    for (let cy = minY; cy <= maxY; cy += 1) {
      let row = this.rows.get(cy);
      if (!row) {
        row = new Map<number, Array<IndexEntry<T>>>();
        this.rows.set(cy, row);
      }
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = row.get(cx);
        if (bucket) bucket.push(entry);
        else row.set(cx, [entry]);
      }
    }
  }

  /**
   * Visit every distinct item near `rect`, stopping early when `predicate`
   * accepts one. Returns the accepted item, or `null` after a full sweep.
   */
  private walk(
    rect: CardArea,
    clearance: number,
    predicate: (item: T, itemRect: CardArea) => boolean,
  ): T | null {
    this.stamp += 1;
    for (const entry of this.oversized) {
      entry.stamp = this.stamp;
      if (predicate(entry.item, entry.rect)) return entry.item;
    }
    const minX = Math.floor((rect.x - clearance) / this.cell);
    const maxX = Math.floor((rect.x + Math.max(0, rect.width) + clearance) / this.cell);
    const minY = Math.floor((rect.y - clearance) / this.cell);
    const maxY = Math.floor((rect.y + Math.max(0, rect.height) + clearance) / this.cell);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    for (let cy = minY; cy <= maxY; cy += 1) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = row.get(cx);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.stamp === this.stamp) continue;
          entry.stamp = this.stamp;
          if (predicate(entry.item, entry.rect)) return entry.item;
        }
      }
    }
    return null;
  }

  /** First item whose rect satisfies `predicate`, searched near `rect` only. */
  find(rect: CardArea, clearance: number, predicate: (item: T, itemRect: CardArea) => boolean): T | null {
    return this.walk(rect, clearance, predicate);
  }

  /**
   * First indexed item overlapping `rect` within `gap`.
   *
   * The same walk as {@link find} with the overlap test written inline. This is
   * the single most-called query in the solver — every candidate, every repair
   * step and every validation runs it — and passing the test as a closure meant
   * allocating one per call, which showed up as collector time rather than as
   * work.
   */
  overlapping(rect: CardArea, gap: number): T | null {
    this.stamp += 1;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    for (const entry of this.oversized) {
      entry.stamp = this.stamp;
      const other = entry.rect;
      if (left < other.x + other.width + gap && right + gap > other.x
        && top < other.y + other.height + gap && bottom + gap > other.y) return entry.item;
    }
    const minX = Math.floor((left - gap) / this.cell);
    const maxX = Math.floor((right + gap) / this.cell);
    const minY = Math.floor((top - gap) / this.cell);
    const maxY = Math.floor((bottom + gap) / this.cell);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    for (let cy = minY; cy <= maxY; cy += 1) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = row.get(cx);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.stamp === this.stamp) continue;
          entry.stamp = this.stamp;
          const other = entry.rect;
          if (left < other.x + other.width + gap && right + gap > other.x
            && top < other.y + other.height + gap && bottom + gap > other.y) return entry.item;
        }
      }
    }
    return null;
  }

  /**
   * Visit every distinct item near `rect`, in cell order. Written as its own
   * loop rather than a {@link walk} with an always-false predicate: this runs
   * once per connector segment during scoring, and the wrapper closure alone
   * showed up as garbage-collector time.
   */
  forEach(rect: CardArea, clearance: number, visit: (item: T, itemRect: CardArea) => void): void {
    this.stamp += 1;
    for (const entry of this.oversized) {
      entry.stamp = this.stamp;
      visit(entry.item, entry.rect);
    }
    const minX = Math.floor((rect.x - clearance) / this.cell);
    const maxX = Math.floor((rect.x + Math.max(0, rect.width) + clearance) / this.cell);
    const minY = Math.floor((rect.y - clearance) / this.cell);
    const maxY = Math.floor((rect.y + Math.max(0, rect.height) + clearance) / this.cell);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
    for (let cy = minY; cy <= maxY; cy += 1) {
      const row = this.rows.get(cy);
      if (!row) continue;
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = row.get(cx);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.stamp === this.stamp) continue;
          entry.stamp = this.stamp;
          visit(entry.item, entry.rect);
        }
      }
    }
  }
}

interface IndexedPolygon {
  polygon: CardPolygon;
  area: CardArea;
  /**
   * One-entry memo for {@link LayoutSpace.pointInside}. Every candidate for a
   * card shares that card's anchor, so a single slot catches nearly all of the
   * repeat ray casts a province outline would otherwise pay for.
   */
  memoX: number;
  memoY: number;
  memoInside: boolean;
}

/** One outline segment, tagged with the polygon it belongs to. */
interface PolygonEdge {
  start: CardPoint;
  end: CardPoint;
  owner: IndexedPolygon;
}

function edgeBounds(start: CardPoint, end: CardPoint): CardArea {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function finitePoint(point: CardPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** The two obstacle structures a solve consults, built together. */
interface ObstacleIndexes {
  /**
   * Grid index over every province outline edge. A card only ever tests the
   * handful of edges in the cells it touches, so a 180-point province costs the
   * same as a triangle unless the card actually sits on its coastline.
   */
  edges: RectIndex<PolygonEdge>;
  raster: PolygonRaster | null;
}

/**
 * Both structures need one pass over every outline edge on the map, and that
 * pass is what a solve pays before it places anything, so they share it.
 */
function buildObstacleIndexes(
  polygons: readonly IndexedPolygon[],
  canvas: CardArea,
  cell: number,
): ObstacleIndexes {
  const edges = new RectIndex<PolygonEdge>(cell);
  const raster = PolygonRaster.forCanvas(polygons, canvas, cell);
  for (const owner of polygons) {
    forEachPolygonEdge(owner.polygon, (start, end) => {
      if (!finitePoint(start) || !finitePoint(end)) return;
      const bounds = edgeBounds(start, end);
      edges.insert(bounds, { start, end, owner });
      raster?.mark(bounds);
    });
  }
  raster?.seal();
  return { edges, raster };
}

/** No part of the cell is inside any province, and no outline crosses it. */
const CELL_FREE = 0;
/** The whole cell is inside one province. */
const CELL_FULL = 1;
/** An outline crosses the cell, so only an exact test can answer. */
const CELL_MIXED = 2;

/** Ceiling on raster cells; past it the raster costs more memory than it saves. */
const MAX_RASTER_CELLS = 262_144;

/**
 * Coarse occupancy map of the province outlines.
 *
 * Walking the edge index costs one segment test per outline edge in the cells a
 * card touches, and a 180-point province puts ~20 edges in every cell it
 * crosses. Most probes, though, are nowhere near a coastline: they sit in the
 * open margin, or squarely inside one province. This raster answers both of
 * those in one array read per cell.
 *
 * It is exact rather than a heuristic. A cell is only {@link CELL_FREE} when no
 * edge passes through it *and* its centre is outside every polygon — with no
 * outline crossing it, the whole cell must then be outside too. The same
 * argument marks {@link CELL_FULL}. Anything an outline touches stays
 * {@link CELL_MIXED} and falls through to the exact edge test, so the raster
 * only ever skips work whose answer it already knows.
 */
class PolygonRaster {
  private readonly cell: number;

  private readonly originX: number;

  private readonly originY: number;

  private readonly columns: number;

  private readonly rows: number;

  private readonly cells: Uint8Array;

  /** Index into `polygons` for {@link CELL_FULL} cells, `-1` otherwise. */
  private readonly owner: Int32Array;

  private readonly polygons: readonly IndexedPolygon[];

  /**
   * Polygon AABBs on the raster's own grid.
   *
   * {@link fillInteriors} asks "which shape covers this cell?" once per run of
   * outline-free cells, and a linear scan makes that question cost the whole
   * polygon list. On a map split into hundreds of parts the scan, not the edge
   * walk, was the bulk of building the raster.
   */
  private readonly areas: RectIndex<number>;

  /** Scratch objects for {@link containerAt}, which runs once per cell run. */
  private readonly centre: CardPoint = { x: 0, y: 0 };

  private readonly probe: CardArea = { x: 0, y: 0, width: 0, height: 0 };

  private constructor(
    polygons: readonly IndexedPolygon[],
    cell: number,
    originX: number,
    originY: number,
    columns: number,
    rows: number,
  ) {
    this.polygons = polygons;
    this.areas = new RectIndex<number>(cell);
    for (let index = 0; index < polygons.length; index += 1) this.areas.insert(polygons[index]!.area, index);
    this.cell = cell;
    this.originX = originX;
    this.originY = originY;
    this.columns = columns;
    this.rows = rows;
    this.cells = new Uint8Array(columns * rows).fill(CELL_FREE);
    this.owner = new Int32Array(columns * rows).fill(-1);
  }

  /**
   * Empty raster covering `canvas` and every polygon, or `null` when the grid
   * would be too large to be worth building. Call {@link mark} for each outline
   * edge, then {@link seal}.
   */
  static forCanvas(polygons: readonly IndexedPolygon[], canvas: CardArea, cell: number): PolygonRaster | null {
    let minX = canvas.x;
    let minY = canvas.y;
    let maxX = canvas.x + canvas.width;
    let maxY = canvas.y + canvas.height;
    for (const entry of polygons) {
      minX = Math.min(minX, entry.area.x);
      minY = Math.min(minY, entry.area.y);
      maxX = Math.max(maxX, entry.area.x + entry.area.width);
      maxY = Math.max(maxY, entry.area.y + entry.area.height);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    const columns = Math.floor((maxX - minX) / cell) + 1;
    const rows = Math.floor((maxY - minY) / cell) + 1;
    if (columns < 1 || rows < 1 || columns * rows > MAX_RASTER_CELLS) return null;
    return new PolygonRaster(polygons, cell, minX, minY, columns, rows);
  }

  /** Record that an outline crosses `rect`. Builder use only. */
  mark(rect: CardArea): void {
    const minColumn = Math.max(0, Math.floor((rect.x - this.originX) / this.cell));
    const maxColumn = Math.min(this.columns - 1, Math.floor((rect.x + rect.width - this.originX) / this.cell));
    const minRow = Math.max(0, Math.floor((rect.y - this.originY) / this.cell));
    const maxRow = Math.min(this.rows - 1, Math.floor((rect.y + rect.height - this.originY) / this.cell));
    for (let row = minRow; row <= maxRow; row += 1) {
      const base = row * this.columns;
      for (let column = minColumn; column <= maxColumn; column += 1) this.cells[base + column] = CELL_MIXED;
    }
  }

  /** Polygon containing the centre of cell (`column`, `row`), or `-1`. */
  private containerAt(column: number, row: number): number {
    const centre = this.centre;
    centre.x = this.originX + (column + 0.5) * this.cell;
    centre.y = this.originY + (row + 0.5) * this.cell;
    const probe = this.probe;
    probe.x = centre.x;
    probe.y = centre.y;
    const found = this.areas.find(probe, 0, (index, area) => pointInArea(centre, area)
      && pointInPolygon(centre, this.polygons[index]!.polygon));
    return found ?? -1;
  }

  /**
   * Classify the cells no outline touched, one ray cast per run. Builder use
   * only; call once every edge has been marked.
   *
   * Neighbouring outline-free cells cannot straddle a boundary — going from
   * inside a shape to outside it means crossing its outline, which would have
   * marked the cells in between. So a whole horizontal run of them shares one
   * answer, and the ray casts scale with how convoluted the coastlines are
   * rather than with the area they enclose. That distinction matters: a
   * province with a distant island has an enormous bounding box and testing
   * every cell inside it would dominate the whole solve.
   */
  seal(): void {
    for (let row = 0; row < this.rows; row += 1) {
      const base = row * this.columns;
      let column = 0;
      while (column < this.columns) {
        if (this.cells[base + column] === CELL_MIXED) {
          column += 1;
          continue;
        }
        let end = column;
        while (end < this.columns && this.cells[base + end] !== CELL_MIXED) end += 1;
        const container = this.containerAt(column, row);
        if (container >= 0) {
          for (let at = column; at < end; at += 1) {
            this.cells[base + at] = CELL_FULL;
            this.owner[base + at] = container;
          }
        }
        column = end;
      }
    }
  }

  /**
   * Verdict for `rect`: the province covering it, `"free"` when nothing can
   * touch it, or `"mixed"` when an outline is close enough to need the exact
   * test. Cells outside the grid are free by construction — the grid spans
   * every polygon.
   */
  classify(rect: CardArea): IndexedPolygon | "free" | "mixed" {
    const minColumn = Math.max(0, Math.floor((rect.x - this.originX) / this.cell));
    const maxColumn = Math.min(this.columns - 1, Math.floor((rect.x + rect.width - this.originX) / this.cell));
    const minRow = Math.max(0, Math.floor((rect.y - this.originY) / this.cell));
    const maxRow = Math.min(this.rows - 1, Math.floor((rect.y + rect.height - this.originY) / this.cell));
    let mixed = false;
    for (let row = minRow; row <= maxRow; row += 1) {
      const base = row * this.columns;
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const state = this.cells[base + column];
        if (state === CELL_FULL) return this.polygons[this.owner[base + column]!]!;
        if (state === CELL_MIXED) mixed = true;
      }
    }
    return mixed ? "mixed" : "free";
  }
}

function normalizeArea(area: CardArea | undefined): CardArea {
  return {
    x: finiteOr(area?.x, 0),
    y: finiteOr(area?.y, 0),
    width: Math.max(0, finiteOr(area?.width, 0)),
    height: Math.max(0, finiteOr(area?.height, 0)),
  };
}

/**
 * Clamp caller input into a solvable shape. A margin larger than half the
 * canvas would invert every span, so it is capped instead of throwing.
 */
export function normalizeBounds(bounds: CardLayoutBounds): CardLayoutBounds {
  const width = Math.max(0, finiteOr(bounds.width, 0));
  const height = Math.max(0, finiteOr(bounds.height, 0));
  const margin = clamp(finiteOr(bounds.margin, 0), 0, Math.min(width, height) / 2);
  const polygons = (bounds.occupiedPolygons ?? [])
    .filter((polygon) => Array.isArray(polygon?.rings) && (polygon.rings[0]?.length ?? 0) >= 3);
  return {
    width,
    height,
    margin,
    gap: Math.max(0, finiteOr(bounds.gap, 0)),
    map: normalizeArea(bounds.map),
    ...(bounds.occupiedAreas === undefined ? {} : { occupiedAreas: bounds.occupiedAreas.map(normalizeArea) }),
    ...(bounds.occupiedPolygons === undefined ? {} : { occupiedPolygons: polygons }),
    ...(bounds.allowMapOverlap === undefined ? {} : { allowMapOverlap: bounds.allowMapOverlap }),
  };
}

/**
 * Protected rectangles. Explicit `occupiedAreas` win; otherwise the map frame
 * stands in for geography unless real polygons or `allowMapOverlap` say
 * otherwise.
 */
export function protectedZones(bounds: CardLayoutBounds): CardArea[] {
  if (bounds.occupiedAreas !== undefined) return bounds.occupiedAreas;
  if (bounds.occupiedPolygons && bounds.occupiedPolygons.length) return [];
  return bounds.allowMapOverlap ? [] : [bounds.map];
}

export class LayoutSpace {
  readonly bounds: CardLayoutBounds;

  readonly width: number;

  readonly height: number;

  readonly margin: number;

  readonly gap: number;

  readonly map: CardArea;

  readonly zones: CardArea[];

  readonly polygons: IndexedPolygon[];

  private readonly zoneIndex: RectIndex<CardArea>;

  private readonly polygonIndex: RectIndex<IndexedPolygon>;

  private readonly edgeIndex: RectIndex<PolygonEdge> | null;

  private readonly raster: PolygonRaster | null;

  /** Scratch rect for {@link firstBlocker}, which allocated one per call. */
  private readonly probe: CardArea = { x: 0, y: 0, width: 0, height: 0 };

  constructor(bounds: CardLayoutBounds) {
    this.bounds = normalizeBounds(bounds);
    this.width = this.bounds.width;
    this.height = this.bounds.height;
    this.margin = this.bounds.margin;
    this.gap = this.bounds.gap;
    this.map = this.bounds.map;
    this.zones = protectedZones(this.bounds);
    this.polygons = (this.bounds.occupiedPolygons ?? []).flatMap((polygon) => {
      const area = polygonBounds(polygon);
      if (!area) return [];
      return [{
        polygon: { ...polygon, bounds: area },
        area,
        memoX: Number.NaN,
        memoY: Number.NaN,
        memoInside: false,
      }];
    });
    const cell = this.cellSize();
    this.zoneIndex = new RectIndex<CardArea>(cell);
    for (const zone of this.zones) this.zoneIndex.insert(zone, zone);
    this.polygonIndex = new RectIndex<IndexedPolygon>(cell);
    for (const entry of this.polygons) this.polygonIndex.insert(entry.area, entry);
    const indexes = this.polygons.length > 0
      ? buildObstacleIndexes(
        this.polygons,
        { x: 0, y: 0, width: this.width, height: this.height },
        this.edgeCellSize(),
      )
      : null;
    this.edgeIndex = indexes?.edges ?? null;
    this.raster = indexes?.raster ?? null;
  }

  /** Grid cell tuned so a typical card touches a handful of cells. */
  cellSize(): number {
    const span = Math.max(this.width, this.height);
    return clamp(span / 12, 48, 320);
  }

  /**
   * Outline edges are far shorter than cards, so they get their own finer grid;
   * a card-sized cell would sweep hundreds of coastline segments per probe.
   */
  edgeCellSize(): number {
    const span = Math.max(this.width, this.height);
    return clamp(span / 48, 16, 80);
  }

  maxX(width: number): number {
    return this.width - this.margin - width;
  }

  maxY(height: number): number {
    return this.height - this.margin - height;
  }

  clampX(x: number, width: number): number {
    return clamp(x, this.margin, this.maxX(width));
  }

  clampY(y: number, height: number): number {
    return clamp(y, this.margin, this.maxY(height));
  }

  inside(card: CardArea): boolean {
    return card.x >= this.margin - 1e-7
      && card.y >= this.margin - 1e-7
      && card.x + card.width <= this.width - this.margin + 1e-7
      && card.y + card.height <= this.height - this.margin + 1e-7;
  }

  /** First protected zone or province polygon that rejects `card`. */
  firstBlocker(card: CardArea, gap = this.gap): Blocker | null {
    if (this.zones.length > 0) {
      const zone = this.zoneIndex.overlapping(card, gap);
      if (zone) return { area: zone, exact: true };
    }
    if (!this.edgeIndex) return null;
    const probe = this.probe;
    probe.x = card.x - gap;
    probe.y = card.y - gap;
    probe.width = card.width + gap * 2;
    probe.height = card.height + gap * 2;
    if (this.raster) {
      const verdict = this.raster.classify(probe);
      if (verdict === "free") return null;
      if (verdict !== "mixed") return { area: verdict.area, exact: false };
    }
    const edge = this.edgeIndex.find(probe, 0, (entry, rect) =>
      boundsTouch(probe, rect, 0) && segmentTouchesArea(entry.start, entry.end, probe));
    if (edge) return { area: edge.owner.area, exact: false };
    // No outline crosses the probe, so it is wholly inside or wholly outside
    // every shape nearby; one ray cast per candidate polygon settles which.
    const containing = this.polygonIndex.find(probe, 0, (entry, rect) =>
      boundsTouch(probe, rect, 0) && pointInPolygon({ x: probe.x, y: probe.y }, entry.polygon));
    return containing ? { area: containing.area, exact: false } : null;
  }

  blocked(card: CardArea, gap = this.gap): boolean {
    return this.firstBlocker(card, gap) !== null;
  }

  /**
   * How many provinces a polyline crosses, ignoring the one `anchor` sits in —
   * a leader line always has to leave its own province.
   *
   * Only the outline edges near each segment are tested, so the cost tracks the
   * length of the line rather than the vertex count of the whole map.
   */
  private pointInside(entry: IndexedPolygon, point: CardPoint): boolean {
    if (entry.memoX === point.x && entry.memoY === point.y) return entry.memoInside;
    entry.memoInside = pointInPolygon(point, entry.polygon);
    entry.memoX = point.x;
    entry.memoY = point.y;
    return entry.memoInside;
  }

  polygonCrossings(
    segments: readonly { start: CardPoint; end: CardPoint }[],
    anchor: CardPoint,
  ): number {
    if (!this.edgeIndex || segments.length === 0) return 0;
    const crossed = new Set<IndexedPolygon>();
    // One reused span and one reused visitor: this loop runs per curve sample
    // for every candidate placement, so per-call allocation is the cost here.
    const span = { x: 0, y: 0, width: 0, height: 0 };
    let current = segments[0]!;
    const visit = (entry: PolygonEdge, rect: CardArea) => {
      if (crossed.has(entry.owner) || !boundsTouch(span, rect, 0)) return;
      if (segmentsIntersect(current.start, current.end, entry.start, entry.end)) crossed.add(entry.owner);
    };
    for (const segment of segments) {
      current = segment;
      span.x = Math.min(segment.start.x, segment.end.x);
      span.y = Math.min(segment.start.y, segment.end.y);
      span.width = Math.abs(segment.end.x - segment.start.x);
      span.height = Math.abs(segment.end.y - segment.start.y);
      this.edgeIndex.forEach(span, 0, visit);
    }
    // Crossing nothing still leaves one case: a line that runs wholly inside a
    // single province. Any line that starts inside one and ends elsewhere has
    // to cut that outline on the way out, so this only needs checking when
    // nothing was crossed — which keeps the ray cast off the hot path.
    if (crossed.size === 0) {
      const head = segments[0]!.start;
      const containing = this.polygonIndex.find({ x: head.x, y: head.y, width: 0, height: 0 }, 0,
        (entry, rect) => pointInArea(head, rect) && pointInPolygon(head, entry.polygon));
      if (containing) crossed.add(containing);
    }

    let count = 0;
    for (const entry of crossed) {
      if (!this.pointInside(entry, anchor)) count += 1;
    }
    return count;
  }

  sideOf(card: CardArea): CardSide {
    return sideForPlacement(card, this.map);
  }

  /** Usable extent along a side's packing axis. */
  sideCapacity(side: CardSide): number {
    return side === "left" || side === "right"
      ? this.height - this.margin * 2
      : this.width - this.margin * 2;
  }

  normalizedSideLoad(load: number, side: CardSide): number {
    const capacity = this.sideCapacity(side);
    return capacity > 1e-7 ? load / capacity : load;
  }
}

/** Occupancy of already-placed cards, backed by the same uniform grid. */
export class PlacementIndex {
  readonly items: CardPlacement[] = [];

  private readonly index: RectIndex<CardPlacement>;

  private readonly cell: number;

  constructor(cell: number) {
    this.cell = cell;
    this.index = new RectIndex<CardPlacement>(cell);
  }

  static forSpace(space: LayoutSpace, seed: readonly CardPlacement[] = []): PlacementIndex {
    const index = new PlacementIndex(space.cellSize());
    for (const placement of seed) index.add(placement);
    return index;
  }

  get size(): number {
    return this.items.length;
  }

  add(placement: CardPlacement): void {
    this.items.push(placement);
    this.index.insert(placement, placement);
  }

  blocker(card: CardArea, gap: number): CardPlacement | null {
    return this.index.overlapping(card, gap);
  }

  hits(card: CardArea, gap: number): boolean {
    return this.blocker(card, gap) !== null;
  }

  clone(): PlacementIndex {
    const copy = new PlacementIndex(this.cell);
    for (const placement of this.items) copy.add(placement);
    return copy;
  }
}

/** The full hard-constraint check: in bounds, off obstacles, no card overlap. */
export function validateHard(placements: readonly CardPlacement[], space: LayoutSpace): boolean {
  const index = new PlacementIndex(space.cellSize());
  for (const card of placements) {
    if (!space.inside(card)) return false;
    if (space.blocked(card)) return false;
    if (index.hits(card, space.gap)) return false;
    index.add(card);
  }
  return true;
}
