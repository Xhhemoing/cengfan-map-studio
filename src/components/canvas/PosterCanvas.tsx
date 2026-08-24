import { geoMercator, geoPath } from "d3-geo";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { DestinationCard, type CardDisplayRow, type DestinationCardStyle, type PreparedCardRow } from "./DestinationCard";
import { clampDestinationCardPosition, type CardArea, type CardLayoutMode, type CardPoint, type CardPolygon } from "../../lib/card-layout";
import { createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";
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
import type { AssetElement, CanvasText, CardFontField, SceneSelection } from "../../lib/scene-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "../../lib/display-frame";
import type { ProjectDocument } from "../../lib/project-document";
import { resolveStudentLocation } from "../../lib/student-data";
import { findProvinceFeature, getChinaMapFeatures, type MapFeature, type Position } from "../../lib/map-data";
import { buildConnectorGeometry } from "../../lib/connector-geometry";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize, DEFAULT_GRID_SIZE } from "../../lib/grid";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES, formatCardExpression } from "../../lib/card-expression";
import { DEFAULT_NAME_FORMAT, formatStudentName } from "../../lib/name-format";
import { universityEmblems } from "../../data/university-emblems";
import { wrapCardText, type CardTextFragment } from "../../lib/card-text-layout";
import { splitMapFeaturesForSouthChinaSea } from "../../lib/south-china-sea";
import { DecorationLayer } from "./DecorationLayer";
import { MapLayer } from "./MapLayer";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import { TextLayer } from "./TextLayer";
import { useCardLayoutWorker } from "./useCardLayoutWorker";
import { clearCanvasPreview, createCanvasPreviewScheduler, scheduleCanvasPreview } from "./CanvasDragPreview";

const features = getChinaMapFeatures();
const openMapSplit = splitMapFeaturesForSouthChinaSea(features, false);
const foldedMapSplit = splitMapFeaturesForSouthChinaSea(features, true);
const HEAT_COLORS = ["#d9f0e5", "#8ccfb6", "#4da184", "#17675e"] as const;
const LANDMARK_ASSET_KINDS: AssetElement["kind"][] = ["landmark"];
const EMPTY_USER_FONTS: UserFont[] = [];

const MemoizedMapLayer = memo(MapLayer);
const MemoizedRegionalAssetLayer = memo(RegionalAssetLayer);
const MemoizedDecorationLayer = memo(DecorationLayer);
const MemoizedTextLayer = memo(TextLayer);

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
  dataTemplateId?: string;
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
  /** Reports current card locations so a parent can freeze them before a map edit. */
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
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

const REFERENCE_CARD_COLORS = ["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"] as const;

function referenceCardColor(key: string, fallback: string): string {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return REFERENCE_CARD_COLORS[hash % REFERENCE_CARD_COLORS.length] ?? fallback;
}

