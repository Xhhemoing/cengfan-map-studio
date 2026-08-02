import { describe, expect, it } from "vitest";
import { computeMapContentBounds, computeMapOccupiedAreas } from "./map-content-bounds";
import type { MapSettings } from "./scene-document";

function vectorMap(overrides: Partial<MapSettings> = {}): MapSettings {
  return {
    x: 350,
    y: 120,
    width: 800,
    height: 690,
    scale: 1,
    landColor: "#eee",
    activeColor: "#123",
    edgeColor: "#789",
    showProvinceLabels: true,
    ...overrides,
  };
}

describe("computeMapContentBounds", () => {
  it("returns the union of province AABBs in vector mode", () => {
    const map = vectorMap();
    const result = computeMapContentBounds({
      map,
      provinceAreas: [
        { x: 400, y: 180, width: 200, height: 160 },
        { x: 600, y: 300, width: 240, height: 260 },
      ],
    });
    expect(result).toEqual({ x: 400, y: 180, width: 440, height: 380 });
  });

  it("falls back to the map frame when province AABBs are empty", () => {
    const map = vectorMap();
    const result = computeMapContentBounds({ map, provinceAreas: [] });
    expect(result).toEqual({ x: 350, y: 120, width: 800, height: 690 });
  });

  it("falls back to the frame when province AABBs are degenerate", () => {
    const map = vectorMap();
    const result = computeMapContentBounds({
      map,
      provinceAreas: [{ x: 0, y: 0, width: 0, height: 0 }],
    });
    expect(result).toEqual({ x: 350, y: 120, width: 800, height: 690 });
  });

  it("uses the aligned image rect (offset by the frame) in image mode", () => {
    const map = vectorMap({
      renderSource: {
        kind: "image",
        assetId: "a",
        src: "data:",
        fit: "contain",
        opacity: 1,
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 800,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 100,
          y: 80,
          width: 400,
          height: 300,
          rotation: 0,
        },
      },
    });
    const result = computeMapContentBounds({ map, provinceAreas: [{ x: 9999, y: 9999, width: 10, height: 10 }] });
    // Image alignment is in map-local space, offset by map.x/map.y in canvas.
    expect(result).toEqual({ x: 350 + 100, y: 120 + 80, width: 400, height: 300 });
  });

  it("uses the rotated image AABB for a replaced image map", () => {
    const map = vectorMap({
      renderSource: {
        kind: "image",
        assetId: "a",
        src: "data:",
        fit: "contain",
        opacity: 1,
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 800,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 100,
          y: 80,
          width: 400,
          height: 300,
          rotation: 90,
        },
      },
    });

    expect(computeMapContentBounds({ map, provinceAreas: [] })).toEqual({
      x: 500,
      y: 150,
      width: 300,
      height: 400,
    });
    expect(computeMapOccupiedAreas({ map, provinceAreas: [] })).toEqual([
      { x: 500, y: 150, width: 300, height: 400 },
    ]);
  });

  it("protects both vector provinces and image bounds in overlay mode", () => {
    const provinceAreas = [{ x: 400, y: 180, width: 200, height: 160 }];
    const map = vectorMap({
      renderSource: {
        kind: "image",
        assetId: "a",
        src: "data:",
        fit: "contain",
        opacity: 1,
        composition: "overlay",
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 800,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 300,
          y: 280,
          width: 300,
          height: 200,
          rotation: 0,
        },
      },
    });

    expect(computeMapContentBounds({ map, provinceAreas })).toEqual({
      x: 400,
      y: 180,
      width: 550,
      height: 420,
    });
    expect(computeMapOccupiedAreas({ map, provinceAreas })).toEqual([
      provinceAreas[0],
      { x: 650, y: 400, width: 300, height: 200 },
    ]);
  });

  it("falls back to the frame when an image mode has no alignment", () => {
    const map = vectorMap({
      renderSource: { kind: "image", assetId: "a", src: "data:", fit: "contain", opacity: 1 },
    });
    const result = computeMapContentBounds({ map, provinceAreas: [] });
    expect(result).toEqual({ x: 350, y: 120, width: 800, height: 690 });
  });

  it("tracks the transformed frame when an unaligned image map is scaled", () => {
    const map = vectorMap({
      x: 120,
      y: 60,
      scale: 1.5,
      renderSource: { kind: "image", assetId: "a", src: "data:", fit: "contain", opacity: 1 },
    });

    const expected = {
      x: 120 + 800 / 2 + (0 - 800 / 2) * 1.5,
      y: 60 + 690 / 2 + (0 - 690 / 2) * 1.5,
      width: 800 * 1.5,
      height: 690 * 1.5,
    };
    const provinceAreas = [{ x: 220, y: 140, width: 300, height: 260 }];
    expect(computeMapContentBounds({ map, provinceAreas })).toEqual(expected);
    expect(computeMapOccupiedAreas({ map, provinceAreas })).toEqual([expected]);
  });

  it("protects vectors and the transformed frame for an unaligned overlay image", () => {
    const map = vectorMap({
      scale: 1.25,
      renderSource: { kind: "image", assetId: "a", src: "data:", fit: "cover", opacity: 1, composition: "overlay" },
    });
    const provinceAreas = [{ x: 400, y: 180, width: 200, height: 160 }];
    const frame = {
      x: 350 + 800 / 2 + (0 - 800 / 2) * 1.25,
      y: 120 + 690 / 2 + (0 - 690 / 2) * 1.25,
      width: 800 * 1.25,
      height: 690 * 1.25,
    };

    expect(computeMapContentBounds({ map, provinceAreas })).toEqual(frame);
    expect(computeMapOccupiedAreas({ map, provinceAreas })).toEqual([provinceAreas[0], frame]);
  });

  it("protects the transformed South China Sea inset when it is folded", () => {
    const map = vectorMap({ x: 120, y: 60, scale: 1.5, collapseSouthChinaSea: true });
    const areas = computeMapOccupiedAreas({
      map,
      provinceAreas: [{ x: 200, y: 100, width: 300, height: 260 }],
    });

    expect(areas.at(-1)).toEqual({
      x: 120 + 800 / 2 + (650 - 800 / 2) * 1.5,
      y: 60 + 690 / 2 + (514.4 - 690 / 2) * 1.5,
      width: 140 * 1.5,
      height: 165.6 * 1.5,
    });
  });
});
