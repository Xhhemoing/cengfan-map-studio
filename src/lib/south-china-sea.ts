import type { MapFeature, Position } from "./map-data";

/** Mainland China cutoff: polygons entirely south of this latitude go into the inset. */
export const SOUTH_SEA_LAT_THRESHOLD = 18.15;

export interface SouthChinaSeaSplit {
  /** Features used for the main map projection / fills when collapsed. */
  mainlandFeatures: MapFeature[];
  /** Features / polygon fragments drawn inside the South China Sea inset box. */
  insetFeatures: MapFeature[];
}

function ringMinLat(ring: Position[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const point of ring) {
    if (Number.isFinite(point[1])) min = Math.min(min, point[1]);
  }
  return min;
}

function polygonMinLat(polygon: Position[][]): number {
  if (!polygon.length) return Number.POSITIVE_INFINITY;
  return ringMinLat(polygon[0] ?? []);
}

function polygonArea(polygon: Position[][]): number {
  const ring = polygon[0] ?? [];
  if (ring.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]!;
    const [x2, y2] = ring[index + 1]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function asPolygons(feature: MapFeature): Position[][][] {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates as Position[][]];
  }
  if (feature.geometry.type === "MultiPolygon") {
    return feature.geometry.coordinates as Position[][][];
  }
  return [];
}

function rebuildFeature(
  feature: MapFeature,
  polygons: Position[][][],
  idSuffix = "",
): MapFeature | null {
  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    return {
      ...feature,
      id: idSuffix ? `${feature.id}${idSuffix}` : feature.id,
      geometry: {
        type: "Polygon",
        coordinates: polygons[0]!,
      },
    };
  }
  return {
    ...feature,
    id: idSuffix ? `${feature.id}${idSuffix}` : feature.id,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons,
    },
  };
}

/**
 * Split Hainan (and any other multi-part coastal province) into mainland-facing
 * geometry vs South China Sea island fragments for the optional inset frame.
 */
export function splitFeatureForSouthChinaSea(feature: MapFeature): {
  mainland: MapFeature | null;
  inset: MapFeature | null;
} {
  const polygons = asPolygons(feature);
  if (polygons.length === 0) {
    return { mainland: feature, inset: null };
  }

  const mainlandPolys: Position[][][] = [];
  const insetPolys: Position[][][] = [];
  const mainPolygonIndex = polygons.reduce((largestIndex, polygon, index) => (
    polygonArea(polygon) > polygonArea(polygons[largestIndex] ?? []) ? index : largestIndex
  ), 0);
  for (const [index, polygon] of polygons.entries()) {
    // The main island can dip just below the latitude cutoff in source data.
    // Keep the largest polygon as the province's main landmass and fold only
    // the smaller southern fragments into the inset.
    if (index === mainPolygonIndex || polygonMinLat(polygon) >= SOUTH_SEA_LAT_THRESHOLD) {
      mainlandPolys.push(polygon);
    } else {
      insetPolys.push(polygon);
    }
  }

  // Features fully north of the threshold stay as-is.
  if (insetPolys.length === 0) {
    return { mainland: feature, inset: null };
  }

  return {
    mainland: rebuildFeature(feature, mainlandPolys),
    inset: rebuildFeature(feature, insetPolys, "-south-sea"),
  };
}

export function splitMapFeaturesForSouthChinaSea(
  features: readonly MapFeature[],
  collapse: boolean,
): SouthChinaSeaSplit {
  if (!collapse) {
    return {
      mainlandFeatures: [...features],
      insetFeatures: [],
    };
  }

  const mainlandFeatures: MapFeature[] = [];
  const insetFeatures: MapFeature[] = [];

  for (const feature of features) {
    const split = splitFeatureForSouthChinaSea(feature);
    if (split.mainland) mainlandFeatures.push(split.mainland);
    if (split.inset) insetFeatures.push(split.inset);
  }

  return { mainlandFeatures, insetFeatures };
}

/** Default inset frame in map-local pixel space (bottom-right corner). */
export function defaultSouthSeaInsetFrame(mapWidth: number, mapHeight: number) {
  const width = Math.max(72, Math.min(140, mapWidth * 0.18));
  const height = Math.max(90, Math.min(170, mapHeight * 0.24));
  const margin = 10;
  return {
    x: Math.max(0, mapWidth - width - margin),
    y: Math.max(0, mapHeight - height - margin),
    width,
    height,
  };
}
