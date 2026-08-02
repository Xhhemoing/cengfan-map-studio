import { describe, expect, it } from "vitest";
import {
  affineFromControlPoints,
  autoFitAlignment,
  mapImageElementPlacement,
  mapImageTransform,
  type MapImageAlignment,
  type NormalizedRect,
} from "./map-alignment";

describe("map-alignment", () => {
  it("auto-fits image content bounds into map frame while preserving aspect ratio (contain)", () => {
    const alignment = autoFitAlignment({
      mapWidth: 800,
      mapHeight: 600,
      sourceWidth: 1000,
      sourceHeight: 500,
      // content occupies full image
      sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
      mode: "contain",
    });

    // image is wider than map aspect (1000/500=2 vs 800/600≈1.33) → height-limited
    expect(alignment.sourceWidth).toBe(1000);
    expect(alignment.sourceHeight).toBe(500);
    expect(alignment.width).toBeCloseTo(800, 5);
    expect(alignment.height).toBeCloseTo(400, 5);
    expect(alignment.x).toBeCloseTo(0, 5);
    expect(alignment.y).toBeCloseTo(100, 5);
    expect(alignment.rotation).toBe(0);
  });

  it("auto-fits using non-full sourceBounds as the effective content", () => {
    // Image has large margins; content is the middle half.
    const alignment = autoFitAlignment({
      mapWidth: 400,
      mapHeight: 400,
      sourceWidth: 800,
      sourceHeight: 800,
      sourceBounds: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      mode: "contain",
    });

    // content square 400x400 maps 1:1 into 400x400 map
    const placement = mapImageElementPlacement(alignment);
    // content center should land on map center
    const contentCenterX = placement.x + (0.25 + 0.25) * placement.width;
    const contentCenterY = placement.y + (0.25 + 0.25) * placement.height;
    expect(contentCenterX).toBeCloseTo(200, 5);
    expect(contentCenterY).toBeCloseTo(200, 5);
    // content size should equal map size
    expect(0.5 * placement.width).toBeCloseTo(400, 5);
    expect(0.5 * placement.height).toBeCloseTo(400, 5);
  });

  it("builds SVG transform around image center for rotation", () => {
    const alignment: MapImageAlignment = {
      sourceWidth: 100,
      sourceHeight: 50,
      sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      rotation: 15,
    };
    expect(mapImageTransform(alignment)).toBe(
      "translate(110 70) rotate(15) translate(-110 -70)",
    );
  });

  it("computes affine matrix from three control points", () => {
    // Source points (image normalized), target points (map local)
    const matrix = affineFromControlPoints([
      { source: { x: 0, y: 0 }, target: { x: 100, y: 50 } },
      { source: { x: 1, y: 0 }, target: { x: 300, y: 50 } },
      { source: { x: 0, y: 1 }, target: { x: 100, y: 250 } },
    ]);
    expect(matrix).not.toBeNull();
    // x' = 100 + 200*x + 0*y
    // y' = 50 + 0*x + 200*y
    expect(matrix!.a).toBeCloseTo(200, 5);
    expect(matrix!.b).toBeCloseTo(0, 5);
    expect(matrix!.c).toBeCloseTo(0, 5);
    expect(matrix!.d).toBeCloseTo(200, 5);
    expect(matrix!.e).toBeCloseTo(100, 5);
    expect(matrix!.f).toBeCloseTo(50, 5);
    expect(matrix!.residual).toBeCloseTo(0, 5);
  });

  it("returns null when control points are collinear or insufficient", () => {
    expect(affineFromControlPoints([
      { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
      { source: { x: 1, y: 0 }, target: { x: 1, y: 0 } },
    ])).toBeNull();
    expect(affineFromControlPoints([
      { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
      { source: { x: 1, y: 0 }, target: { x: 2, y: 0 } },
      { source: { x: 2, y: 0 }, target: { x: 4, y: 0 } },
    ])).toBeNull();
  });

  it("converts sourceBounds rect helper into default full bounds", () => {
    const full: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
    const alignment = autoFitAlignment({
      mapWidth: 100,
      mapHeight: 100,
      sourceWidth: 100,
      sourceHeight: 100,
      sourceBounds: full,
      mode: "stretch",
    });
    expect(alignment.width).toBe(100);
    expect(alignment.height).toBe(100);
    expect(alignment.x).toBe(0);
    expect(alignment.y).toBe(0);
  });
});
