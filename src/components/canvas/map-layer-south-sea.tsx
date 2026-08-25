import type { DataViewId } from "../../lib/project-data";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { defaultSouthSeaInsetFrame } from "../../lib/south-china-sea";
import { fitFeatureProjection } from "./map-data-projection";
import { MapDataLayer } from "./MapDataLayer";
import type { MapLayerThemeColors } from "./MapLayer";

export function SouthSeaInset({
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
  const projected = fitFeatureProjection(insetFeatures, [
    [pad, pad],
    [frame.width - pad, frame.height - pad],
  ]);

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
        path={projected.path}
        bounds={projected.bounds}
        center={projected.center}
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
