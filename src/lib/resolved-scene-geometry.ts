import { geoMercator, geoPath } from "d3-geo";
import type { CardArea, CardPoint, CardPolygon, CardSide } from "./card-layout";
import { computeMapContentBounds, computeMapOccupiedAreas } from "./map-content-bounds";
import { getChinaMapFeatures, type MapFeature, type Position } from "./map-data";
import type { CanvasText, MapSettings } from "./scene-document";
import { splitMapFeaturesForSouthChinaSea } from "./south-china-sea";

const features = getChinaMapFeatures();
const splits = [splitMapFeaturesForSouthChinaSea(features, false), splitMapFeaturesForSouthChinaSea(features, true)];
const projections = new Map<string, ReturnType<typeof createProjection>>();
const centeredCache = new Map<string, CardPolygon[]>();

function boundedSet<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.set(key, value);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return value;
}

function createProjection(map: MapSettings) {
  const mainlandFeatures = splits[map.collapseSouthChinaSea === true ? 1 : 0]!.mainlandFeatures;
  const projection = geoMercator().fitExtent([[0, 0], [map.width, map.height]], { type: "FeatureCollection", features: mainlandFeatures } as never);
  const mapPath = geoPath(projection);
  const projectedBounds = mainlandFeatures.flatMap((feature) => {
    const [[left, top], [right, bottom]] = mapPath.bounds(feature as never);
    return [left, top, right, bottom].every(Number.isFinite) ? [{ left, top, right, bottom }] : [];
  });
  return { projection, mapPath, mainlandFeatures, projectedBounds };
}

function simplifyRing(points: CardPoint[], tolerance = 1.5, maximumPoints = 180): CardPoint[] {
  if (points.length <= 4) return points;
  const simplified = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const previous = simplified[simplified.length - 1]!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= tolerance) simplified.push(point);
  }
  const last = points[points.length - 1]!;
  if (Math.hypot(last.x - simplified[simplified.length - 1]!.x, last.y - simplified[simplified.length - 1]!.y) > 0.01) simplified.push(last);
  if (simplified.length <= maximumPoints) return simplified.length >= 3 ? simplified : points;
  return Array.from({ length: maximumPoints }, (_, index) => simplified[Math.round(index * (simplified.length - 1) / (maximumPoints - 1))]!);
}

function projectedPolygon(rings: CardPoint[][]): CardPolygon | null {
  if (!rings[0] || rings[0].length < 3) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of rings.flat()) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  return { rings, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

function coordinatePolygons(feature: MapFeature): Position[][][] {
  return feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as Position[][]] : feature.geometry.coordinates as Position[][][];
}

/** The same projected geometry is used by the canvas, diagnostics and AI tools.
 * Projection and centered rings are bounded caches; a map pan never reprojects coastline points. */
export function resolveSceneMapGeometry(map: MapSettings) {
  const projectionKey = `${map.width}:${map.height}:${map.collapseSouthChinaSea === true}`;
  const projected = projections.get(projectionKey) ?? boundedSet(projections, projectionKey, createProjection(map));
  const { projection, mapPath, mainlandFeatures } = projected;
  const hidden = Object.keys(map.provinceStyles ?? {}).filter((name) => map.provinceStyles?.[name]?.visible === false).sort();
  const replaces = map.renderSource?.kind === "image" && map.renderSource.composition !== "overlay";
  const centeredKey = JSON.stringify([projectionKey, map.scale, hidden, replaces]);
  let centeredProvincePolygons = centeredCache.get(centeredKey);
  if (!centeredProvincePolygons) {
    const hiddenSet = new Set(hidden);
    centeredProvincePolygons = replaces ? [] : mainlandFeatures.flatMap((feature): CardPolygon[] => {
      if (hiddenSet.has(feature.name)) return [];
      return coordinatePolygons(feature).flatMap((polygon) => {
        const rings = polygon.map((ring) => simplifyRing(ring.flatMap((coordinate) => {
          const point = projection(coordinate);
          return point?.every(Number.isFinite) ? [{ x: (point[0] - map.width / 2) * map.scale, y: (point[1] - map.height / 2) * map.scale }] : [];
        })));
        const result = projectedPolygon(rings);
        return result ? [result] : [];
      });
    });
    boundedSet(centeredCache, centeredKey, centeredProvincePolygons);
  }
  const mapOriginX = map.x + map.width / 2;
  const mapOriginY = map.y + map.height / 2;
  const provinceAreas = projected.projectedBounds.map(({ left, top, right, bottom }) => ({
    x: mapOriginX + (left - map.width / 2) * map.scale,
    y: mapOriginY + (top - map.height / 2) * map.scale,
    width: (right - left) * map.scale, height: (bottom - top) * map.scale,
  }));
  const provincePolygons = centeredProvincePolygons.map(({ rings, bounds }) => ({
    rings: rings.map((ring) => ring.map((point) => ({ x: mapOriginX + point.x, y: mapOriginY + point.y }))),
    ...(bounds ? { bounds: { ...bounds, x: mapOriginX + bounds.x, y: mapOriginY + bounds.y } } : {}),
  }));
  const mapContentBounds = computeMapContentBounds({ map, provinceAreas });
  const mapVisualBounds = computeMapContentBounds({ map: { ...map, mapBoundaryMargin: 0 }, provinceAreas });
  const nonProvinceMapAreas = computeMapOccupiedAreas({ map, provinceAreas }).filter((area) => !provinceAreas.some((province) =>
    province.x === area.x && province.y === area.y && province.width === area.width && province.height === area.height));
  return { projection, mapPath, mapContentBounds, mapVisualBounds, provincePolygons, centeredProvincePolygons, nonProvinceMapAreas, mapOriginX, mapOriginY };
}

export function sceneTextBounds(text: CanvasText): CardArea {
  const x = text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x;
  return { x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 };
}

export function sceneTextObstacle(text: CanvasText): CardArea | null {
  return text.visibility && text.content.trim() ? sceneTextBounds(text) : null;
}

export function placementSide(card: CardArea, map: CardArea): CardSide {
  const horizontal = (card.x + card.width / 2 - (map.x + map.width / 2)) / Math.max(1, map.width / 2);
  const vertical = (card.y + card.height / 2 - (map.y + map.height / 2)) / Math.max(1, map.height / 2);
  return Math.abs(horizontal) >= Math.abs(vertical) ? horizontal < 0 ? "left" : "right" : vertical < 0 ? "top" : "bottom";
}
