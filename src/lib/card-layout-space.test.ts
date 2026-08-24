import { describe, expect, it } from "vitest";
import {
  LayoutSpace,
  PlacementIndex,
  normalizeBounds,
  protectedZones,
  validateHard,
} from "./card-layout-space";
import { rectangleIntersectsPolygon } from "./card-layout-geometry";
import type { CardLayoutBounds, CardPlacement } from "./card-layout-types";

const bounds: CardLayoutBounds = {
  width: 1000,
  height: 800,
  map: { x: 300, y: 200, width: 400, height: 300 },
  margin: 20,
  gap: 10,
};

function placement(id: string, x: number, y: number, width = 100, height = 60): CardPlacement {
  return { id, anchorX: x, anchorY: y, width, height, x, y, side: "right" };
}

describe("layout space", () => {
  it("caps a margin that would invert the usable canvas", () => {
    const normalized = normalizeBounds({ ...bounds, width: 200, height: 150, margin: 400 });
    expect(normalized.margin).toBe(75);
  });

  it("replaces non-finite and negative geometry with usable numbers", () => {
    const normalized = normalizeBounds({
      width: Number.NaN,
      height: Number.POSITIVE_INFINITY,
      map: { x: Number.NaN, y: 10, width: -50, height: 40 },
      margin: Number.NaN,
      gap: -5,
    });
    expect(normalized.width).toBe(0);
    expect(normalized.height).toBe(0);
    expect(normalized.margin).toBe(0);
    expect(normalized.gap).toBe(0);
    expect(normalized.map).toEqual({ x: 0, y: 10, width: 0, height: 40 });
  });

  it("drops polygons that cannot form a ring but keeps valid ones", () => {
    const space = new LayoutSpace({
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons: [
        { rings: [[{ x: 0, y: 0 }, { x: 1, y: 1 }]] },
        { rings: [[{ x: 400, y: 300 }, { x: 500, y: 300 }, { x: 500, y: 400 }]] },
      ],
    });
    expect(space.polygons).toHaveLength(1);
    expect(space.polygons[0]!.area).toEqual({ x: 400, y: 300, width: 100, height: 100 });
  });

  it("falls back to the map frame only when no explicit geography is given", () => {
    expect(protectedZones(bounds)).toEqual([bounds.map]);
    expect(protectedZones({ ...bounds, allowMapOverlap: true })).toEqual([]);
    expect(protectedZones({ ...bounds, occupiedAreas: [] })).toEqual([]);
    expect(protectedZones({ ...bounds, occupiedAreas: [{ x: 1, y: 2, width: 3, height: 4 }] }))
      .toEqual([{ x: 1, y: 2, width: 3, height: 4 }]);
  });

  it("reports the blocking rectangle so a sweep can jump past it", () => {
    const zone = { x: 300, y: 200, width: 400, height: 300 };
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [zone] });
    expect(space.blocked({ x: 40, y: 40, width: 100, height: 60 })).toBe(false);
    const blocker = space.firstBlocker({ x: 280, y: 220, width: 100, height: 60 });
    expect(blocker?.exact).toBe(true);
    expect(blocker?.area).toEqual(zone);
  });

  it("marks a polygon blocker as inexact because its AABB is conservative", () => {
    const space = new LayoutSpace({
      ...bounds,
      occupiedAreas: [],
      occupiedPolygons: [{ rings: [[{ x: 300, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 400 }]] }],
    });
    expect(space.firstBlocker({ x: 320, y: 210, width: 60, height: 40 })?.exact).toBe(false);
    expect(space.blocked({ x: 60, y: 600, width: 60, height: 40 })).toBe(false);
  });

  it("finds neighbours across grid cells regardless of card size", () => {
    const space = new LayoutSpace(bounds);
    const index = PlacementIndex.forSpace(space, [placement("a", 100, 100, 400, 300)]);
    expect(index.hits({ x: 460, y: 380, width: 40, height: 40 }, 0)).toBe(true);
    expect(index.hits({ x: 520, y: 420, width: 40, height: 40 }, 0)).toBe(false);
    expect(index.hits({ x: 520, y: 420, width: 40, height: 40 }, 30)).toBe(true);
    expect(index.clone().items).toHaveLength(1);
  });

  it("answers polygon hit tests exactly, however coarse the occupancy raster is", () => {
    // A ring with a genuine hole plus a blob small enough to sit inside a
    // single raster cell: the first punishes a raster that treats "inside the
    // outline" as blocked, the second one that assumes a cell no outline
    // crosses must be empty.
    const ring = [
      { x: 300, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 500 }, { x: 300, y: 500 },
    ];
    const hole = [
      { x: 420, y: 300 }, { x: 580, y: 300 }, { x: 580, y: 420 }, { x: 420, y: 420 },
    ];
    const speck = [{ x: 120, y: 640 }, { x: 150, y: 640 }, { x: 150, y: 670 }, { x: 120, y: 670 }];
    const polygons = [{ rings: [ring, [...hole].reverse()] }, { rings: [speck] }];
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [], occupiedPolygons: polygons });

    // Brute force over probes of several sizes; every one must agree with the
    // geometry primitives the raster is shortcutting. The half-pixel offset
    // keeps probe edges off the polygon coordinates, where "touching" and
    // "overlapping" disagree by zero area and the answer is arbitrary anyway.
    for (const size of [8, 30, 90]) {
      for (let x = 20.5; x <= 900; x += 37) {
        for (let y = 20.5; y <= 700; y += 41) {
          const probe = { x, y, width: size, height: size };
          const expected = polygons.some((polygon) =>
            rectangleIntersectsPolygon(probe, polygon, space.gap));
          expect({ x, y, size, blocked: space.blocked(probe) })
            .toEqual({ x, y, size, blocked: expected });
        }
      }
    }
  });

  it("rejects layouts that break any hard constraint", () => {
    const space = new LayoutSpace({ ...bounds, occupiedAreas: [{ x: 300, y: 200, width: 400, height: 300 }] });
    expect(validateHard([placement("a", 40, 40), placement("b", 40, 200)], space)).toBe(true);
    expect(validateHard([placement("a", 40, 40), placement("b", 60, 60)], space)).toBe(false);
    expect(validateHard([placement("outside", -10, 40)], space)).toBe(false);
    expect(validateHard([placement("on-map", 320, 220)], space)).toBe(false);
  });
});
