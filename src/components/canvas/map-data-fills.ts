import type { DataViewId } from "../../lib/project-data";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { heatColorForCount } from "../../lib/heat-scale";
import { hasTexture } from "./map-data-province-style";

const POSTER_PALETTES = {
  playful: ["#e95646", "#f3c847", "#efb8c6", "#3d8fc2", "#263b78"],
  pastel: ["#f6c4cf", "#f2d08b", "#a9d9ce", "#9fc8df", "#c4b5dc"],
  muted: ["#d8c6bd", "#c6d2c2", "#bac9d6", "#d8cda8", "#cdbdce"],
} as const;

function posterPaletteColor(feature: MapFeature, palette: keyof typeof POSTER_PALETTES): string {
  const colors = POSTER_PALETTES[palette];
  let hash = 0;
  for (const character of feature.name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
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
  if (settings.dataPalette && settings.dataPalette !== "single") return posterPaletteColor(feature, settings.dataPalette);
  return (settings.fillMode === "heat" || dataView === "heat")
    ? heatColor(count, settings, heatColors)
    : settings.activeColor;
}

/**
 * Solid underfill for province path. Textures no longer use pattern fills
 * (which tile when scaled down). With a texture, prefer an explicit solid
 * underfill so transparent PNG edges still look clean; fall back to heat/land.
 */
export function provinceFillReference(
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
  if (!style.appearance && !style.fill && count > 0 && settings.dataPalette && settings.dataPalette !== "single") {
    return posterPaletteColor(feature, settings.dataPalette);
  }
  if (!style.appearance && !style.fill && count > 0 && (settings.fillMode === "heat" || dataView === "heat")) {
    if (settings.heatScale) return heatColorForCount(count, settings.heatScale);
    return normalizedHeatColor(count, maximum, settings, heatColors);
  }
  return provinceFill(feature, count, dataView, settings, heatColors);
}
