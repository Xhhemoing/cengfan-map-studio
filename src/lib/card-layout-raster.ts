/**
 * Obstacle structures built from projected province outlines.
 *
 * Two of them, built in one pass over every outline edge:
 *   - a {@link RectIndex} of individual edges, so a hit test costs the segments
 *     in the cells the card touches rather than the vertex count of the map;
 *   - a {@link PolygonRaster}, a coarse occupancy map that answers the common
 *     "nowhere near a coastline" case without touching an edge at all.
 *
 * {@link LayoutSpace} owns both and is the only caller.
 */
import { forEachPolygonEdge, pointInArea, pointInPolygon } from "./card-layout-geometry";
import { RectIndex } from "./card-layout-index";
import { type CardArea, type CardPoint, type CardPolygon } from "./card-layout-types";

/**
 * A province outline plus its cached AABB.
 *
 * `memo*` is a one-entry memo for {@link LayoutSpace.pointInside}. Every
 * candidate for a card shares that card's anchor, so a single slot catches
 * nearly all of the repeat ray casts a province outline would otherwise pay
 * for.
 */
export interface IndexedPolygon {
  polygon: CardPolygon;
  area: CardArea;
  memoX: number;
  memoY: number;
  memoInside: boolean;
}

/** One outline segment, tagged with the polygon it belongs to. */
export interface PolygonEdge {
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
export interface ObstacleIndexes {
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
export function buildObstacleIndexes(
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
export class PolygonRaster {
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
