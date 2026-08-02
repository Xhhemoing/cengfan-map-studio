import { describe, expect, it } from "vitest";
import { normalizeMapFeatures, type RawMapFeature } from "./map-data";

const rawFeatures: RawMapFeature[] = [
  {
    type: "Feature",
    properties: {
      adcode: 110000,
      name: "北京市",
      center: [116.405285, 39.904989],
      centroid: [116.41995, 40.18994],
    },
    geometry: { type: "Polygon", coordinates: [] },
  },
  {
    type: "Feature",
    properties: {
      adcode: 100000,
      name: "",
    },
    geometry: { type: "MultiPolygon", coordinates: [] },
  },
];

describe("normalizeMapFeatures", () => {
  it("keeps named provincial features and indexes them by adcode", () => {
    const normalized = normalizeMapFeatures(rawFeatures);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      id: "110000",
      name: "北京市",
      shortName: "北京",
      center: [116.405285, 39.904989],
    });
  });

  it("matches province names with or without administrative suffixes", () => {
    const normalized = normalizeMapFeatures(rawFeatures);

    expect(normalized.find((feature) => feature.name === "北京市")).toMatchObject({
      name: "北京市",
      shortName: "北京",
    });
  });
});
