import { geoMercator, geoPath } from "d3-geo";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, type PointerEvent, type ReactNode, type RefObject } from "react";
import { cardSideForArea, clampDestinationCardPosition, type CardArea, type CardLayoutInput, type CardLayoutMode, type CardPoint, type CardPolygon } from "../../lib/card-layout";
import { createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";
import { computeMapContentBounds, computeMapOccupiedAreas } from "../../lib/map-content-bounds";
import { prepareCardContents, type PreparedCardRow } from "../../lib/card-metrics";
import type { LayoutGroup } from "../../lib/layout";
import { buildProvinceSummary, getVisibleStudents } from "../../lib/project-data";
import { CANVAS_LAYER_Z } from "../../lib/scene-document";
import type { AssetElement, CanvasText, CardFontField, SceneSelection } from "../../lib/scene-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame, type DisplayFrameFixedItem } from "../../lib/display-frame";
import type { ProjectDocument } from "../../lib/project-document";
import { resolveStudentLocation } from "../../lib/student-data";
import { findProvinceFeature, getChinaMapFeatures, type MapFeature, type Position } from "../../lib/map-data";
import { buildConnectorGeometry } from "../../lib/connector-geometry";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize, DEFAULT_GRID_SIZE } from "../../lib/grid";
import { computeGuestPanelMetrics } from "../../lib/guest-metrics";
import { universityEmblems } from "../../data/university-emblems";
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

function frameTextAnchor(item: DisplayFrameFixedItem): "start" | "middle" | "end" {
  if (item.style?.align === "center") return "middle";
  if (item.style?.align === "right") return "end";
  return "start";
}

function frameTextX(item: DisplayFrameFixedItem): number {
  if (item.style?.align === "center") return item.x + item.width / 2;
  if (item.style?.align === "right") return item.x + item.width;
  return item.x;
}

