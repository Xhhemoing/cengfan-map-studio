import type { CardArea, CardPoint, CardPolygon } from "./card-layout";
import type { MapFeature, Position } from "./map-data";
import type { MapSettings } from "./scene-document";

/** Heat-map fill ramp used by the poster's map theme. */
export const HEAT_COLORS = ["#d9f0e5", "#8ccfb6", "#4da184", "#17675e"] as const;

export function featureCoordinatePolygons(feature: MapFeature): Position[][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Position[][]]
    : feature.geometry.coordinates as Position[][][];
}

export function simplifyProjectedRing(points: CardPoint[], tolerance = 1.5, maximumPoints = 180): CardPoint[] {
  if (points.length <= 4) return points;
  const simplified = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const previous = simplified[simplified.length - 1]!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= tolerance) simplified.push(point);
  }
  const last = points[points.length - 1]!;
  if (Math.hypot(last.x - simplified[simplified.length - 1]!.x, last.y - simplified[simplified.length - 1]!.y) > 0.01) {
    simplified.push(last);
  }
  if (simplified.length <= maximumPoints) return simplified.length >= 3 ? simplified : points;

  // Collision needs the outer contour, not every source vertex. Bound the work
  // per province so dense coastlines cannot stall auto-layout or jsdom renders.
  const sampled: CardPoint[] = [];
  const lastIndex = simplified.length - 1;
  for (let index = 0; index < maximumPoints; index += 1) {
    sampled.push(simplified[Math.round(index * lastIndex / (maximumPoints - 1))]!);
  }
  return sampled;
}

export function projectedPolygon(rings: CardPoint[][]): CardPolygon | null {
  const shell = rings[0];
  if (!shell || shell.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of rings.flat()) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    rings,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

/** Projected province bounding boxes in canvas pixels (map position/scale applied). */
export function computeProvinceAreas(
  mainlandFeatures: MapFeature[],
  bounds: (feature: MapFeature) => [[number, number], [number, number]],
  map: MapSettings,
): CardArea[] {
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  return mainlandFeatures.flatMap((feature) => {
    const [[left, top], [right, bottom]] = bounds(feature);
    if (![left, top, right, bottom].every(Number.isFinite)) return [];
    return [{
      x: map.x + centerX + (left - centerX) * map.scale,
      y: map.y + centerY + (top - centerY) * map.scale,
      width: (right - left) * map.scale,
      height: (bottom - top) * map.scale,
    }];
  });
}

/** Simplified province outlines in canvas pixels, used as collision polygons for
 *  card layout. Empty when the map renders as a full-bleed image (no province shapes). */
export function computeProvincePolygons(
  mainlandFeatures: MapFeature[],
  projection: (coordinate: Position) => [number, number] | null,
  map: MapSettings,
): CardPolygon[] {
  const source = map.renderSource;
  if (source?.kind === "image" && source.composition !== "overlay") return [];
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  const projectPoint = (coordinate: Position): CardPoint | null => {
    const point = projection(coordinate);
    if (!point || !point.every(Number.isFinite)) return null;
    return {
      x: map.x + centerX + (point[0] - centerX) * map.scale,
      y: map.y + centerY + (point[1] - centerY) * map.scale,
    };
  };
  return mainlandFeatures.flatMap((feature): CardPolygon[] => {
    if (map.provinceStyles?.[feature.name]?.visible === false) return [];
    return featureCoordinatePolygons(feature).flatMap((polygon) => {
      const rings = polygon.map((ring) => simplifyProjectedRing(
        ring.flatMap((coordinate) => {
          const point = projectPoint(coordinate);
          return point ? [point] : [];
        }),
      ));
      const projected = projectedPolygon(rings);
      return projected ? [projected] : [];
    });
  });
}
