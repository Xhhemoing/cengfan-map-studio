import { describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardLayoutInput, CardLayoutOptions, CardLayoutResult } from "./card-layout";
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
