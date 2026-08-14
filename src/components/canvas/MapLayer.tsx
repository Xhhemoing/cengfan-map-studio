import { geoMercator, geoPath } from "d3-geo";
import type { DataViewId } from "../../lib/project-data";
import { findProvinceFeature, type MapFeature } from "../../lib/map-data";
import type { MapSettings, SceneSelection } from "../../lib/scene-document";
import { mapImageElementPlacement, mapImageTransform } from "../../lib/map-alignment";
import {
  defaultSouthSeaInsetFrame,
  splitMapFeaturesForSouthChinaSea,
} from "../../lib/south-china-sea";
import { MapDataLayer } from "./MapDataLayer";
import { ResizeHandles } from "./ResizeHandles";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";

/** Base plane z-values for ordering the overlay image against map sub-layers. */
const BORDER_Z = 50;
const LABEL_Z = 100;

export interface MapLayerThemeColors {
  ink: string;
  heatColors?: readonly string[];
}

export interface StudentPin {
  id: string;
  province: string;
  label: string;
}

export interface MapLayerProps {
  settings: MapSettings;
  features: readonly MapFeature[];
  counts: ReadonlyMap<string, number>;
  dataView?: DataViewId;
  pins?: readonly StudentPin[];
  selectedStudentId?: string | null;
  onSelectStudent?: (id: string) => void;
  theme?: MapLayerThemeColors;
  /** @deprecated Province textures use map.provinceStyles appearance; movable assets render in PosterCanvas. */
  assets?: import("../../lib/scene-document").AssetElement[];
  selectedAssetId?: string | null;
  exportMode?: boolean;
  onSelectMap?: (selection: Extract<SceneSelection, { type: "map" }>) => void;
  onSelectProvince?: (province: string) => void;
  selectedProvince?: string | null;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
  onSelectAsset?: (assetId: string) => void;
  onAssetLoadError?: (assetId: string) => void;
  /** True when the map itself is the current scene selection (shows resize handles on the overlay image). */
  selected?: boolean;
  renderIntervalMs?: number;
  /** Commit a new alignment for the overlay image (width/height/x/y). */
  onResizeMapImage?: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  userFonts?: UserFont[];
}

const splitCache = new WeakMap<readonly MapFeature[], {
  open: ReturnType<typeof splitMapFeaturesForSouthChinaSea>;
  folded: ReturnType<typeof splitMapFeaturesForSouthChinaSea>;
}>();

function getFeatureSplit(features: readonly MapFeature[], collapse: boolean) {
  let cached = splitCache.get(features);
  if (!cached) {
    cached = {
      open: splitMapFeaturesForSouthChinaSea(features, false),
      folded: splitMapFeaturesForSouthChinaSea(features, true),
    };
    splitCache.set(features, cached);
  }
  return collapse ? cached.folded : cached.open;
}