function readableTextColor(background: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1]!, 16);
  const luminance = ((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return luminance > 160 ? "#1c3154" : "#ffffff";
}

function renderReferenceCardVisual({
  presentation,
  group,
  rows,
  width,
  height,
  accent,
  background,
  opacity,
  textColor,
  fontSize,
  edgeColor,
  titleFont,
}: {
  presentation: Exclude<import("../../lib/scene-document").CardPresentation, "standard">;
  group: ReturnType<typeof buildLayoutGroups>[number];
  rows: PreparedCardRow[];
  width: number;
  height: number;
  accent: string;
  background: string;
  opacity: number;
  textColor: string;
  fontSize: number;
  edgeColor: string;
  titleFont?: string;
}): ReactNode {
  const bodyRows = rows.filter((row) => !row.cityHeading || presentation === "glass-stat");
  const textFor = (row: PreparedCardRow) => row.lines.map((line) => line.map((part) => part.text).join("")).join(" ");
  const lineHeight = Math.max(17, fontSize + 5);

  if (presentation === "color-pill") {
    const foreground = readableTextColor(accent);
    const bodyStart = 32;
    return (
      <g data-card-visual="color-pill">
        <rect x={0} y={12} width={width} height={Math.max(36, height - 12)} rx={Math.min(28, Math.max(18, height / 3))} fill={accent} fillOpacity={opacity} />
        <text x={width / 2} y={19} textAnchor="middle" fill="#1c3154" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => <text key={row.key} x={width / 2} y={bodyStart + index * lineHeight} textAnchor="middle" fill={foreground} fontSize={fontSize} fontWeight={600}>{textFor(row)}</text>)}
      </g>
    );
  }

  if (presentation === "emblem-list") {
    return (
      <g data-card-visual="emblem-list">
        <path d={`M20 19 Q${Math.round(width * 0.35)} 10 ${Math.round(width * 0.68)} 18`} fill="none" stroke="#f1c84b" strokeWidth={13} strokeLinecap="round" opacity={0.85} />
        <circle cx={11} cy={14} r={5} fill="#e24d42" /><path d="M8 18 L11 25 L14 18" fill="#e24d42" />
        <text x={24} y={20} fill="#263b78" fontSize={fontSize + 5} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => {
          const y = 40 + index * Math.max(22, lineHeight + 3);
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return <g key={row.key}>{emblem && <image href={emblem} x={7} y={y - 14} width={18} height={18} preserveAspectRatio="xMidYMid meet" />}<text x={emblem ? 31 : 9} y={y} fill={textColor} fontSize={fontSize} fontWeight={500}>{textFor(row)}</text></g>;
        })}
      </g>
    );
  }

  if (presentation === "city-label") {
    return (
      <g data-card-visual="city-label">
        <text x={6} y={fontSize + 8} fill={accent} stroke="#ffffff" strokeWidth={2.5} paintOrder="stroke" fontSize={fontSize + 8} fontWeight={900} fontFamily={titleFont}>{group.title}</text>
        {bodyRows.map((row, index) => {
          const y = 39 + index * lineHeight;
          const emblem = row.university ? universityEmblems[row.university] : undefined;
          return <g key={row.key}>{emblem && <image href={emblem} x={7} y={y - 13} width={16} height={16} preserveAspectRatio="xMidYMid meet" />}<text x={emblem ? 29 : 8} y={y} fill={textColor} fontSize={fontSize} fontWeight={600}>{textFor(row)}</text></g>;
        })}
      </g>
    );
  }

  let bodyIndex = 0;
  return (
    <g data-card-visual="glass-stat">
      <rect width={width} height={height} rx={4} fill={background} fillOpacity={Math.min(0.9, Math.max(0.55, opacity))} stroke={edgeColor} strokeOpacity={0.7} />
      <rect x={8} y={8} width={15} height={15} rx={3} fill={accent} />
      <text x={29} y={20} fill={textColor} fontSize={fontSize + 2} fontWeight={800} fontFamily={titleFont}>{group.title}</text>
      <text x={width - 9} y={20} textAnchor="end" fill={accent} fontSize={fontSize} fontWeight={800}>{group.count} 人</text>
      <line x1={8} x2={width - 8} y1={28} y2={28} stroke={edgeColor} strokeOpacity={0.55} />
      {rows.map((row) => {
        const isHeading = Boolean(row.cityHeading);
        const y = 46 + bodyIndex * lineHeight;
        bodyIndex += 1;
        return <text key={row.key} x={isHeading ? 9 : 15} y={y} fill={isHeading ? accent : textColor} fontSize={isHeading ? Math.max(9, fontSize - 1) : fontSize} fontWeight={isHeading ? 800 : 500}>{textFor(row)}</text>;
      })}
    </g>
  );
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
  dataTemplateId,
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
  onCardPositionsResolved,
  userFonts = EMPTY_USER_FONTS,
  showGrid = false,
  gridSize = DEFAULT_GRID_SIZE,
  renderIntervalMs = 0,
}: PosterCanvasProps) {
  const resolvedGridSize = clampGridSize(gridSize);
  const cardDrag = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
    element: SVGGElement;
    connectorGroup: SVGGElement;
    anchorX: number;
    anchorY: number;
    side: "left" | "right" | "top" | "bottom";
    connectorStyle: ProjectDocument["cards"]["connectorStyle"];
    borderless: boolean;
    connectorHidden: boolean;
  } | null>(null);
  const guestDrag = useRef<{
    offsetX: number;
    offsetY: number;
    x: number;
    y: number;
    originalX: number;
    originalY: number;
    element: SVGGElement;
  } | null>(null);
  const cardPreviewScheduler = useRef(createCanvasPreviewScheduler<{ id: string; x: number; y: number }>());
  const guestPreviewScheduler = useRef(createCanvasPreviewScheduler<{ x: number; y: number }>());

  const updateCardPreview = useCallback((next: { id: string; x: number; y: number }) => {
    const drag = cardDrag.current;
    if (!drag || drag.id !== next.id) return;
    const placement = { x: next.x, y: next.y, width: drag.width, height: drag.height, side: drag.side };
    drag.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
    const connector = drag.connectorHidden ? null : buildConnectorGeometry({
      card: placement,
      anchor: { x: drag.anchorX, y: drag.anchorY },
      style: drag.connectorStyle,
      preferredSide: drag.side,
    });
    const pathData = connector
      ? drag.borderless
        ? connectorPathToCenter(connector.pathData, connector.port, placement)
        : connector.pathData
      : null;
    if (pathData) {
      drag.connectorGroup.querySelectorAll<SVGPathElement>("path").forEach((path) => path.setAttribute("d", pathData));
    }
  }, []);

  const clearCardPreview = useCallback(() => clearCanvasPreview(cardPreviewScheduler.current), []);
  const clearGuestPreview = useCallback(() => clearCanvasPreview(guestPreviewScheduler.current), []);

  const scheduleCardPreview = useCallback((next: { id: string; x: number; y: number }) => {
    scheduleCanvasPreview(cardPreviewScheduler.current, next, renderIntervalMs, updateCardPreview);
  }, [renderIntervalMs, updateCardPreview]);

  const updateGuestPreview = useCallback((next: { x: number; y: number }) => {
    const drag = guestDrag.current;
    if (!drag) return;
    drag.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
  }, []);

  const scheduleGuestPreview = useCallback((next: { x: number; y: number }) => {
    scheduleCanvasPreview(guestPreviewScheduler.current, next, renderIntervalMs, updateGuestPreview);
  }, [renderIntervalMs, updateGuestPreview]);

  useEffect(() => () => {
    clearCardPreview();
    clearGuestPreview();
  }, [clearCardPreview, clearGuestPreview]);
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
  const displayFrame = useMemo(
    () => project.cards.displayFrame === undefined
      ? deriveFixedDisplayFrameFromCardSettings(project.cards)
      : normalizeDisplayFrame(project.cards.displayFrame),
    // Depend on the card fields the frame derives from rather than the whole
    // project.cards object, which is replaced on unrelated edits (a dragged card
    // position, a connector tweak) and would re-render every destination card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      project.cards.background,
      project.cards.displayFrame,
      project.cards.fieldFonts,
      project.cards.fieldTypography,
      project.cards.fontSize,
      project.cards.gap,
      project.cards.maxWidth,
      project.cards.opacity,
      project.cards.padding,
      project.cards.textColor,
      project.cards.visibleFields,
    ],
  );

  const frameBodyItem = displayFrame.fixed.items.find((item) => item.id === "name") ?? displayFrame.fixed.items[0];
  const horizontalPadding = displayFrame.mode === "fixed"
    ? frameBodyItem?.x ?? project.cards.horizontalPadding ?? project.cards.padding
    : displayFrame.style.padding;
  const cardStyle = useMemo<DestinationCardStyle>(() => {
    const flowBlocks = displayFrame.mode === "flow"
      ? displayFrame.flow.blocks.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      : [];
    const flowBlockFor = (field: CardFontField) => flowBlocks.find((block) => block.field === field);
    const flowTitleBlock = flowBlockFor("title");
    const flowNameBlock = flowBlockFor("name");
    const compactLayout = project.cards.compactLayout === true || project.cards.preset === "compact";
    return {
      preset: project.cards.preset,
      background: project.cards.background,
      opacity: project.cards.opacity,
      textColor: project.cards.textColor,
      fontSize: project.cards.fontSize,
      showCount: project.cards.showCount !== false,
      horizontalPadding,
      lineHeightMultiplier,
      rowHeight: Math.max(
        compactLayout ? 18 : 20,
        Math.max(...project.cards.visibleFields.map((field) => project.cards.fieldTypography?.[field]?.fontSize ?? project.cards.fontSize), project.cards.fieldTypography?.city?.fontSize ?? Math.max(9, project.cards.fontSize - 1)) + 6,
      ) * lineHeightMultiplier,
      edgeColor: project.map.edgeColor,
      activeColor: project.map.activeColor,
      fieldFonts: project.cards.fieldFonts,
      fieldTypography: project.cards.fieldTypography,
      frameMode: displayFrame.mode,
      frameStyle: displayFrame.style,
      frameTitleItem: displayFrame.fixed.items.find((item) => item.id === "title"),
      frameBodyItem,
      customFrameItems: displayFrame.mode === "fixed"
        ? displayFrame.fixed.items.filter((item) => item.kind === "text" || item.kind === "decoration").slice().sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
        : [],
      flowTitleBlock,
      flowNameBlock,
      flowCityBlock: flowBlockFor("city"),
      flowTitleFontSize: flowTitleBlock?.style?.fontSize ?? project.cards.fieldTypography?.title?.fontSize ?? project.cards.fontSize,
      flowNameFontSize: flowNameBlock?.style?.fontSize ?? project.cards.fieldTypography?.name?.fontSize ?? project.cards.fontSize,
      flowContentStart: displayFrame.mode === "flow"
        ? flowBlocks.reduce((cursor, block) => cursor + block.spacing + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize)) * block.lineHeight, 12)
        : 0,
      userFonts,
    };
  }, [
    displayFrame,
    frameBodyItem,
    horizontalPadding,
    lineHeightMultiplier,
    project.cards.background,
    project.cards.compactLayout,
    project.cards.fieldFonts,
    project.cards.fieldTypography,
    project.cards.fontSize,
    project.cards.opacity,
    project.cards.preset,
    project.cards.showCount,
    project.cards.textColor,
    project.cards.visibleFields,
    project.map.activeColor,
    project.map.edgeColor,
    userFonts,
  ]);
  const preparedCards = useMemo(() => {
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
    return prepared;
  }, [
    expressionTemplates.city,
    expressionTemplates.row,
    expressionTemplates.title,
    groups,
    grouping,
    horizontalPadding,
    lineHeightMultiplier,
    mapPath,
    noWrapFieldSet,
    project.cards.bottomPadding,
    project.cards.citySubgroups,
    project.cards.compactLayout,
    project.cards.fieldTypography,
    project.cards.fontSize,
    project.cards.maxWidth,
    project.cards.nameFormat,
    project.cards.padding,
    project.cards.preset,
    project.cards.showProvinceTexture,
    project.cards.visibleFields,
    project.canvas.safeMargin,
    project.canvas.width,
    project.dataView,
    project.map.height,
    project.map.scale,
    project.map.width,
    project.map.y,
    project.map.x,
    projection,
  ]);

  const layoutRequest = useMemo<CardLayoutWorkerRequest | null>(() => {
    if (preparedCards.length === 0) return null;
    const layoutMode = (project.cards.layoutMode ?? "quadrant") as CardLayoutMode;
    const cards = preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({
      id: group.key,
      anchorX,
      anchorY,
      width,
      height,
    }));
    const bounds = {
      width: project.canvas.width,
      height: project.canvas.height,
      map: mapContentBounds,
      occupiedAreas: layoutOccupiedAreas,
      occupiedPolygons: layoutOccupiedPolygons,
      allowMapOverlap: project.cards.allowMapOverlap === true,
      margin: project.canvas.safeMargin,
      gap: Math.max(10, project.cards.gap),
    };
    const options = {
      mode: layoutMode,
      autoBalance: project.cards.autoBalance !== false,
      connectorStyle: project.cards.connectorStyle,
      connectorWidth: project.cards.connectorWidth,
    };
    return {
      key: createCardLayoutCacheKey({ cards, bounds, options }),
      cards,
      bounds,
      options,
    };
  }, [
    layoutOccupiedAreas,
    layoutOccupiedPolygons,
    mapContentBounds,
    preparedCards,
    project.canvas.height,
    project.canvas.safeMargin,
    project.canvas.width,
    project.cards.allowMapOverlap,
    project.cards.autoBalance,
    project.cards.connectorStyle,
    project.cards.connectorWidth,
    project.cards.gap,
    project.cards.layoutMode,
  ]);

  const layoutState = useCardLayoutWorker(layoutRequest, exportMode);
  const destinationCards = useMemo(() => {
    if (!layoutRequest || !layoutState.result) return [];
    const placements = new Map(layoutState.result.placements.map((placement) => [placement.id, placement]));
    return preparedCards.flatMap((card) => {
      const placement = placements.get(card.group.key);
      if (!placement) return [];
      const manual = project.cards.positions?.[card.group.key];
      return [manual ? { ...card, placement: { ...placement, x: manual.x, y: manual.y } } : { ...card, placement }];
    });
  }, [layoutRequest, layoutState.result, preparedCards, project.cards.positions]);

  useEffect(() => {
    if (!onCardPositionsResolved || destinationCards.length === 0) return;
    onCardPositionsResolved(Object.fromEntries(destinationCards.map(({ group, placement }) => [group.key, { x: placement.x, y: placement.y }])));
  }, [destinationCards, onCardPositionsResolved]);

  const connectorEdge = useMemo(() => resolveEdgeStyle({
    style: project.cards.connectorDash,
    color: project.cards.connectorColor,
    width: project.cards.connectorWidth,
    filterPrefix: "connector-edge",
  }), [project.cards.connectorColor, project.cards.connectorDash, project.cards.connectorWidth]);

  const guestX = guests.x;
  const guestY = guests.y;
  const decorationAssets = useMemo(
    () => project.assetElements.filter((asset) => asset.kind === "decoration"),
    [project.assetElements],
  );
  const mapPins = useMemo(
    () => project.dataView === "pins" ? pins : selectedStudentId ? pins.filter((pin) => pin.id === selectedStudentId) : [],
    [pins, project.dataView, selectedStudentId],
  );
  const mapTheme = useMemo(() => ({ ink: project.map.edgeColor, heatColors: HEAT_COLORS }), [project.map.edgeColor]);
  const selectMap = useCallback(() => onSelect?.({ type: "map" }), [onSelect]);
  const selectProvince = useCallback((province: string) => onSelect?.({ type: "province", province }), [onSelect]);
  const selectAsset = useCallback((id: string) => onSelect?.({ type: "asset", id }), [onSelect]);
  const mapPathForAsset = useCallback((feature: MapFeature) => mapPath(feature as never), [mapPath]);
  const selectText = useCallback((id: string) => onSelect?.({ type: "text", id }), [onSelect]);

  const canvasPoint = useCallback((event: PointerEvent<SVGGElement>) => {
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
  }, [project.canvas.height, project.canvas.width]);

  // Drag handlers are shared by every card and read their card from the DOM key, so the
  // card list does not allocate four closures per card on each render.
  const cardsByKey = useMemo(
    () => new Map(destinationCards.map((card) => [card.group.key, card])),
    [destinationCards],
  );

  const handleCardPointerDown = useCallback((event: PointerEvent<SVGGElement>) => {
    const card = cardsByKey.get(event.currentTarget.getAttribute("data-destination-card") ?? "");
    if (!card) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const connectorGroup = event.currentTarget.parentElement;
    if (!connectorGroup) return;
    const placement = card.placement;
    const borderless = project.cards.preset === "borderless";
    cardDrag.current = {
      id: card.group.key,
      offsetX: point.x - placement.x,
      offsetY: point.y - placement.y,
      width: placement.width,
      height: placement.height,
      x: placement.x,
      y: placement.y,
      originalX: placement.x,
      originalY: placement.y,
      element: event.currentTarget,
      connectorGroup: connectorGroup as unknown as SVGGElement,
      anchorX: card.anchorX,
      anchorY: card.anchorY,
      side: placement.side,
      connectorStyle: project.cards.connectorStyle,
      borderless,
      connectorHidden: !card.isInternational && borderless && (project.cards.opacity ?? 1) < 0.9,
    };
  }, [canvasPoint, cardsByKey, project.cards.connectorStyle, project.cards.opacity, project.cards.preset]);

  const handleCardPointerMove = useCallback((event: PointerEvent<SVGGElement>) => {
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
  }, [
    canvasPoint,
    layoutOccupiedAreas,
    layoutOccupiedPolygons,
    mapContentBounds,
    project.canvas.height,
    project.canvas.safeMargin,
    project.canvas.width,
    project.cards.allowMapOverlap,
    project.cards.gap,
    scheduleCardPreview,
  ]);

  const handleCardPointerUp = useCallback((event: PointerEvent<SVGGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const drag = cardDrag.current;
    if (drag) onMoveCard?.(drag.id, drag.x, drag.y);
    clearCardPreview();
    cardDrag.current = null;
  }, [clearCardPreview, onMoveCard]);

  const cardDragEnabled = !exportMode && Boolean(onMoveCard);

  const handleCardPointerCancel = useCallback(() => {
    const drag = cardDrag.current;
    if (drag) updateCardPreview({ id: drag.id, x: drag.originalX, y: drag.originalY });
    clearCardPreview();
    cardDrag.current = null;
  }, [clearCardPreview, updateCardPreview]);

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
          <MemoizedMapLayer
            settings={project.map}
            features={features}
            counts={counts}
            dataView={project.dataView}
            theme={mapTheme}
            pins={mapPins}
            selectedStudentId={selectedStudentId}
            onSelectStudent={onSelectStudent}
            assets={project.assetElements}
            selectedAssetId={selectedAssetId}
            exportMode={exportMode}
            selected={!exportMode && mapSelected}
            renderIntervalMs={renderIntervalMs}
            onResizeMapImage={onResizeMapImage}
            onSelectMap={selectMap}
            onSelectProvince={selectProvince}
            selectedProvince={selectedProvince}
            onMoveProvinceTexture={onMoveProvinceTexture}
            onSelectAsset={selectAsset}
            onAssetLoadError={onAssetLoadError}
            userFonts={userFonts}
          />

          <MemoizedRegionalAssetLayer
            settings={project.map}
            features={features}
            path={mapPathForAsset}
            assets={project.assetElements}
            kinds={LANDMARK_ASSET_KINDS}
            selectedAssetId={selectedAssetId}
            exportMode={exportMode}
            renderIntervalMs={renderIntervalMs}
            onSelectAsset={selectAsset}
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
                const displayPlacement = placement;
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
                      data-card-presentation={project.cards.presentation ?? "standard"}
                      className="destination-card"
                      onPointerDown={cardDragEnabled ? handleCardPointerDown : undefined}
                      onPointerMove={cardDragEnabled ? handleCardPointerMove : undefined}
                      onPointerUp={cardDragEnabled ? handleCardPointerUp : undefined}
                      onPointerCancel={cardDragEnabled ? handleCardPointerCancel : undefined}
                    >
                      {(project.cards.presentation ?? "standard") !== "standard" ? renderReferenceCardVisual({
                        presentation: project.cards.presentation as Exclude<import("../../lib/scene-document").CardPresentation, "standard">,
                        group,
                        rows,
                        width: placement.width,
                        height: placement.height,
                        accent: project.map.provinceStyles?.[province]?.appearance?.kind === "manual-color"
                          ? project.map.provinceStyles[province]!.appearance!.color
                          : referenceCardColor(group.key, project.map.activeColor),
                        background: project.cards.background,
                        opacity: project.cards.opacity,
                        textColor: project.cards.textColor,
                        fontSize: project.cards.fontSize,
                        edgeColor: project.map.edgeColor,
                        titleFont: resolveFontFamily(project.cards.fieldFonts?.title, userFonts),
                      }) : (
                        <DestinationCard
                          style={cardStyle}
                          group={group}
                          province={province}
                          rows={rows}
                          titleLines={titleLines}
                          headerExtra={headerExtra}
                          width={placement.width}
                          height={placement.height}
                          provinceTexture={provinceTexture}
                        />
                      )}
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
                guestDrag.current = {
                  offsetX: point.x - guestX,
                  offsetY: point.y - guestY,
                  x: guestX,
                  y: guestY,
                  originalX: guestX,
                  originalY: guestY,
                  element: event.currentTarget,
                };
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
              } : undefined}
              onPointerCancel={!exportMode && onMoveGuests ? () => {
                const drag = guestDrag.current;
                if (drag) drag.element.setAttribute("transform", `translate(${drag.originalX} ${drag.originalY})`);
                guestDrag.current = null;
                clearGuestPreview();
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
        <MemoizedDecorationLayer
          assets={decorationAssets}
          selectedAssetId={selectedAssetId}
          exportMode={exportMode}
          renderIntervalMs={renderIntervalMs}
          onSelectAsset={selectAsset}
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
        <MemoizedTextLayer
          textElements={project.textElements}
          selectedTextId={selectedTextId}
          exportMode={exportMode}
          userFonts={userFonts}
          onSelectText={selectText}
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
      data-template-preview={dataTemplateId ? "true" : undefined}
      data-template-id={dataTemplateId}
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
