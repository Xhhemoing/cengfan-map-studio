import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { provinceTextureBox } from "../../lib/province-texture";
import {
  resolveProvinceTexturePlacements,
  type TexturePlacementBounds,
} from "../../lib/province-texture-placement";
import {
  isOverflowTexture,
  provinceVisible,
  textureLayout,
  textureSource,
} from "./map-data-province-style";

export interface TexturePreview {
  province: string;
  offsetX: number;
  offsetY: number;
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

export function provinceTextureRecords(
  features: readonly MapFeature[],
  settings: MapSettings,
  path: (feature: MapFeature) => string | null | undefined,
  bounds?: (feature: MapFeature) => [[number, number], [number, number]] | null | undefined,
  center?: (feature: MapFeature) => [number, number] | null | undefined,
  placementBounds: TexturePlacementBounds = { x: 0, y: 0, width: settings.width, height: settings.height },
  preview?: TexturePreview | null,
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

export type ProvinceTextureRecord = ReturnType<typeof provinceTextureRecords>[number];
