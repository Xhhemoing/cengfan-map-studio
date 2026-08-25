/**
 * Rail-aware move generation for the connector-crossing repair.
 *
 * Side packing leaves the board as a handful of *rails*: runs of cards that
 * share a side and a lane, stacked along one axis. Most residual crossings are
 * an order inversion inside such a run — the cards sit in a different order
 * than their anchors do — and the pairwise moves in `card-layout-uncross.ts`
 * cannot undo those: exchanging two cards of unequal height by centre leaves
 * one of them overlapping a neighbour, so the candidate is rejected as illegal
 * before its lower crossing count is ever seen.
 *
 * The moves here reorder a whole rail and re-pack it contiguously from its
 * current head, which keeps every card in the lane its mode chose while
 * letting the order change freely. The caller still validates and scores the
 * result, so a reorder that would overlap something outside the rail is
 * discarded like any other candidate.
 */

import { EPSILON, type CardPlacement, type CardSide } from "./card-layout-types";

export interface RailMove {
  index: number;
  x: number;
  y: number;
}

export interface Rail {
  /** Card indices in current packing order along the rail. */
  members: number[];
  /** `left`/`right` rails stack vertically; `top`/`bottom` rails run across. */
  vertical: boolean;
}

const SIDES: CardSide[] = ["left", "right", "top", "bottom"];

function alongStart(card: CardPlacement, vertical: boolean): number {
  return vertical ? card.y : card.x;
}

function alongSize(card: CardPlacement, vertical: boolean): number {
  return vertical ? card.height : card.width;
}

function acrossStart(card: CardPlacement, vertical: boolean): number {
  return vertical ? card.x : card.y;
}

function acrossSize(card: CardPlacement, vertical: boolean): number {
  return vertical ? card.width : card.height;
}

/** Where the connector leaves the anchor's side of the card, along the rail axis. */
function anchorKey(card: CardPlacement, vertical: boolean): number {
  return vertical ? card.anchorY : card.anchorX;
}

/**
 * Split one side's cards into lanes.
 *
 * Two cards belong to the same lane when their extents across the rail overlap,
 * chained through the sorted order. Overlapping across the rail is exactly the
 * condition that forces them to be separated along it, so a lane is the set of
 * cards whose order genuinely competes for the same run of space.
 */
function laneGroups(cards: readonly CardPlacement[], indices: number[], vertical: boolean): number[][] {
  const sorted = [...indices].sort((left, right) =>
    acrossStart(cards[left]!, vertical) - acrossStart(cards[right]!, vertical));
  const lanes: number[][] = [];
  let lane: number[] = [];
  let laneEnd = -Infinity;
  for (const index of sorted) {
    const card = cards[index]!;
    const start = acrossStart(card, vertical);
    if (lane.length > 0 && start >= laneEnd - EPSILON) {
      lanes.push(lane);
      lane = [];
      laneEnd = -Infinity;
    }
    lane.push(index);
    laneEnd = Math.max(laneEnd, start + acrossSize(card, vertical));
  }
  if (lane.length > 0) lanes.push(lane);
  return lanes.map((members) => members.sort((left, right) =>
    alongStart(cards[left]!, vertical) - alongStart(cards[right]!, vertical)));
}

/** Every rail on the board, plus the `card index → rail index` lookup (`-1` for singletons). */
export function buildRails(cards: readonly CardPlacement[]): { rails: Rail[]; railOf: Int32Array } {
  const railOf = new Int32Array(cards.length).fill(-1);
  const rails: Rail[] = [];
  for (const side of SIDES) {
    const indices: number[] = [];
    for (let index = 0; index < cards.length; index += 1) {
      if (cards[index]!.side === side) indices.push(index);
    }
    if (indices.length < 2) continue;
    const vertical = side === "left" || side === "right";
    for (const members of laneGroups(cards, indices, vertical)) {
      if (members.length < 2) continue;
      const rail = rails.length;
      for (const index of members) railOf[index] = rail;
      rails.push({ members, vertical });
    }
  }
  return { rails, railOf };
}

/**
 * Lay `order` out contiguously from `start`, one `gap` apart.
 *
 * Contiguous packing is the tightest arrangement of the same cards, so a run
 * re-packed from its own head never grows past the span it already occupies;
 * only the cards whose coordinate actually changes get a move.
 */
function packOrder(
  cards: readonly CardPlacement[],
  vertical: boolean,
  order: readonly number[],
  start: number,
  gap: number,
): RailMove[] {
  let cursor = start;
  const moves: RailMove[] = [];
  for (const index of order) {
    const card = cards[index]!;
    if (Math.abs(alongStart(card, vertical) - cursor) > EPSILON) {
      moves.push(vertical ? { index, x: card.x, y: cursor } : { index, x: cursor, y: card.y });
    }
    cursor += alongSize(card, vertical) + gap;
  }
  return moves;
}

/** The orders tried for a run: exchange its two ends, or send either end to the other. */
function windowOrders(members: readonly number[]): number[][] {
  const last = members.length - 1;
  if (last < 1) return [];
  const swapped = [...members];
  [swapped[0], swapped[last]] = [swapped[last]!, swapped[0]!];
  const orders = [swapped];
  if (last > 1) {
    orders.push([...members.slice(1), members[0]!], [members[last]!, ...members.slice(0, last)]);
  }
  return orders;
}

/**
 * Reorderings of `rail` worth trying for a crossing between `left` and `right`.
 *
 * The window orders come first: they only touch the run between the two
 * crossing cards, so they re-pack inside a span the rail already owns and leave
 * the rest of the lane exactly where its mode put it. The anchor-sorted whole
 * rail follows as the aggressive option — it is the one arrangement with no
 * intra-rail inversion left at all, at the cost of shifting every card in the
 * lane.
 */
export function railReorderMoves(
  cards: readonly CardPlacement[],
  rail: Rail,
  gap: number,
  left: number,
  right: number,
  includeWholeRail: boolean,
): RailMove[][] {
  const first = rail.members.indexOf(left);
  const second = rail.members.indexOf(right);
  if (first < 0 || second < 0) return [];
  const vertical = rail.vertical;
  const from = Math.min(first, second);
  const window = rail.members.slice(from, Math.max(first, second) + 1);
  const windowStart = alongStart(cards[window[0]!]!, vertical);
  const railStart = alongStart(cards[rail.members[0]!]!, vertical);
  const byAnchor = [...rail.members].sort((a, b) =>
    anchorKey(cards[a]!, vertical) - anchorKey(cards[b]!, vertical));

  const candidates: RailMove[][] = [];
  for (const order of windowOrders(window)) {
    const moves = packOrder(cards, vertical, order, windowStart, gap);
    if (moves.length > 0) candidates.push(moves);
  }
  if (!includeWholeRail) return candidates;
  const sorted = packOrder(cards, vertical, byAnchor, railStart, gap);
  if (sorted.length > 0) candidates.push(sorted);
  return candidates;
}
