export interface ImageThemeDiagnostics {
  fallbackUsed?: boolean;
  reason?: string;
  foregroundCoverage?: number;
  subjectContrast?: number;
  edgeContrast?: number;
  grayscaleSeparation?: number;
  camouflageRisk?: number;
  neighborAdjusted?: boolean;
  neighborConflicts?: string[];
}

export interface ImageThemeResult {
  primaryColor: string | null;
  identityColor: string | null;
  supportingColor: string | null;
  backgroundColor: string;
  outlineColor: string;
  haloColor: string;
  confidence: number;
  diagnostics: ImageThemeDiagnostics;
}

export interface ImageThemeOptions {
  mapBaseColor?: string;
  posterBackground?: string;
}

interface Oklab {
  l: number;
  a: number;
  b: number;
}

interface Oklch {
  l: number;
  c: number;
  h: number;
}

interface PixelFeature {
  lab: Oklab;
  x: number;
  y: number;
  weight: number;
}

interface ColorCluster {
  center: Oklab;
  weight: number;
  count: number;
  spread: number;
  centerCoverage: number;
  areaRatio: number;
  chroma: number;
  outlineLikelihood: number;
  backgroundLikelihood: number;
  identityLikelihood: number;
  score: number;
}

const DEFAULT_MAP_BASE = "#d6d3c2";
const DEFAULT_POSTER_BACKGROUND = "#fff9ed";
const ALPHA_THRESHOLD = 0.15;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function channelHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_MAP_BASE;
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number];
}

function srgbToLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  return clamp(value) * 255;
}

function rgbToOklab(red: number, green: number, blue: number): Oklab {
  const r = srgbToLinear(red);
  const g = srgbToLinear(green);
  const b = srgbToLinear(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToRgb(lab: Oklab): [number, number, number] {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function labToLch(lab: Oklab): Oklch {
  const h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), h: h < 0 ? h + 360 : h };
}

function lchToLab(lch: Oklch): Oklab {
  const radians = lch.h * Math.PI / 180;
  return { l: lch.l, a: lch.c * Math.cos(radians), b: lch.c * Math.sin(radians) };
}

function labToHex(lab: Oklab): string {
  return rgbToHex(...oklabToRgb(lab));
}

function colorDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function smoothRange(value: number, minimum: number, maximum: number, softness: number): number {
  if (value >= minimum && value <= maximum) return 1;
  const distance = value < minimum ? minimum - value : value - maximum;
  return clamp(1 - distance / softness);
}

function perceptualMix(first: string, second: string, firstRatio: number): string {
  const firstLab = rgbToOklab(...hexToRgb(first));
  const secondLab = rgbToOklab(...hexToRgb(second));
  const ratio = clamp(firstRatio);
  return labToHex({
    l: firstLab.l * ratio + secondLab.l * (1 - ratio),
    a: firstLab.a * ratio + secondLab.a * (1 - ratio),
    b: firstLab.b * ratio + secondLab.b * (1 - ratio),
  });
}

function modifyColor(color: string, patch: Partial<Oklch>): string {
  const lch = labToLch(rgbToOklab(...hexToRgb(color)));
  return labToHex(lchToLab({
    l: clamp(patch.l ?? lch.l),
    c: clamp(patch.c ?? lch.c, 0, 0.4),
    h: ((patch.h ?? lch.h) + 360) % 360,
  }));
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexToRgb(color).map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function representativeImageColor(pixels: Uint8ClampedArray): string | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] / 255;
    if (alpha < 0.08) continue;
    red += pixels[offset] * alpha;
    green += pixels[offset + 1] * alpha;
    blue += pixels[offset + 2] * alpha;
    weight += alpha;
  }

  if (weight === 0) return null;
  return rgbToHex(red / weight, green / weight, blue / weight);
}

function estimateBoundaryBackground(pixels: Uint8ClampedArray, width: number, height: number): Oklab | null {
  const samples: Oklab[] = [];
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if ((pixels[offset + 3] ?? 0) / 255 < ALPHA_THRESHOLD) return;
    samples.push(rgbToOklab(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0));
  };
  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }
  if (samples.length < Math.max(3, Math.round((width + height) * 0.15))) return null;
  const seed = samples.reduce((best, sample) => {
    const neighbors = samples.filter((candidate) => colorDistance(candidate, sample) < 0.055).length;
    return neighbors > best.neighbors ? { sample, neighbors } : best;
  }, { sample: samples[0]!, neighbors: 0 });
  if (seed.neighbors / samples.length < 0.4) return null;
  const matching = samples.filter((sample) => colorDistance(sample, seed.sample) < 0.055);
  const sum = matching.reduce(
    (total, sample) => ({ l: total.l + sample.l, a: total.a + sample.a, b: total.b + sample.b }),
    { l: 0, a: 0, b: 0 },
  );
  return { l: sum.l / matching.length, a: sum.a / matching.length, b: sum.b / matching.length };
}

