import type { DataViewId } from "../../lib/project-data";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings, SceneSelection } from "../../lib/scene-document";
import type { UserFont } from "../../lib/fonts";
import { MapDataLayer } from "./MapDataLayer";
import { fitFeatureProjection, getFeatureSplit } from "./map-data-projection";
import { BORDER_Z, LABEL_Z, renderMapImage } from "./map-layer-image";
import { MapImageResizeHandles } from "./map-layer-image-handles";
import { ProvinceHitAreas, ProvinceLabels, StudentPins } from "./map-layer-marks";
import { SouthSeaInset } from "./map-layer-south-sea";

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
  const projected = fitFeatureProjection(mainlandFeatures, [[0, 0], [settings.width, settings.height]]);
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
      // The container is a named group, not a button: keeping the button role
      // here would nest the focusable province/pin buttons inside another
      // button (invalid) and its keydown handler would swallow Enter/Space
      // bubbling up from them, re-selecting the map right after a province.
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "地图" : undefined}
      onClick={interactive ? () => selectMap() : undefined}
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
      {/* The frame rect carries the "select map" button: clicks bubble to the
          group's onClick as before, keyboard activation is handled here. */}
      <rect
        data-map-frame
        width={settings.width}
        height={settings.height}
        fill="transparent"
        pointerEvents="all"
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? "选择地图" : undefined}
        onKeyDown={interactive ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectMap();
          }
        } : undefined}
      />
      <g data-map-content opacity={settings.opacity ?? 1} style={settings.shadow ? { filter: "drop-shadow(0 8px 7px rgba(57, 67, 78, 0.24))" } : undefined}>
      {/* Vector fills under overlay images; hidden in replace mode. Textures deferred to top pass. */}
      <MapDataLayer
        settings={settings}
        features={mainlandFeatures}
        counts={counts}
        dataView={dataView}
        path={projected.path}
        bounds={projected.bounds}
        center={projected.center}
        heatColors={theme?.heatColors}
        renderFills={renderVectorFills}
        renderTextures={false}
        renderBorders={false}
      />
      {imageSource && (imageZIndex < BORDER_Z) && renderMapImage(settings, mainlandFeatures, projected.path)}
      {/* Borders + province textures on top of the custom map image (and solid fills). */}
      <g data-map-borders>
        <MapDataLayer
          settings={settings}
          features={mainlandFeatures}
          counts={counts}
          dataView={dataView}
          path={projected.path}
          bounds={projected.bounds}
          center={projected.center}
          heatColors={theme?.heatColors}
          renderFills={false}
          renderTextures
          renderBorders
          selectedProvince={selectedProvince}
          onSelectProvince={!exportMode ? onSelectProvince : undefined}
          onMoveProvinceTexture={!exportMode ? onMoveProvinceTexture : undefined}
        />
      </g>
      {imageSource && (imageZIndex >= BORDER_Z && imageZIndex < LABEL_Z) && renderMapImage(settings, mainlandFeatures, projected.path)}
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
      <StudentPins
        settings={settings}
        pins={pins}
        features={features}
        mainlandFeatures={mainlandFeatures}
        projection={projected}
        dataView={dataView}
        theme={theme}
        selectedStudentId={selectedStudentId}
        onSelectStudent={onSelectStudent}
      />
      {settings.showProvinceLabels && (
        <ProvinceLabels
          settings={settings}
          features={mainlandFeatures}
          counts={counts}
          projection={projected}
          theme={theme}
          userFonts={userFonts}
        />
      )}
      {imageSource && imageZIndex >= LABEL_Z && renderMapImage(settings, mainlandFeatures, projected.path)}
      </g>
      {!exportMode && onSelectProvince && (
        <ProvinceHitAreas
          features={interactiveFeatures}
          projection={projected}
          selectedProvince={selectedProvince}
          onSelectProvince={onSelectProvince}
        />
      )}
      {imageSource && selected && !exportMode && onResizeMapImage && imageSource.alignment && (
        <MapImageResizeHandles alignment={imageSource.alignment} renderIntervalMs={renderIntervalMs} onCommit={onResizeMapImage} />
      )}
    </g>
  );
}
