import { geoMercator, geoPath } from "d3-geo";
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import chinaMapSource from "../../assets/china.geojson?raw";
import { clampDestinationCardPosition, solveCardLayout, type CardArea, type CardLayoutMode, type CardPoint, type CardPolygon } from "../../lib/card-layout";
import { computeMapContentBounds, computeMapOccupiedAreas } from "../../lib/map-content-bounds";
import {
  buildCitySections,
  buildLayoutGroups,
  buildSchoolRows,
  schoolRowParts,
  type SchoolRowPart,
} from "../../lib/layout";
import { buildProvinceSummary, getVisibleStudents } from "../../lib/project-data";
import { CANVAS_LAYER_Z } from "../../lib/scene-document";
import type { CanvasText, CardFontField, SceneSelection } from "../../lib/scene-document";
import type { ProjectDocument } from "../../lib/project-document";
import { resolveStudentLocation } from "../../lib/student-data";
import { findProvinceFeature, normalizeMapFeatures, type MapFeature, type Position, type RawMapFeature } from "../../lib/map-data";
import { buildConnectorGeometry } from "../../lib/connector-geometry";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize, DEFAULT_GRID_SIZE } from "../../lib/grid";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression } from "../../lib/card-expression";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "../../lib/name-format";
import { wrapCardText, type CardTextFragment, type CardTextLine } from "../../lib/card-text-layout";
import { splitMapFeaturesForSouthChinaSea } from "../../lib/south-china-sea";
import { DecorationLayer } from "./DecorationLayer";
import { MapLayer } from "./MapLayer";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import { TextLayer } from "./TextLayer";

const mapSource = JSON.parse(chinaMapSource) as { features: unknown[] };
const features = normalizeMapFeatures(mapSource.features as RawMapFeature[]);
const openMapSplit = splitMapFeaturesForSouthChinaSea(features, false);
const foldedMapSplit = splitMapFeaturesForSouthChinaSea(features, true);
const HEAT_COLORS = ["#d9f0e5", "#8ccfb6", "#4da184", "#17675e"] as const;

