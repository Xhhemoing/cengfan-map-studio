/**
 * The canvas model shared by every placement strategy.
 *
 * {@link LayoutSpace} normalizes the caller-supplied bounds (finite numbers,
 * non-negative sizes, a margin that can never invert the usable rect) and
 * answers the two questions the solver asks millions of times: "is this
 * rectangle inside the canvas?" and "what blocks it?".
 *
 * Obstacles and placed cards live in a uniform grid index
 * ({@link ./card-layout-index}), so a query costs O(obstacles in the touched
 * cells) instead of O(all obstacles). Province outlines get the extra
 * structures in {@link ./card-layout-raster}. Polygon AABBs are computed once
 * here rather than on every hit test.
 */
import {
  boundsTouch,
  clamp,
  finiteOr,
  pointInArea,
  pointInPolygon,
  polygonBounds,
  segmentsIntersect,
  segmentTouchesArea,
  sideForPlacement,
} from "./card-layout-geometry";
import { RectIndex } from "./card-layout-index";
import {
  buildObstacleIndexes,
  type IndexedPolygon,
  type PolygonEdge,
  type PolygonRaster,
} from "./card-layout-raster";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardPlacement,
  type CardPoint,
  type CardSide,
} from "./card-layout-types";

/** An obstacle that rejected a candidate rectangle. */
export interface Blocker {
  /** Obstacle AABB. Exact for rectangles, conservative for polygons. */
  area: CardArea;
  /** `true` when a sweep may jump straight past `area` without missing a gap. */
  exact: boolean;
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

  private pointInside(entry: IndexedPolygon, point: CardPoint): boolean {
    if (entry.memoX === point.x && entry.memoY === point.y) return entry.memoInside;
    entry.memoInside = pointInPolygon(point, entry.polygon);
    entry.memoX = point.x;
    entry.memoY = point.y;
    return entry.memoInside;
  }

  /**
   * How many provinces a polyline crosses, ignoring the one `anchor` sits in —
   * a leader line always has to leave its own province.
   *
   * Only the outline edges near each segment are tested, so the cost tracks the
   * length of the line rather than the vertex count of the whole map.
   */
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

/**
 * Re-label one placement by the seat it actually occupies.
 *
 * Every strategy sets `side` for itself, and most of them set it from the seat
 * already; a column packer sets it from the column it classified into, which
 * is the same thing only while the column stays on that flank of the map. This
 * is the one call the solver's public exit makes on every placement so the
 * shipped label can never be the one a strategy hoped for. Coordinates are
 * copied through untouched — a hand-placed card must stay where it was put.
 */
export function sideForShippedPlacement(placement: CardPlacement, space: LayoutSpace): CardPlacement {
  return { ...placement, side: space.sideOf(placement) };
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