function extractForeground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { features: PixelFeature[]; coverage: number } {
  const boundaryBackground = estimateBoundaryBackground(pixels, width, height);
  const features: PixelFeature[] = [];
  const maximumSamples = 4000;
  const stride = Math.max(1, Math.ceil(Math.sqrt(width * height / maximumSamples)));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const alpha = (pixels[offset + 3] ?? 0) / 255;
      if (alpha < ALPHA_THRESHOLD) continue;
      const lab = rgbToOklab(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
      const lch = labToLch(lab);
      const onBoundary = x < stride || y < stride || x >= width - stride || y >= height - stride;
      const nearWhite = lch.l > 0.96 && lch.c < 0.025;
      const backgroundLike = boundaryBackground && colorDistance(lab, boundaryBackground) < 0.055;
      if ((nearWhite || backgroundLike) && onBoundary) continue;
      if (backgroundLike) continue;
      const normalizedX = (x + 0.5) / width - 0.5;
      const normalizedY = (y + 0.5) / height - 0.5;
      const centerWeight = 1 + 0.35 * clamp(1 - Math.hypot(normalizedX, normalizedY) / 0.7);
      const alphaWeight = clamp((alpha - ALPHA_THRESHOLD) / (1 - ALPHA_THRESHOLD));
      features.push({ lab, x: (x + 0.5) / width, y: (y + 0.5) / height, weight: alphaWeight * centerWeight });
    }
  }
  return { features, coverage: features.length * stride * stride / Math.max(1, width * height) };
}

function weightedKMeans(features: PixelFeature[], k: number): ColorCluster[] {
  const centers: Oklab[] = [features.reduce((best, feature) => feature.weight > best.weight ? feature : best).lab];
  while (centers.length < k) {
    const next = features.reduce((best, feature) => {
      const distance = Math.min(...centers.map((center) => colorDistance(feature.lab, center)));
      const score = distance * distance * feature.weight;
      return score > best.score ? { feature, score } : best;
    }, { feature: features[0]!, score: -1 });
    if (next.score < 0.00001) break;
    centers.push(next.feature.lab);
  }

  let assignments = new Array<number>(features.length).fill(0);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    assignments = features.map((feature) => centers.reduce((bestIndex, center, index) =>
      colorDistance(feature.lab, center) < colorDistance(feature.lab, centers[bestIndex]!) ? index : bestIndex, 0));
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, weight: 0 }));
    features.forEach((feature, index) => {
      const sum = sums[assignments[index]!]!;
      sum.l += feature.lab.l * feature.weight;
      sum.a += feature.lab.a * feature.weight;
      sum.b += feature.lab.b * feature.weight;
      sum.weight += feature.weight;
    });
    centers.forEach((center, index) => {
      const sum = sums[index]!;
      if (sum.weight > 0) centers[index] = { l: sum.l / sum.weight, a: sum.a / sum.weight, b: sum.b / sum.weight };
      else centers[index] = center;
    });
  }

  const totalWeight = features.reduce((sum, feature) => sum + feature.weight, 0);
  return centers.map((center, clusterIndex) => {
    const members = features.filter((_, index) => assignments[index] === clusterIndex);
    const weight = members.reduce((sum, member) => sum + member.weight, 0);
    const meanX = members.reduce((sum, member) => sum + member.x * member.weight, 0) / Math.max(weight, 0.001);
    const meanY = members.reduce((sum, member) => sum + member.y * member.weight, 0) / Math.max(weight, 0.001);
    const spread = members.reduce((sum, member) => sum + Math.hypot(member.x - meanX, member.y - meanY) * member.weight, 0) / Math.max(weight, 0.001);
    const centerCoverage = members.filter((member) => Math.hypot(member.x - 0.5, member.y - 0.5) < 0.28).reduce((sum, member) => sum + member.weight, 0) / Math.max(weight, 0.001);
    const areaRatio = weight / Math.max(totalWeight, 0.001);
    const lch = labToLch(center);
    const outlineLikelihood = clamp(0.65 * (1 - lch.l) + 0.25 * smoothRange(areaRatio, 0, 0.18, 0.2) - 0.2 * areaRatio);
    const backgroundLikelihood = clamp(0.45 * areaRatio + 0.3 * smoothRange(lch.c, 0, 0.035, 0.08) + 0.25 * smoothRange(lch.l, 0.86, 1, 0.2));
    const identityLikelihood = clamp(
      0.23 * smoothRange(areaRatio, 0.08, 0.45, 0.25)
      + 0.25 * smoothRange(lch.c, 0.05, 0.22, 0.12)
      + 0.17 * smoothRange(lch.l, 0.35, 0.82, 0.25)
      + 0.18 * clamp(spread / 0.3)
      + 0.17 * centerCoverage
      - 0.3 * outlineLikelihood
      - 0.3 * backgroundLikelihood,
    );
    const score = clamp(
      0.22 * smoothRange(areaRatio, 0.08, 0.4, 0.25)
      + 0.22 * smoothRange(lch.c, 0.04, 0.2, 0.12)
      + 0.12 * smoothRange(lch.l, 0.35, 0.85, 0.25)
      + 0.18 * clamp(spread / 0.3)
      + 0.26 * identityLikelihood
      - 0.24 * outlineLikelihood
      - 0.24 * backgroundLikelihood,
    );
    return { center, weight, count: members.length, spread, centerCoverage, areaRatio, chroma: lch.c, outlineLikelihood, backgroundLikelihood, identityLikelihood, score };
  }).filter((cluster) => cluster.count > 0).sort((a, b) => b.score - a.score);
}