function renderMapImage(
  settings: MapSettings,
  features: readonly MapFeature[],
  path: (feature: MapFeature) => string | null | undefined,
) {
  const source = settings.renderSource;
  if (source?.kind !== "image") return null;

  const clipId = "map-image-clip";
  const alignment = source.alignment;
  const clipToMap = source.clipToMap === true;

  const imageNode = alignment
    ? (() => {
        const placement = mapImageElementPlacement(alignment);
        const transform = mapImageTransform(alignment);
        return (
          <g data-map-image-aligned transform={transform || undefined}>
            <image
              data-map-image
              href={source.src}
              x={placement.x}
              y={placement.y}
              width={placement.width}
              height={placement.height}
              opacity={source.opacity}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
          </g>
        );
      })()
    : (
      <image
        data-map-image
        href={source.src}
        width={settings.width}
        height={settings.height}
        opacity={source.opacity}
        preserveAspectRatio={
          source.fit === "stretch"
            ? "none"
            : source.fit === "contain"
              ? "xMidYMid meet"
              : "xMidYMid slice"
        }
        pointerEvents="none"
      />
    );

  if (!clipToMap) return imageNode;

  const clipPaths = features
    .map((feature) => path(feature))
    .filter((d): d is string => Boolean(d));

  return (
    <>
      <defs>
        <clipPath id={clipId} data-map-image-clip>
          {clipPaths.map((d, index) => (
            <path key={`map-clip-${index}`} d={d} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{imageNode}</g>
    </>
  );
}

function SouthSeaInset({
  settings,
  insetFeatures,
  counts,
  dataView,
  theme,
  renderVectorFills,
  selectedProvince,
  onSelectProvince,
  onMoveProvinceTexture,
}: {
  settings: MapSettings;
  insetFeatures: readonly MapFeature[];
  counts: ReadonlyMap<string, number>;
  dataView: DataViewId;
  theme?: MapLayerThemeColors;
  renderVectorFills: boolean;
  selectedProvince?: string | null;
  onSelectProvince?: (province: string) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
}) {
  if (insetFeatures.length === 0) return null;
  const frame = defaultSouthSeaInsetFrame(settings.width, settings.height);
  const pad = 8;
  const projection = geoMercator().fitExtent(
    [[pad, pad], [frame.width - pad, frame.height - pad]],
    { type: "FeatureCollection", features: insetFeatures } as never,
  );
  const path = geoPath(projection);
  const featureBounds = (feature: MapFeature): [[number, number], [number, number]] | null => {
    const bounds = path.bounds(feature as never);
    if (!bounds || !Number.isFinite(bounds[0][0]) || !Number.isFinite(bounds[1][0])) return null;
    return bounds as [[number, number], [number, number]];
  };
  const featureCenter = (feature: MapFeature): [number, number] | null => {
    const centroid = path.centroid(feature as never);
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
      return [centroid[0], centroid[1]];
    }
    return null;
  };

  return (
    <g data-south-sea-inset transform={`translate(${frame.x} ${frame.y})`}>
      <rect
        data-south-sea-frame
        width={frame.width}
        height={frame.height}
        fill="#f8fafb"
        stroke={settings.edgeColor}
        strokeWidth={1.5}
        rx={4}
      />
      <MapDataLayer
        settings={settings}
        features={insetFeatures}
        counts={counts}
        dataView={dataView}
        path={(feature) => path(feature as never)}
        bounds={featureBounds}
        center={featureCenter}
        heatColors={theme?.heatColors}
        renderFills={renderVectorFills}
        renderTextures
        renderBorders
        edgeFilterPrefix="south-sea-edge"
        texturePlacementBounds={{ x: 0, y: 0, width: frame.width, height: frame.height }}
        selectedProvince={selectedProvince}
        onSelectProvince={onSelectProvince}
        onMoveProvinceTexture={onMoveProvinceTexture}
      />
      <text
        x={frame.width / 2}
        y={frame.height - 6}
        textAnchor="middle"
        fill={theme?.ink ?? settings.edgeColor}
        fontSize={9}
        fontWeight={600}
        data-south-sea-label
      >
        南海诸岛
      </text>
    </g>
  );
}

function MapImageResizeHandles({
  alignment,
  renderIntervalMs,
  onCommit,
}: {
  alignment: import("../../lib/map-alignment").MapImageAlignment;
  renderIntervalMs: number;
  onCommit: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
}) {
  return (
    <ResizeHandles
      renderIntervalMs={renderIntervalMs}
      rect={{ x: alignment.x, y: alignment.y, width: alignment.width, height: alignment.height, rotation: alignment.rotation }}
      onChange={() => { /* live preview handled by ResizeHandles internal state */ }}
      onCommit={(next) => onCommit({ x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation })}
      color="#d05a45"
    />
  );
}

export function MapLayer({
  settings,
  features,
  counts,
  dataView = "province",
  pins = [],
  selectedStudentId = null,
  onSelectStudent,
  theme,
  exportMode = false,
  onSelectMap,
  onSelectProvince,
  selectedProvince = null,
  onMoveProvinceTexture,
  selected = false,
  renderIntervalMs = 0,
  onResizeMapImage,
  userFonts = [],
}: MapLayerProps) {
  const collapse = settings.collapseSouthChinaSea === true;
  const { mainlandFeatures, insetFeatures } = getFeatureSplit(features, collapse);
  const projection = geoMercator().fitExtent(
    [[0, 0], [settings.width, settings.height]],
    { type: "FeatureCollection", features: mainlandFeatures } as never,
  );
  const path = geoPath(projection);
  const featureBounds = (feature: MapFeature): [[number, number], [number, number]] | null => {
    const bounds = path.bounds(feature as never);
    if (!bounds || !Number.isFinite(bounds[0][0]) || !Number.isFinite(bounds[1][0])) return null;
    return bounds as [[number, number], [number, number]];
  };
  const featureCenter = (feature: MapFeature): [number, number] | null => {
    const centroid = path.centroid(feature as never);
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
      return [centroid[0], centroid[1]];
    }
    return null;
  };
  const interactive = !exportMode && Boolean(onSelectMap);
  const selectMap = () => onSelectMap?.({ type: "map" });
  const centerX = settings.width / 2;
  const centerY = settings.height / 2;

  const imageSource = settings.renderSource?.kind === "image" ? settings.renderSource : null;
  const composition = imageSource?.composition === "overlay" ? "overlay" : "replace";
  // replace mode hides vector fills so the uploaded map is the visual base.
  const renderVectorFills = !imageSource || composition === "overlay";
  const imageZIndex = imageSource?.zIndex ?? 25;

  // Hit-testing / labels use original features projected with the mainland projection
  // so province selection still maps to real names.
  const interactiveFeatures = mainlandFeatures;

  return (
    <g
      data-map-layer
      data-width={settings.width}
      data-height={settings.height}
      data-scale={settings.scale}
      data-collapse-south-sea={collapse || undefined}
      transform={`translate(${settings.x} ${settings.y}) translate(${centerX} ${centerY}) scale(${settings.scale}) translate(${-centerX} ${-centerY})`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "选择地图" : undefined}
      onClick={interactive ? () => selectMap() : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectMap();
        }
      } : undefined}
    >
      {!exportMode && onSelectMap && (
        <rect
          data-map-selection-overlay
          width={settings.width}
          height={settings.height}
          fill="none"
          stroke="#d05a45"
          strokeDasharray="8 5"
          strokeWidth="2"
          pointerEvents="none"
        />
      )}
      <rect
        data-map-frame
        width={settings.width}
        height={settings.height}
        fill="transparent"
        pointerEvents="all"
      />
      <g data-map-content opacity={settings.opacity ?? 1} style={settings.shadow ? { filter: "drop-shadow(0 8px 7px rgba(57, 67, 78, 0.24))" } : undefined}>
      {/* Vector fills under overlay images; hidden in replace mode. Textures deferred to top pass. */}
      <MapDataLayer
        settings={settings}
        features={mainlandFeatures}
        counts={counts}
        dataView={dataView}
        path={(feature) => path(feature as never)}
        bounds={featureBounds}
        center={featureCenter}
        heatColors={theme?.heatColors}
        renderFills={renderVectorFills}
        renderTextures={false}
        renderBorders={false}
      />
      {imageSource && (imageZIndex < BORDER_Z) && renderMapImage(settings, mainlandFeatures, (feature) => path(feature as never))}
      {/* Borders + province textures on top of the custom map image (and solid fills). */}
      <g data-map-borders>
        <MapDataLayer
          settings={settings}
          features={mainlandFeatures}
          counts={counts}
          dataView={dataView}
          path={(feature) => path(feature as never)}
          bounds={featureBounds}
          center={featureCenter}
          heatColors={theme?.heatColors}
          renderFills={false}
          renderTextures
          renderBorders
          selectedProvince={selectedProvince}
          onSelectProvince={!exportMode ? onSelectProvince : undefined}
          onMoveProvinceTexture={!exportMode ? onMoveProvinceTexture : undefined}
        />
      </g>
      {imageSource && (imageZIndex >= BORDER_Z && imageZIndex < LABEL_Z) && renderMapImage(settings, mainlandFeatures, (feature) => path(feature as never))}
      {collapse && (
        <SouthSeaInset
          settings={settings}
          insetFeatures={insetFeatures}
          counts={counts}
          dataView={dataView}
          theme={theme}
          renderVectorFills={renderVectorFills}
          selectedProvince={selectedProvince}
          onSelectProvince={!exportMode ? onSelectProvince : undefined}
          onMoveProvinceTexture={!exportMode ? onMoveProvinceTexture : undefined}
        />
      )}
      {pins.flatMap((pin, index) => {
        const feature = findProvinceFeature(mainlandFeatures, pin.province)
          ?? findProvinceFeature(features, pin.province);
        if (!feature) return [];
        const point = projection(feature.center);
        if (!point) return [];
        const angle = index * 2.4;
        const radius = (index % 3) * 10;
        const x = point[0] + Math.cos(angle) * radius;
        const y = point[1] + Math.sin(angle) * radius;
        const pinsView = dataView === "pins";
        return (
          <g
            key={pin.id}
            data-student-pin={pin.id}
            data-selected={selectedStudentId === pin.id || undefined}
            transform={`translate(${x} ${y})`}
            role={onSelectStudent ? "button" : undefined}
            tabIndex={onSelectStudent ? 0 : undefined}
            aria-label={onSelectStudent ? `选择 ${pin.label}` : undefined}
            onClick={onSelectStudent ? (event) => { event.stopPropagation(); onSelectStudent(pin.id); } : undefined}
          >
            <circle
              r={pinsView ? (selectedStudentId === pin.id ? 9 : 6) : 4}
              fill={settings.activeColor}
              stroke="#fff"
              strokeWidth={pinsView ? 2 : 1.5}
            />
            {pinsView && <text x={9} y={4} fill={theme?.ink ?? settings.edgeColor} fontSize={10} fontWeight={700}>{pin.label}</text>}
          </g>
        );
      })}
      {settings.showProvinceLabels && mainlandFeatures.map((feature) => {
        const administrativeCenter = projection(feature.center);
        const centroid = path.centroid(feature as never);
        const usesAdministrativeCenter = Boolean(administrativeCenter
          && Number.isFinite(administrativeCenter[0])
          && Number.isFinite(administrativeCenter[1]));
        const point = usesAdministrativeCenter ? administrativeCenter : centroid;
        const hasData = (counts.get(feature.name) ?? 0) > 0;
        return point ? (
          <text
            key={`${feature.id}-label`}
            data-province-label={feature.id}
            data-label-anchor={usesAdministrativeCenter ? "administrative-center" : "geometry-centroid"}
            x={point[0]}
            y={point[1]}
            fill={settings.provinceLabelTypography?.color ?? theme?.ink ?? settings.edgeColor}
            textAnchor="middle"
            fontSize={settings.provinceLabelTypography?.fontSize ?? 10}
            fontFamily={resolveFontFamily(
              settings.provinceStyles?.[feature.name]?.labelFontId ?? settings.provinceLabelFontId,
              userFonts,
            )}
          >
            {feature.shortName}{hasData ? "*" : ""}
          </text>
        ) : null;
      })}
      {imageSource && imageZIndex >= LABEL_Z && renderMapImage(settings, mainlandFeatures, (feature) => path(feature as never))}
      </g>
      {!exportMode && onSelectProvince && interactiveFeatures.map((feature) => (
        <path
          key={`province-hit-${feature.id}`}
          data-province-hit={feature.id}
          d={path(feature as never) ?? ""}
          fill="transparent"
          stroke="transparent"
          strokeWidth={8}
          role="button"
          tabIndex={0}
          aria-label={`选择${feature.name}`}
          onClick={(event) => { event.stopPropagation(); onSelectProvince(feature.name); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectProvince(feature.name);
            }
          }}
        />
      ))}
      {imageSource && selected && !exportMode && onResizeMapImage && imageSource.alignment && (
        <MapImageResizeHandles alignment={imageSource.alignment} renderIntervalMs={renderIntervalMs} onCommit={onResizeMapImage} />
      )}
    </g>
  );
}
