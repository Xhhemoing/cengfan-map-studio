import { geoMercator, geoPath } from "d3-geo";
import { useMemo } from "react";
import type { CardArea, CardPolygon } from "../../lib/card-layout";
import { computeMapContentBounds, computeMapOccupiedAreas } from "../../lib/map-content-bounds";
import type { MapFeature } from "../../lib/map-data";
import { textLayoutObstacle } from "../../lib/poster-card-rows";
import { computeProvinceAreas, computeProvincePolygons, HEAT_COLORS } from "../../lib/poster-map-geometry";
import { buildProvinceSummary, getVisibleStudents } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { GuestPanelSettings } from "../../lib/scene-document";
import { resolveStudentLocation } from "../../lib/student-data";

/** Visible students plus the per-province counts and map pins derived from them. */
export function usePosterStudentData(students: ProjectDocument["students"]) {
  const visibleStudents = useMemo(() => getVisibleStudents(students), [students]);
  const summary = useMemo(() => buildProvinceSummary(visibleStudents), [visibleStudents]);
  const counts = useMemo(() => new Map(summary.map((item) => [item.province, item.count])), [summary]);
  const pins = useMemo(
    () => visibleStudents.flatMap((student) => {
      if (student.locationScope === "international") return [];
      const location = resolveStudentLocation(student);
      return location.province ? [{ id: student.id, province: location.province, label: student.name }] : [];
    }),
    [visibleStudents],
  );
  return { visibleStudents, counts, pins };
}

/** Mercator projection fitted to the mainland extent, the projected province
 *  geometry (collision polygons, content bounds, non-province occupied areas)
 *  and the map theme derived from the current edge color. */
export function usePosterMapGeometry(map: ProjectDocument["map"], mainlandFeatures: MapFeature[]) {
  const projection = useMemo(() => geoMercator().fitExtent(
    [[0, 0], [map.width, map.height]],
    { type: "FeatureCollection", features: mainlandFeatures } as never,
  ), [mainlandFeatures, map.height, map.width]);
  const mapPath = useMemo(() => geoPath(projection), [projection]);
  const provinceAreas = useMemo(
    () => computeProvinceAreas(mainlandFeatures, (feature) => mapPath.bounds(feature as never), map),
    [mainlandFeatures, mapPath, map],
  );
  const provincePolygons = useMemo(
    () => computeProvincePolygons(mainlandFeatures, projection, map),
    [mainlandFeatures, map, projection],
  );
  const mapContentBounds = useMemo(
    () => computeMapContentBounds({ map, provinceAreas }),
    [map, provinceAreas],
  );
  const mapOccupiedAreas = useMemo(
    () => computeMapOccupiedAreas({ map, provinceAreas }),
    [map, provinceAreas],
  );
  const nonProvinceMapAreas = useMemo(() => mapOccupiedAreas.filter((area) =>
    !provinceAreas.some((province) => province.x === area.x
      && province.y === area.y
      && province.width === area.width
      && province.height === area.height)), [mapOccupiedAreas, provinceAreas]);
  const mapTheme = useMemo(() => ({ ink: map.edgeColor, heatColors: HEAT_COLORS }), [map.edgeColor]);
  return { projection, mapPath, provincePolygons, mapContentBounds, nonProvinceMapAreas, mapTheme };
}

/** Areas and polygons the card auto-layout must keep clear (map, texts, guest panel). */
export function usePosterLayoutAreas({ textElements, guests, guestHeight, allowMapOverlap, nonProvinceMapAreas, provincePolygons }: {
  textElements: ProjectDocument["textElements"];
  guests: GuestPanelSettings;
  guestHeight: number;
  allowMapOverlap: boolean | undefined;
  nonProvinceMapAreas: CardArea[];
  provincePolygons: CardPolygon[];
}) {
  const layoutOccupiedAreas = useMemo<CardArea[]>(() => {
    const textAreas = textElements.flatMap((text) => {
      const area = textLayoutObstacle(text);
      return area ? [area] : [];
    });
    const guestAreas = guests.visibility === false
      ? []
      : [{ x: guests.x, y: guests.y, width: guests.width, height: guestHeight }];
    const protectedMapAreas = allowMapOverlap === true ? [] : nonProvinceMapAreas;
    return [...protectedMapAreas, ...textAreas, ...guestAreas];
  }, [allowMapOverlap, guestHeight, guests.visibility, guests.width, guests.x, guests.y, nonProvinceMapAreas, textElements]);
  const layoutOccupiedPolygons = useMemo(
    () => allowMapOverlap === true ? [] : provincePolygons,
    [allowMapOverlap, provincePolygons],
  );
  return { layoutOccupiedAreas, layoutOccupiedPolygons };
}
