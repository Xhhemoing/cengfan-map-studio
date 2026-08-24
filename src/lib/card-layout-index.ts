/**
 * Uniform grid index over axis-aligned rectangles.
 *
 * Every spatial question the solver asks — "what blocks this candidate?", "what
 * outline edges are near this connector segment?" — is a lookup near one small
 * rectangle. Bucketing the obstacles by grid cell turns each of those from a
 * scan of every obstacle into a scan of the handful sharing a cell, which is
 * what keeps a 60-card board on a full-detail province map inside a frame.
 *
 * The index is used by {@link ./card-layout-space} for zones, polygons and
 * placed cards, by {@link ./card-layout-raster} for outline edges, and by
 * {@link ./card-layout-manual} for drag clamping.
 */
import { type CardArea } from "./card-layout-types";

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