function mergeSimilarClusters(clusters: ColorCluster[]): ColorCluster[] {
  const result = [...clusters];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let first = 0; first < result.length; first += 1) {
      for (let second = first + 1; second < result.length; second += 1) {
        if (colorDistance(result[first]!.center, result[second]!.center) >= 0.035) continue;
        const a = result[first]!;
        const b = result[second]!;
        const weight = a.weight + b.weight;
        result.splice(second, 1);
        result.splice(first, 1, {
          ...a,
          center: {
            l: (a.center.l * a.weight + b.center.l * b.weight) / weight,
            a: (a.center.a * a.weight + b.center.a * b.weight) / weight,
            b: (a.center.b * a.weight + b.center.b * b.weight) / weight,
          },
          weight,
          count: a.count + b.count,
          areaRatio: a.areaRatio + b.areaRatio,
          score: Math.max(a.score, b.score),
        });
        merged = true;
        break outer;
      }
    }
  }
  return result.sort((a, b) => b.score - a.score);
}

function backgroundCandidates(identity: string, primary: string, supporting: string, mapBase: string, poster: string): string[] {
  const sources = [identity, primary, supporting, perceptualMix(identity, supporting, 0.5)];
  const candidates = sources.flatMap((source) => {
    const lch = labToLch(rgbToOklab(...hexToRgb(source)));
    return [0.89, 0.91, 0.93, 0.95].flatMap((l) => [0.18, 0.28, 0.38, 0.5].map((scale) =>
      modifyColor(source, { l, c: clamp(lch.c * scale, 0.018, 0.085) })))
      .concat(perceptualMix(source, poster, 0.15), perceptualMix(source, mapBase, 0.2));
  });
  return [...new Set(candidates)];
}

function selectBackground(candidates: string[], clusters: ColorCluster[], identity: string, poster: string) {
  const identityLab = rgbToOklab(...hexToRgb(identity));
  const posterLab = rgbToOklab(...hexToRgb(poster));
  return candidates.reduce((best, color) => {
    const lab = rgbToOklab(...hexToRgb(color));
    const weightedSeparation = clusters.reduce((sum, cluster) => sum + colorDistance(cluster.center, lab) * cluster.areaRatio, 0);
    const closestDistance = Math.min(...clusters.map((cluster) => colorDistance(cluster.center, lab)));
    const subjectContrast = clamp(weightedSeparation / 0.35);
    const edgeContrast = clamp(closestDistance / 0.18);
    const harmony = clamp(1 - Math.abs(labToLch(lab).h - labToLch(identityLab).h) / 120);
    const posterHarmony = clamp(1 - colorDistance(lab, posterLab) / 0.25);
    const subtlety = smoothRange(lab.l, 0.88, 0.96, 0.1) * smoothRange(labToLch(lab).c, 0.015, 0.09, 0.08);
    const camouflageRisk = clamp((0.11 - closestDistance) / 0.11);
    const score = 0.28 * subjectContrast + 0.2 * edgeContrast + 0.16 * harmony + 0.12 * posterHarmony + 0.14 * subtlety - 0.22 * camouflageRisk;
    return score > best.score ? { color, score, subjectContrast, edgeContrast, camouflageRisk } : best;
  }, { color: candidates[0]!, score: -Infinity, subjectContrast: 0, edgeContrast: 0, camouflageRisk: 1 });
}

