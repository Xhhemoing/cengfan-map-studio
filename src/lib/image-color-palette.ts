import type { ColorCluster } from "./image-color-clusters";
import {
  clamp,
  colorDistance,
  hexToRgb,
  labToLch,
  modifyColor,
  perceptualMix,
  rgbToOklab,
  smoothRange,
} from "./image-color-space";
import type { ImageThemeResult } from "./image-color-types";

/** Low-chroma, light background variants derived from the image's own palette. */
export function backgroundCandidates(identity: string, primary: string, supporting: string, mapBase: string, poster: string): string[] {
  const sources = [identity, primary, supporting, perceptualMix(identity, supporting, 0.5)];
  const candidates = sources.flatMap((source) => {
    const lch = labToLch(rgbToOklab(...hexToRgb(source)));
    return [0.89, 0.91, 0.93, 0.95].flatMap((l) => [0.18, 0.28, 0.38, 0.5].map((scale) =>
      modifyColor(source, { l, c: clamp(lch.c * scale, 0.018, 0.085) })))
      .concat(perceptualMix(source, poster, 0.15), perceptualMix(source, mapBase, 0.2));
  });
  return [...new Set(candidates)];
}

/** Picks the candidate that separates best from the subject while staying subtle. */
export function selectBackground(candidates: string[], clusters: ColorCluster[], identity: string, poster: string) {
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

export function fallbackResult(mapBaseColor: string, posterBackground: string, reason: string): ImageThemeResult {
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