function renderDisplayFrameItem(item: DisplayFrameFixedItem, frameStyle: { color: string; fontSize: number; align: "left" | "center" | "right" }, userFonts: UserFont[]): ReactNode {
  const color = item.style?.color ?? frameStyle.color;
  if (item.kind === "text") {
    return (
      <text
        key={item.id}
        data-display-frame-text={item.id}
        x={frameTextX(item)}
        y={item.y + Math.min(item.height, item.style?.fontSize ?? frameStyle.fontSize)}
        fill={color}
        fontSize={item.style?.fontSize ?? frameStyle.fontSize}
        fontWeight={item.style?.fontWeight === "bold" ? 700 : item.style?.fontWeight === "medium" ? 500 : undefined}
        fontFamily={resolveFontFamily(item.style?.fontId, userFonts)}
        textAnchor={frameTextAnchor(item)}
        pointerEvents="none"
      >
        {item.content || " "}
      </text>
    );
  }
  if (item.kind === "decoration" && item.decoration === "line") {
    return <line key={item.id} data-display-frame-decoration={item.id} x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y} stroke={color} strokeWidth={item.style?.strokeWidth ?? 1} pointerEvents="none" />;
  }
  if (item.kind === "decoration") {
    return <rect key={item.id} data-display-frame-decoration={item.id} x={item.x} y={item.y} width={item.width} height={item.height} fill={item.style?.fill ?? "transparent"} stroke={color} strokeWidth={item.style?.strokeWidth ?? 1} pointerEvents="none" />;
  }
  return null;
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
  group: LayoutGroup;
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

  const updateCardPreview = (next: { id: string; x: number; y: number }) => {
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
  };

  const clearCardPreview = () => clearCanvasPreview(cardPreviewScheduler.current);
  const clearGuestPreview = () => clearCanvasPreview(guestPreviewScheduler.current);

  const scheduleCardPreview = (next: { id: string; x: number; y: number }) => {
    scheduleCanvasPreview(cardPreviewScheduler.current, next, renderIntervalMs, updateCardPreview);
  };

  const updateGuestPreview = (next: { x: number; y: number }) => {
    const drag = guestDrag.current;
    if (!drag) return;
    drag.element.setAttribute("transform", `translate(${next.x} ${next.y})`);
  };

  const scheduleGuestPreview = (next: { x: number; y: number }) => {
    scheduleCanvasPreview(guestPreviewScheduler.current, next, renderIntervalMs, updateGuestPreview);
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
  const {
    visibleGuests,
    guestTitleTypography,
    guestPeopleTypography,
    guestTitleFontSize,
    guestPeopleFontSize,
    guestNoteFontSize,
    guestsDisplayMode,
    guestListAvatarSize,
    guestListUsesAvatar,
    guestListAvatarGap,
    guestRowHeight,
    guestCardGap,
    guestCardColumns,
    guestCardWidth,
    guestCardAvatarSize,
    guestCardTitleLine,
    guestCardSubLine,
    guestCardHasTitle,
    guestCardHeight,
    guestCustomText,
    guestCustomLines,
    guestCustomLineHeight,
    guestCustomTopGap,
    guestCustomHeight,
    guestHeight,
  } = computeGuestPanelMetrics(guests, lineHeightMultiplier);
  // 零可见嘉宾且无自定义文本时，导出成品不应包含空嘉宾框（框体/标题/分隔线整组）；
  // 编辑器仍渲染空框引导添加。布局占位（layoutOccupiedAreas）保持不变，
  // 避免导出时卡片自动布局挤进该区域、与编辑器预览错位。
  // 编辑器画布也可能被共享导出 ref 序列化（如「内容与排版」阶段直接导出），
  // 因此空框在编辑态整组标记 data-editor-placeholder，由 serializePosterSvg 剔除。
  const guestPanelEmpty = visibleGuests.length === 0 && !guestCustomText;
  const guestPanelOmittedInExport = exportMode && guestPanelEmpty;
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
    [project.cards],
  );

  const frameTitleItem = displayFrame.fixed.items.find((item) => item.id === "title");
  const frameBodyItem = displayFrame.fixed.items.find((item) => item.id === "name") ?? displayFrame.fixed.items[0];
  const flowBlocks = displayFrame.mode === "flow" ? displayFrame.flow.blocks.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)) : [];
  const flowBlockFor = (field: CardFontField) => flowBlocks.find((block) => block.field === field);
  const flowTitleBlock = flowBlockFor("title");
  const flowNameBlock = flowBlockFor("name");
  const flowTitleFontSize = flowTitleBlock?.style?.fontSize ?? project.cards.fieldTypography?.title?.fontSize ?? project.cards.fontSize;
  const flowNameFontSize = flowNameBlock?.style?.fontSize ?? project.cards.fieldTypography?.name?.fontSize ?? project.cards.fontSize;
  const flowContentStart = displayFrame.mode === "flow"
    ? flowBlocks.reduce((cursor, block) => cursor + block.spacing + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize)) * block.lineHeight, 12)
    : 0;
  const customFrameItems = displayFrame.mode === "fixed"
    ? displayFrame.fixed.items.filter((item) => item.kind === "text" || item.kind === "decoration").slice().sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
    : [];
  const horizontalPadding = displayFrame.mode === "fixed"
    ? frameBodyItem?.x ?? project.cards.horizontalPadding ?? project.cards.padding
    : displayFrame.style.padding;
  const preparedContents = useMemo(
    () => prepareCardContents({
      students: project.students,
      dataView: project.dataView,
      cards: project.cards,
      canvas: {
        width: project.canvas.width,
        safeMargin: project.canvas.safeMargin,
        lineHeight: project.canvas.lineHeight,
      },
    }),
    [
      project.cards,
      project.canvas.lineHeight,
      project.canvas.safeMargin,
      project.canvas.width,
      project.dataView,
      project.students,
    ],
  );
  const preparedCards = useMemo(() => preparedContents.map((content) => {
    const feature = findProvinceFeature(features, content.province);
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
    return { ...content, anchorX, anchorY };
  }), [
    mapPath,
    preparedContents,
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
    // Manually positioned cards (dragged or frozen before a map edit) keep their
    // stored spot; the solver only places the rest and must treat the manual
    // rects as obstacles so auto cards never cover them.
    const manualPositions = project.cards.positions ?? {};
    const cards: CardLayoutInput[] = [];
    const manualAreas: CardArea[] = [];
    for (const { group, anchorX, anchorY, width, height } of preparedCards) {
      const manual = manualPositions[group.key];
      if (manual) manualAreas.push({ x: manual.x, y: manual.y, width, height });
      else cards.push({ id: group.key, anchorX, anchorY, width, height });
    }
    const bounds = {
      width: project.canvas.width,
      height: project.canvas.height,
      map: mapContentBounds,
      occupiedAreas: [...layoutOccupiedAreas, ...manualAreas],
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
    project.cards.positions,
  ]);

  const layoutState = useCardLayoutWorker(layoutRequest, exportMode);
  const destinationCards = useMemo(() => {
    if (!layoutRequest || !layoutState.result) return [];
    const placements = new Map(layoutState.result.placements.map((placement) => [placement.id, placement]));
    return preparedCards.flatMap((card) => {
      const manual = project.cards.positions?.[card.group.key];
      if (manual) {
        const area = { x: manual.x, y: manual.y, width: card.width, height: card.height };
        return [{
          ...card,
          placement: {
            id: card.group.key,
            anchorX: card.anchorX,
            anchorY: card.anchorY,
            ...area,
            side: cardSideForArea(area, layoutRequest.bounds),
          },
        }];
      }
      const placement = placements.get(card.group.key);
      return placement ? [{ ...card, placement }] : [];
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
  // 纯预览（无 onSelect，如展示框样式实时预览）不传选择回调：
  // MapLayer 以 onSelectMap 判定是否画红色虚线选择框，预览应与导出画面一致。
  const selectMap = useMemo(() => onSelect ? () => onSelect({ type: "map" }) : undefined, [onSelect]);
  const selectProvince = useCallback((province: string) => onSelect?.({ type: "province", province }), [onSelect]);
  const selectAsset = useCallback((id: string) => onSelect?.({ type: "asset", id }), [onSelect]);
  const mapPathForAsset = useCallback((feature: MapFeature) => mapPath(feature as never), [mapPath]);
  const selectText = useCallback((id: string) => onSelect?.({ type: "text", id }), [onSelect]);

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
                      onPointerDown={!exportMode && onMoveCard ? (event) => {
                        const point = canvasPoint(event);
                        if (!point) return;
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const connectorGroup = event.currentTarget.parentElement;
                        if (!connectorGroup) return;
                        cardDrag.current = {
                          id: group.key,
                          offsetX: point.x - displayPlacement.x,
                          offsetY: point.y - displayPlacement.y,
                          width: displayPlacement.width,
                          height: displayPlacement.height,
                          x: displayPlacement.x,
                          y: displayPlacement.y,
                          originalX: displayPlacement.x,
                          originalY: displayPlacement.y,
                          element: event.currentTarget,
                          connectorGroup: connectorGroup as unknown as SVGGElement,
                          anchorX,
                          anchorY,
                          side: displayPlacement.side,
                          connectorStyle: project.cards.connectorStyle,
                          borderless: borderlessCards,
                          connectorHidden,
                        };
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
                        clearCardPreview();
                        cardDrag.current = null;
                      } : undefined}
                      onPointerCancel={!exportMode && onMoveCard ? () => {
                        const drag = cardDrag.current;
                        if (drag) updateCardPreview({ id: drag.id, x: drag.originalX, y: drag.originalY });
                        clearCardPreview();
                        cardDrag.current = null;
                      } : undefined}
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
                      }) : <>
                      <rect
                        data-display-frame-surface
                        width={placement.width}
                        height={placement.height}
                        rx={project.cards.preset === "ticket" ? 12 : project.cards.preset === "borderless" ? 0 : displayFrame.style.borderRadius ?? 6}
                        fill={displayFrame.style.background || project.cards.background}
                        fillOpacity={displayFrame.style.opacity ?? project.cards.opacity}
                        stroke={project.cards.preset === "borderless" ? "none" : displayFrame.style.borderColor ?? project.map.edgeColor}
                        strokeWidth={project.cards.preset === "borderless" ? undefined : displayFrame.style.borderWidth ?? 1}
                        data-display-frame-mode={displayFrame.mode}
                      />
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
                      {customFrameItems.map((item) => renderDisplayFrameItem(item, displayFrame.style, userFonts))}
                      {titleLines.map((line, index) => (
                        <text
                          key={`title-${index}`}
                          data-card-title-line
                          x={(displayFrame.mode === "fixed" ? frameTitleItem?.x ?? horizontalPadding : horizontalPadding) + (project.cards.preset === "photo" ? 32 : 0) + (provinceTexture ? 36 : 0)}
                          y={(displayFrame.mode === "fixed" ? frameTitleItem?.y ?? 12 : 12 + (flowTitleBlock?.spacing ?? 0)) + (index + 1) * Math.max(16, flowTitleFontSize + 4) * (flowTitleBlock?.lineHeight ?? lineHeightMultiplier)}
                          fontWeight={flowTitleBlock?.style?.fontWeight === "medium" ? 500 : 700}
                          fontSize={flowTitleFontSize}
                          fill={flowTitleBlock?.style?.color ?? project.cards.fieldTypography?.title?.color ?? project.cards.textColor}
                          fontFamily={resolveFontFamily(flowTitleBlock?.style?.fontId ?? project.cards.fieldFonts?.title, userFonts)}
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
                          const rowField = row.cityHeading ? "city" : "name";
                          const block = displayFrame.mode === "flow" ? flowBlockFor(rowField) : undefined;
                          const rowFontSize = block?.style?.fontSize ?? project.cards.fieldTypography?.[rowField]?.fontSize ?? (row.cityHeading ? Math.max(9, project.cards.fontSize - 1) : flowNameFontSize);
                          const rowLineHeight = displayFrame.mode === "flow"
                            ? Math.max(16, rowFontSize + 6) * (block?.lineHeight ?? 1.2)
                            : rowHeight;
                          const y = (displayFrame.mode === "fixed" ? frameBodyItem?.y ?? 42 : flowContentStart + flowTitleFontSize + 8) + headerExtra + lineIndex * rowLineHeight;
                          lineIndex += 1;
                          return (
                            <text
                              key={`${row.key}-${index}`}
                                  data-city-section={index === 0 ? row.cityHeading : undefined}
                              data-card-row-line={row.key}
                              x={displayFrame.mode === "fixed" ? frameBodyItem?.x ?? horizontalPadding : horizontalPadding}
                              y={y}
                              fill={block?.style?.color ?? project.cards.fieldTypography?.[rowField]?.color ?? project.cards.textColor}
                              fontSize={rowFontSize}
                              fontWeight={row.cityHeading ? 700 : block?.style?.fontWeight === "bold" ? 700 : block?.style?.fontWeight === "medium" ? 500 : undefined}
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

                      </>}

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
          {guests.visibility !== false && !guestPanelOmittedInExport && (
            <g
              data-guests-layer
              data-editor-placeholder={guestPanelEmpty || undefined}
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
                // 编辑器里的引导占位；导出成品（PNG/SVG）不应包含这句提示。
                // data-editor-placeholder 供 serializePosterSvg 在导出时剔除。
                !exportMode && (
                  <text data-editor-placeholder x={guests.padding} y={guests.padding + 36 + guests.fontSize} fill={guests.textColor} fontSize={guests.fontSize} opacity={0.65}>
                    在右侧添加老师 / 嘉宾
                  </text>
                )
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
        if (exportMode) return;
        // 全画布背景 rect/背景图覆盖了 svg 本身，点空白时 target 永远不是
        // currentTarget；把背景元素也视为“画布空白”，否则画布永远选不中。
        const target = event.target as Element;
        const isCanvasBlank = target === event.currentTarget
          || target.hasAttribute?.("data-canvas-background")
          || target.hasAttribute?.("data-background-image");
        if (isCanvasBlank) onSelect?.({ type: "canvas" });
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
