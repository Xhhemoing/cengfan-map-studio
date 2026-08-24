import type { CardLayoutBounds, CardPlacement } from "./card-layout";

export interface LayoutInvariantOptions {
  /**
   * Check the solver's card-to-card gap guarantee. Dense fallback layouts may
   * deliberately relax this guarantee, so callers opt in when it applies.
   */
  checkOverlaps?: boolean;
  /**
   * Check that cards in the same geographic anchor cluster remain on one side.
   * Saturated fallback layouts may split clusters, so callers opt in only when
   * the fixture has enough room for a cohesive result.
   */
  checkSameAnchorClusters?: boolean;
}

const EPSILON = 1e-7;

function rectanglesOverlap(left: CardPlacement, right: CardPlacement, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function sameAnchorCluster(left: CardPlacement, right: CardPlacement): boolean {
  const tolerance = Math.max(24, Math.min(left.width, left.height, right.width, right.height) * 0.35);
  return Math.hypot(left.anchorX - right.anchorX, left.anchorY - right.anchorY) <= tolerance;
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite; received ${String(value)}`);
}

/**
 * Guards the layout properties that benchmark timing alone cannot detect.
 * This intentionally duplicates the public rectangle checks rather than
 * coupling probes to private solver helpers.
 */
export function assertLayoutInvariants(
  placements: readonly CardPlacement[],
  bounds: CardLayoutBounds,
  options: LayoutInvariantOptions = {},
): void {
  assertFinite("bounds.width", bounds.width);
  assertFinite("bounds.height", bounds.height);
  assertFinite("bounds.margin", bounds.margin);
  assertFinite("bounds.gap", bounds.gap);

  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin;
  const maxY = bounds.height - bounds.margin;

  for (const [index, placement] of placements.entries()) {
    const prefix = `placements[${index}] (${placement.id})`;
    assertFinite(`${prefix}.anchorX`, placement.anchorX);
    assertFinite(`${prefix}.anchorY`, placement.anchorY);
    assertFinite(`${prefix}.width`, placement.width);
    assertFinite(`${prefix}.height`, placement.height);
    assertFinite(`${prefix}.x`, placement.x);
    assertFinite(`${prefix}.y`, placement.y);

    if (placement.width <= 0 || placement.height <= 0) {
      throw new Error(`${prefix} must have positive dimensions`);
    }
    if (placement.x < minX - EPSILON
      || placement.y < minY - EPSILON
      || placement.x + placement.width > maxX + EPSILON
      || placement.y + placement.height > maxY + EPSILON) {
      throw new Error(`${prefix} is outside the canvas margin`);
    }
  }

  if (options.checkOverlaps) {
    for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
        const left = placements[leftIndex]!;
        const right = placements[rightIndex]!;
        if (rectanglesOverlap(left, right, bounds.gap)) {
          throw new Error(`placements overlap: ${left.id} and ${right.id}`);
        }
      }
    }
  }

  if (!options.checkSameAnchorClusters) return;
  for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
      const left = placements[leftIndex]!;
      const right = placements[rightIndex]!;
      if (sameAnchorCluster(left, right) && left.side !== right.side) {
        throw new Error(`same-anchor cluster split across sides: ${left.id} and ${right.id}`);
      }
    }
  }
}
