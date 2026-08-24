/**
 * 渲染真值 · 几何层。
 *
 * 地图投影、居中缩放、省份占位、文本与嘉宾面板的实际占位。PosterCanvas 与影子
 * Agent 共用这一层，避免出现「渲染按中心缩放、Agent 按左上角 width×scale」这类漂移。
 */
import { geoMercator, geoPath, type GeoPath, type GeoProjection } from "d3-geo";
import type { CardArea, CardPoint, CardPolygon } from "./card-layout";
import { computeMapContentBounds, computeMapOccupiedAreas, type ContentBounds } from "./map-content-bounds";
import { getChinaMapFeatures, type MapFeature, type Position } from "./map-data";
import type { CanvasText, GuestPanelSettings, GuestPerson, MapSettings } from "./scene-document";
import { splitMapFeaturesForSouthChinaSea } from "./south-china-sea";

const allFeatures = getChinaMapFeatures();
const openMapSplit = splitMapFeaturesForSouthChinaSea(allFeatures, false);
const foldedMapSplit = splitMapFeaturesForSouthChinaSea(allFeatures, true);

export function chinaMapFeatures(): MapFeature[] {
  return allFeatures;
}

export function mainlandFeaturesFor(collapseSouthChinaSea: boolean | undefined): MapFeature[] {
  return collapseSouthChinaSea === true ? foldedMapSplit.mainlandFeatures : openMapSplit.mainlandFeatures;
}

