import { useState } from "react";
import type { DataViewId } from "../../lib/project-data";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import type { TexturePlacementBounds } from "../../lib/province-texture-placement";
import { resolveEdgeStyle } from "../../lib/edge-styles";
import { provinceFillReference } from "./map-data-fills";
import { provinceVisible } from "./map-data-province-style";
import { provinceTextureRecords, type TexturePreview } from "./map-data-textures";
import { ProvinceTextureEditors } from "./map-layer-texture-editor";
import {
  edgeFilterDefs,
  provinceTextureNodes,
  strokePath,
  textureClipDefs,
} from "./map-layer-texture-nodes";

export interface MapDataLayerProps {
  settings: MapSettings;
  features: readonly MapFeature[];
  counts: ReadonlyMap<string, number>;
  dataView: DataViewId;
  path: (feature: MapFeature) => string | null | undefined;
  bounds?: (feature: MapFeature) => [[number, number], [number, number]] | null | undefined;
  /** Projected province visual center (centroid / admin center). Used to anchor textures. */
  center?: (feature: MapFeature) => [number, number] | null | undefined;
  heatColors?: readonly string[];
  renderFills?: boolean;
  /** Render province texture images independently from solid vector fills. */
  renderTextures?: boolean;
  renderBorders?: boolean;
  edgeFilterPrefix?: string;
  /** Local coordinate bounds used when separating overflow texture boxes. */
  texturePlacementBounds?: TexturePlacementBounds;
  selectedProvince?: string | null;
  onSelectProvince?: (province: string) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
}

export function MapDataLayer({
  settings,
  features,
  counts,
  dataView,
  path,
  bounds,
  center,
  heatColors,
  renderFills = true,
  renderTextures = true,
  renderBorders = true,
  edgeFilterPrefix = "map-edge",
  texturePlacementBounds,
  selectedProvince = null,
  onSelectProvince,
  onMoveProvinceTexture,
}: MapDataLayerProps) {
  const [texturePreview, setTexturePreview] = useState<TexturePreview | null>(null);
  const maximum = Math.max(0, ...features.map((feature) => counts.get(feature.name) ?? 0));
  const edge = resolveEdgeStyle({
    style: settings.edgeStyle,
    color: settings.edgeColor,
    width: settings.edgeWidth ?? 1,
    filterPrefix: edgeFilterPrefix,
  });
  const textureRecords = renderTextures
    ? provinceTextureRecords(features, settings, path, bounds, center, texturePlacementBounds, texturePreview)
    : [];

  return (
    <>
      {renderTextures && <defs data-province-texture-clips>{textureClipDefs(features, settings, path)}</defs>}
      {renderBorders && edge.filters.length > 0 && <defs data-edge-filters>{edgeFilterDefs(edge.filters)}</defs>}
      {/* Solid underfills first */}
      {renderFills && features.map((feature) => {
        const count = counts.get(feature.name) ?? 0;
        if (!provinceVisible(feature, settings)) return null;
        return (
          <path
            key={feature.id}
            data-province-id={feature.id}
            d={path(feature) ?? ""}
            fill={provinceFillReference(feature, settings, count, maximum, dataView, heatColors)}
            stroke="none"
            strokeWidth={0}
          />
        );
      })}
      {/* Single centered texture images AFTER fills so overflow is never covered by pure color.
          Can also run with fills disabled (replace-mode custom map) so textures still appear. */}
      {renderTextures && provinceTextureNodes(textureRecords)}
      {onSelectProvince && (
        <ProvinceTextureEditors
          records={textureRecords}
          selectedProvince={selectedProvince}
          preview={texturePreview}
          onPreviewChange={setTexturePreview}
          onSelectProvince={onSelectProvince}
          onMoveProvinceTexture={onMoveProvinceTexture}
        />
      )}
      {renderBorders && features.flatMap((feature) => {
        if (!provinceVisible(feature, settings)) return [];
        const d = path(feature) ?? "";
        if (!d) return [];
        return [
          ...edge.underlays.map((spec, index) => strokePath(feature, d, "underlay", index, spec)),
          ...edge.strokes.map((spec, index) => strokePath(feature, d, "stroke", index, spec)),
        ];
      })}
    </>
  );
}
