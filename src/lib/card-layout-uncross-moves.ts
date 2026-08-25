/**
 * The move repertoire the connector-crossing repair tries for one crossing pair.
 *
 * Nothing here decides anything: every function only proposes where cards could
 * go. `card-layout-uncross.ts` validates each proposal against the solver's hard
 * constraints, scores it, and keeps the one that removes the most crossings.
 */

import {
  centerOf,
  clamp,
  type CardLayoutBounds,
  type CardPlacement,
} from "./card-layout-types";
import { railReorderMoves, type Rail, type RailMove } from "./card-layout-uncross-rails";

/**
 * How much of the rail repertoire a descent may use.
 *
 * - `none` — pairwise moves only, the repertoire before rails existed.
 * - `window` — also re-pack the run between the two crossing cards, which stays
 *   inside a span the lane already owns.
 * - `sort` — also re-sort the whole lane by anchor, the one arrangement with no
 *   intra-rail inversion left, at the cost of shifting every card in it.
 */
export type RailMoveLevel = "none" | "window" | "sort";

/**
 * One descent's character.
 *
 * A greedy descent lands in whichever local minimum its move order walks into,
 * so the repair runs every plan from the same board and keeps the best result.
 * `reversePairs` works the crossing list from the far end, which reaches a
 * different basin on boards where repairing the first pair spoils a later one.
 *
 * The `none` plan is what makes the rail moves a safe addition rather than a
 * trade: it reproduces the pairwise-only descent exactly, so a board the rails
 * would have made worse still ships its pairwise result.
 */
export interface RepairPlan {
  railMoves: RailMoveLevel;
  reversePairs: boolean;
}

export const REPAIR_PLANS: readonly RepairPlan[] = [
  { railMoves: "none", reversePairs: false },
  { railMoves: "window", reversePairs: false },
  { railMoves: "sort", reversePairs: false },
  { railMoves: "window", reversePairs: true },
  { railMoves: "sort", reversePairs: true },
];

/** Everything a move proposal needs to know about the board it is proposed for. */
export interface MoveContext {
  cards: readonly CardPlacement[];
  bounds: CardLayoutBounds;
  rails: readonly Rail[];
  railOf: Int32Array;
  plan: RepairPlan;
}

/** Reflection of a card across the map centre, on whichever axis its side rides. */
function mirroredMove(context: MoveContext, index: number): RailMove {
  const card = context.cards[index]!;
  const centre = centerOf(context.bounds.map);
  const bounds = context.bounds;
  if (card.side === "left" || card.side === "right") {
    return {
      index,
      x: clamp(2 * centre.x - (card.x + card.width), bounds.margin, bounds.width - bounds.margin - card.width),
      y: card.y,
    };
  }
  return {
    index,
    x: card.x,
    y: clamp(2 * centre.y - (card.y + card.height), bounds.margin, bounds.height - bounds.margin - card.height),
  };
}

/**
 * Slide `index` along its own rail until it sits just before or just after
 * `neighbour`. This is the move that untangles a side-packed column: the two
 * cards keep their rail, only their order along it changes.
 */
function railSlides(context: MoveContext, index: number, neighbour: number): RailMove[][] {
  const card = context.cards[index]!;
  const other = context.cards[neighbour]!;
  const gap = context.bounds.gap;
  if (card.side === "top" || card.side === "bottom") {
    return [
      [{ index, x: other.x - gap - card.width, y: card.y }],
      [{ index, x: other.x + other.width + gap, y: card.y }],
    ];
  }
  return [
    [{ index, x: card.x, y: other.y - gap - card.height }],
    [{ index, x: card.x, y: other.y + other.height + gap }],
  ];
}

/** Rail reorderings available to a pair, or nothing when the two are not stacked together. */
function railMoves(context: MoveContext, left: number, right: number): RailMove[][] {
  if (context.plan.railMoves === "none") return [];
  const rail = context.railOf[left]!;
  if (rail < 0 || rail !== context.railOf[right]) return [];
  return railReorderMoves(
    context.cards,
    context.rails[rail]!,
    context.bounds.gap,
    left,
    right,
    context.plan.railMoves === "sort",
  );
}

/**
 * The repertoire tried for one crossing pair: exchange the two slots (whole, or
 * one axis at a time), slide either card past the other along its rail, re-pack
 * the shared rail in a better order, then push either card to the opposite side
 * of the map.
 */
export function candidateMoves(context: MoveContext, left: number, right: number): RailMove[][] {
  const a = context.cards[left]!;
  const b = context.cards[right]!;
  // Each card keeps its own size, so the swap targets the other card's centre.
  const swapA: RailMove = {
    index: left,
    x: b.x + b.width / 2 - a.width / 2,
    y: b.y + b.height / 2 - a.height / 2,
  };
  const swapB: RailMove = {
    index: right,
    x: a.x + a.width / 2 - b.width / 2,
    y: a.y + a.height / 2 - b.height / 2,
  };
  // Ordered cheapest-looking first: ties are broken by this order, so a repair
  // that keeps both cards on their rail wins over one that rearranges the board.
  return [
    [{ index: left, x: a.x, y: swapA.y }, { index: right, x: b.x, y: swapB.y }],
    [{ index: left, x: swapA.x, y: a.y }, { index: right, x: swapB.x, y: b.y }],
    ...railSlides(context, left, right),
    ...railSlides(context, right, left),
    ...railMoves(context, left, right),
    [swapA, swapB],
    [mirroredMove(context, left)],
    [mirroredMove(context, right)],
  ];
}

/** Manhattan travel a move set costs, used to prefer the least disruptive repair. */
export function moveDisplacement(cards: readonly CardPlacement[], moves: readonly RailMove[]): number {
  let travel = 0;
  for (const move of moves) {
    const card = cards[move.index]!;
    travel += Math.abs(card.x - move.x) + Math.abs(card.y - move.y);
  }
  return travel;
}
