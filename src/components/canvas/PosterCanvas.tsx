import { Fragment, memo, useCallback, useMemo, type ReactNode, type RefObject } from "react";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "../../lib/display-frame";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import type { UserFont } from "../../lib/fonts";
import { DEFAULT_GRID_SIZE } from "../../lib/grid";
import { getChinaMapFeatures, type MapFeature } from "../../lib/map-data";
import { deriveCardFrameLayout } from "../../lib/poster-display-frame";
import { computeGuestPanelMetrics, FALLBACK_GUEST_PANEL } from "../../lib/poster-guest-layout";
import type { ProjectDocument } from "../../lib/project-document";
import { CANVAS_LAYER_Z } from "../../lib/scene-document";
import type { AssetElement, SceneSelection } from "../../lib/scene-document";
import { splitMapFeaturesForSouthChinaSea } from "../../lib/south-china-sea";
import { DecorationLayer } from "./DecorationLayer";
import { MapLayer } from "./MapLayer";
import { usePosterCardPlacement } from "./poster-card-placement";
import { usePosterLayoutAreas, usePosterMapGeometry, usePosterStudentData } from "./poster-canvas-geometry";
import { DestinationCardsLayer } from "./poster-destination-cards";
import { GuestPanel } from "./poster-guest-panel";
import { PosterSvgChrome } from "./poster-svg-chrome";
import { RegionalAssetLayer } from "./RegionalAssetLayer";
import { TextLayer } from "./TextLayer";

const features = getChinaMapFeatures();
const openMapSplit = splitMapFeaturesForSouthChinaSea(features, false);
const foldedMapSplit = splitMapFeaturesForSouthChinaSea(features, true);
const LANDMARK_ASSET_KINDS: AssetElement["kind"][] = ["landmark"];
const EMPTY_USER_FONTS: UserFont[] = [];

const MemoizedMapLayer = memo(MapLayer);
const MemoizedRegionalAssetLayer = memo(RegionalAssetLayer);
const MemoizedDecorationLayer = memo(DecorationLayer);
const MemoizedTextLayer = memo(TextLayer);

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
  const { visibleStudents, counts, pins } = usePosterStudentData(project.students);
  const collapse = project.map.collapseSouthChinaSea === true;
  const mainlandFeatures = collapse ? foldedMapSplit.mainlandFeatures : openMapSplit.mainlandFeatures;
  const { projection, mapPath, provincePolygons, mapContentBounds, nonProvinceMapAreas, mapTheme } =
    usePosterMapGeometry(project.map, mainlandFeatures);
  const lineHeightMultiplier = project.canvas.lineHeight ?? 1;
  const guests = project.guests ?? FALLBACK_GUEST_PANEL;
  const guestMetrics = computeGuestPanelMetrics(guests, lineHeightMultiplier);
  const { layoutOccupiedAreas, layoutOccupiedPolygons } = usePosterLayoutAreas({
    textElements: project.textElements,
    guests,
    guestHeight: guestMetrics.panelHeight,
    allowMapOverlap: project.cards.allowMapOverlap,
    nonProvinceMapAreas,
    provincePolygons,
  });
  const displayFrame = useMemo(
    () => project.cards.displayFrame === undefined
      ? deriveFixedDisplayFrameFromCardSettings(project.cards)
      : normalizeDisplayFrame(project.cards.displayFrame),
    [project.cards],
  );
  const frame = deriveCardFrameLayout(displayFrame, project.cards);
  const destinationCards = usePosterCardPlacement({
    project,
    visibleStudents,
    projection,
    mapPath,
    mapContentBounds,
    layoutOccupiedAreas,
    layoutOccupiedPolygons,
    horizontalPadding: frame.horizontalPadding,
    lineHeightMultiplier,
    exportMode,
    onCardPositionsResolved,
  });

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
  // Screen-reader description of the current canvas selection. Announced through
  // a polite live region next to the svg and mirrored into the svg's aria-label
  // so the selection survives a fresh read of the canvas landmark.
  const selectionAnnouncement = useMemo(() => {
    if (exportMode) return "";
    if (selectedTextId) {
      const text = project.textElements.find((element) => element.id === selectedTextId);
      return text ? `已选中文字：${text.content.trim() || text.role}` : "";
    }
    if (selectedAssetId) {
      const asset = project.assetElements.find((element) => element.id === selectedAssetId);
      return asset ? `已选中素材：${asset.label}` : "";
    }
    if (selectedProvince) return `已选中省份：${selectedProvince}`;
    if (selectedStudentId) {
      const pin = pins.find((item) => item.id === selectedStudentId);
      return pin ? `已选中学生：${pin.label}` : "";
    }
    if (mapSelected) return "已选中地图展示框";
    return "";
  }, [exportMode, mapSelected, pins, project.assetElements, project.textElements, selectedAssetId, selectedProvince, selectedStudentId, selectedTextId]);
  const selectMap = useCallback(() => onSelect?.({ type: "map" }), [onSelect]);
  const selectProvince = useCallback((province: string) => onSelect?.({ type: "province", province }), [onSelect]);
  const selectAsset = useCallback((id: string) => onSelect?.({ type: "asset", id }), [onSelect]);
  const mapPathForAsset = useCallback((feature: MapFeature) => mapPath(feature as never), [mapPath]);
  const selectText = useCallback((id: string) => onSelect?.({ type: "text", id }), [onSelect]);

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
          placedCards={destinationCards}
          cards={project.cards}
          map={project.map}
          canvas={project.canvas}
          connectorEdge={connectorEdge}
          displayFrame={displayFrame}
          frame={frame}
          mapContentBounds={mapContentBounds}
          layoutOccupiedAreas={layoutOccupiedAreas}
          layoutOccupiedPolygons={layoutOccupiedPolygons}
          lineHeightMultiplier={lineHeightMultiplier}
          userFonts={userFonts}
          exportMode={exportMode}
          renderIntervalMs={renderIntervalMs}
          onSelect={onSelect}
          onMoveCard={onMoveCard}
        />
      ),
    },
    {
      key: "guests",
      z: CANVAS_LAYER_Z.guests,
      node: (
        <GuestPanel
          guests={guests}
          metrics={guestMetrics}
          edgeColor={project.map.edgeColor}
          canvasWidth={project.canvas.width}
          canvasHeight={project.canvas.height}
          userFonts={userFonts}
          exportMode={exportMode}
          renderIntervalMs={renderIntervalMs}
          onSelect={onSelect}
          onMoveGuests={onMoveGuests}
        />
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
    <>
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
      aria-label={selectionAnnouncement ? `毕业去向蹭饭图编辑画布，${selectionAnnouncement}` : "毕业去向蹭饭图编辑画布"}
      onClick={(event) => {
        if (!exportMode && event.target === event.currentTarget) onSelect?.({ type: "canvas" });
      }}
    >
      <PosterSvgChrome
        canvas={project.canvas}
        userFonts={userFonts}
        showEditorGrid={!exportMode && showGrid}
        gridSize={gridSize}
      />

      {layerBlocks.map((block) => <Fragment key={block.key}>{block.node}</Fragment>)}
    </svg>
    {!exportMode && (
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        data-canvas-selection-announcement
      >
        {selectionAnnouncement}
      </span>
    )}
    </>
  );
}
