import { describe, expect, it } from "vitest";
import { RectIndex } from "./card-layout-index";
import type { CardArea } from "./card-layout-types";

function area(x: number, y: number, width: number, height: number): CardArea {
  return { x, y, width, height };
}

describe("rect index", () => {
  it("finds an item whatever cell of the grid it landed in", () => {
    const index = new RectIndex<string>(10);
    index.insert(area(0, 0, 5, 5), "near-origin");
    index.insert(area(500, 400, 20, 20), "far");
    expect(index.overlapping(area(2, 2, 1, 1), 0)).toBe("near-origin");
    expect(index.overlapping(area(505, 405, 1, 1), 0)).toBe("far");
    expect(index.overlapping(area(200, 200, 1, 1), 0)).toBeNull();
  });

  it("applies the gap to both sides of the overlap test", () => {
    const index = new RectIndex<string>(10);
    index.insert(area(100, 100, 20, 20), "block");
    expect(index.overlapping(area(130, 100, 10, 10), 0)).toBeNull();
    expect(index.overlapping(area(130, 100, 10, 10), 11)).toBe("block");
  });

  it("still matches an item too large to bucket", () => {
    // Past the per-item cell ceiling the entry is held aside and scanned on
    // every query instead of being written into ~10_000 buckets. It has to
    // stay just as findable, and stay findable from anywhere.
    const index = new RectIndex<string>(10);
    index.insert(area(0, 0, 4000, 4000), "map");
    index.insert(area(50, 50, 10, 10), "small");
    expect(index.overlapping(area(3900, 3900, 5, 5), 0)).toBe("map");
    expect(index.find(area(2000, 2000, 1, 1), 0, (item) => item === "map")).toBe("map");
    const seen: string[] = [];
    index.forEach(area(55, 55, 1, 1), 0, (item) => seen.push(item));
    expect([...seen].sort()).toEqual(["map", "small"]);
  });

  it("visits an item spanning many cells exactly once per query", () => {
    const index = new RectIndex<string>(10);
    index.insert(area(0, 0, 100, 100), "wide");
    const visits: string[] = [];
    index.forEach(area(0, 0, 100, 100), 0, (item) => visits.push(item));
    expect(visits).toEqual(["wide"]);
    // The visit stamp is per query, not per index, so a second sweep sees it
    // again rather than treating it as already visited.
    const second: string[] = [];
    index.forEach(area(0, 0, 100, 100), 0, (item) => second.push(item));
    expect(second).toEqual(["wide"]);
  });

  it("stops the scan at the first item the predicate accepts", () => {
    const index = new RectIndex<number>(10);
    for (let n = 0; n < 20; n += 1) index.insert(area(n * 12, 0, 8, 8), n);
    let tested = 0;
    const found = index.find(area(0, 0, 240, 8), 0, (item) => {
      tested += 1;
      return item >= 0;
    });
    expect(found).toBe(0);
    expect(tested).toBe(1);
  });

  it("hands the predicate the indexed rect alongside the item", () => {
    const index = new RectIndex<string>(10);
    const rect = area(30, 40, 20, 20);
    index.insert(rect, "tagged");
    let seen: CardArea | null = null;
    index.find(area(35, 45, 1, 1), 0, (_item, itemRect) => {
      seen = itemRect;
      return true;
    });
    expect(seen).toEqual(rect);
  });

  it("ignores non-finite geometry instead of throwing or filling the grid", () => {
    const index = new RectIndex<string>(10);
    index.insert(area(Number.NaN, 0, 10, 10), "nan");
    index.insert(area(0, 0, Number.POSITIVE_INFINITY, 10), "infinite");
    index.insert(area(20, 20, 10, 10), "real");
    expect(index.overlapping(area(22, 22, 1, 1), 0)).toBe("real");
    expect(index.overlapping(area(Number.NaN, 0, 1, 1), 0)).toBeNull();
    expect(index.find(area(0, Number.NaN, 1, 1), 0, () => true)).toBeNull();
  });

  it("falls back to a usable cell size when given a degenerate one", () => {
    for (const cell of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const index = new RectIndex<string>(cell);
      index.insert(area(300, 300, 40, 40), "item");
      expect(index.overlapping(area(310, 310, 5, 5), 0)).toBe("item");
      expect(index.overlapping(area(900, 900, 5, 5), 0)).toBeNull();
    }
  });

  it("treats a zero-size rect as a point query", () => {
    const index = new RectIndex<string>(10);
    index.insert(area(100, 100, 40, 40), "block");
    expect(index.overlapping(area(120, 120, 0, 0), 0)).toBe("block");
    expect(index.overlapping(area(80, 80, 0, 0), 0)).toBeNull();
  });
});