/** 地图局部坐标 → 画布像素。缩放锚在地图框中心，不是左上角。 */
export function mapPointToCanvas(map: MapSettings, point: readonly number[]): CardPoint {
  const centerX = map.width / 2;
  const centerY = map.height / 2;
  const [x, y] = point;
  return {
    x: Number.isFinite(x) ? map.x + centerX + (x! - centerX) * map.scale : map.x + centerX,
    y: Number.isFinite(y) ? map.y + centerY + (y! - centerY) * map.scale : map.y + centerY,
  };
}

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
  return { rings, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

export function projectedProvinceAreas(map: MapSettings, path: GeoPath, features: readonly MapFeature[]): CardArea[] {
  return features.flatMap((feature) => {
    const [[left, top], [right, bottom]] = path.bounds(feature as never);
    if (![left, top, right, bottom].every(Number.isFinite)) return [];
    const origin = mapPointToCanvas(map, [left, top]);
    return [{ x: origin.x, y: origin.y, width: (right - left) * map.scale, height: (bottom - top) * map.scale }];
  });
}

export function projectedProvincePolygons(
  map: MapSettings,
  projection: GeoProjection,
  features: readonly MapFeature[],
): CardPolygon[] {
  const source = map.renderSource;
  if (source?.kind === "image" && source.composition !== "overlay") return [];
  const projectPoint = (coordinate: Position): CardPoint | null => {
    const point = projection(coordinate);
    if (!point || !point.every(Number.isFinite)) return null;
    return mapPointToCanvas(map, point);
  };
  return features.flatMap((feature): CardPolygon[] => {
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

export interface RenderGeometry {
  mainlandFeatures: MapFeature[];
  projection: GeoProjection;
  path: GeoPath;
  provinceAreas: CardArea[];
  provincePolygons: CardPolygon[];
  mapContentBounds: ContentBounds;
  mapOccupiedAreas: ContentBounds[];
  /** 地图占位中不属于省份 AABB 的部分（图片底图 / 南海小图）。 */
  nonProvinceMapAreas: ContentBounds[];
}

/** 地图投影与其在画布上的实际占位。所有派生量都走居中缩放。 */
export function buildRenderGeometry(project: { map: MapSettings }): RenderGeometry {
  const map = project.map;
  const mainlandFeatures = mainlandFeaturesFor(map.collapseSouthChinaSea);
  const projection = geoMercator().fitExtent(
    [[0, 0], [map.width, map.height]],
    { type: "FeatureCollection", features: mainlandFeatures } as never,
  );
  const path = geoPath(projection);
  const provinceAreas = projectedProvinceAreas(map, path, mainlandFeatures);
  const mapOccupiedAreas = computeMapOccupiedAreas({ map, provinceAreas });
  return {
    mainlandFeatures,
    projection,
    path,
    provinceAreas,
    provincePolygons: projectedProvincePolygons(map, projection, mainlandFeatures),
    mapContentBounds: computeMapContentBounds({ map, provinceAreas }),
    mapOccupiedAreas,
    nonProvinceMapAreas: mapOccupiedAreas.filter((area) => !provinceAreas.some((province) =>
      province.x === area.x && province.y === area.y && province.width === area.width && province.height === area.height)),
  };
}

/** 文本框在画布上的实际占位，随 textAlign 左移；卡片与健康检查用同一个矩形。 */
export function textElementBounds(text: CanvasText): CardArea {
  const x = text.textAlign === "right"
    ? text.x - text.maxWidth
    : text.textAlign === "center"
      ? text.x - text.maxWidth / 2
      : text.x;
  return { x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 };
}

export function textLayoutObstacle(text: CanvasText): CardArea | null {
  if (!text.visibility || !text.content.trim()) return null;
  return textElementBounds(text);
}

const GUEST_CUSTOM_MAX_LINES = 14;

/** Wrap the panel's free-form custom text into display lines (hard wrap by width, cap the line count). */
export function wrapGuestCustomText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let rest = rawLine;
    while (rest.length > maxChars) {
      if (lines.length >= GUEST_CUSTOM_MAX_LINES) break;
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (lines.length >= GUEST_CUSTOM_MAX_LINES) {
      if (rest.length > 0) {
        const last = lines[GUEST_CUSTOM_MAX_LINES - 1];
        if (last) lines[GUEST_CUSTOM_MAX_LINES - 1] = `${last.slice(0, maxChars - 1)}…`;
      }
      break;
    }
    lines.push(rest);
  }
  return lines;
}

export interface GuestPanelMetrics {
  visibleGuests: GuestPerson[];
  titleFontSize: number;
  peopleFontSize: number;
  noteFontSize: number;
  displayMode: "list" | "cards";
  listAvatarSize: number;
  listUsesAvatar: boolean;
  listAvatarGap: number;
  rowHeight: number;
  cardGap: number;
  cardColumns: number;
  cardWidth: number;
  cardAvatarSize: number;
  cardTitleLine: number;
  cardSubLine: number;
  cardHasTitle: boolean;
  cardHasNote: boolean;
  cardHeight: number;
  cardRows: number;
  customLines: string[];
  customLineHeight: number;
  customTopGap: number;
  customHeight: number;
  /** 嘉宾面板的实际高度：卡片避让与健康检查都用它，不再用 120 估值。 */
  height: number;
}

/** 画布真正会绘制的嘉宾：面板与检查器共用同一份过滤规则，避免人数口径不一致。 */
export function visibleGuestPeople(guests: { people?: GuestPerson[] | null }): GuestPerson[] {
  return (guests.people ?? []).filter((person) => person.visibility !== false);
}

export function computeGuestPanelMetrics(guests: GuestPanelSettings, lineHeightMultiplier: number): GuestPanelMetrics {
  const visibleGuests = visibleGuestPeople(guests);
  const titleTypography = guests.titleTypography ?? {};
  const peopleTypography = guests.peopleTypography ?? {};
  const titleFontSize = titleTypography.fontSize ?? guests.fontSize + 1;
  const peopleFontSize = peopleTypography.fontSize ?? guests.fontSize;
  const noteFontSize = Math.max(10, peopleFontSize - 2);
  const displayMode = guests.displayMode === "cards" ? "cards" : "list";
  const listAvatarSize = Math.max(22, peopleFontSize + 8);
  const listUsesAvatar = visibleGuests.some((person) => person.avatarSrc);
  const listAvatarGap = listUsesAvatar ? listAvatarSize + 8 : 0;
  const noteLineHeight = Math.max(13, noteFontSize + 3) * lineHeightMultiplier;
  const listNoteLines = visibleGuests.some((person) => person.note) ? noteLineHeight : 0;
  const rowHeight = Math.max(listAvatarSize, Math.max(16, peopleFontSize + 6) * lineHeightMultiplier) + listNoteLines;
  const cardGap = 10;
  const cardMinWidth = 92;
  const cardColumns = Math.max(1, Math.floor((guests.width - guests.padding * 2 + cardGap) / (cardMinWidth + cardGap)));
  const cardWidth = (guests.width - guests.padding * 2 - (cardColumns - 1) * cardGap) / cardColumns;
  const cardAvatarSize = 40;
  const cardTitleLine = Math.max(15, peopleFontSize + 5) * lineHeightMultiplier;
  const cardSubLine = Math.max(12, Math.max(10, peopleFontSize - 2) + 3) * lineHeightMultiplier;
  const cardHasTitle = visibleGuests.some((person) => person.title);
  const cardHasNote = visibleGuests.some((person) => person.note);
  const cardHeight = 6 + cardAvatarSize + 6 + cardTitleLine
    + (cardHasTitle ? cardSubLine : 0)
    + (cardHasNote ? cardSubLine : 0) + 6;
  const cardRows = Math.max(1, Math.ceil(visibleGuests.length / Math.max(1, cardColumns)));
  const customText = guests.customText ?? "";
  const customMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - listAvatarGap) / peopleFontSize));
  const customLines = customText ? wrapGuestCustomText(customText, customMaxChars) : [];
  const customLineHeight = Math.max(16, peopleFontSize + 4) * lineHeightMultiplier;
  // Gap between the header divider and the first custom-text baseline, scaled with the font size.
  const customTopGap = Math.round(peopleFontSize * 0.9) + 11;
  const customHeight = customLines.length > 0
    ? customTopGap + (customLines.length - 1) * customLineHeight + Math.round(peopleFontSize * 0.35) + 8
    : 0;
  return {
    visibleGuests,
    titleFontSize,
    peopleFontSize,
    noteFontSize,
    displayMode,
    listAvatarSize,
    listUsesAvatar,
    listAvatarGap,
    rowHeight,
    cardGap,
    cardColumns,
    cardWidth,
    cardAvatarSize,
    cardTitleLine,
    cardSubLine,
    cardHasTitle,
    cardHasNote,
    cardHeight,
    cardRows,
    customLines,
    customLineHeight,
    customTopGap,
    customHeight,
    height: guests.padding * 2 + 28 + customHeight
      + (displayMode === "cards"
        ? cardRows * cardHeight + (cardRows - 1) * cardGap
        : Math.max(1, visibleGuests.length) * rowHeight),
  };
}

export function buildLayoutOccupiedAreas(input: {
  textElements: readonly CanvasText[];
  guests: Pick<GuestPanelSettings, "x" | "y" | "width"> & { visibility?: boolean };
  guestHeight: number;
  nonProvinceMapAreas: readonly CardArea[];
  allowMapOverlap: boolean;
}): CardArea[] {
  const textAreas = input.textElements.flatMap((text) => {
    const area = textLayoutObstacle(text);
    return area ? [area] : [];
  });
  const guestAreas = input.guests.visibility === false
    ? []
    : [{ x: input.guests.x, y: input.guests.y, width: input.guests.width, height: input.guestHeight }];
  const protectedMapAreas = input.allowMapOverlap ? [] : [...input.nonProvinceMapAreas];
  return [...protectedMapAreas, ...textAreas, ...guestAreas];
}
