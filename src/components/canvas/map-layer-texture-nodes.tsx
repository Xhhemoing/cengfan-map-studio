import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import type { EdgeStrokeSpec } from "../../lib/edge-styles";
import { hasTexture, isOverflowTexture, provinceVisible } from "./map-data-province-style";
import type { ProvinceTextureRecord } from "./map-data-textures";

export function textureClipDefs(
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

export function provinceTextureNodes(records: readonly ProvinceTextureRecord[]) {
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

export function edgeFilterDefs(filters: Array<{ id: string; markupKey: string }>) {
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

export function strokePath(
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
