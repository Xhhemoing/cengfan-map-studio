import { geoMercator, geoPath } from "d3-geo";
import type { MapFeature } from "../../lib/map-data";
import { splitMapFeaturesForSouthChinaSea } from "../../lib/south-china-sea";

const splitCache = new WeakMap<readonly MapFeature[], {
  open: ReturnType<typeof splitMapFeaturesForSouthChinaSea>;
  folded: ReturnType<typeof splitMapFeaturesForSouthChinaSea>;
}>();

export function getFeatureSplit(features: readonly MapFeature[], collapse: boolean) {
  let cached = splitCache.get(features);
  if (!cached) {
    cached = {
      open: splitMapFeaturesForSouthChinaSea(features, false),
      folded: splitMapFeaturesForSouthChinaSea(features, true),
    };
    splitCache.set(features, cached);
  }
  return collapse ? cached.folded : cached.open;
}

export interface FeatureProjection {
  project: (point: [number, number]) => [number, number] | null;
  path: (feature: MapFeature) => string | null | undefined;
  bounds: (feature: MapFeature) => [[number, number], [number, number]] | null;
  /** Projected visual center, or null when the geometry projects to a non-finite point. */
  center: (feature: MapFeature) => [number, number] | null;
  centroid: (feature: MapFeature) => [number, number];
}

/** Mercator fit of `features` into `extent`, with the path/bounds/center helpers map layers need. */
export function fitFeatureProjection(
  features: readonly MapFeature[],
  extent: [[number, number], [number, number]],
): FeatureProjection {
  const projection = geoMercator().fitExtent(extent, { type: "FeatureCollection", features } as never);
  const path = geoPath(projection);
  const centroid = (feature: MapFeature): [number, number] => {
    const point = path.centroid(feature as never);
    return [point[0], point[1]];
  };
  return {
    project: (point) => {
      const projected = projection(point);
      return projected ? [projected[0], projected[1]] : null;
    },
    path: (feature) => path(feature as never),
    bounds: (feature) => {
      const box = path.bounds(feature as never);
      if (!box || !Number.isFinite(box[0][0]) || !Number.isFinite(box[1][0])) return null;
      return box as [[number, number], [number, number]];
    },
    center: (feature) => {
      const point = centroid(feature);
      return Number.isFinite(point[0]) && Number.isFinite(point[1]) ? point : null;
    },
    centroid,
  };
}
