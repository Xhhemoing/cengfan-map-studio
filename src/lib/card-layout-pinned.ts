/**
 * Manually placed cards as fixed obstacles for the auto-layout solve.
 *
 * A card the user dragged is authoritative: the renderer draws it at the saved
 * coordinate whatever the solver returns. Without this module the solver never
 * hears about that coordinate, keeps handing it out as free canvas, and the
 * next solve parks another card on top of the one just placed.
 *
 * The fix is to take those cards out of the solve entirely and put their
 * rectangles into the protected zones instead, so every remaining card packs
 * around them under the same clearance rules that separate two solved cards.
 * The pinned coordinates are used exactly as given — clamping them would move a
 * card the user positioned deliberately, and would also disagree with what the
 * canvas actually draws.
 */
import { finiteOr, sideForPlacement } from "./card-layout-geometry";
import { orderResult } from "./card-layout-pack";
import { normalizeBounds, protectedZones } from "./card-layout-space";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPlacement,
  type CardPoint,
} from "./card-layout-types";

export interface PinnedCardPlan {
  /** Solver bounds with every pinned card added as a protected rectangle. */
  bounds: CardLayoutBounds;
  /** Cards the solver still has to place, in input order. */
  free: CardLayoutInput[];
  /** One slot per input card, in input order: the pinned placement, or `null`. */
  slots: (CardPlacement | null)[];
}

function pinnedPoint(
  positions: Readonly<Record<string, CardPoint>>,
  id: string,
): CardPoint | null {
  const point = positions[id];
  if (!point) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}

/**
 * Split the roster into pinned and free cards.
 *
 * Returns `null` when nothing is pinned, so the ordinary solve keeps running on
 * the caller's own bounds object and produces byte-identical results.
 */
export function planPinnedCards(
  cards: readonly CardLayoutInput[],
  bounds: CardLayoutBounds,
  positions: Readonly<Record<string, CardPoint>> | undefined,
): PinnedCardPlan | null {
  if (!positions) return null;
  const normalized = normalizeBounds(bounds);
  const free: CardLayoutInput[] = [];
  const slots: (CardPlacement | null)[] = [];
  const reserved: CardArea[] = [];
  for (const card of cards) {
    const point = pinnedPoint(positions, card.id);
    if (!point) {
      free.push(card);
      slots.push(null);
      continue;
    }
    const area: CardArea = {
      x: point.x,
      y: point.y,
      width: Math.max(0, finiteOr(card.width, 0)),
      height: Math.max(0, finiteOr(card.height, 0)),
    };
    reserved.push(area);
    slots.push({ ...card, x: area.x, y: area.y, side: sideForPlacement(area, normalized.map) });
  }
  if (reserved.length === 0) return null;
  return {
    // `protectedZones` is resolved first so the map-frame fallback is not lost
    // by the act of naming an explicit `occupiedAreas` list.
    bounds: { ...normalized, occupiedAreas: [...protectedZones(normalized), ...reserved] },
    free,
    slots,
  };
}

/** Weave the solved free cards back between the pinned ones, in input order. */
export function mergePinnedCards(
  plan: PinnedCardPlan,
  solved: readonly CardPlacement[],
): CardPlacement[] {
  const placed = orderResult(plan.free, solved);
  let cursor = 0;
  return plan.slots.map((slot) => {
    if (slot) return slot;
    const placement = placed[cursor]!;
    cursor += 1;
    return placement;
  });
}