function fallbackResult(mapBaseColor: string, posterBackground: string, reason: string): ImageThemeResult {
  const backgroundColor = perceptualMix(mapBaseColor, posterBackground, 0.35);
  return {
    primaryColor: null,
    identityColor: null,
    supportingColor: null,
    backgroundColor,
    outlineColor: modifyColor(backgroundColor, { l: Math.max(0, labToLch(rgbToOklab(...hexToRgb(backgroundColor))).l - 0.18) }),
    haloColor: posterBackground,
    confidence: 0,
    diagnostics: { fallbackUsed: true, reason },
  };
}

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

  const clusterCount = Math.min(6, Math.max(3, Math.round(Math.sqrt(features.length / 20)) + 2));
  const clusters = mergeSimilarClusters(weightedKMeans(features, clusterCount));
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

function neighborAlternatives(color: string): string[] {
  const lch = labToLch(rgbToOklab(...hexToRgb(color)));
  return [
    modifyColor(color, { l: clamp(lch.l + 0.025) }),
    modifyColor(color, { l: clamp(lch.l - 0.025) }),
    modifyColor(color, { c: clamp(lch.c + 0.015, 0.015, 0.1) }),
    modifyColor(color, { c: clamp(lch.c - 0.015, 0.015, 0.1) }),
    modifyColor(color, { h: lch.h + 8 }),
    modifyColor(color, { h: lch.h - 8 }),
    modifyColor(color, { h: lch.h + 15 }),
    modifyColor(color, { h: lch.h - 15 }),
  ];
}

export function optimizeNeighborThemeColors(
  results: Record<string, ImageThemeResult>,
  adjacency: Record<string, readonly string[]>,
): Record<string, ImageThemeResult> {
  const optimized = Object.fromEntries(Object.entries(results).map(([province, result]) => [province, {
    ...result,
    diagnostics: { ...result.diagnostics },
  }])) as Record<string, ImageThemeResult>;
  const processed = new Set<string>();
  for (let iteration = 0; iteration < 12; iteration += 1) {
    let changed = false;
    for (const [province, neighbors] of Object.entries(adjacency)) {
      for (const neighbor of neighbors) {
        const edgeKey = [province, neighbor].sort().join("|");
        if (processed.has(edgeKey)) continue;
        processed.add(edgeKey);
        const first = optimized[province];
        const second = optimized[neighbor];
        if (!first || !second) continue;
        const distance = colorDistance(rgbToOklab(...hexToRgb(first.backgroundColor)), rgbToOklab(...hexToRgb(second.backgroundColor)));
        if (distance >= 0.045) continue;
        const targetProvince = first.confidence <= second.confidence ? province : neighbor;
        const otherProvince = targetProvince === province ? neighbor : province;
        const target = optimized[targetProvince]!;
        const other = optimized[otherProvince]!;
        const alternatives = neighborAlternatives(target.backgroundColor);
        const replacement = alternatives.reduce((best, candidate) => {
          const candidateLab = rgbToOklab(...hexToRgb(candidate));
          const collision = colorDistance(candidateLab, rgbToOklab(...hexToRgb(other.backgroundColor)));
          const deviation = colorDistance(candidateLab, rgbToOklab(...hexToRgb(target.backgroundColor)));
          const score = collision - deviation * 0.35;
          return score > best.score ? { color: candidate, score } : best;
        }, { color: target.backgroundColor, score: distance });
        if (replacement.color !== target.backgroundColor) {
          optimized[targetProvince] = {
            ...target,
            backgroundColor: replacement.color,
            diagnostics: {
              ...target.diagnostics,
              neighborAdjusted: true,
              neighborConflicts: [...new Set([...(target.diagnostics.neighborConflicts ?? []), otherProvince])],
            },
          };
          changed = true;
        }
      }
    }
    if (!changed) break;
    processed.clear();
  }
  return optimized;
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