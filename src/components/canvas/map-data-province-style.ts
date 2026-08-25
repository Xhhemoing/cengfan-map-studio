import type { MapFeature } from "../../lib/map-data";
import type { MapSettings, ProvinceStyle } from "../../lib/scene-document";
import { smartTextureLayout, textureLayoutFromAppearance } from "../../lib/province-texture";

export function provinceVisible(feature: MapFeature, settings: MapSettings): boolean {
  const style = settings.provinceStyles?.[feature.name] ?? {};
  return style.visible !== false;
}

export function textureSource(style: ProvinceStyle): string | undefined {
  return style.appearance?.kind === "feature" || style.appearance?.kind === "texture"
    ? style.appearance.src
    : style.textureSrc;
}

export function textureLayout(style: ProvinceStyle) {
  if (style.appearance?.kind === "feature" || style.appearance?.kind === "texture") {
    return textureLayoutFromAppearance(style.appearance) ?? smartTextureLayout();
  }
  return smartTextureLayout({ fit: "contain", scale: 1, overflow: false });
}

export function isOverflowTexture(style: ProvinceStyle): boolean {
  if (!textureSource(style)) return false;
  if (style.appearance?.kind === "feature" || style.appearance?.kind === "texture") {
    return style.appearance.overflow === true;
  }
  return false;
}

export function hasTexture(style: ProvinceStyle): boolean {
  return Boolean(textureSource(style));
}
