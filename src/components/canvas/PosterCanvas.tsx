import { Fragment, memo, useCallback, useEffect, useMemo, useSyncExternalStore, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { DestinationCardStyle } from "./DestinationCard";
import type {
  CardLayoutBounds,
  CardPolygon,
} from "../../lib/card-layout";
import { createCardLayoutCacheKey } from "../../lib/card-layout-cache";
import type { CardLayoutWorkerRequest } from "../../lib/card-layout-worker-protocol";
import { buildLayoutGroups } from "../../lib/layout";
import { buildProvinceSummary, getVisibleStudents } from "../../lib/project-data";
import { CANVAS_LAYER_Z } from "../../lib/scene-document";
import type { AssetElement, CardFontField, SceneSelection } from "../../lib/scene-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "../../lib/display-frame";
import type { ProjectDocument } from "../../lib/project-document";
import { resolveStudentLocation } from "../../lib/student-data";
import { getChinaMapFeatures, type MapFeature } from "../../lib/map-data";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { resolveFontFamily, buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize, DEFAULT_GRID_SIZE } from "../../lib/grid";
import {
  cardFieldFontSize,
} from "../../lib/prepared-card-content";
import {
  destinationCardFixedRowHeight,
  destinationCardFlowContentStart,
  destinationCardRowFontSize,
} from "../../lib/destination-card-metrics";
import { computeGuestPanelLayout, DEFAULT_GUEST_PANEL } from "../../lib/guest-panel-layout";
import { DecorationLayer } from "./DecorationLayer";
import { DestinationCardsLayer, type DestinationCardsAppearance, type PlacedDestinationCard } from "./DestinationCardsLayer";
import { GuestsLayer } from "./GuestsLayer";
import { MapLayer } from "./MapLayer";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import { TextLayer } from "./TextLayer";
import { useCardLayoutWorker } from "./useCardLayoutWorker";
import { resolveSceneMapGeometry, sceneTextObstacle } from "../../lib/resolved-scene-geometry";
import { buildProjectCardContents, anchorProjectCards } from "../../lib/resolved-card-content";
import { createSceneLayoutRequest, mergeScenePlacements } from "../../lib/scene-layout-request";
import { resolveCardSettings } from "../../lib/card-settings-scope";
import { diagnoseCardTypography } from "../../lib/card-typography-diagnostics";
import { fingerprintProject } from "../../lib/project-digest";
import { createSceneTextMeasurement, getSceneTextMeasurer } from "../../lib/scene-text-measurement";
import { createResolvedSceneSnapshot, resolveStoredScenePositions, type ResolvedProjectScene } from "../../lib/resolved-scene";

const features = getChinaMapFeatures();
const HEAT_COLORS = ["#d9f0e5", "#8ccfb6", "#4da184", "#17675e"] as const;
const LANDMARK_ASSET_KINDS: AssetElement["kind"][] = ["landmark"];
const EMPTY_USER_FONTS: UserFont[] = [];
const EMPTY_CARD_POLYGONS: CardPolygon[] = [];

const MemoizedMapLayer = memo(MapLayer);
const MemoizedRegionalAssetLayer = memo(RegionalAssetLayer);
const MemoizedDecorationLayer = memo(DecorationLayer);
const MemoizedTextLayer = memo(TextLayer);

export interface PosterCanvasProps {
  project: ProjectDocument;
  selectedCardIds?: string[];
  onSceneResolved?: (scene: ResolvedProjectScene) => void;
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
  selectedCardIds,
  onSceneResolved,
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
  const groups = useMemo(() => buildLayoutGroups(visibleStudents, grouping), [grouping, visibleStudents]);
  const geometry = useMemo(() => resolveSceneMapGeometry(project.map), [project.map]);
  const { projection, mapPath, mapContentBounds, provincePolygons, centeredProvincePolygons, nonProvinceMapAreas, mapOriginX, mapOriginY } = geometry;
  const lineHeightMultiplier = project.canvas.lineHeight ?? 1;
  const guests = project.guests ?? DEFAULT_GUEST_PANEL;
  const guestLayout = useMemo(
    () => computeGuestPanelLayout(guests, lineHeightMultiplier),
    [guests, lineHeightMultiplier],
  );
  const guestHeight = guestLayout.height;
  const layoutOccupiedAreas = useMemo(() => {
    const textAreas = project.textElements.flatMap((text) => {
      const area = sceneTextObstacle(text);
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
  const measurer = getSceneTextMeasurer();
  const fontRevision = useSyncExternalStore(measurer.subscribe, measurer.getVersion, measurer.getVersion);
  const preparedContent = useMemo(() => {
    const measurement = createSceneTextMeasurement(userFonts);
    const contents = buildProjectCardContents(project, groups, measurement.options);
    const typographyIssues = diagnoseCardTypography(project, contents, measurement.options);
    return { contents, typographyIssues, measurementStatus: measurement.getStatus() };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content dependencies intentionally exclude geography
  }, [
    groups, userFonts, fontRevision, project.cards.fieldFonts, project.cards.bottomPadding, project.cards.citySubgroups, project.cards.compactLayout,
    project.cards.fieldTypography, project.cards.fontSize, project.cards.maxWidth, project.cards.widthMode, project.cards.minWidth, project.cards.minFontSize, project.cards.nameFormat,
    project.cards.padding, project.cards.horizontalPadding, project.cards.preset, project.cards.presentation,
    project.cards.showCount, project.cards.showProvinceTexture, project.cards.visibleFields, project.cards.noWrapFields,
    project.cards.expressionTemplates, project.cards.displayFrame, project.cards.styleOverrides,
    project.canvas.safeMargin, project.canvas.width, project.canvas.lineHeight, project.dataView,
    // Every content/typography dependency is listed above; map movement must not rewrap text.
  ]);
  const preparedCardContents = preparedContent.contents;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- anchors only read map geometry
  const anchoredCards = useMemo(() => anchorProjectCards(project, preparedCardContents, { projection, mapPath }), [
    preparedCardContents, projection, mapPath, project.map.height, project.map.width, project.map.scale, project.map.x, project.map.y,
  ]);

  const preparedCards = useMemo(() => anchoredCards.map((card) => {
    const hasScopedStyle = Boolean(project.cards.styleOverrides && Object.keys(project.cards.styleOverrides).length > 0);
    return hasScopedStyle
      ? { ...card, resolvedSettings: resolveCardSettings(project.cards, card.group.key) }
      : card;
  }), [anchoredCards, project.cards]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- storage policy dependencies are listed explicitly
  const storedPositions = useMemo(() => resolveStoredScenePositions(project, preparedCards, cardLayoutBounds), [
    preparedCards, cardLayoutBounds, project.cards.positions, project.cards.positionPolicies, project.cards.positionSources, project.cards.grouping,
  ]);
  const layoutOptions = useMemo(() => ({
    mode: project.cards.layoutMode ?? "quadrant", autoBalance: project.cards.autoBalance !== false,
    connectorStyle: project.cards.connectorStyle, connectorWidth: project.cards.connectorWidth,
  }), [project.cards.layoutMode, project.cards.autoBalance, project.cards.connectorStyle, project.cards.connectorWidth]);
  const layoutRequest = useMemo<CardLayoutWorkerRequest | null>(() => createSceneLayoutRequest(
    preparedCards, cardLayoutBounds, layoutOptions, storedPositions,
    { polygons: layoutOccupiedCenteredPolygons, originX: mapOriginX, originY: mapOriginY },
  ), [preparedCards, cardLayoutBounds, layoutOptions, storedPositions, layoutOccupiedCenteredPolygons, mapOriginX, mapOriginY]);
  const layoutState = useCardLayoutWorker(layoutRequest, exportMode);
  const destinationCards = useMemo<PlacedDestinationCard[]>(() => mergeScenePlacements(
    preparedCards, cardLayoutBounds, layoutState.result?.placements ?? [], storedPositions,
  ), [preparedCards, cardLayoutBounds, layoutState.result, storedPositions]);
  useEffect(() => {
    if (!onCardPositionsResolved || destinationCards.length === 0) return;
    onCardPositionsResolved(Object.fromEntries(destinationCards.map(({ group, placement }) => [group.key, { x: placement.x, y: placement.y }])));
  }, [destinationCards, onCardPositionsResolved]);
  useEffect(() => {
    if (!onSceneResolved || layoutState.pending) return;
    const cards = preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height }));
    const input = {
      preparedCards, bounds: cardLayoutBounds, mapVisualBounds: geometry.mapVisualBounds, options: layoutOptions, measurementStatus: preparedContent.measurementStatus, fontRevision, typographyIssues: preparedContent.typographyIssues,
      key: createCardLayoutCacheKey({ cards, bounds: cardLayoutBounds, options: layoutOptions,
        polygonOrigin: { polygons: layoutOccupiedCenteredPolygons, originX: mapOriginX, originY: mapOriginY } }),
    };
    onSceneResolved(createResolvedSceneSnapshot(project, input, destinationCards.map((card) => card.placement), layoutState.result?.status));
  }, [project, preparedCards, cardLayoutBounds, layoutOptions, destinationCards, layoutState.pending, layoutState.result?.status, onSceneResolved, preparedContent.measurementStatus, preparedContent.typographyIssues, fontRevision, geometry.mapVisualBounds, layoutOccupiedCenteredPolygons, mapOriginX, mapOriginY]);

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

  const selectCards = useCallback((id?: string, additive?: boolean) => {
    if (!id) { onSelect?.({ type: "cards" }); return; }
    const current = selectedCardIds ?? [];
    const ids = additive ? current.includes(id) ? current.filter((key) => key !== id) : [...current, id] : [id];
    onSelect?.({ type: "cards", ...(ids.length ? { ids, scopeGrouping: project.cards.grouping } : {}) });
  }, [onSelect, selectedCardIds, project.cards.grouping]);

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
          selectedCardIds={selectedCardIds}
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
      data-scene-revision={fingerprintProject(project)}
      data-font-revision={fontRevision}
      data-layout-pending={layoutState.pending ? "true" : "false"}
      data-measurement-status={preparedContent.measurementStatus}
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