/** Truncate a single-line guest text (name / title / note) with an ellipsis. */
function truncateGuestText(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

const GUEST_CUSTOM_MAX_LINES = 14;

/** Wrap the panel's free-form custom text into display lines (hard wrap by width, cap the line count). */
function wrapGuestCustomText(text: string, maxChars: number): string[] {
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

function featureCoordinatePolygons(feature: MapFeature): Position[][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as Position[][]]
    : feature.geometry.coordinates as Position[][][];
}

function simplifyProjectedRing(points: CardPoint[], tolerance = 1.5, maximumPoints = 180): CardPoint[] {
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

function projectedPolygon(rings: CardPoint[][]): CardPolygon | null {
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

export interface PosterCanvasProps {
  project: ProjectDocument;
  posterRef?: RefObject<SVGSVGElement | null>;
  exportMode?: boolean;
  selectedTextId?: string | null;
  selectedAssetId?: string | null;
  selectedProvince?: string | null;
  userFonts?: UserFont[];
  showGrid?: boolean;
  gridSize?: number;
  /** Minimum interval between local drag-preview paints. Final positions always commit immediately. */
  renderIntervalMs?: number;
  onSelect?: (selection: SceneSelection) => void;
  onMoveText?: (id: string, x: number, y: number) => void;
  onSelectAsset?: (id: string) => void;
  onAssetLoadError?: (id: string) => void;
  onMoveAsset?: (id: string, x: number, y: number) => void;
  onResizeAsset?: (id: string, x: number, y: number, width: number, height: number) => void;
  /** Commit a new alignment for the map overlay image. */
  onResizeMapImage?: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
  /** Whether the map is the current scene selection (shows overlay resize handles). */
  mapSelected?: boolean;
  selectedStudentId?: string | null;
  onSelectStudent?: (id: string) => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
  onMoveGuests?: (x: number, y: number) => void;
}

function destinationHeight(lineCount: number, rowHeight: number, bottomPadding: number, headerExtra: number): number {
  return 44 + headerExtra + lineCount * rowHeight + bottomPadding;
}

/** Extend a connector path so it runs from the card center to its boundary port. The
 *  portion inside the card is covered by the card fill, so the visible line ends flush
 *  at the card edge and its tip stays hidden ("到板块的中心隐藏"). */
function connectorPathToCenter(pathData: string, port: { x: number; y: number }, card: { x: number; y: number; width: number; height: number }): string {
  const centerX = card.x + card.width / 2;
  const centerY = card.y + card.height / 2;
  const format = (value: number) => Number(value.toFixed(3)).toString();
  const rest = pathData.replace(/^M[-\d.]+ [-\d.]+/, "").trim();
  return `M${format(centerX)} ${format(centerY)} L${format(port.x)} ${format(port.y)} ${rest}`;
}

function textLayoutObstacle(text: CanvasText): CardArea | null {
  if (!text.visibility || !text.content.trim()) return null;
  const x = text.textAlign === "right"
    ? text.x - text.maxWidth
    : text.textAlign === "center"
      ? text.x - text.maxWidth / 2
      : text.x;
  return {
    x,
    y: text.y - text.fontSize,
    width: text.maxWidth,
    height: text.fontSize * 1.3,
  };
}

function studentFieldParts(
  student: { name: string; university: string; city: string },
  fields: ProjectDocument["cards"]["visibleFields"],
): SchoolRowPart[] {
  return fields
    .map((field) => ({ field, value: student[field] }))
    .filter((part): part is SchoolRowPart => Boolean(part.value));
}

interface CardDisplayRow {
  key: string;
  parts: SchoolRowPart[];
  remainingPeople: number;
  cityHeading?: string;
  city?: string;
  university?: string;
  names?: string;
}

interface PreparedCardRow extends CardDisplayRow {
  lines: CardTextLine<CardFontField>[];
}

function rowFragments(
  row: CardDisplayRow,
  expression: string,
  context: Parameters<typeof formatCardExpression>[1],
): CardTextFragment<CardFontField>[] {
  if (expression !== DEFAULT_CARD_EXPRESSION_TEMPLATES.row) {
    return [{ text: formatCardExpression(expression, context, row.parts.map((part) => part.value).join(" · ")) }];
  }
  return row.parts.flatMap((part, index) => [
    ...(index > 0 ? [{ text: " · " }] : []),
    { text: part.value, field: part.field },
  ]);
}

function cardRowsForGroup(
  group: ReturnType<typeof buildLayoutGroups>[number],
  grouping: ProjectDocument["cards"]["grouping"],
  fields: ProjectDocument["cards"]["visibleFields"],
  citySubgroups: boolean,
  formatName: (name: string) => string,
): CardDisplayRow[] {
  const students = group.students.map((student) => ({ ...student, name: formatName(student.name) }));
  if (grouping === "university") {
    return students.map((student) => ({
      key: student.id,
      parts: studentFieldParts(student, fields),
      city: student.city,
      university: student.university,
      names: student.name,
      remainingPeople: 0,
    }));
  }

  if (grouping === "province" && citySubgroups) {
    const showCityHeading = fields.includes("city");
    return buildCitySections(students).flatMap((section) => [{
        key: `city-${section.city}`,
        parts: showCityHeading ? [{ field: "city" as const, value: section.city }] : [],
        cityHeading: showCityHeading ? section.city : undefined,
        city: section.city,
        remainingPeople: 0,
      }, ...section.rows.map((row) => ({
        key: row.studentIds[0] ?? `${section.city}-${row.university}`,
        parts: schoolRowParts(row, fields.filter((field) => field !== "city")),
        city: section.city,
        university: row.university,
        names: row.names.join("、"),
        remainingPeople: 0,
      }))]);
  }

  return buildSchoolRows(students).map((row) => ({
    key: row.studentIds[0] ?? row.university,
    parts: schoolRowParts(row, fields, grouping === "city" ? undefined : group.students[0]?.city),
    city: grouping === "city" ? group.title : group.students[0]?.city,
    university: row.university,
    names: row.names.join("、"),
    remainingPeople: 0,
  }));
}

export function PosterCanvas({
  project,
  posterRef,
  exportMode = false,
  selectedTextId = null,
  selectedAssetId = null,
  selectedProvince = null,
  onSelect,
  onMoveText,
  onAssetLoadError,
  onMoveAsset,
  onResizeAsset,
  onResizeMapImage,
  onMoveProvinceTexture,
  mapSelected = false,
  selectedStudentId = null,
  onSelectStudent,
  onMoveCard,
  onMoveGuests,
  userFonts = [],
  showGrid = false,
  gridSize = DEFAULT_GRID_SIZE,
  renderIntervalMs = 0,
}: PosterCanvasProps) {
  const resolvedGridSize = clampGridSize(gridSize);
  const cardDrag = useRef<{ id: string; offsetX: number; offsetY: number; width: number; height: number; x: number; y: number } | null>(null);
  const guestDrag = useRef<{ offsetX: number; offsetY: number; x: number; y: number } | null>(null);
  const cardPreviewFrame = useRef<number | null>(null);
  const guestPreviewFrame = useRef<number | null>(null);
  const cardPreviewTimer = useRef<number | null>(null);
  const guestPreviewTimer = useRef<number | null>(null);
  const pendingCardPreview = useRef<{ id: string; x: number; y: number } | null>(null);
  const pendingGuestPreview = useRef<{ x: number; y: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [guestPreview, setGuestPreview] = useState<{ x: number; y: number } | null>(null);

  const clearCardPreview = () => {
    if (cardPreviewFrame.current !== null) window.cancelAnimationFrame(cardPreviewFrame.current);
    cardPreviewFrame.current = null;
    if (cardPreviewTimer.current !== null) window.clearTimeout(cardPreviewTimer.current);
    cardPreviewTimer.current = null;
    pendingCardPreview.current = null;
  };

  const clearGuestPreview = () => {
    if (guestPreviewFrame.current !== null) window.cancelAnimationFrame(guestPreviewFrame.current);
    guestPreviewFrame.current = null;
    if (guestPreviewTimer.current !== null) window.clearTimeout(guestPreviewTimer.current);
    guestPreviewTimer.current = null;
    pendingGuestPreview.current = null;
  };

  const scheduleCardPreview = (next: { id: string; x: number; y: number }) => {
    if (renderIntervalMs <= 0) {
      pendingCardPreview.current = next;
      if (cardPreviewFrame.current !== null) return;
      cardPreviewFrame.current = window.requestAnimationFrame(() => {
        cardPreviewFrame.current = null;
        const pending = pendingCardPreview.current;
        pendingCardPreview.current = null;
        if (pending) setDragPreview(pending);
      });
      return;
    }
    pendingCardPreview.current = next;
    if (cardPreviewTimer.current !== null) return;
    cardPreviewTimer.current = window.setTimeout(() => {
      cardPreviewTimer.current = null;
      const pending = pendingCardPreview.current;
      pendingCardPreview.current = null;
      if (pending) setDragPreview(pending);
    }, renderIntervalMs);
  };

  const scheduleGuestPreview = (next: { x: number; y: number }) => {
    if (renderIntervalMs <= 0) {
      pendingGuestPreview.current = next;
      if (guestPreviewFrame.current !== null) return;
      guestPreviewFrame.current = window.requestAnimationFrame(() => {
        guestPreviewFrame.current = null;
        const pending = pendingGuestPreview.current;
        pendingGuestPreview.current = null;
        if (pending) setGuestPreview(pending);
      });
      return;
    }
    pendingGuestPreview.current = next;
    if (guestPreviewTimer.current !== null) return;
    guestPreviewTimer.current = window.setTimeout(() => {
      guestPreviewTimer.current = null;
      const pending = pendingGuestPreview.current;
      pendingGuestPreview.current = null;
      if (pending) setGuestPreview(pending);
    }, renderIntervalMs);
  };

  useEffect(() => () => {
    clearCardPreview();
    clearGuestPreview();
  }, []);
  const visibleStudents = useMemo(() => getVisibleStudents(project.students), [project.students]);
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
  const grouping = project.cards.grouping;
  const expressionTemplates = project.cards.expressionTemplates ?? DEFAULT_CARD_EXPRESSION_TEMPLATES;
  const groups = useMemo(() => buildLayoutGroups(visibleStudents, grouping), [grouping, visibleStudents]);
  const collapse = project.map.collapseSouthChinaSea === true;
  const mainlandFeatures = collapse ? foldedMapSplit.mainlandFeatures : openMapSplit.mainlandFeatures;
  const projection = useMemo(() => geoMercator().fitExtent(
    [[0, 0], [project.map.width, project.map.height]],
    { type: "FeatureCollection", features: mainlandFeatures } as never,
  ), [mainlandFeatures, project.map.height, project.map.width]);
  const mapPath = useMemo(() => geoPath(projection), [projection]);
  const provinceAreas = useMemo(() => {
    const centerX = project.map.width / 2;
    const centerY = project.map.height / 2;
    return mainlandFeatures.flatMap((feature) => {
      const [[left, top], [right, bottom]] = mapPath.bounds(feature as never);
      if (![left, top, right, bottom].every(Number.isFinite)) return [];
      return [{
        x: project.map.x + centerX + (left - centerX) * project.map.scale,
        y: project.map.y + centerY + (top - centerY) * project.map.scale,
        width: (right - left) * project.map.scale,
        height: (bottom - top) * project.map.scale,
      }];
    });
  }, [mainlandFeatures, mapPath, project.map]);
  const provincePolygons = useMemo<CardPolygon[]>(() => {
    const source = project.map.renderSource;
    if (source?.kind === "image" && source.composition !== "overlay") return [];
    const centerX = project.map.width / 2;
    const centerY = project.map.height / 2;
    const projectPoint = (coordinate: Position): CardPoint | null => {
      const point = projection(coordinate);
      if (!point || !point.every(Number.isFinite)) return null;
      return {
        x: project.map.x + centerX + (point[0] - centerX) * project.map.scale,
        y: project.map.y + centerY + (point[1] - centerY) * project.map.scale,
      };
    };
    return mainlandFeatures.flatMap((feature): CardPolygon[] => {
      if (project.map.provinceStyles?.[feature.name]?.visible === false) return [];
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
  }, [mainlandFeatures, project.map, projection]);
  const mapContentBounds = useMemo(
    () => computeMapContentBounds({ map: project.map, provinceAreas }),
    [project.map, provinceAreas],
  );
  const mapOccupiedAreas = useMemo(
    () => computeMapOccupiedAreas({ map: project.map, provinceAreas }),
    [project.map, provinceAreas],
  );
  const nonProvinceMapAreas = useMemo(() => mapOccupiedAreas.filter((area) =>
    !provinceAreas.some((province) => province.x === area.x
      && province.y === area.y
      && province.width === area.width
      && province.height === area.height)), [mapOccupiedAreas, provinceAreas]);
  const lineHeightMultiplier = project.canvas.lineHeight ?? 1;
  const noWrapFieldSet = useMemo(
    () => new Set(project.cards.noWrapFields ?? []),
    [project.cards.noWrapFields],
  );
  const guests = project.guests ?? {
    title: "特邀嘉宾 · 老师名单",
    x: 48,
    y: 780,
    width: 280,
    padding: 14,
    background: "#ffffff",
    opacity: 0.92,
    textColor: "#1c3154",
    fontSize: 13,
    visibility: true,
    people: [],
  };
  const visibleGuests = guests.people.filter((person) => person.visibility !== false);
  const guestTitleTypography = guests.titleTypography ?? {};
  const guestPeopleTypography = guests.peopleTypography ?? {};
  const guestTitleFontSize = guestTitleTypography.fontSize ?? guests.fontSize + 1;
  const guestPeopleFontSize = guestPeopleTypography.fontSize ?? guests.fontSize;
  const guestNoteFontSize = Math.max(10, guestPeopleFontSize - 2);
  const guestsDisplayMode = guests.displayMode === "cards" ? "cards" : "list";
  const guestListAvatarSize = Math.max(22, guestPeopleFontSize + 8);
  const guestListUsesAvatar = visibleGuests.some((person) => person.avatarSrc);
  const guestListAvatarGap = guestListUsesAvatar ? guestListAvatarSize + 8 : 0;
  const guestNoteLineHeight = Math.max(13, guestNoteFontSize + 3) * lineHeightMultiplier;
  const guestListNoteLines = visibleGuests.some((person) => person.note) ? guestNoteLineHeight : 0;
  const guestRowHeight = Math.max(guestListAvatarSize, Math.max(16, guestPeopleFontSize + 6) * lineHeightMultiplier) + guestListNoteLines;
  const guestCardGap = 10;
  const guestCardMinWidth = 92;
  const guestCardColumns = Math.max(1, Math.floor((guests.width - guests.padding * 2 + guestCardGap) / (guestCardMinWidth + guestCardGap)));
  const guestCardWidth = (guests.width - guests.padding * 2 - (guestCardColumns - 1) * guestCardGap) / guestCardColumns;
  const guestCardAvatarSize = 40;
  const guestCardTitleLine = Math.max(15, guestPeopleFontSize + 5) * lineHeightMultiplier;
  const guestCardSubLine = Math.max(12, Math.max(10, guestPeopleFontSize - 2) + 3) * lineHeightMultiplier;
  const guestCardHasTitle = visibleGuests.some((person) => person.title);
  const guestCardHasNote = visibleGuests.some((person) => person.note);
  const guestCardHeight = 6 + guestCardAvatarSize + 6 + guestCardTitleLine
    + (guestCardHasTitle ? guestCardSubLine : 0)
    + (guestCardHasNote ? guestCardSubLine : 0) + 6;
  const guestCardRows = Math.max(1, Math.ceil(visibleGuests.length / Math.max(1, guestCardColumns)));
  const guestCustomText = guests.customText ?? "";
  const guestCustomMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - guestListAvatarGap) / guestPeopleFontSize));
  const guestCustomLines = guestCustomText ? wrapGuestCustomText(guestCustomText, guestCustomMaxChars) : [];
  const guestCustomLineHeight = Math.max(16, guestPeopleFontSize + 4) * lineHeightMultiplier;
  // Gap between the header divider and the first custom-text baseline, scaled with the font size.
  const guestCustomTopGap = Math.round(guestPeopleFontSize * 0.9) + 11;
  const guestCustomHeight = guestCustomLines.length > 0
    ? guestCustomTopGap + (guestCustomLines.length - 1) * guestCustomLineHeight + Math.round(guestPeopleFontSize * 0.35) + 8
    : 0;
  const guestHeight = guests.padding * 2 + 28 + guestCustomHeight
    + (guestsDisplayMode === "cards"
      ? guestCardRows * guestCardHeight + (guestCardRows - 1) * guestCardGap
      : Math.max(1, visibleGuests.length) * guestRowHeight);
  const layoutOccupiedAreas = useMemo(() => {
    const textAreas = project.textElements.flatMap((text) => {
      const area = textLayoutObstacle(text);
      return area ? [area] : [];
    });
    const guestAreas = guests.visibility === false
      ? []
      : [{ x: guests.x, y: guests.y, width: guests.width, height: guestHeight }];
    const protectedMapAreas = project.cards.allowMapOverlap === true ? [] : nonProvinceMapAreas;
    return [...protectedMapAreas, ...textAreas, ...guestAreas];
  }, [guestHeight, guests.visibility, guests.width, guests.x, guests.y, nonProvinceMapAreas, project.cards.allowMapOverlap, project.textElements]);
  const layoutOccupiedPolygons = useMemo(
    () => project.cards.allowMapOverlap === true ? [] : provincePolygons,
    [project.cards.allowMapOverlap, provincePolygons],
  );
  const horizontalPadding = project.cards.horizontalPadding ?? project.cards.padding;
  const destinationCards = useMemo(() => {
    if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
    const compactLayout = project.cards.compactLayout === true || project.cards.preset === "compact";
    const cardFieldFontSize = (field: CardFontField) => project.cards.fieldTypography?.[field]?.fontSize ?? (field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize);
    const rowFontSize = Math.max(...project.cards.visibleFields.map(cardFieldFontSize), cardFieldFontSize("city"));
    const rowHeight = Math.max(compactLayout ? 18 : 20, rowFontSize + 6) * lineHeightMultiplier;
    const titleFontSize = cardFieldFontSize("title");
    const cardWidth = Math.min(project.cards.maxWidth, Math.max(80, project.canvas.width - project.canvas.safeMargin * 2));
    const contentWidth = Math.max(rowFontSize, cardWidth - horizontalPadding * 2);
    const bottomPadding = project.cards.bottomPadding ?? project.cards.padding;
    const titleLineHeight = Math.max(16, titleFontSize + 4) * lineHeightMultiplier;
    const formatName = (name: string) => formatStudentName(name, project.cards.nameFormat ?? DEFAULT_NAME_FORMAT);
    const prepared = groups.map((group) => {
      const isInternational = group.students.every((student) => student.locationScope === "international");
      const province = isInternational || !group.students[0] ? "" : resolveStudentLocation(group.students[0]).province;
      const feature = findProvinceFeature(features, province);
      const administrativeCenter = feature ? projection(feature.center) : null;
      const point = administrativeCenter && administrativeCenter.every(Number.isFinite)
        ? administrativeCenter
        : feature
          ? mapPath.centroid(feature as never)
          : [project.map.width / 2, project.map.height / 2];
      const centerX = project.map.width / 2;
      const centerY = project.map.height / 2;
      const anchorX = Number.isFinite(point[0]) ? project.map.x + centerX + (point[0] - centerX) * project.map.scale : project.map.x + centerX;
      const anchorY = Number.isFinite(point[1]) ? project.map.y + centerY + (point[1] - centerY) * project.map.scale : project.map.y + centerY;
      const rows = cardRowsForGroup(group, grouping, project.cards.visibleFields, project.cards.citySubgroups !== false, formatName).map((row): PreparedCardRow => {
        const context = {
          group: group.title,
          count: group.count,
          province: grouping === "province" ? group.title : resolveStudentLocation(group.students[0]!).province,
          city: row.city ?? group.students[0]?.city,
          university: row.university,
          names: row.names,
        };
        const fragments = row.cityHeading
          ? [{ text: formatCardExpression(expressionTemplates.city, context, row.cityHeading), field: "city" as const }]
          : rowFragments(row, expressionTemplates.row, context);
        return { ...row, lines: wrapCardText(fragments, contentWidth, row.cityHeading ? cardFieldFontSize("city") : rowFontSize, {
          preserveFields: noWrapFieldSet,
        }) };
      });
      const lineCount = rows.reduce((total, row) => total + row.lines.length, 0);
      const title = formatCardExpression(expressionTemplates.title, {
        group: group.title,
        count: group.count,
        province: grouping === "province" ? group.title : resolveStudentLocation(group.students[0]!).province,
        city: grouping === "city" ? group.title : undefined,
        university: grouping === "university" ? group.students[0]?.university : undefined,
      }, group.title);
      const textureHeaderWidth = project.cards.showProvinceTexture === true ? 36 : 0;
      const titleWidth = Math.max(titleFontSize, contentWidth - Math.max(42, titleFontSize * 3) - textureHeaderWidth);
      const titleLines = wrapCardText([{ text: title, field: "title" as const }], titleWidth, titleFontSize);
      const headerExtra = Math.max(0, titleLines.length - 1) * titleLineHeight;
      return {
        group,
        province,
        isInternational,
        rows,
        titleLines,
        headerExtra,
        anchorX,
        anchorY,
        width: cardWidth,
        height: destinationHeight(lineCount, rowHeight, bottomPadding, headerExtra),
      };
    });
    const layoutMode = (project.cards.layoutMode ?? "quadrant") as CardLayoutMode;
    const placements = solveCardLayout(
      prepared.map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height })),
      {
        width: project.canvas.width,
        height: project.canvas.height,
        map: mapContentBounds,
        occupiedAreas: layoutOccupiedAreas,
        occupiedPolygons: layoutOccupiedPolygons,
        allowMapOverlap: project.cards.allowMapOverlap === true,
        margin: project.canvas.safeMargin,
        gap: Math.max(10, project.cards.gap),
      },
      {
        mode: layoutMode,
        autoBalance: project.cards.autoBalance !== false,
        connectorStyle: project.cards.connectorStyle,
        connectorWidth: project.cards.connectorWidth,
      },
    ).placements;
    return prepared.map((card) => {
      const placement = placements.find((item) => item.id === card.group.key)!;
      const manual = project.cards.positions?.[card.group.key];
      const constrained = manual && clampDestinationCardPosition(
        { ...manual, width: placement.width, height: placement.height },
        {
          width: project.canvas.width,
          height: project.canvas.height,
          map: mapContentBounds,
          occupiedAreas: layoutOccupiedAreas,
          occupiedPolygons: layoutOccupiedPolygons,
          allowMapOverlap: project.cards.allowMapOverlap === true,
          margin: project.canvas.safeMargin,
          gap: Math.max(10, project.cards.gap),
        },
      );
      return constrained ? { ...card, placement: { ...placement, ...constrained } } : { ...card, placement };
    });
  }, [expressionTemplates.city, expressionTemplates.row, expressionTemplates.title, groups, grouping, horizontalPadding, layoutOccupiedAreas, layoutOccupiedPolygons, lineHeightMultiplier, mapPath, noWrapFieldSet, projection, project.canvas, project.cards, project.dataView, project.map, mapContentBounds]);

  const connectorEdge = useMemo(() => resolveEdgeStyle({
    style: project.cards.connectorDash,
    color: project.cards.connectorColor,
    width: project.cards.connectorWidth,
    filterPrefix: "connector-edge",
  }), [project.cards.connectorColor, project.cards.connectorDash, project.cards.connectorWidth]);

  const guestX = guestPreview?.x ?? guests.x;
  const guestY = guestPreview?.y ?? guests.y;

  const canvasPoint = (event: PointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return null;
    if (typeof svg.createSVGPoint !== "function") {
      const rect = svg.getBoundingClientRect();
      const width = rect.width || project.canvas.width;
      const height = rect.height || project.canvas.height;
      return {
        x: (event.clientX - rect.left) * project.canvas.width / width,
        y: (event.clientY - rect.top) * project.canvas.height / height,
      };
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  };

  const mapLayerZ = project.map.zIndex ?? CANVAS_LAYER_Z.map;
  const cardsLayerZ = project.cards.zIndex ?? CANVAS_LAYER_Z.cards;

  // 画布顶层块按 zIndex 排序渲染：SVG 的绘制顺序即 DOM 顺序，数值越大越靠上。
  // map / cards 的层级可在属性面板调整；guests / decorations / texts 为固定锚点。
  const layerBlocks: Array<{ key: string; z: number; node: ReactNode }> = [
    {
      key: "map",
      z: mapLayerZ,
      node: (
        <>
          <MapLayer
            settings={project.map}
            features={features}
            counts={counts}
            dataView={project.dataView}
            theme={{ ink: project.map.edgeColor, heatColors: HEAT_COLORS }}
            pins={project.dataView === "pins" ? pins : selectedStudentId ? pins.filter((pin) => pin.id === selectedStudentId) : []}
            selectedStudentId={selectedStudentId}
            onSelectStudent={onSelectStudent}
            assets={project.assetElements}
            selectedAssetId={selectedAssetId}
            exportMode={exportMode}
            selected={!exportMode && mapSelected}
            renderIntervalMs={renderIntervalMs}
            onResizeMapImage={onResizeMapImage}
            onSelectMap={() => onSelect?.({ type: "map" })}
            onSelectProvince={(province) => onSelect?.({ type: "province", province })}
            selectedProvince={selectedProvince}
            onMoveProvinceTexture={onMoveProvinceTexture}
            onSelectAsset={(id) => onSelect?.({ type: "asset", id })}
            onAssetLoadError={onAssetLoadError}
            userFonts={userFonts}
          />

          <RegionalAssetLayer
            settings={project.map}
            features={features}
            path={(feature) => mapPath(feature as never)}
            assets={project.assetElements}
            kinds={["landmark"]}
            selectedAssetId={selectedAssetId}
            exportMode={exportMode}
            renderIntervalMs={renderIntervalMs}
            onSelectAsset={(id) => onSelect?.({ type: "asset", id })}
            onAssetLoadError={onAssetLoadError}
            onMoveAsset={onMoveAsset}
            onResizeAsset={onResizeAsset}
          />
        </>
      ),
    },
    {
      key: "cards",
      z: cardsLayerZ,
      node: (
        <>
          {destinationCards.length > 0 && (
            <g
              data-cards-layer
              onClick={!exportMode ? () => onSelect?.({ type: "cards" }) : undefined}
              role={!exportMode && onSelect ? "button" : undefined}
            >
              {connectorEdge.filters.length > 0 && (
                <defs data-connector-edge-filters>
                  {connectorEdge.filters.map((filter) => (
                    filter.markupKey === "soft-glow" ? (
                      <filter key={filter.id} id={filter.id} x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur stdDeviation={Math.max(1.2, project.cards.connectorWidth)} result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    ) : filter.markupKey === "ink" ? (
                      <filter key={filter.id} id={filter.id} x="-20%" y="-20%" width="140%" height="140%">
                        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale={Math.max(0.6, project.cards.connectorWidth * 0.35)} />
                      </filter>
                    ) : null
                  ))}
                </defs>
              )}
              {destinationCards.map(({ group, province, isInternational, rows, titleLines, headerExtra, anchorX, anchorY, placement }) => {
                const displayPlacement = dragPreview?.id === group.key ? { ...placement, x: dragPreview.x, y: dragPreview.y } : placement;
                const provinceAppearance = project.map.provinceStyles?.[province]?.appearance;
                const provinceTexture = project.cards.showProvinceTexture === true
                  && provinceAppearance
                  && provinceAppearance.kind !== "manual-color"
                  ? provinceAppearance
                  : null;
                const connector = isInternational ? null : buildConnectorGeometry({
                  card: displayPlacement,
                  anchor: { x: anchorX, y: anchorY },
                  style: project.cards.connectorStyle,
                  preferredSide: displayPlacement.side,
                });
                // Borderless cards have no border stroke to visually terminate the connector,
                // so the line runs to the card center where the card fill hides it. When the
                // fill is too transparent to cover the line (it would cross the card text),
                // the connector is omitted entirely.
                const borderlessCards = project.cards.preset === "borderless";
                const connectorHidden = connector !== null && borderlessCards && (project.cards.opacity ?? 1) < 0.9;
                const displayConnector = connector !== null && !connectorHidden
                  ? borderlessCards
                    ? { ...connector, pathData: connectorPathToCenter(connector.pathData, connector.port, displayPlacement) }
                    : connector
                  : null;
                const strokeNodes = [
                  ...(displayConnector ? connectorEdge.underlays.map((spec, index) => (
                    <path
                      key={`${group.key}-u-${index}`}
                      data-destination-connector-underlay={group.key}
                      d={displayConnector.pathData}
                      fill="none"
                      stroke={spec.color}
                      strokeWidth={spec.width}
                      strokeDasharray={spec.dasharray}
                      strokeLinecap={spec.linecap}
                      strokeLinejoin={spec.linejoin}
                      opacity={spec.opacity ?? 0.55}
                      filter={spec.filter}
                      pointerEvents="none"
                    />
                  )) : []),
                  ...(displayConnector ? connectorEdge.strokes.map((spec, index) => (
                    <path
                      key={`${group.key}-s-${index}`}
                      data-destination-connector={index === 0 ? group.key : undefined}
                      data-connector-style={project.cards.connectorStyle}
                      data-connector-dash={project.cards.connectorDash}
                      d={displayConnector.pathData}
                      fill="none"
                      stroke={spec.color}
                      strokeWidth={spec.width}
                      strokeDasharray={spec.dasharray}
                      strokeLinecap={spec.linecap}
                      strokeLinejoin={spec.linejoin}
                      opacity={spec.opacity ?? 0.85}
                      filter={spec.filter}
                    />
                  )) : []),
                ];
                return (
                  <g key={group.key}>
                    {strokeNodes}
                    {!isInternational && <circle data-destination-anchor={group.key} cx={anchorX} cy={anchorY} r={4} fill={project.map.activeColor} />}
                    <g
                      transform={`translate(${displayPlacement.x} ${displayPlacement.y})`}
                      data-destination-card={group.key}
                      data-card-preset={project.cards.preset}
                      className="destination-card"
                      onPointerDown={!exportMode && onMoveCard ? (event) => {
                        const point = canvasPoint(event);
                        if (!point) return;
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        cardDrag.current = { id: group.key, offsetX: point.x - displayPlacement.x, offsetY: point.y - displayPlacement.y, width: displayPlacement.width, height: displayPlacement.height, x: displayPlacement.x, y: displayPlacement.y };
                      } : undefined}
                      onPointerMove={!exportMode && onMoveCard ? (event) => {
                        if (!event.currentTarget.hasPointerCapture(event.pointerId) || !cardDrag.current) return;
                        const point = canvasPoint(event);
                        if (!point) return;
                        const drag = cardDrag.current;
                        const position = clampDestinationCardPosition({
                          x: point.x - drag.offsetX,
                          y: point.y - drag.offsetY,
                          width: drag.width,
                          height: drag.height,
                        }, {
                          width: project.canvas.width,
                          height: project.canvas.height,
                          map: mapContentBounds,
                          occupiedAreas: layoutOccupiedAreas,
                          occupiedPolygons: layoutOccupiedPolygons,
                          allowMapOverlap: project.cards.allowMapOverlap === true,
                          margin: project.canvas.safeMargin,
                          gap: Math.max(10, project.cards.gap),
                        });
                        drag.x = Math.round(position.x);
                        drag.y = Math.round(position.y);
                        scheduleCardPreview({ id: drag.id, x: drag.x, y: drag.y });
                      } : undefined}
                      onPointerUp={!exportMode && onMoveCard ? (event) => {
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                        const drag = cardDrag.current;
                        if (drag) onMoveCard(drag.id, drag.x, drag.y);
                        cardDrag.current = null;
                        clearCardPreview();
                        setDragPreview(null);
                      } : undefined}
                      onPointerCancel={!exportMode && onMoveCard ? () => {
                        cardDrag.current = null;
                        clearCardPreview();
                        setDragPreview(null);
                      } : undefined}
                    >
                      <rect width={placement.width} height={placement.height} rx={project.cards.preset === "ticket" ? 12 : project.cards.preset === "borderless" ? 0 : 6} fill={project.cards.background} fillOpacity={project.cards.opacity} stroke={project.cards.preset === "borderless" ? "none" : project.map.edgeColor} />
                      {provinceTexture && (
                        <image
                          data-card-province-texture={province}
                          href={provinceTexture.src}
                          x={horizontalPadding + (project.cards.preset === "photo" ? 32 : 0)}
                          y={3}
                          width={30}
                          height={30}
                          opacity={provinceTexture.opacity ?? 1}
                          preserveAspectRatio="xMidYMid meet"
                          pointerEvents="none"
                        />
                      )}
                      {project.cards.preset === "ticket" && <><rect data-card-accent width={8} height={placement.height} rx={4} fill={project.map.activeColor} /><circle cx={placement.width - 18} cy={18} r={7} fill={project.map.activeColor} opacity={0.2} /></>}
                      {project.cards.preset === "photo" && <><circle data-card-avatar cx={horizontalPadding + 13} cy={21} r={13} fill={project.map.activeColor} opacity={0.2} /><text x={horizontalPadding + 13} y={25} textAnchor="middle" fill={project.map.activeColor} fontWeight={700} fontSize={11}>{group.title.slice(0, 1)}</text></>}
                      {titleLines.map((line, index) => (
                        <text
                          key={`title-${index}`}
                          data-card-title-line
                          x={horizontalPadding + (project.cards.preset === "photo" ? 32 : 0) + (provinceTexture ? 36 : 0)}
                          y={22 + index * Math.max(16, project.cards.fontSize + 4) * lineHeightMultiplier}
                          fontWeight={700}
                          fontSize={project.cards.fieldTypography?.title?.fontSize ?? project.cards.fontSize}
                          fill={project.cards.fieldTypography?.title?.color ?? project.cards.textColor}
                          fontFamily={resolveFontFamily(project.cards.fieldFonts?.title, userFonts)}
                        >{line.map((fragment) => fragment.text).join("")}</text>
                      ))}
                      {project.cards.showCount !== false && <text x={placement.width - horizontalPadding} y={22} fill={project.map.activeColor} textAnchor="end" fontWeight={700} fontSize={project.cards.fontSize} fontFamily={resolveFontFamily(project.cards.fieldFonts?.title, userFonts)}>{group.count} 人</text>}
                      {project.cards.preset !== "borderless" && <line x1={horizontalPadding} x2={placement.width - horizontalPadding} y1={30 + headerExtra} y2={30 + headerExtra} stroke={project.map.edgeColor} />}
                      {(() => {
                        const rowHeight = Math.max(
                          project.cards.compactLayout === true || project.cards.preset === "compact" ? 18 : 20,
                          Math.max(...project.cards.visibleFields.map((field) => project.cards.fieldTypography?.[field]?.fontSize ?? project.cards.fontSize), project.cards.fieldTypography?.city?.fontSize ?? Math.max(9, project.cards.fontSize - 1)) + 6,
                        ) * lineHeightMultiplier;
                        let lineIndex = 0;
                        return rows.flatMap((row) => row.lines.map((line, index) => {
                          const y = 49 + headerExtra + lineIndex * rowHeight;
                          lineIndex += 1;
                          return (
                            <text
                              key={`${row.key}-${index}`}
                              data-city-section={index === 0 ? row.cityHeading : undefined}
                              data-card-row-line={row.key}
                              x={horizontalPadding}
                              y={y}
                              fill={project.cards.fieldTypography?.[row.cityHeading ? "city" : "name"]?.color ?? project.cards.textColor}
                              fontSize={project.cards.fieldTypography?.[row.cityHeading ? "city" : "name"]?.fontSize ?? (row.cityHeading ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize)}
                              fontWeight={row.cityHeading ? 700 : undefined}
                            >
                              {line.map((fragment, fragmentIndex) => (
                                <tspan
                                  key={fragmentIndex}
                                  fontFamily={resolveFontFamily(fragment.field ? project.cards.fieldFonts?.[fragment.field] : undefined, userFonts)}
                                  fontSize={fragment.field ? project.cards.fieldTypography?.[fragment.field]?.fontSize : undefined}
                                  fill={fragment.field ? project.cards.fieldTypography?.[fragment.field]?.color : undefined}
                                >{fragment.text}</tspan>
                              ))}
                            </text>
                          );
                        }));
                      })()}

                    </g>
                  </g>
                );
              })}
            </g>
          )}
        </>
      ),
    },
    {
      key: "guests",
      z: CANVAS_LAYER_Z.guests,
      node: (
        <>
          {guests.visibility !== false && (
            <g
              data-guests-layer
              transform={`translate(${guestX} ${guestY})`}
              onClick={!exportMode ? (event) => { event.stopPropagation(); onSelect?.({ type: "guests" }); } : undefined}
              role={!exportMode && onSelect ? "button" : undefined}
              tabIndex={!exportMode && onSelect ? 0 : undefined}
              aria-label="特邀嘉宾"
              onPointerDown={!exportMode && onMoveGuests ? (event) => {
                const point = canvasPoint(event);
                if (!point) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                guestDrag.current = { offsetX: point.x - guestX, offsetY: point.y - guestY, x: guestX, y: guestY };
              } : undefined}
              onPointerMove={!exportMode && onMoveGuests ? (event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId) || !guestDrag.current) return;
                const point = canvasPoint(event);
                if (!point) return;
                const nextX = Math.round(Math.min(project.canvas.width - guests.width, Math.max(0, point.x - guestDrag.current.offsetX)));
                const nextY = Math.round(Math.min(project.canvas.height - guestHeight, Math.max(0, point.y - guestDrag.current.offsetY)));
                guestDrag.current.x = nextX;
                guestDrag.current.y = nextY;
                scheduleGuestPreview({ x: nextX, y: nextY });
              } : undefined}
              onPointerUp={!exportMode && onMoveGuests ? (event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                const drag = guestDrag.current;
                if (drag) onMoveGuests(drag.x, drag.y);
                guestDrag.current = null;
                clearGuestPreview();
                setGuestPreview(null);
              } : undefined}
              onPointerCancel={!exportMode && onMoveGuests ? () => {
                guestDrag.current = null;
                clearGuestPreview();
                setGuestPreview(null);
              } : undefined}
            >
              <rect
                width={guests.width}
                height={guestHeight}
                rx={10}
                fill={guests.background}
                fillOpacity={guests.opacity}
                stroke={project.map.edgeColor}
              />
              <text data-guest-title x={guests.padding} y={guests.padding + guestTitleFontSize} fill={guestTitleTypography.color ?? guests.textColor} fontSize={guestTitleFontSize} fontWeight={700} fontFamily={resolveFontFamily(guests.titleFontId, userFonts)}>
                {guests.title}
              </text>
              <line
                x1={guests.padding}
                x2={guests.width - guests.padding}
                y1={guests.padding + guestTitleFontSize + 8}
                y2={guests.padding + guestTitleFontSize + 8}
                stroke={project.map.edgeColor}
              />
              {guestCustomLines.map((line, index) => (
                <text
                  key={`guest-custom-${index}`}
                  data-guest-custom-text
                  x={guests.padding + guestListAvatarGap}
                  y={guests.padding + guestTitleFontSize + 8 + guestCustomTopGap + index * guestCustomLineHeight}
                  fill={guestPeopleTypography.color ?? guests.textColor}
                  fontSize={guestPeopleFontSize}
                  fontFamily={resolveFontFamily(guests.peopleFontId, userFonts)}
                >
                  {line || " "}
                </text>
              ))}
              {visibleGuests.length === 0 && !guestCustomText ? (
                <text x={guests.padding} y={guests.padding + 36 + guests.fontSize} fill={guests.textColor} fontSize={guests.fontSize} opacity={0.65}>
                  在右侧添加老师 / 嘉宾
                </text>
              ) : guestsDisplayMode === "cards" ? visibleGuests.map((person, index) => {
                const col = index % guestCardColumns;
                const row = Math.floor(index / guestCardColumns);
                const cardX = guests.padding + col * (guestCardWidth + guestCardGap);
                const cardY = guests.padding + 30 + guestTitleFontSize + guestCustomHeight + row * (guestCardHeight + guestCardGap);
                const avatarCenterX = guestCardWidth / 2;
                const avatarCenterY = 6 + guestCardAvatarSize / 2;
                const nameBaseline = 6 + guestCardAvatarSize + 6 + guestCardTitleLine;
                const nameMaxChars = Math.max(4, Math.floor((guestCardWidth - 8) / guestPeopleFontSize));
                const subMaxChars = Math.max(4, Math.floor((guestCardWidth - 8) / guestNoteFontSize));
                const noteBaseline = nameBaseline + (guestCardHasTitle ? guestCardSubLine : 0) + guestCardSubLine;
                return (
                  <g key={person.id} data-guest-card={person.id} transform={`translate(${cardX} ${cardY})`}>
                    <rect
                      width={guestCardWidth}
                      height={guestCardHeight}
                      rx={8}
                      fill={guestPeopleTypography.color ?? guests.textColor}
                      fillOpacity={0.07}
                      stroke={project.map.edgeColor}
                      strokeOpacity={0.4}
                      strokeWidth={1}
                    />
                    <g data-guest-avatar={person.id}>
                      <clipPath id={`guest-avatar-clip-${person.id}`}>
                        <circle cx={avatarCenterX} cy={avatarCenterY} r={guestCardAvatarSize / 2} />
                      </clipPath>
                      <circle
                        cx={avatarCenterX}
                        cy={avatarCenterY}
                        r={guestCardAvatarSize / 2}
                        fill={guestPeopleTypography.color ?? guests.textColor}
                        fillOpacity={0.14}
                        stroke={guestPeopleTypography.color ?? guests.textColor}
                        strokeOpacity={0.4}
                        strokeWidth={1}
                      />
                      {person.avatarSrc ? (
                        <image
                          href={person.avatarSrc}
                          x={avatarCenterX - guestCardAvatarSize / 2}
                          y={avatarCenterY - guestCardAvatarSize / 2}
                          width={guestCardAvatarSize}
                          height={guestCardAvatarSize}
                          clipPath={`url(#guest-avatar-clip-${person.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      ) : (
                        <text
                          data-guest-avatar-initial={person.id}
                          x={avatarCenterX}
                          y={avatarCenterY + Math.max(6, guestCardAvatarSize * 0.3)}
                          textAnchor="middle"
                          fill={guestPeopleTypography.color ?? guests.textColor}
                          fontSize={Math.max(14, guestCardAvatarSize * 0.38)}
                          fontWeight={600}
                        >
                          {person.name.slice(0, 1)}
                        </text>
                      )}
                    </g>
                    <text
                      data-guest-person={person.id}
                      x={avatarCenterX}
                      y={nameBaseline}
                      textAnchor="middle"
                      fill={guestPeopleTypography.color ?? guests.textColor}
                      fontSize={guestPeopleFontSize}
                      fontWeight={600}
                      fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
                    >
                      {truncateGuestText(person.name, nameMaxChars)}
                    </text>
                    {person.title && (
                      <text
                        x={avatarCenterX}
                        y={nameBaseline + guestCardSubLine}
                        textAnchor="middle"
                        fill={guestPeopleTypography.color ?? guests.textColor}
                        fillOpacity={0.66}
                        fontSize={guestNoteFontSize}
                        fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
                      >
                        {truncateGuestText(person.title, subMaxChars)}
                      </text>
                    )}
                    {person.note && (
                      <text
                        data-guest-note={person.id}
                        x={avatarCenterX}
                        y={noteBaseline}
                        textAnchor="middle"
                        fill={guestPeopleTypography.color ?? guests.textColor}
                        fillOpacity={0.72}
                        fontSize={guestNoteFontSize}
                        fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
                      >
                        {truncateGuestText(person.note, subMaxChars)}
                      </text>
                    )}
                  </g>
                );
              }) : visibleGuests.map((person, index) => {
                const nameBaseline = guests.padding + 30 + guestTitleFontSize + guestCustomHeight + index * guestRowHeight;
                const avatarCenterY = nameBaseline - guestPeopleFontSize * 0.35;
                const avatarR = guestListAvatarSize / 2;
                const textX = guests.padding + guestListAvatarGap;
                const noteMaxChars = Math.max(8, Math.floor((guests.width - guests.padding * 2 - guestListAvatarGap) / guestNoteFontSize));
                return (
                  <g key={person.id} data-guest-row={person.id}>
                    {guestListUsesAvatar && (
                      <g data-guest-avatar={person.id}>
                        {person.avatarSrc ? (
                          <>
                            <clipPath id={`guest-avatar-clip-${person.id}`}>
                              <circle cx={guests.padding + avatarR} cy={avatarCenterY} r={avatarR} />
                            </clipPath>
                            <circle cx={guests.padding + avatarR} cy={avatarCenterY} r={avatarR} fill={guests.background} stroke={project.map.edgeColor} strokeWidth={1} />
                            <image
                              href={person.avatarSrc}
                              x={guests.padding}
                              y={avatarCenterY - avatarR}
                              width={guestListAvatarSize}
                              height={guestListAvatarSize}
                              clipPath={`url(#guest-avatar-clip-${person.id})`}
                              preserveAspectRatio="xMidYMid slice"
                            />
                          </>
                        ) : (
                          <circle
                            cx={guests.padding + avatarR}
                            cy={avatarCenterY}
                            r={avatarR}
                            fill={guestPeopleTypography.color ?? guests.textColor}
                            fillOpacity={0.12}
                            stroke={guestPeopleTypography.color ?? guests.textColor}
                            strokeOpacity={0.35}
                            strokeWidth={1}
                          >
                            <title>{person.name}</title>
                          </circle>
                        )}
                      </g>
                    )}
                    <text
                      data-guest-person={person.id}
                      x={textX}
                      y={nameBaseline}
                      fill={guestPeopleTypography.color ?? guests.textColor}
                      fontSize={guestPeopleFontSize}
                      fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
                    >
                      {person.name}{person.title ? ` · ${person.title}` : ""}
                    </text>
                    {person.note && (
                      <text
                        data-guest-note={person.id}
                        x={textX}
                        y={nameBaseline + guestNoteFontSize + 3}
                        fill={guestPeopleTypography.color ?? guests.textColor}
                        fillOpacity={0.62}
                        fontSize={guestNoteFontSize}
                        fontFamily={resolveFontFamily(person.fontId ?? guests.peopleFontId, userFonts)}
                      >
                        {truncateGuestText(person.note, noteMaxChars)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </>
      ),
    },
    {
      key: "decorations",
      z: CANVAS_LAYER_Z.decorations,
      node: (
        <DecorationLayer
          assets={project.assetElements.filter((asset) => asset.kind === "decoration")}
          selectedAssetId={selectedAssetId}
          exportMode={exportMode}
          renderIntervalMs={renderIntervalMs}
          onSelectAsset={(id) => onSelect?.({ type: "asset", id })}
          onAssetLoadError={onAssetLoadError}
          onMoveAsset={onMoveAsset}
          onResizeAsset={onResizeAsset}
        />
      ),
    },
    {
      key: "texts",
      z: CANVAS_LAYER_Z.texts,
      node: (
        <TextLayer
          textElements={project.textElements}
          selectedTextId={selectedTextId}
          exportMode={exportMode}
          userFonts={userFonts}
          onSelectText={(id) => onSelect?.({ type: "text", id })}
          onMoveText={onMoveText}
        />
      ),
    },
  ];
  layerBlocks.sort((a, b) => a.z - b.z);

  return (
    <svg
      ref={posterRef}
      className="poster"
      data-render-interval-ms={renderIntervalMs}
      viewBox={`0 0 ${project.canvas.width} ${project.canvas.height}`}
      width={project.canvas.width}
      height={project.canvas.height}
      role="img"
      aria-label="毕业去向蹭饭图编辑画布"
      onClick={(event) => {
        if (!exportMode && event.target === event.currentTarget) onSelect?.({ type: "canvas" });
      }}
    >
      {userFonts.length > 0 && (
        <defs data-font-faces>
          <style>{buildFontFaceCss(userFonts)}</style>
        </defs>
      )}
      <rect
        width={project.canvas.width}
        height={project.canvas.height}
        fill={project.canvas.backgroundColor}
        opacity={project.canvas.backgroundOpacity}
        data-canvas-background
      />
      {project.canvas.backgroundImageSrc && (
        <image
          href={project.canvas.backgroundImageSrc}
          x={0}
          y={0}
          width={project.canvas.width}
          height={project.canvas.height}
          opacity={project.canvas.backgroundOpacity}
          preserveAspectRatio={project.canvas.backgroundFit === "stretch" ? "none" : project.canvas.backgroundFit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
          data-background-image
        />
      )}

      {!exportMode && showGrid && (
        <g data-editor-grid data-grid-size={resolvedGridSize} pointerEvents="none">
          <defs>
            <pattern
              id="editor-grid-pattern"
              width={resolvedGridSize}
              height={resolvedGridSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${resolvedGridSize} 0 L 0 0 0 ${resolvedGridSize}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={0.5}
                opacity={0.55}
              />
            </pattern>
          </defs>
          <rect
            width={project.canvas.width}
            height={project.canvas.height}
            fill="url(#editor-grid-pattern)"
          />
        </g>
      )}

      {layerBlocks.map((block) => <Fragment key={block.key}>{block.node}</Fragment>)}
    </svg>
  );
}
