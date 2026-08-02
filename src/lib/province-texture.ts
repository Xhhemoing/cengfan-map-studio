import type { ProvinceAppearance, ProvinceStyle } from "./scene-document";

export const DEFAULT_TEXTURE_SCALE = 1;
export const MIN_TEXTURE_SCALE = 0.3;
export const MAX_TEXTURE_SCALE = 2.5;

export interface ProvinceTextureLayout {
  fit: "cover" | "contain";
  scale: number;
  opacity?: number;
  overflow: boolean;
  sizingMode: "province" | "natural" | "custom";
  naturalWidth?: number;
  naturalHeight?: number;
  customWidth?: number;
  customHeight?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface ProvinceTextureBox {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Always a single non-tiling image placement. */
  mode: "single";
}

export function clampTextureScale(value: unknown, fallback = DEFAULT_TEXTURE_SCALE): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_TEXTURE_SCALE, Math.max(MIN_TEXTURE_SCALE, numeric));
}

export function clampTextureOpacity(value: unknown, fallback = 1): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

/** Smart defaults: show the full image inside the province without overflowing. */
export function smartTextureLayout(overrides: Partial<ProvinceTextureLayout> = {}): ProvinceTextureLayout {
  return {
    fit: overrides.fit === "cover" ? "cover" : "contain",
    scale: clampTextureScale(overrides.scale, DEFAULT_TEXTURE_SCALE),
    opacity: clampTextureOpacity(overrides.opacity, 1),
    overflow: overrides.overflow === true,
    sizingMode: overrides.sizingMode === "natural" || overrides.sizingMode === "custom" ? overrides.sizingMode : "province",
    naturalWidth: Number.isFinite(overrides.naturalWidth) && Number(overrides.naturalWidth) > 0 ? Number(overrides.naturalWidth) : undefined,
    naturalHeight: Number.isFinite(overrides.naturalHeight) && Number(overrides.naturalHeight) > 0 ? Number(overrides.naturalHeight) : undefined,
    customWidth: Number.isFinite(overrides.customWidth) && Number(overrides.customWidth) > 0 ? Number(overrides.customWidth) : undefined,
    customHeight: Number.isFinite(overrides.customHeight) && Number(overrides.customHeight) > 0 ? Number(overrides.customHeight) : undefined,
    offsetX: Number.isFinite(overrides.offsetX) ? Number(overrides.offsetX) : 0,
    offsetY: Number.isFinite(overrides.offsetY) ? Number(overrides.offsetY) : 0,
  };
}

export function textureLayoutFromAppearance(appearance: ProvinceAppearance | undefined): ProvinceTextureLayout | null {
  if (!appearance || appearance.kind === "manual-color") return null;
  return smartTextureLayout({
    fit: appearance.fit,
    scale: appearance.scale,
    opacity: appearance.opacity,
    overflow: appearance.overflow,
    sizingMode: appearance.sizingMode,
    naturalWidth: appearance.naturalWidth,
    naturalHeight: appearance.naturalHeight,
    customWidth: appearance.customWidth,
    customHeight: appearance.customHeight,
    offsetX: appearance.offsetX,
    offsetY: appearance.offsetY,
  });
}

export function withTextureLayout(
  appearance: Extract<ProvinceAppearance, { kind: "feature" | "texture" }>,
  layout: Partial<ProvinceTextureLayout>,
): Extract<ProvinceAppearance, { kind: "feature" | "texture" }> {
  const nextOffsetX = layout.offsetX !== undefined ? layout.offsetX : appearance.offsetX;
  const nextOffsetY = layout.offsetY !== undefined ? layout.offsetY : appearance.offsetY;
  const next = smartTextureLayout({
    fit: layout.fit ?? appearance.fit,
    scale: layout.scale ?? appearance.scale,
    opacity: layout.opacity ?? appearance.opacity,
    overflow: layout.overflow ?? appearance.overflow,
    sizingMode: layout.sizingMode ?? appearance.sizingMode,
    naturalWidth: layout.naturalWidth ?? appearance.naturalWidth,
    naturalHeight: layout.naturalHeight ?? appearance.naturalHeight,
    customWidth: layout.customWidth ?? appearance.customWidth,
    customHeight: layout.customHeight ?? appearance.customHeight,
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
  });
  return {
    ...appearance,
    fit: next.fit,
    scale: next.scale,
    opacity: next.opacity,
    overflow: next.overflow,
    sizingMode: next.sizingMode,
    naturalWidth: next.naturalWidth,
    naturalHeight: next.naturalHeight,
    customWidth: next.customWidth,
    customHeight: next.customHeight,
    ...(nextOffsetX !== undefined ? { offsetX: next.offsetX } : {}),
    ...(nextOffsetY !== undefined ? { offsetY: next.offsetY } : {}),
  };
}

