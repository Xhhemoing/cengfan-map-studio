import { clusterForegroundColors, extractForeground } from "./image-color-clusters";
import { backgroundCandidates, fallbackResult, selectBackground } from "./image-color-palette";
import {
  clamp,
  contrastRatio,
  DEFAULT_MAP_BASE,
  hexToRgb,
  labToHex,
  labToLch,
  modifyColor,
  perceptualMix,
  rgbToOklab,
} from "./image-color-space";
import type { ImageThemeOptions, ImageThemeResult } from "./image-color-types";

export type { ImageThemeDiagnostics, ImageThemeOptions, ImageThemeResult } from "./image-color-types";
export { representativeImageColor } from "./image-color-clusters";
export { optimizeNeighborThemeColors } from "./image-color-palette";

const DEFAULT_POSTER_BACKGROUND = "#fff9ed";

/** Derives the province theme (identity, background, outline, halo) from raw image pixels. */
export function inferImageTheme(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ImageThemeOptions = {},
): ImageThemeResult {
  const mapBaseColor = options.mapBaseColor ?? DEFAULT_MAP_BASE;
  const posterBackground = options.posterBackground ?? DEFAULT_POSTER_BACKGROUND;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || pixels.length < width * height * 4) {
    return fallbackResult(mapBaseColor, posterBackground, "图片像素数据无效");
  }
  const { features, coverage } = extractForeground(pixels, width, height);
  if (features.length < Math.max(6, Math.round(Math.min(width * height * 0.025, 24)))) {
    return fallbackResult(mapBaseColor, posterBackground, "有效前景像素不足");
  }

  const clusters = clusterForegroundColors(features);
  if (clusters.length === 0) return fallbackResult(mapBaseColor, posterBackground, "无法识别有效颜色");
  const identityCluster = clusters.find((cluster) => cluster.chroma >= 0.035 && cluster.outlineLikelihood < 0.72 && cluster.backgroundLikelihood < 0.78) ?? clusters[0]!;
  const primaryCluster = [...clusters].sort((a, b) => b.areaRatio - a.areaRatio)
    .find((cluster) => cluster.outlineLikelihood < 0.75 && cluster.backgroundLikelihood < 0.8) ?? identityCluster;
  const supportingCluster = clusters.find((cluster) => cluster !== identityCluster && cluster !== primaryCluster && cluster.outlineLikelihood < 0.65)
    ?? clusters.find((cluster) => cluster !== identityCluster)
    ?? identityCluster;
  const identityColor = labToHex(identityCluster.center);
  const primaryColor = labToHex(primaryCluster.center);
  const supportingColor = labToHex(supportingCluster.center);
  const selected = selectBackground(
    backgroundCandidates(identityColor, primaryColor, supportingColor, mapBaseColor, posterBackground),
    clusters,
    identityColor,
    posterBackground,
  );
  const candidateGap = clusters.length > 1 ? Math.max(0, clusters[0]!.score - clusters[1]!.score) : clusters[0]!.score;
  const confidence = clamp(0.3 * clamp(candidateGap / 0.25) + 0.25 * clamp(coverage / 0.25) + 0.2 * clamp(clusters.length / 4) + 0.25 * clamp(selected.score));
  const conservativeBackground = confidence < 0.3
    ? perceptualMix(selected.color, mapBaseColor, 0.35)
    : confidence < 0.5
      ? modifyColor(selected.color, { c: labToLch(rgbToOklab(...hexToRgb(selected.color))).c * 0.65 })
      : selected.color;
  const backgroundLch = labToLch(rgbToOklab(...hexToRgb(conservativeBackground)));
  const lightEdges = clusters.some((cluster) => cluster.center.l > 0.9 && cluster.areaRatio > 0.08);
  const haloColor = lightEdges
    ? modifyColor(conservativeBackground, { l: Math.max(0, backgroundLch.l - 0.04) })
    : perceptualMix(conservativeBackground, "#ffffff", 0.15);

  return {
    primaryColor,
    identityColor,
    supportingColor,
    backgroundColor: conservativeBackground,
    outlineColor: modifyColor(identityColor, { l: Math.max(0.25, backgroundLch.l - 0.28), c: Math.min(0.08, labToLch(identityCluster.center).c * 0.65) }),
    haloColor,
    confidence,
    diagnostics: {
      foregroundCoverage: coverage,
      subjectContrast: selected.subjectContrast,
      edgeContrast: selected.edgeContrast,
      grayscaleSeparation: clamp((contrastRatio(identityColor, conservativeBackground) - 1) / 4),
      camouflageRisk: selected.camouflageRisk,
    },
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

export async function extractImageTheme(src: string, options: ImageThemeOptions = {}): Promise<ImageThemeResult> {
  const image = await loadImage(src);
  const sourceWidth = Math.max(1, image.naturalWidth || image.width);
  const sourceHeight = Math.max(1, image.naturalHeight || image.height);
  const scale = Math.min(1, 256 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取图片颜色");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return inferImageTheme(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, options);
}

export async function extractImageColor(src: string, options: ImageThemeOptions = {}): Promise<string | null> {
  return (await extractImageTheme(src, options)).backgroundColor;
}
