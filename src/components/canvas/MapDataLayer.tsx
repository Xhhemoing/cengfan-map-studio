import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DataViewId } from "../../lib/project-data";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings, ProvinceStyle } from "../../lib/scene-document";
import {
  smartTextureLayout,
  textureLayoutFromAppearance,
  provinceTextureBox,
} from "../../lib/province-texture";
import {
  resolveProvinceTexturePlacements,
  type TexturePlacementBounds,
} from "../../lib/province-texture-placement";
import { resolveEdgeStyle, type EdgeStrokeSpec } from "../../lib/edge-styles";
import { heatColorForCount } from "../../lib/heat-scale";

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

function provinceFill(
  feature: MapFeature,
  count: number,
  dataView: DataViewId,
  settings: MapSettings,
  heatColors?: readonly string[],
): string {
  const style = settings.provinceStyles?.[feature.name] ?? {};
  if (style.appearance?.kind === "manual-color") return style.appearance.color;
  if (style.fill) return style.fill;
  if (count === 0) return settings.emptyProvinceFill === "transparent" ? "transparent" : settings.landColor;
  return (settings.fillMode === "heat" || dataView === "heat")
    ? heatColor(count, settings, heatColors)
    : settings.activeColor;
}

function heatColor(count: number, settings: MapSettings, heatColors?: readonly string[]): string {
  if (!heatColors?.length) return settings.activeColor;
  return heatColors[Math.min(count, heatColors.length) - 1] ?? settings.activeColor;
}

function normalizedHeatColor(
  count: number,
  maximum: number,
  settings: MapSettings,
  heatColors?: readonly string[],
): string {
  if (!heatColors?.length || maximum <= 0) return settings.activeColor;
  const index = Math.min(heatColors.length - 1, Math.max(0, Math.ceil(count / maximum * heatColors.length) - 1));
  return heatColors[index] ?? settings.activeColor;
}

function provinceVisible(feature: MapFeature, settings: MapSettings): boolean {
  const style = settings.provinceStyles?.[feature.name] ?? {};
  return style.visible !== false;
}

function textureSource(style: ProvinceStyle): string | undefined {
  return style.appearance?.kind === "feature" || style.appearance?.kind === "texture"
    ? style.appearance.src
    : style.textureSrc;
}

function textureLayout(style: ProvinceStyle) {
  if (style.appearance?.kind === "feature" || style.appearance?.kind === "texture") {
    return textureLayoutFromAppearance(style.appearance) ?? smartTextureLayout();
  }
  return smartTextureLayout({ fit: "contain", scale: 1, overflow: false });
}

function isOverflowTexture(style: ProvinceStyle): boolean {
  if (!textureSource(style)) return false;
  if (style.appearance?.kind === "feature" || style.appearance?.kind === "texture") {
    return style.appearance.overflow === true;
  }
  return false;
}

function hasTexture(style: ProvinceStyle): boolean {
  return Boolean(textureSource(style));
}

/**
 * Solid underfill for province path. Textures no longer use pattern fills
 * (which tile when scaled down). With a texture, prefer an explicit solid
 * underfill so transparent PNG edges still look clean; fall back to heat/land.
 */
function provinceFillReference(
  feature: MapFeature,
  settings: MapSettings,
  count: number,
  maximum: number,
  dataView: DataViewId,
  heatColors?: readonly string[],
): string {
  const style = settings.provinceStyles?.[feature.name] ?? {};
  if (hasTexture(style)) {
    if (style.appearance?.kind === "manual-color") return style.appearance.color;
    if (style.fill) return style.fill;
    // Solid land underfill so contain/small-scale images don't punch a hole in the map.
    return settings.landColor;
  }
  if (!style.appearance && !style.fill && count > 0 && (settings.fillMode === "heat" || dataView === "heat")) {
    if (settings.heatScale) return heatColorForCount(count, settings.heatScale);
    return normalizedHeatColor(count, maximum, settings, heatColors);
  }
  return provinceFill(feature, count, dataView, settings, heatColors);
}

function resolveBounds(
  feature: MapFeature,
  path: (feature: MapFeature) => string | null | undefined,
  bounds?: (feature: MapFeature) => [[number, number], [number, number]] | null | undefined,
): [[number, number], [number, number]] | null {
  const fromHelper = bounds?.(feature);
  if (fromHelper) return fromHelper;
  const d = path(feature);
  if (!d) return null;
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 2) return [[0, 0], [1, 1]];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]!);
    maxX = Math.max(maxX, numbers[i]!);
    minY = Math.min(minY, numbers[i + 1]!);
    maxY = Math.max(maxY, numbers[i + 1]!);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return [[0, 0], [1, 1]];
  return [[minX, minY], [maxX, maxY]];
}

