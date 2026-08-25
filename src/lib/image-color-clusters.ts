import { clamp, colorDistance, labToLch, rgbToHex, rgbToOklab, smoothRange, type Oklab } from "./image-color-space";

export interface PixelFeature {
  lab: Oklab;
  x: number;
  y: number;
  weight: number;
}

export interface ColorCluster {
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

const ALPHA_THRESHOLD = 0.15;

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

export function extractForeground(
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

/** Groups the sampled foreground pixels into merged, score-sorted color clusters. */
export function clusterForegroundColors(features: PixelFeature[]): ColorCluster[] {
  const clusterCount = Math.min(6, Math.max(3, Math.round(Math.sqrt(features.length / 20)) + 2));
  return mergeSimilarClusters(weightedKMeans(features, clusterCount));
}
