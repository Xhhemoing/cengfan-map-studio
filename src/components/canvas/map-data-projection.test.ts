import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geoMercator, geoPath } from "d3-geo";
import type { MapFeature } from "../../lib/map-data";
import { fitFeatureProjection, getFeatureSplit } from "./map-data-projection";

const beijing: MapFeature = {
  type: "Feature",
  properties: { adcode: 1, name: "北京市", center: [116, 40] },
  geometry: { type: "Polygon", coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40.5], [115.5, 40.5], [115.5, 39.5]]] },
  id: "1",
  name: "北京市",
  shortName: "北京",
  center: [116, 40],
};

const empty: MapFeature = {
  type: "Feature",
  properties: { adcode: 2, name: "空区", center: [0, 0] },
  geometry: { type: "Polygon", coordinates: [] },
  id: "2",
  name: "空区",
  shortName: "空",
  center: [116, 40],
};

const extent: [[number, number], [number, number]] = [[0, 0], [800, 690]];

describe("map-data-projection", () => {
  it("matches a plain d3 mercator fit for path, bounds and centers", () => {
    const projected = fitFeatureProjection([beijing], extent);
    const projection = geoMercator().fitExtent(extent, { type: "FeatureCollection", features: [beijing] } as never);
    const path = geoPath(projection);

    expect(projected.path(beijing)).toBe(path(beijing as never));
    expect(projected.bounds(beijing)).toEqual(path.bounds(beijing as never));
    expect(projected.centroid(beijing)).toEqual([...path.centroid(beijing as never)]);
    expect(projected.center(beijing)).toEqual([...path.centroid(beijing as never)]);
    expect(projected.project(beijing.center)).toEqual([...projection(beijing.center)!]);
  });

  it("reports null bounds and center for geometry that does not project", () => {
    const projected = fitFeatureProjection([beijing], extent);
    expect(projected.bounds(empty)).toBeNull();
    expect(projected.center(empty)).toBeNull();
  });

  it("caches the south sea split per feature array and per collapse flag", () => {
    const features = [beijing];
    const open = getFeatureSplit(features, false);
    const folded = getFeatureSplit(features, true);

    expect(getFeatureSplit(features, false)).toBe(open);
    expect(getFeatureSplit(features, true)).toBe(folded);
    expect(folded).not.toBe(open);
    expect(getFeatureSplit([beijing], false)).not.toBe(open);
    expect(open.mainlandFeatures.map((feature) => feature.id)).toEqual(["1"]);
  });
});

describe("map layer file budget", () => {
  it.each([
    "src/components/canvas/MapLayer.tsx",
    "src/components/canvas/MapDataLayer.tsx",
  ])("keeps %s under the 400 line budget", (file) => {
    const lines = readFileSync(file, "utf8").split("\n").length;
    expect(lines).toBeLessThanOrEqual(400);
  });
});