function resolveCenter(
  feature: MapFeature,
  box: [[number, number], [number, number]],
  center?: (feature: MapFeature) => [number, number] | null | undefined,
): [number, number] {
  const fromHelper = center?.(feature);
  if (fromHelper && Number.isFinite(fromHelper[0]) && Number.isFinite(fromHelper[1])) {
    return fromHelper;
  }
  const [[x0, y0], [x1, y1]] = box;
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

function textureClipDefs(
  features: readonly MapFeature[],
  settings: MapSettings,
  path: (feature: MapFeature) => string | null | undefined,
) {
  return features.flatMap((feature) => {
    const style = settings.provinceStyles?.[feature.name] ?? {};
    if (!hasTexture(style) || isOverflowTexture(style)) return [];
    if (!provinceVisible(feature, settings)) return [];
    const d = path(feature);
    if (!d) return [];
    return [
      <clipPath key={`province-texture-clip-${feature.id}`} id={`province-texture-clip-${feature.id}`}>
        <path d={d} />
      </clipPath>,
    ];
  });
}

function provinceTextureRecords(
  features: readonly MapFeature[],
  settings: MapSettings,
  path: (feature: MapFeature) => string | null | undefined,
  bounds?: (feature: MapFeature) => [[number, number], [number, number]] | null | undefined,
  center?: (feature: MapFeature) => [number, number] | null | undefined,
  placementBounds: TexturePlacementBounds = { x: 0, y: 0, width: settings.width, height: settings.height },
  preview?: { province: string; offsetX: number; offsetY: number } | null,
) {
  const textures = features.flatMap((feature) => {
    if (!provinceVisible(feature, settings)) return [];
    const style = settings.provinceStyles?.[feature.name] ?? {};
    const src = textureSource(style);
    if (!src) return [];
    const layout = textureLayout(style);
    const box = resolveBounds(feature, path, bounds);
    if (!box) return [];
    const baseAnchor = resolveCenter(feature, box, center);
    const offsetX = preview?.province === feature.name ? preview.offsetX : layout.offsetX ?? 0;
    const offsetY = preview?.province === feature.name ? preview.offsetY : layout.offsetY ?? 0;
    const anchor: [number, number] = [baseAnchor[0] + offsetX, baseAnchor[1] + offsetY];
    const calculatedRect = provinceTextureBox(box, layout, anchor);
    const uniformSize = settings.provinceTextureUniformSize;
    const uniform = uniformSize?.enabled === true;
    const rect = uniform
      ? {
          ...calculatedRect,
          x: anchor[0] - uniformSize.width / 2,
          y: anchor[1] - uniformSize.height / 2,
          width: uniformSize.width,
          height: uniformSize.height,
        }
      : calculatedRect;
    const overflow = isOverflowTexture(style);
    const preserveAspectRatio = layout.sizingMode === "province"
      ? "none"
      : layout.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice";
    return [{ feature, src, layout, rect, anchor, offsetX, offsetY, overflow, uniform, preserveAspectRatio }];
  });

  const adjustedOverflow = new Map(resolveProvinceTexturePlacements(
    textures.map((texture) => ({
      id: texture.feature.id,
      anchor: texture.anchor,
      rect: texture.rect,
      avoidOverlap: texture.overflow,
      fixed: texture.overflow && (texture.offsetX !== 0 || texture.offsetY !== 0),
    })),
    placementBounds,
  ).map((placement) => [placement.id, placement]));

  return textures.map((texture) => ({
    ...texture,
    unadjustedRect: texture.rect,
    placement: adjustedOverflow.get(texture.feature.id),
    rect: adjustedOverflow.get(texture.feature.id)?.rect ?? texture.rect,
  }));
}

function provinceTextureNodes(
  records: ReturnType<typeof provinceTextureRecords>,
) {
  return records.map((texture) => {
    const { rect } = texture;
    return (
      <image
        key={`province-texture-img-${texture.feature.id}`}
        data-province-texture={texture.feature.id}
        data-province-overflow={texture.overflow ? texture.feature.id : undefined}
        href={texture.src}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        opacity={texture.layout.opacity ?? 1}
        preserveAspectRatio={texture.preserveAspectRatio}
        pointerEvents="none"
        clipPath={texture.overflow ? undefined : `url(#province-texture-clip-${texture.feature.id})`}
        data-texture-scale={texture.layout.scale}
        data-texture-fit={texture.layout.fit}
        data-texture-sizing={texture.layout.sizingMode}
        data-texture-uniform={texture.uniform ? "true" : undefined}
        data-texture-adjusted={texture.placement?.adjusted ? "true" : undefined}
        data-texture-mode="single"
        data-texture-cx={texture.anchor[0]}
        data-texture-cy={texture.anchor[1]}
      />
    );
  });
}

function edgeFilterDefs(filters: Array<{ id: string; markupKey: string }>) {
  return filters.map((filter) => {
    if (filter.markupKey === "soft-glow") {
      return (
        <filter key={filter.id} id={filter.id} x="-40%" y="-40%" width="180%" height="180%" data-edge-filter="soft-glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      );
    }
    return (
      <filter key={filter.id} id={filter.id} x="-35%" y="-35%" width="170%" height="170%" data-edge-filter="ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    );
  });
}

function strokePath(
  feature: MapFeature,
  d: string,
  layer: "underlay" | "stroke",
  index: number,
  spec: EdgeStrokeSpec,
) {
  return (
    <path
      key={`province-edge-${layer}-${feature.id}-${index}`}
      data-province-edge={feature.id}
      data-edge-layer={layer}
      d={d}
      fill="none"
      stroke={spec.color}
      strokeWidth={spec.width}
      strokeDasharray={spec.dasharray}
      strokeLinecap={spec.linecap ?? "round"}
      strokeLinejoin={spec.linejoin ?? "round"}
      opacity={spec.opacity ?? 1}
      filter={spec.filter}
      pointerEvents="none"
    />
  );
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
  const [texturePreview, setTexturePreview] = useState<{ province: string; offsetX: number; offsetY: number } | null>(null);
  const textureDrag = useRef<{
    province: string;
    pointerId: number;
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const maximum = Math.max(0, ...features.map((feature) => counts.get(feature.name) ?? 0));
  const edge = resolveEdgeStyle({
    style: settings.edgeStyle,
    color: settings.edgeColor,
    width: settings.edgeWidth ?? 1,
    filterPrefix: edgeFilterPrefix,
  });
  const eventPoint = (event: ReactPointerEvent<SVGGraphicsElement>) => {
    const ctm = event.currentTarget.getScreenCTM?.();
    const svg = event.currentTarget.ownerSVGElement;
    if (ctm && svg) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    }
    return { x: event.clientX, y: event.clientY };
  };
  const textureRecords = renderTextures
    ? provinceTextureRecords(features, settings, path, bounds, center, texturePlacementBounds, texturePreview)
    : [];
  const textureEditors = !onSelectProvince ? [] : textureRecords.map((texture) => {
    const selected = selectedProvince === texture.feature.name;
    const automaticOffsetX = texture.rect.x - texture.unadjustedRect.x;
    const automaticOffsetY = texture.rect.y - texture.unadjustedRect.y;
    const startOffsetX = texturePreview?.province === texture.feature.name
      ? texturePreview.offsetX
      : (texture.layout.offsetX ?? 0) + automaticOffsetX;
    const startOffsetY = texturePreview?.province === texture.feature.name
      ? texturePreview.offsetY
      : (texture.layout.offsetY ?? 0) + automaticOffsetY;
    return (
      <g
        key={`province-texture-editor-${texture.feature.id}`}
        data-province-texture-editor={texture.feature.id}
        data-province-texture-selection={selected ? texture.feature.id : undefined}
        data-texture-offset-x={startOffsetX}
        data-texture-offset-y={startOffsetY}
        role="button"
        tabIndex={0}
        aria-label={`调整${texture.feature.name}贴图位置`}
        style={{ cursor: onMoveProvinceTexture ? "move" : "pointer" }}
        onClick={(event) => { event.stopPropagation(); onSelectProvince(texture.feature.name); }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelectProvince(texture.feature.name);
          if (!onMoveProvinceTexture) return;
          const point = eventPoint(event);
          event.currentTarget.setPointerCapture?.(event.pointerId);
          textureDrag.current = {
            province: texture.feature.name,
            pointerId: event.pointerId,
            pointerX: point.x,
            pointerY: point.y,
            offsetX: startOffsetX,
            offsetY: startOffsetY,
          };
        }}
        onPointerMove={(event) => {
          const drag = textureDrag.current;
          if (!drag) return;
          const point = eventPoint(event);
          setTexturePreview({
            province: drag.province,
            offsetX: drag.offsetX + point.x - drag.pointerX,
            offsetY: drag.offsetY + point.y - drag.pointerY,
          });
        }}
        onPointerUp={(event) => {
          const drag = textureDrag.current;
          if (!drag) return;
          const point = eventPoint(event);
          const offsetX = drag.offsetX + point.x - drag.pointerX;
          const offsetY = drag.offsetY + point.y - drag.pointerY;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          textureDrag.current = null;
          setTexturePreview(null);
          onMoveProvinceTexture?.(drag.province, Math.round(offsetX), Math.round(offsetY));
        }}
        onPointerCancel={() => {
          textureDrag.current = null;
          setTexturePreview(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectProvince(texture.feature.name);
          }
        }}
      >
        <rect
          x={texture.rect.x}
          y={texture.rect.y}
          width={texture.rect.width}
          height={texture.rect.height}
          fill="transparent"
          stroke={selected ? "#d05a45" : "transparent"}
          strokeWidth={selected ? 2 : 0}
          strokeDasharray={selected ? "6 4" : undefined}
          clipPath={texture.overflow ? undefined : `url(#province-texture-clip-${texture.feature.id})`}
        />
      </g>
    );
  });

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
      {textureEditors}
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
