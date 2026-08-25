/**
 * Drag-time layout repair.
 *
 * `solveCardLayout` re-derives the whole board and is far too heavy to run on
 * every pointer event. Once a card is dropped we only need a local fix: pin the
 * dragged card where the user left it and slide the cards it now covers out of
 * the way along their own track axis. The pass is a bounded number of sweeps,
 * so it stays O(rounds · n²) on a handful of cards and never backtracks.
 */

import {
  clampCardPosition,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutOptions,
  type CardPlacement,
} from "./card-layout";

export interface CardLayoutAdaptOptions extends CardLayoutOptions {
  /** Upper bound on push sweeps. Local repair, not a solve; defaults to 8. */
  maxRounds?: number;
}

type Axis = "x" | "y";

const DEFAULT_MAX_ROUNDS = 8;

function overlapsWithGap(left: CardArea, right: CardArea, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

function centerDistance(left: CardArea, right: CardArea): number {
  return Math.hypot(
    left.x + left.width / 2 - (right.x + right.width / 2),
    left.y + left.height / 2 - (right.y + right.height / 2),
  );
}

/** The card's track axis: side rails slide vertically, top/bottom rails slide horizontally. */
function trackAxis(placement: CardPlacement): Axis {
  return placement.side === "top" || placement.side === "bottom" ? "x" : "y";
}

/** Both ways out of a blocker along one axis, cheapest move first. */
function axisEscapes(
  card: CardPlacement,
  blocker: CardArea,
  gap: number,
  axis: Axis,
): Array<{ x: number; y: number }> {
  const forward = axis === "y"
    ? { x: card.x, y: blocker.y + blocker.height + gap }
    : { x: blocker.x + blocker.width + gap, y: card.y };
  const backward = axis === "y"
    ? { x: card.x, y: blocker.y - gap - card.height }
    : { x: blocker.x - gap - card.width, y: card.y };
  const cost = (candidate: { x: number; y: number }) =>
    axis === "y" ? Math.abs(candidate.y - card.y) : Math.abs(candidate.x - card.x);
  return [forward, backward].sort((left, right) =>
    cost(left) - cost(right) || left.y - right.y || left.x - right.x);
}

/**
 * Nearest position that clears `blocker`, preferring the card's own track axis
 * and falling back to the cross axis when the canvas leaves no room. Every
 * candidate goes through {@link clampCardPosition}, so protected geography and
 * the canvas margin are respected exactly like a manual drag.
 */
function escapeBlocker(
  card: CardPlacement,
  blocker: CardArea,
  gap: number,
  bounds: CardLayoutBounds,
): { x: number; y: number } | null {
  const primary = trackAxis(card);
  const candidates = [
    ...axisEscapes(card, blocker, gap, primary),
    ...axisEscapes(card, blocker, gap, primary === "x" ? "y" : "x"),
  ];
  for (const candidate of candidates) {
    const clamped = clampCardPosition(
      { x: candidate.x, y: candidate.y, width: card.width, height: card.height },
      bounds,
    );
    const area: CardArea = { ...clamped, width: card.width, height: card.height };
    if (!overlapsWithGap(area, blocker, gap)) return clamped;
  }
  return null;
}

/**
 * Move one card to `nextPosition` and let its neighbours give way.
 *
 * The moved card is clamped exactly as a manual drag would clamp it and then
 * never moves again; every other card keeps its identity and order in the
 * returned array. Cards that cannot escape within the round budget are left
 * where they are rather than thrown somewhere arbitrary.
 */
export function adaptCardLayout(
  placements: CardPlacement[],
  movedId: string,
  nextPosition: { x: number; y: number },
  bounds: CardLayoutBounds,
  options: CardLayoutAdaptOptions = {},
): CardPlacement[] {
  const working = placements.map((placement) => ({ ...placement }));
  const movedIndex = working.findIndex((placement) => placement.id === movedId);
  if (movedIndex < 0) return working;

  const moved = working[movedIndex]!;
  const target = clampCardPosition(
    { x: nextPosition.x, y: nextPosition.y, width: moved.width, height: moved.height },
    bounds,
  );
  moved.x = target.x;
  moved.y = target.y;
  if (working.length < 2) return working;

  const gap = Number.isFinite(bounds.gap) ? Math.max(0, bounds.gap) : 0;
  const rounds = Math.max(1, Math.min(32, Math.floor(options.maxRounds ?? DEFAULT_MAX_ROUNDS)));
  // Nearest neighbours settle first, so a push chain propagates outward from
  // the drop point instead of rippling back into it.
  const queue = working
    .map((placement, index) => ({ placement, index }))
    .filter(({ index }) => index !== movedIndex)
    .sort((left, right) =>
      centerDistance(left.placement, moved) - centerDistance(right.placement, moved)
      || left.index - right.index)
    .map(({ index }) => index);

  for (let round = 0; round < rounds; round += 1) {
    let changed = false;
    for (const index of queue) {
      const card = working[index]!;
      const blocker = working.find((other, otherIndex) =>
        otherIndex !== index && overlapsWithGap(card, other, gap));
      if (!blocker) continue;
      const escape = escapeBlocker(card, blocker, gap, bounds);
      if (!escape || (escape.x === card.x && escape.y === card.y)) continue;
      card.x = escape.x;
      card.y = escape.y;
      changed = true;
    }
    if (!changed) break;
  }

  return working;
}