export function createTextureAppearance(input: {
  kind?: "feature" | "texture";
  assetId: string;
  src: string;
  fit?: "cover" | "contain";
  scale?: number;
  opacity?: number;
  overflow?: boolean;
  sizingMode?: "province" | "natural" | "custom";
  naturalWidth?: number;
  naturalHeight?: number;
  customWidth?: number;
  customHeight?: number;
  offsetX?: number;
  offsetY?: number;
}): Extract<ProvinceAppearance, { kind: "feature" | "texture" }> {
  const layout = smartTextureLayout({
    fit: input.fit,
    scale: input.scale,
    opacity: input.opacity,
    overflow: input.overflow,
    sizingMode: input.sizingMode,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight,
    customWidth: input.customWidth,
    customHeight: input.customHeight,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
  });
  return {
    kind: input.kind ?? "texture",
    assetId: input.assetId,
    src: input.src,
    fit: layout.fit,
    scale: layout.scale,
    opacity: layout.opacity,
    overflow: layout.overflow,
    sizingMode: layout.sizingMode,
    naturalWidth: layout.naturalWidth,
    naturalHeight: layout.naturalHeight,
    customWidth: layout.customWidth,
    customHeight: layout.customHeight,
    ...(input.offsetX !== undefined ? { offsetX: layout.offsetX } : {}),
    ...(input.offsetY !== undefined ? { offsetY: layout.offsetY } : {}),
  };
}

export function synchronizeProvinceTextureSettings(
  styles: Record<string, ProvinceStyle>,
  source: Extract<ProvinceAppearance, { kind: "feature" | "texture" }>,
): Record<string, ProvinceStyle> {
  const sourceLayout = smartTextureLayout({
    fit: source.fit,
    scale: source.scale,
    opacity: source.opacity,
    overflow: source.overflow,
    sizingMode: source.sizingMode,
    customWidth: source.customWidth,
    customHeight: source.customHeight,
  });
  return Object.fromEntries(Object.entries(styles).map(([province, style]) => {
    const appearance = style.appearance;
    if (!appearance || appearance.kind === "manual-color") return [province, style];
    return [province, {
      ...style,
      appearance: {
        ...appearance,
        fit: sourceLayout.fit,
        scale: sourceLayout.scale,
        opacity: sourceLayout.opacity,
        overflow: sourceLayout.overflow,
        sizingMode: sourceLayout.sizingMode,
        customWidth: sourceLayout.customWidth,
        customHeight: sourceLayout.customHeight,
      },
    }];
  }));
}

/**
 * @deprecated Pattern fills tile when scale < 1. Prefer provinceTextureBox + single <image>.
 * Kept for any residual callers; returns empty string (no pattern transform).
 */
export function texturePatternTransform(_scale: number): string {
  return "";
}

/**
 * Pixel layout for a single non-tiling texture image.
 * Anchors the image center on the province geometry centroid
 * when provided; otherwise falls back to the bounding-box center.
 *
 * scale multiplies the province bounds box (not a pattern tile). scale < 1 shrinks
 * one image — it never repeats.
 */
export function provinceTextureBox(
  bounds: [[number, number], [number, number]],
  layout: ProvinceTextureLayout,
  center?: [number, number] | null,
): ProvinceTextureBox {
  const [[x0, y0], [x1, y1]] = bounds;
  const boxWidth = Math.max(1, x1 - x0);
  const boxHeight = Math.max(1, y1 - y0);
  const scale = clampTextureScale(layout.scale, DEFAULT_TEXTURE_SCALE);
  const fallbackCx = x0 + boxWidth / 2;
  const fallbackCy = y0 + boxHeight / 2;
  const cx = center && Number.isFinite(center[0]) && Number.isFinite(center[1]) ? center[0] : fallbackCx;
  const cy = center && Number.isFinite(center[0]) && Number.isFinite(center[1]) ? center[1] : fallbackCy;

  let width: number;
  let height: number;

  if (layout.sizingMode === "custom") {
    width = layout.customWidth && layout.customWidth > 0 ? layout.customWidth : boxWidth * scale;
    height = layout.customHeight && layout.customHeight > 0 ? layout.customHeight : boxHeight * scale;
  } else if (layout.sizingMode === "natural") {
    const naturalW = Math.max(1, layout.naturalWidth ?? boxWidth);
    const naturalH = Math.max(1, layout.naturalHeight ?? boxHeight);
    const naturalAspect = naturalW / naturalH;
    const boxAspect = boxWidth / boxHeight;
    if (layout.fit === "contain") {
      if (naturalAspect > boxAspect) {
        width = boxWidth * scale;
        height = width / naturalAspect;
      } else {
        height = boxHeight * scale;
        width = height * naturalAspect;
      }
    } else {
      if (naturalAspect > boxAspect) {
        height = boxHeight * scale;
        width = height * naturalAspect;
      } else {
        width = boxWidth * scale;
        height = width / naturalAspect;
      }
    }
  } else {
    width = boxWidth * scale;
    height = boxHeight * scale;
  }

  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    cx,
    cy,
    mode: "single",
  };
}

/** @deprecated Use provinceTextureBox. Alias kept for older imports. */
export function overflowTextureBox(
  bounds: [[number, number], [number, number]],
  layout: ProvinceTextureLayout,
  center?: [number, number] | null,
): { x: number; y: number; width: number; height: number } {
  const box = provinceTextureBox(bounds, layout, center);
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}
