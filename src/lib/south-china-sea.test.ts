import { describe, expect, it } from "vitest";
import type { MapFeature } from "./map-data";
import {
  SOUTH_SEA_LAT_THRESHOLD,
  defaultSouthSeaInsetFrame,
  splitFeatureForSouthChinaSea,
  splitMapFeaturesForSouthChinaSea,
} from "./south-china-sea";

function poly(latMin: number, latMax: number, lonMin = 110, lonMax = 111): number[][][] {
  return [[
    [lonMin, latMin],
    [lonMax, latMin],
    [lonMax, latMax],
    [lonMin, latMax],
    [lonMin, latMin],
  ]];
}

const hainan: MapFeature = {
  type: "Feature",
  id: "460000",
  name: "海南省",
  shortName: "海南",
  center: [110.3, 20],
  properties: { adcode: 460000, name: "海南省", center: [110.3, 20] },
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      poly(18.2, 20.1),
      poly(3.8, 4.1),
      poly(15.0, 15.3),
    ],
  },
};

const nearThresholdHainan: MapFeature = {
  ...hainan,
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      poly(18.14, 20.1),
      poly(3.8, 4.1),
      poly(15.0, 15.3),
    ],
  },
};

const beijing: MapFeature = {
  type: "Feature",
  id: "110000",
  name: "北京市",
  shortName: "北京",
  center: [116.4, 39.9],
  properties: { adcode: 110000, name: "北京市", center: [116.4, 39.9] },
  geometry: {
    type: "Polygon",
    coordinates: poly(39, 41, 115, 117),
  },
};

describe("south china sea fold", () => {
  it("splits hainan main island from southern island fragments", () => {
    const split = splitFeatureForSouthChinaSea(hainan);
    expect(split.mainland?.geometry.type).toBe("Polygon");
    expect(split.inset?.geometry.type).toBe("MultiPolygon");
    if (split.inset?.geometry.type === "MultiPolygon") {
      expect(split.inset.geometry.coordinates).toHaveLength(2);
    }
    if (split.mainland?.geometry.type === "Polygon") {
      const coordinates = split.mainland.geometry.coordinates as Array<Array<[number, number]>>;
      const ring = coordinates[0] ?? [];
      const minLat = Math.min(...ring.map((point) => point[1]));
      expect(minLat).toBeGreaterThanOrEqual(SOUTH_SEA_LAT_THRESHOLD);
    }
  });

  it("keeps hainan main island when its southern coast dips below the split threshold", () => {
    const split = splitFeatureForSouthChinaSea(nearThresholdHainan);

    expect(split.mainland?.geometry.type).toBe("Polygon");
    expect(split.inset?.geometry.type).toBe("MultiPolygon");
    if (split.mainland?.geometry.type === "Polygon") {
      expect(split.mainland.geometry.coordinates).toEqual(poly(18.14, 20.1));
    }
    if (split.inset?.geometry.type === "MultiPolygon") {
      expect(split.inset.geometry.coordinates).toHaveLength(2);
    }
  });

  it("leaves pure mainland provinces untouched", () => {
    const split = splitFeatureForSouthChinaSea(beijing);
    expect(split.mainland).toBe(beijing);
    expect(split.inset).toBeNull();
  });

  it("only builds inset features when collapse is enabled", () => {
    const open = splitMapFeaturesForSouthChinaSea([beijing, hainan], false);
    expect(open.mainlandFeatures).toHaveLength(2);
    expect(open.insetFeatures).toHaveLength(0);

    const folded = splitMapFeaturesForSouthChinaSea([beijing, hainan], true);
    expect(folded.mainlandFeatures).toHaveLength(2);
    expect(folded.insetFeatures).toHaveLength(1);
    expect(folded.insetFeatures[0]?.name).toBe("海南省");
  });

  it("places the default inset frame in the bottom-right of the map", () => {
    const frame = defaultSouthSeaInsetFrame(800, 690);
    expect(frame.x + frame.width).toBeLessThanOrEqual(800);
    expect(frame.y + frame.height).toBeLessThanOrEqual(690);
    expect(frame.x).toBeGreaterThan(800 * 0.5);
    expect(frame.y).toBeGreaterThan(690 * 0.5);
  });
});
