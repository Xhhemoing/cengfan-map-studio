import { describe, expect, it } from "vitest";
import type { CardArea, CardLayoutBounds, CardLayoutInput, CardPolygon } from "./card-layout";
import { createCardLayoutCacheKey } from "./card-layout-cache";

const cards: CardLayoutInput[] = [
  { id: "beijing", anchorX: 810, anchorY: 320, width: 180, height: 96 },
  { id: "zhejiang", anchorX: 860, anchorY: 610, width: 180, height: 96 },
];

const polygons: CardPolygon[] = [
  {
    rings: [[
      { x: 540, y: 220 },
      { x: 620, y: 240 },
      { x: 600, y: 320 },
      { x: 540, y: 220 },
    ]],
    bounds: { x: 540, y: 220, width: 80, height: 100 },
  },
  {
    rings: [[
      { x: 760, y: 480 },
      { x: 850, y: 470 },
      { x: 830, y: 560 },
      { x: 760, y: 480 },
    ]],
    bounds: { x: 760, y: 470, width: 90, height: 90 },
  },
];

const originX = 750;
const originY = 450;

const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 320, y: 100, width: 860, height: 700 },
  margin: 32,
  gap: 14,
  occupiedPolygons: polygons.map((polygon) => translatePolygon(polygon, originX, originY)),
};

function translateArea(area: CardArea, x: number, y: number): CardArea {
  return { ...area, x: area.x + x, y: area.y + y };
}

function translatePolygon(polygon: CardPolygon, x: number, y: number): CardPolygon {
  return {
    rings: polygon.rings.map((ring) => ring.map((point) => ({
      x: point.x + x,
      y: point.y + y,
    }))),
    ...(polygon.bounds ? { bounds: translateArea(polygon.bounds, x, y) } : {}),
  };
}

function polygonGeometrySuffix(key: string): string {
  const separator = key.indexOf("|");
  expect(separator).toBeGreaterThan(-1);
  const polygonSegment = key.slice(separator + 1);
  const originSeparator = polygonSegment.indexOf("@");
  expect(originSeparator).toBeGreaterThan(-1);
  return polygonSegment.slice(originSeparator + 1);
}

describe("card layout cache affine polygon key", () => {
  it("keeps the polygon suffix stable across a coherent map translation", () => {
    const base = createCardLayoutCacheKey({
      cards,
      bounds,
      options: { mode: "quadrant", autoBalance: true },
      polygonOrigin: { polygons, originX, originY },
    });
    const deltaX = 73;
    const deltaY = -41;
    const translated = createCardLayoutCacheKey({
      cards: cards.map((card) => ({
        ...card,
        anchorX: card.anchorX + deltaX,
        anchorY: card.anchorY + deltaY,
      })),
      bounds: {
        ...bounds,
        map: translateArea(bounds.map, deltaX, deltaY),
        occupiedPolygons: polygons.map((polygon) =>
          translatePolygon(polygon, originX + deltaX, originY + deltaY)),
      },
      options: { mode: "quadrant", autoBalance: true },
      polygonOrigin: {
        polygons,
        originX: originX + deltaX,
        originY: originY + deltaY,
      },
    });

    // The whole request must remain position-sensitive, but province ring serialization
    // is reusable because a uniform pan changes no centered collision geometry.
    expect(translated).not.toBe(base);
    expect(polygonGeometrySuffix(translated)).toBe(polygonGeometrySuffix(base));

    const reshapedPolygons = polygons.map((polygon, polygonIndex) => polygonIndex > 0 ? polygon : {
      ...polygon,
      rings: polygon.rings.map((ring, ringIndex) => ringIndex > 0 ? ring : ring.map((point, pointIndex) =>
        pointIndex === 1 ? { ...point, x: point.x + 1 } : point)),
    });
    const reshaped = createCardLayoutCacheKey({
      cards,
      bounds: {
        ...bounds,
        occupiedPolygons: reshapedPolygons.map((polygon) => translatePolygon(polygon, originX, originY)),
      },
      options: { mode: "quadrant", autoBalance: true },
      polygonOrigin: { polygons: reshapedPolygons, originX, originY },
    });
    expect(polygonGeometrySuffix(reshaped)).not.toBe(polygonGeometrySuffix(base));
  });
});
