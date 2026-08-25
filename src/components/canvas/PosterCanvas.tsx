import { geoMercator, geoPath } from "d3-geo";
import { Fragment, memo, useCallback, useEffect, useMemo, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { DestinationCardStyle } from "./DestinationCard";
import type {
  CardArea,
  CardLayoutBounds,
  CardLayoutMode,
  CardPlacement,
  CardPoint,
  CardPolygon,
  CardSide,
} from "../../lib/card-layout";
import { createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";
import { computeMapContentBounds, computeMapOccupiedAreas } from "../../lib/map-content-bounds";
import { buildLayoutGroups } from "../../lib/layout";
import { buildProvinceSummary, getVisibleStudents } from "../../lib/project-data";
import { CANVAS_LAYER_Z } from "../../lib/scene-document";
import type { AssetElement, CanvasText, CardFontField, SceneSelection } from "../../lib/scene-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "../../lib/display-frame";
import type { ProjectDocument } from "../../lib/project-document";
import { resolveStudentLocation } from "../../lib/student-data";
import { findProvinceFeature, getChinaMapFeatures, type MapFeature, type Position } from "../../lib/map-data";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize, DEFAULT_GRID_SIZE } from "../../lib/grid";
import { DEFAULT_CARD_EXPRESSION_TEMPLATES } from "../../lib/card-expression";
import {
  buildPreparedCardContents,
  cardFieldFontSize,
  resolveCardAnchor,
  type CardAnchor,
  type PreparedCard,
} from "../../lib/prepared-card-content";
import {
  destinationCardFixedRowHeight,
  destinationCardFlowContentStart,
  destinationCardHeaderOffset,
  destinationCardRowFontSize,
} from "../../lib/destination-card-metrics";
import { splitMapFeaturesForSouthChinaSea } from "../../lib/south-china-sea";
import { computeGuestPanelLayout, DEFAULT_GUEST_PANEL } from "../../lib/guest-panel-layout";
import { DecorationLayer } from "./DecorationLayer";
import { DestinationCardsLayer, type DestinationCardsAppearance, type PlacedDestinationCard } from "./DestinationCardsLayer";
import { GuestsLayer } from "./GuestsLayer";
import { MapLayer } from "./MapLayer";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import { TextLayer } from "./TextLayer";
import { useCardLayoutWorker } from "./useCardLayoutWorker";

const features = getChinaMapFeatures();
const openMapSplit = splitMapFeaturesForSouthChinaSea(features, false);
const foldedMapSplit = splitMapFeaturesForSouthChinaSea(features, true);
const HEAT_COLORS = ["#d9f0e5", "#8ccfb6", "#4da184", "#17675e"] as const;
const LANDMARK_ASSET_KINDS: AssetElement["kind"][] = ["landmark"];
const EMPTY_USER_FONTS: UserFont[] = [];
const EMPTY_CARD_POLYGONS: CardPolygon[] = [];

const MemoizedMapLayer = memo(MapLayer);
const MemoizedRegionalAssetLayer = memo(RegionalAssetLayer);
const MemoizedDecorationLayer = memo(DecorationLayer);
const MemoizedTextLayer = memo(TextLayer);

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

/**
 * Which side of the map a stored card box sits on, classified the same way the solver
 * classifies a placement it produced itself. A placement's `side` only picks the connector
 * port in the degenerate case where the anchor coincides with the card center, so a frozen
 * card never needs the side the discarded solver run would have assigned it.
 */
function frozenCardSide(card: CardArea, map: CardArea): CardSide {
  const horizontal = (card.x + card.width / 2 - (map.x + map.width / 2)) / Math.max(1, map.width / 2);
  const vertical = (card.y + card.height / 2 - (map.y + map.height / 2)) / Math.max(1, map.height / 2);
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

/** Document slices painted for a given document object. A caller may edit a document in place
 *  (same object, a replaced `cards` / `map` / … slice); prop identity cannot see that, because
 *  both sides of the memo comparison are then the very same object. */
const paintedSlices = new WeakMap<ProjectDocument, Record<string, unknown>>();

function documentChangedInPlace(project: ProjectDocument): boolean {
  const painted = paintedSlices.get(project);
  if (!painted) return false;
  const current = project as unknown as Record<string, unknown>;
  const keys = Object.keys(current);
  return keys.length !== Object.keys(painted).length
    || keys.some((key) => !Object.is(painted[key], current[key]));
}

function arePosterCanvasPropsEqual(previous: PosterCanvasProps, next: PosterCanvasProps): boolean {
  if (documentChangedInPlace(next.project)) return false;
  const keys = Object.keys(next) as Array<keyof PosterCanvasProps>;
  if (keys.length !== Object.keys(previous).length) return false;
  return keys.every((key) => Object.is(previous[key], next[key]));
}

function PosterCanvasView({
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
  paintedSlices.set(project, { ...project });
  const resolvedGridSize = clampGridSize(gridSize);
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
  // Province extents in projection space. `mapPath.bounds` streams every ring of every
  // feature, so it is kept off the pan path: only the projection (map size and the folded
  // South China Sea split) can move these.
  const projectedProvinceBounds = useMemo(() => mainlandFeatures.flatMap((feature) => {
    const [[left, top], [right, bottom]] = mapPath.bounds(feature as never);
    if (![left, top, right, bottom].every(Number.isFinite)) return [];
    return [{ left, top, right, bottom }];
  }), [mainlandFeatures, mapPath]);
  const provinceAreas = useMemo(() => {
    const centerX = project.map.width / 2;
    const centerY = project.map.height / 2;
    return projectedProvinceBounds.map(({ left, top, right, bottom }) => ({
      x: project.map.x + centerX + (left - centerX) * project.map.scale,
      y: project.map.y + centerY + (top - centerY) * project.map.scale,
      width: (right - left) * project.map.scale,
      height: (bottom - top) * project.map.scale,
    }));
  }, [
    projectedProvinceBounds,
    project.map.height,
    project.map.scale,
    project.map.width,
    project.map.x,
    project.map.y,
  ]);
  const mapRenderSource = project.map.renderSource;
  const mapImageReplacesProvinces = mapRenderSource?.kind === "image" && mapRenderSource.composition !== "overlay";
  // Visibility is the only thing the collision geometry reads out of `provinceStyles`, and
  // a recolor replaces that record wholesale. Reducing it to a sorted name list first means
  // a color edit leaves the set — and therefore the projected rings — identical.
  const hiddenProvincesKey = useMemo(() => {
    const styles = project.map.provinceStyles;
    if (!styles) return "";
    return Object.keys(styles).filter((name) => styles[name]?.visible === false).sort().join("\n");
  }, [project.map.provinceStyles]);
  const hiddenProvinces = useMemo(
    () => new Set(hiddenProvincesKey === "" ? [] : hiddenProvincesKey.split("\n")),
    [hiddenProvincesKey],
  );
  const mapOriginX = project.map.x + project.map.width / 2;
  const mapOriginY = project.map.y + project.map.height / 2;
  // Collision geometry expressed as offsets from the map center, which is where scaling
  // happens. Panning only slides that center across the canvas, so it must not reproject —
  // and because a translation preserves every distance, simplification decided here is the
  // same one the canvas-space rings would have made.
  const centeredProvincePolygons = useMemo<CardPolygon[]>(() => {
    if (mapImageReplacesProvinces) return [];
    const centerX = project.map.width / 2;
    const centerY = project.map.height / 2;
    const projectPoint = (coordinate: Position): CardPoint | null => {
      const point = projection(coordinate);
      if (!point || !point.every(Number.isFinite)) return null;
      return {
        x: (point[0] - centerX) * project.map.scale,
        y: (point[1] - centerY) * project.map.scale,
      };
    };
    return mainlandFeatures.flatMap((feature): CardPolygon[] => {
      if (hiddenProvinces.has(feature.name)) return [];
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
    // Depend on the map fields the projection actually reads instead of the whole
    // project.map object — and on the derived visibility set rather than provinceStyles,
    // which a recolor replaces wholesale. Either would otherwise reproject every province
    // ring and invalidate the layout cache key for an edit that moves no geometry.
  }, [
    hiddenProvinces,
    mainlandFeatures,
    mapImageReplacesProvinces,
    project.map.height,
    project.map.scale,
    project.map.width,
    projection,
  ]);
  const provincePolygons = useMemo<CardPolygon[]>(
    () => centeredProvincePolygons.map(({ rings, bounds }) => ({
      rings: rings.map((ring) => ring.map((point) => ({ x: mapOriginX + point.x, y: mapOriginY + point.y }))),
      ...(bounds
        ? { bounds: { x: mapOriginX + bounds.x, y: mapOriginY + bounds.y, width: bounds.width, height: bounds.height } }
        : {}),
    })),
    [centeredProvincePolygons, mapOriginX, mapOriginY],
  );
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
  const guests = project.guests ?? DEFAULT_GUEST_PANEL;
  const guestLayout = useMemo(
    () => computeGuestPanelLayout(guests, lineHeightMultiplier),
    [guests, lineHeightMultiplier],
  );
  const guestHeight = guestLayout.height;
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
    () => project.cards.allowMapOverlap === true ? EMPTY_CARD_POLYGONS : provincePolygons,
    [project.cards.allowMapOverlap, provincePolygons],
  );
  // The same obstacles the solver receives, still relative to the map center. A pan leaves
  // this array instance alone, which is what keeps the layout cache key from re-serializing
  // every province ring; `layoutOccupiedPolygons` is exactly this translated by the origin.
  const layoutOccupiedCenteredPolygons = useMemo(
    () => project.cards.allowMapOverlap === true ? EMPTY_CARD_POLYGONS : centeredProvincePolygons,
    [centeredProvincePolygons, project.cards.allowMapOverlap],
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
      // The same step `buildPreparedCardContents` solved the card height from, so the rows a
      // card paints land inside the box that was reserved for them.
      rowHeight: destinationCardFixedRowHeight({
        rowFontSize: destinationCardRowFontSize({
          visibleFieldFontSizes: project.cards.visibleFields.map((field) => project.cards.fieldTypography?.[field]?.fontSize ?? project.cards.fontSize),
          cityHeadingFontSize: cardFieldFontSize("city", project.cards.fontSize, project.cards.fieldTypography),
        }),
        compactLayout,
        lineHeightMultiplier,
      }),
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
        ? destinationCardFlowContentStart(flowBlocks, project.cards.fontSize)
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
  // Text wrapping and card sizing only read content and typography. Keeping the map
  // transform out of this memo means panning or zooming the map re-runs the anchor memo
  // below instead of re-wrapping every card.
  const preparedCardContents = useMemo(() => {
    if (project.cards.visibleFields.length === 0 || project.dataView === "pins") return [];
    return buildPreparedCardContents({
      groups,
      grouping,
      visibleFields: project.cards.visibleFields,
      citySubgroups: project.cards.citySubgroups !== false,
      expressionTemplates,
      nameFormat: project.cards.nameFormat,
      fontSize: project.cards.fontSize,
      fieldTypography: project.cards.fieldTypography,
      compactLayout: project.cards.compactLayout === true || project.cards.preset === "compact",
      maxWidth: project.cards.maxWidth,
      horizontalPadding,
      bottomPadding: project.cards.bottomPadding ?? project.cards.padding,
      showProvinceTexture: project.cards.showProvinceTexture === true,
      headerOffset: destinationCardHeaderOffset(project.cards.preset),
      noWrapFields: noWrapFieldSet,
      lineHeightMultiplier,
      canvasWidth: project.canvas.width,
      safeMargin: project.canvas.safeMargin,
    });
  }, [
    expressionTemplates,
    groups,
    grouping,
    horizontalPadding,
    lineHeightMultiplier,
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
  ]);

  const cardAnchors = useMemo<CardAnchor[]>(() => {
    const map = {
      x: project.map.x,
      y: project.map.y,
      width: project.map.width,
      height: project.map.height,
      scale: project.map.scale,
    };
    const byProvince = new Map<string, CardAnchor>();
    return preparedCardContents.map((content) => {
      const cached = byProvince.get(content.province);
      if (cached) return cached;
      const feature = findProvinceFeature(features, content.province);
      const administrativeCenter = feature ? projection(feature.center) : null;
      const point = administrativeCenter && administrativeCenter.every(Number.isFinite)
        ? administrativeCenter
        : feature
          ? mapPath.centroid(feature as never)
          : [map.width / 2, map.height / 2];
      const anchor = resolveCardAnchor(point, map);
      byProvince.set(content.province, anchor);
      return anchor;
    });
  }, [
    mapPath,
    preparedCardContents,
    project.map.height,
    project.map.scale,
    project.map.width,
    project.map.x,
    project.map.y,
    projection,
  ]);

  const preparedCards = useMemo<PreparedCard[]>(
    () => preparedCardContents.map((content, index) => ({ ...content, ...cardAnchors[index]! })),
    [cardAnchors, preparedCardContents],
  );

  // Shared by auto-layout and by the clamp applied while a card is dragged, so both agree
  // on the protected geometry.
  const cardLayoutBounds = useMemo<CardLayoutBounds>(() => ({
    width: project.canvas.width,
    height: project.canvas.height,
    map: mapContentBounds,
    occupiedAreas: layoutOccupiedAreas,
    occupiedPolygons: layoutOccupiedPolygons,
    allowMapOverlap: project.cards.allowMapOverlap === true,
    margin: project.canvas.safeMargin,
    gap: Math.max(10, project.cards.gap),
  }), [
    layoutOccupiedAreas,
    layoutOccupiedPolygons,
    mapContentBounds,
    project.canvas.height,
    project.canvas.safeMargin,
    project.canvas.width,
    project.cards.allowMapOverlap,
    project.cards.gap,
  ]);

  // Every card pinned to a stored position makes the solver pure overhead: `destinationCards`
  // overwrites its x/y with those positions anyway, so a map pan would pay for a full re-solve
  // that cannot move a single card. The stored positions are used exactly as saved — clamping
  // them here would drag frozen cards around as the map slides underneath them.
  const frozenPlacements = useMemo<CardPlacement[] | null>(() => {
    const positions = project.cards.positions;
    if (!positions || preparedCards.length === 0) return null;
    const placements: CardPlacement[] = [];
    for (const card of preparedCards) {
      const position = positions[card.group.key];
      if (!position) return null;
      const box = { x: position.x, y: position.y, width: card.width, height: card.height };
      placements.push({
        id: card.group.key,
        anchorX: card.anchorX,
        anchorY: card.anchorY,
        ...box,
        side: frozenCardSide(box, mapContentBounds),
      });
    }
    return placements;
  }, [mapContentBounds, preparedCards, project.cards.positions]);

  const layoutRequest = useMemo<CardLayoutWorkerRequest | null>(() => {
    if (frozenPlacements || preparedCards.length === 0) return null;
    const layoutMode = (project.cards.layoutMode ?? "quadrant") as CardLayoutMode;
    const cards = preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({
      id: group.key,
      anchorX,
      anchorY,
      width,
      height,
    }));
    const options = {
      mode: layoutMode,
      autoBalance: project.cards.autoBalance !== false,
      connectorStyle: project.cards.connectorStyle,
      connectorWidth: project.cards.connectorWidth,
    };
    return {
      key: createCardLayoutCacheKey({
        cards,
        bounds: cardLayoutBounds,
        options,
        polygonOrigin: {
          polygons: layoutOccupiedCenteredPolygons,
          originX: mapOriginX,
          originY: mapOriginY,
        },
      }),
      cards,
      bounds: cardLayoutBounds,
      options,
    };
  }, [
    cardLayoutBounds,
    frozenPlacements,
    layoutOccupiedCenteredPolygons,
    mapOriginX,
    mapOriginY,
    preparedCards,
    project.cards.autoBalance,
    project.cards.connectorStyle,
    project.cards.connectorWidth,
    project.cards.layoutMode,
  ]);

  const layoutState = useCardLayoutWorker(layoutRequest, exportMode);
  const destinationCards = useMemo<PlacedDestinationCard[]>(() => {
    const solved = frozenPlacements ?? (layoutRequest ? layoutState.result?.placements : null);
    if (!solved) return [];
    const placements = new Map(solved.map((placement) => [placement.id, placement]));
    return preparedCards.flatMap((card) => {
      const placement = placements.get(card.group.key);
      if (!placement) return [];
      const manual = project.cards.positions?.[card.group.key];
      return [manual ? { ...card, placement: { ...placement, x: manual.x, y: manual.y } } : { ...card, placement }];
    });
  }, [frozenPlacements, layoutRequest, layoutState.result, preparedCards, project.cards.positions]);

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
  const selectGuests = useCallback(() => onSelect?.({ type: "guests" }), [onSelect]);

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

  const selectCards = useCallback(() => onSelect?.({ type: "cards" }), [onSelect]);

  // Grouped so the cards layer keeps its memo across edits to unrelated card settings.
  const cardsAppearance = useMemo<DestinationCardsAppearance>(() => ({
    preset: project.cards.preset,
    presentation: project.cards.presentation ?? "standard",
    connectorStyle: project.cards.connectorStyle,
    connectorDash: project.cards.connectorDash,
    connectorWidth: project.cards.connectorWidth,
    background: project.cards.background,
    opacity: project.cards.opacity,
    textColor: project.cards.textColor,
    fontSize: project.cards.fontSize,
    showProvinceTexture: project.cards.showProvinceTexture === true,
    titleFont: resolveFontFamily(project.cards.fieldFonts?.title, userFonts),
    activeColor: project.map.activeColor,
    edgeColor: project.map.edgeColor,
    provinceStyles: project.map.provinceStyles,
    lineHeightMultiplier,
  }), [
    lineHeightMultiplier,
    project.cards.background,
    project.cards.connectorDash,
    project.cards.connectorStyle,
    project.cards.connectorWidth,
    project.cards.fieldFonts,
    project.cards.fontSize,
    project.cards.opacity,
    project.cards.presentation,
    project.cards.preset,
    project.cards.showProvinceTexture,
    project.cards.textColor,
    project.map.activeColor,
    project.map.edgeColor,
    project.map.provinceStyles,
    userFonts,
  ]);

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
        <DestinationCardsLayer
          cards={destinationCards}
          style={cardStyle}
          appearance={cardsAppearance}
          connectorEdge={connectorEdge}
          dragBounds={cardLayoutBounds}
          exportMode={exportMode}
          renderIntervalMs={renderIntervalMs}
          canvasPoint={canvasPoint}
          onSelectCards={onSelect ? selectCards : undefined}
          onMoveCard={onMoveCard}
        />
      ),
    },
    {
      key: "guests",
      z: CANVAS_LAYER_Z.guests,
      node: (
        <>
          {guests.visibility !== false && (
            <GuestsLayer
              guests={guests}
              layout={guestLayout}
              edgeColor={project.map.edgeColor}
              userFonts={userFonts}
              exportMode={exportMode}
              canvasWidth={project.canvas.width}
              canvasHeight={project.canvas.height}
              renderIntervalMs={renderIntervalMs}
              canvasPoint={canvasPoint}
              onSelectGuests={onSelect ? selectGuests : undefined}
              onMoveGuests={onMoveGuests}
            />
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

/** Memoized so unrelated editor state (panel toggles, status text, the undo stack) cannot
 *  re-run the canvas body. Callers already pass a memoized document and stable callbacks. */
export const PosterCanvas = memo(PosterCanvasView, arePosterCanvasPropsEqual);
