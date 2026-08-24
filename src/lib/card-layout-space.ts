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
  overlaps,
  polygonBounds,
  rectangleIntersectsPolygon,
  sideForPlacement,
} from "./card-layout-geometry";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardPlacement,
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

/** Uniform grid over the canvas. Duplicate visits are filtered by a query stamp. */
export class RectIndex<T> {
  private readonly cell: number;

  private readonly buckets = new Map<string, Array<IndexEntry<T>>>();

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
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const key = `${cx}:${cy}`;
        const bucket = this.buckets.get(key);
        if (bucket) bucket.push(entry);
        else this.buckets.set(key, [entry]);
      }
    }
  }

  /** First item whose rect satisfies `predicate`, searched near `rect` only. */
  find(rect: CardArea, clearance: number, predicate: (item: T, itemRect: CardArea) => boolean): T | null {
    this.stamp += 1;
    const minX = Math.floor((rect.x - clearance) / this.cell);
    const maxX = Math.floor((rect.x + Math.max(0, rect.width) + clearance) / this.cell);
    const minY = Math.floor((rect.y - clearance) / this.cell);
    const maxY = Math.floor((rect.y + Math.max(0, rect.height) + clearance) / this.cell);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const bucket = this.buckets.get(`${cx}:${cy}`);
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
}

interface IndexedPolygon {
  polygon: CardPolygon;
  area: CardArea;
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
      return area ? [{ polygon: { ...polygon, bounds: area }, area }] : [];
    });
    const cell = this.cellSize();
    this.zoneIndex = new RectIndex<CardArea>(cell);
    for (const zone of this.zones) this.zoneIndex.insert(zone, zone);
    this.polygonIndex = new RectIndex<IndexedPolygon>(cell);
    for (const entry of this.polygons) this.polygonIndex.insert(entry.area, entry);
  }

  /** Grid cell tuned so a typical card touches a handful of cells. */
  cellSize(): number {
    const span = Math.max(this.width, this.height);
    return clamp(span / 12, 48, 320);
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
    const zone = this.zoneIndex.find(card, gap, (_item, rect) => overlaps(card, rect, gap));
    if (zone) return { area: zone, exact: true };
    if (this.polygons.length === 0) return null;
    const polygon = this.polygonIndex.find(card, gap, (entry, rect) =>
      boundsTouch(card, rect, gap) && rectangleIntersectsPolygon(card, entry.polygon, gap, entry.area));
    return polygon ? { area: polygon.area, exact: false } : null;
  }

  blocked(card: CardArea, gap = this.gap): boolean {
    return this.firstBlocker(card, gap) !== null;
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
    return this.index.find(card, gap, (_item, rect) => overlaps(card, rect, gap));
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
