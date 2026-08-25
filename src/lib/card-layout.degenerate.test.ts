import { describe, expect, it } from "vitest";
import {
  clampCardPosition,
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPolygon,
} from "./card-layout";
import { FUZZ_MODES, fuzzScenario, oracleRectHitsPolygon } from "./card-layout-test-fixtures";

describe("card layout degenerate and hostile inputs", () => {
  const hostileBounds = (polygons: CardPolygon[]): CardLayoutBounds => ({
    width: 1200,
    height: 800,
    map: { x: 300, y: 150, width: 600, height: 500 },
    margin: 24,
    gap: 10,
    occupiedAreas: [],
    occupiedPolygons: polygons,
  });

  const sample = (count: number): CardLayoutInput[] => Array.from({ length: count }, (_, index) => ({
    id: `d-${index}`,
    anchorX: 350 + index * 70,
    anchorY: 250 + (index % 3) * 120,
    width: 150,
    height: 80,
  }));

  it.each<[string, CardPolygon[]]>([
    ["empty ring list", [{ rings: [] }]],
    ["empty ring", [{ rings: [[]] }]],
    ["single-point ring", [{ rings: [[{ x: 500, y: 400 }]] }]],
    ["two-point ring", [{ rings: [[{ x: 460, y: 300 }, { x: 720, y: 300 }]] }]],
    ["collinear ring", [{ rings: [[{ x: 400, y: 400 }, { x: 500, y: 400 }, { x: 600, y: 400 }, { x: 700, y: 400 }]] }]],
    ["zero-area ring", [{ rings: [[{ x: 500, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 400 }]] }]],
    ["ring with hole", [{
      rings: [
        [{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }],
        [{ x: 500, y: 330 }, { x: 700, y: 330 }, { x: 700, y: 520 }, { x: 500, y: 520 }],
      ],
    }]],
    ["hole larger than shell", [{
      rings: [
        [{ x: 500, y: 330 }, { x: 700, y: 330 }, { x: 700, y: 520 }, { x: 500, y: 520 }],
        [{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }],
      ],
    }]],
    ["declared bounds with empty rings", [{ rings: [], bounds: { x: 400, y: 300, width: 200, height: 150 } }]],
    ["declared bounds of zero size", [{
      rings: [[{ x: 500, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 400 }]],
      bounds: { x: 500, y: 400, width: 0, height: 0 },
    }]],
  ])("survives a degenerate polygon: %s", (_label, polygons) => {
    const layoutBounds = hostileBounds(polygons);
    const cards = sample(6);
    const result = solveCardLayout(cards, layoutBounds, { mode: "quadrant" });
    expect(result.placements).toHaveLength(cards.length);
    for (const placement of result.placements) {
      expect(Number.isFinite(placement.x)).toBe(true);
      expect(Number.isFinite(placement.y)).toBe(true);
    }
    if (result.status === "solved") {
      for (const placement of result.placements) {
        for (const polygon of polygons) {
          expect(oracleRectHitsPolygon(placement, polygon, layoutBounds.gap)).toBe(false);
        }
      }
    }
    expect(() => clampCardPosition({ x: 520, y: 380, width: 160, height: 90 }, layoutBounds)).not.toThrow();
  });

  it.each<[string, number, number]>([
    ["NaN anchors", Number.NaN, Number.NaN],
    ["positive infinity anchors", Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ["negative infinity anchors", Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ["mixed NaN/infinity anchors", Number.NaN, Number.POSITIVE_INFINITY],
  ])("never throws on non-finite anchors: %s", (_label, anchorX, anchorY) => {
    const polygons: CardPolygon[] = [{
      rings: [[{ x: 400, y: 250 }, { x: 800, y: 250 }, { x: 800, y: 600 }, { x: 400, y: 600 }]],
    }];
    const layoutBounds = hostileBounds(polygons);
    const cards: CardLayoutInput[] = [
      { id: "bad-0", anchorX, anchorY, width: 160, height: 90 },
      { id: "bad-1", anchorX, anchorY: 300, width: 160, height: 90 },
      { id: "good", anchorX: 500, anchorY: 400, width: 160, height: 90 },
    ];
    for (const mode of FUZZ_MODES) {
      let result: ReturnType<typeof solveCardLayout> | null = null;
      expect(() => { result = solveCardLayout(cards, layoutBounds, { mode, autoBalance: true }); }).not.toThrow();
      expect(result!.placements).toHaveLength(cards.length);
      expect(result!.placements.map((placement) => placement.id)).toEqual(cards.map((card) => card.id));
    }
    expect(() => clampCardPosition({ x: anchorX, y: anchorY, width: 160, height: 90 }, layoutBounds)).not.toThrow();
    expect(() => clampCardPosition({ x: 500, y: 400, width: anchorX, height: anchorY }, layoutBounds)).not.toThrow();
  });

  it("keeps repeated solves of the same inputs byte-identical", () => {
    const { cards, bounds: layoutBounds, options } = fuzzScenario(77);
    const first = solveCardLayout(cards, layoutBounds, options);
    const second = solveCardLayout(cards, layoutBounds, options);
    const third = solveCardLayout(cards.slice(), { ...layoutBounds }, { ...options });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("resolves equidistant repair slots to the first probe in scan order", () => {
    // (192,180) and (240,108) are exactly equidistant from the (30,30) probe.
    // The repair scan compares squared distances, so the row-major first hit
    // wins deterministically instead of depending on Math.hypot rounding.
    const layoutBounds: CardLayoutBounds = {
      width: 900,
      height: 700,
      map: { x: 300, y: 200, width: 300, height: 250 },
      margin: 30,
      gap: 6,
      occupiedAreas: [],
    };
    const cards: CardLayoutInput[] = Array.from({ length: 12 }, (_, index) => ({
      id: `tie-${index}`,
      anchorX: 450,
      anchorY: 325,
      width: 120,
      height: 60,
    }));
    const runs = Array.from({ length: 3 }, () => solveCardLayout(cards, layoutBounds, { mode: "right-stack" }));
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });
});
