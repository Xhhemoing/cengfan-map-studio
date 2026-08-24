import { describe, expect, it } from "vitest";
import type {
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
  CardLayoutResult,
  CardPolygon,
} from "./card-layout";
import { CardLayoutCache, createCardLayoutCacheKey } from "./card-layout-cache";

const cards: CardLayoutInput[] = [
  { id: "beijing", anchorX: 810, anchorY: 320, width: 180, height: 96 },
  { id: "zhejiang", anchorX: 860, anchorY: 610, width: 180, height: 96 },
];

const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 320, y: 100, width: 860, height: 700 },
  margin: 32,
  gap: 14,
  occupiedAreas: [{ x: 48, y: 780, width: 280, height: 120 }],
};

const options: CardLayoutOptions = {
  mode: "quadrant",
  autoBalance: true,
  connectorStyle: "curve",
  connectorWidth: 1.5,
};

const result: CardLayoutResult = {
  mode: "quadrant",
  status: "solved",
  placements: [],
};

function centeredPolygon(): CardPolygon {
  return {
    rings: [[{ x: -40, y: -30 }, { x: 40, y: -30 }, { x: 40, y: 30 }, { x: -40, y: 30 }]],
    bounds: { x: -40, y: -30, width: 80, height: 60 },
  };
}

function translate(polygons: readonly CardPolygon[], originX: number, originY: number): CardPolygon[] {
  return polygons.map(({ rings, bounds }) => ({
    rings: rings.map((ring) => ring.map((point) => ({ x: originX + point.x, y: originY + point.y }))),
    ...(bounds
      ? { bounds: { x: originX + bounds.x, y: originY + bounds.y, width: bounds.width, height: bounds.height } }
      : {}),
  }));
}

/** Keys the geometry the way PosterCanvas does: origin-relative rings plus the map origin,
 *  alongside the translated polygons the solver itself receives. */
function originKey(centered: readonly CardPolygon[], originX: number, originY: number): string {
  return createCardLayoutCacheKey({
    cards,
    bounds: { ...bounds, occupiedPolygons: translate(centered, originX, originY) },
    options,
    polygonOrigin: { polygons: centered, originX, originY },
  });
}

function ringSegment(key: string): string {
  return key.slice(key.indexOf("|") + 1).replace(/^[-\d.,e+]*@/, "");
}

describe("card layout cache", () => {
  it("uses only layout geometry and options in a stable request key", () => {
    const base = createCardLayoutCacheKey({ cards, bounds, options });
    const equivalent = createCardLayoutCacheKey({
      cards: cards.map((card) => ({ ...card, labelColor: "#d05a45" } as CardLayoutInput)),
      bounds: { ...bounds, backgroundColor: "#ffffff" } as CardLayoutBounds,
      options: { ...options, searchBudget: 9999 },
    });

    expect(equivalent).toBe(base);
    expect(createCardLayoutCacheKey({
      cards: [{ ...cards[0]!, anchorX: cards[0]!.anchorX + 1 }, cards[1]!],
      bounds,
      options,
    })).not.toBe(base);
    expect(createCardLayoutCacheKey({
      cards,
      bounds: { ...bounds, occupiedAreas: [{ x: 48, y: 781, width: 280, height: 120 }] },
      options,
    })).not.toBe(base);
  });

  it("re-keys a pan from the origin alone, leaving the serialized rings untouched", () => {
    const centered = [centeredPolygon()];
    const before = originKey(centered, 700, 450);

    // A memoized ring segment cannot see this; a segment rebuilt from the rings would.
    centered[0]!.rings[0]![0]!.x = 9999;
    const after = originKey(centered, 790, 490);

    expect(after).not.toBe(before);
    expect(ringSegment(after)).toBe(ringSegment(before));
  });

  it("keys geometry carried across a pan the same as geometry projected fresh at that origin", () => {
    const carried = [centeredPolygon()];
    originKey(carried, 700, 450);

    expect(originKey(carried, 790, 490)).toBe(originKey([centeredPolygon()], 790, 490));
  });

  it("separates two pans of the same geometry", () => {
    const centered = [centeredPolygon()];

    expect(originKey(centered, 700, 450)).not.toBe(originKey(centered, 701, 450));
  });

  it("ignores the origin when no polygon is protected", () => {
    const withoutPolygons = createCardLayoutCacheKey({ cards, bounds, options });

    expect(originKey([], 700, 450)).toBe(originKey([], 120, 980));
    expect(originKey([], 700, 450)).toBe(withoutPolygons);
  });

  it("evicts the least recently used result after reaching its capacity", () => {
    const cache = new CardLayoutCache(2);
    cache.set("a", result);
    cache.set("b", { ...result, mode: "radial" });
    expect(cache.get("a")).toBe(result);

    cache.set("c", { ...result, mode: "grid" });

    expect(cache.get("a")).toBe(result);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")?.mode).toBe("grid");
    expect(cache.size).toBe(2);
  });

  it("ignores invalid capacities without allowing unbounded growth", () => {
    const cache = new CardLayoutCache(0);
    cache.set("a", result);
    cache.set("b", result);

    expect(cache.size).toBe(1);
    expect(cache.get("b")).toBe(result);
  });
});
