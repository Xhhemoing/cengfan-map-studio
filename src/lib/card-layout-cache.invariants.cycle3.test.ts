import { describe, expect, it } from "vitest";
import type { CardLayoutBounds, CardLayoutInput, CardPolygon } from "./card-layout";
import { createCardLayoutCacheKey } from "./card-layout-cache";

const cards: CardLayoutInput[] = [
  { id: "beijing", anchorX: 810, anchorY: 320, width: 180, height: 96 },
];

const baseBounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 320, y: 100, width: 860, height: 700 },
  margin: 32,
  gap: 14,
};

const centeredPolygons: CardPolygon[] = [{
  rings: [[
    { x: -40, y: -30 },
    { x: 40, y: -30 },
    { x: 40, y: 30 },
    { x: -40, y: -30 },
  ]],
  bounds: { x: -40, y: -30, width: 80, height: 60 },
}];

function translatePolygons(
  polygons: readonly CardPolygon[],
  originX: number,
  originY: number,
): CardPolygon[] {
  return polygons.map((polygon) => ({
    rings: polygon.rings.map((ring) => ring.map((point) => ({
      x: point.x + originX,
      y: point.y + originY,
    }))),
    ...(polygon.bounds ? {
      bounds: {
        ...polygon.bounds,
        x: polygon.bounds.x + originX,
        y: polygon.bounds.y + originY,
      },
    } : {}),
  }));
}

function cacheKey(polygons: readonly CardPolygon[], originX: number, originY: number): string {
  return createCardLayoutCacheKey({
    cards,
    bounds: {
      ...baseBounds,
      occupiedPolygons: translatePolygons(polygons, originX, originY),
    },
    options: { mode: "quadrant", autoBalance: true },
    polygonOrigin: { polygons, originX, originY },
  });
}

function ringSegment(key: string): string {
  const polygonSegment = key.slice(key.indexOf("|") + 1);
  return polygonSegment.slice(polygonSegment.indexOf("@") + 1);
}

describe("card layout cache polygon-key invariants", () => {
  it("separates keys that would collide if the polygon origin were ignored", () => {
    const first = cacheKey(centeredPolygons, 700, 450);
    const second = cacheKey(centeredPolygons, 790, 490);

    expect(ringSegment(second)).toBe(ringSegment(first));
    expect(second).not.toBe(first);
  });

  it("separates keys when rings differ at the same origin", () => {
    const reshapedPolygons: CardPolygon[] = [{
      ...centeredPolygons[0]!,
      rings: [[
        { x: -40, y: -30 },
        { x: 41, y: -30 },
        { x: 40, y: 30 },
        { x: -40, y: -30 },
      ]],
    }];
    const original = cacheKey(centeredPolygons, 700, 450);
    const reshaped = cacheKey(reshapedPolygons, 700, 450);

    expect(ringSegment(reshaped)).not.toBe(ringSegment(original));
    expect(reshaped).not.toBe(original);
  });
});
