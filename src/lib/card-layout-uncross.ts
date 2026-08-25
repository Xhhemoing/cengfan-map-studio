/**
 * Connector crossing repair.
 *
 * Side packing (`columns`, `quadrant`, `right-stack`) and the grid fallback
 * place cards from anchor order alone, so two cards can end up in an order that
 * forces their connectors to cross even when the canvas has room for a clean
 * arrangement. This pass takes such a board and fixes the crossings it can: for
 * each crossing pair it scores the proposals from `card-layout-uncross-moves.ts`
 * and applies the one that lowers the total crossing count the most, preferring
 * the smallest displacement when several tie.
 *
 * A greedy descent is only as good as the basin its move order walks into, so
 * the whole descent is repeated once per {@link REPAIR_PLANS} entry from the
 * same starting board and the fewest-crossings result wins. That is what makes
 * a new move kind a monotone improvement instead of a trade: a plan that would
 * end up worse than the plain pairwise descent simply loses.
 *
 * The search is deliberately greedy and budgeted — plans, rounds, pairs per
 * round and total cards moved are all capped — so it never degenerates into
 * exponential backtracking. Every candidate is re-validated against the same
 * hard constraints the solver uses, so a repair can never trade a crossing for
 * an overlap or an out-of-canvas card.
 */

import type { ConnectorGeometry, ConnectorStyle } from "./connector-geometry";
import {
  overlaps,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutOptions,
  type CardPlacement,
} from "./card-layout-types";
import { hitsProtected, isInsideCanvas, sideForPlacement } from "./card-layout-collision";
import {
  connectorBounds,
  connectorClearance,
  connectorIntersects,
  crossingsEnforced,
  placementGeometry,
} from "./card-layout-connectors";
import { buildRails, type Rail, type RailMove } from "./card-layout-uncross-rails";
import {
  candidateMoves,
  moveDisplacement,
  REPAIR_PLANS,
  type RepairPlan,
} from "./card-layout-uncross-moves";

/** Boards larger than this are left alone; the pass is a polish step, not a solver. */
const MAX_REPAIR_CARDS = 96;
const MAX_REPAIR_ROUNDS = 12;
const MAX_PAIRS_PER_ROUND = 64;
/** Budget in *cards moved*, not candidates, so a rail reorder pays for its width. */
const MAX_MOVE_EVALUATIONS = 6000;

type Move = RailMove;

interface RepairState {
  cards: CardPlacement[];
  geometries: ConnectorGeometry[];
  boxes: CardArea[];
  /** Symmetric `n × n` crossing flags, row-major. */
  cross: Uint8Array;
  total: number;
  style: ConnectorStyle;
  clearance: number;
  bounds: CardLayoutBounds;
  /** Reused `card index → move slot` scratch, `-1` for cards a move leaves alone. */
  slotScratch: Int32Array;
  /** Lanes of stacked cards, rebuilt after every commit because a move can re-lane a card. */
  rails: Rail[];
  railOf: Int32Array;
  plan: RepairPlan;
}

const NO_RAILS: { rails: Rail[]; railOf: Int32Array } = { rails: [], railOf: new Int32Array(0) };

function laneIndex(cards: CardPlacement[], plan: RepairPlan): { rails: Rail[]; railOf: Int32Array } {
  return plan.railMoves === "none"
    ? { rails: NO_RAILS.rails, railOf: new Int32Array(cards.length).fill(-1) }
    : buildRails(cards);
}

function refreshRails(state: RepairState): void {
  const { rails, railOf } = laneIndex(state.cards, state.plan);
  state.rails = rails;
  state.railOf = railOf;
}

function buildState(
  placements: CardPlacement[],
  bounds: CardLayoutBounds,
  style: ConnectorStyle,
  clearance: number,
  plan: RepairPlan,
): RepairState {
  const cards = placements.map((placement) => ({ ...placement }));
  const geometries = cards.map((placement) => placementGeometry(placement, style));
  const boxes = geometries.map(connectorBounds);
  const size = cards.length;
  const cross = new Uint8Array(size * size);
  let total = 0;
  for (let left = 0; left < size; left += 1) {
    for (let right = left + 1; right < size; right += 1) {
      if (!connectorIntersects(
        geometries[left]!,
        boxes[left]!,
        geometries[right]!,
        boxes[right]!,
        clearance,
      )) continue;
      cross[left * size + right] = 1;
      cross[right * size + left] = 1;
      total += 1;
    }
  }
  const { rails, railOf } = laneIndex(cards, plan);
  return {
    cards,
    geometries,
    boxes,
    cross,
    total,
    style,
    clearance,
    bounds,
    slotScratch: new Int32Array(size),
    rails,
    railOf,
    plan,
  };
}

/** The placement a move produces, with its side re-derived from the new spot. */
function movedPlacement(state: RepairState, move: Move): CardPlacement {
  const card = state.cards[move.index]!;
  const area: CardArea = { x: move.x, y: move.y, width: card.width, height: card.height };
  return { ...card, x: move.x, y: move.y, side: sideForPlacement(area, state.bounds) };
}

/**
 * A move set is only worth scoring when it keeps every hard geometric rule.
 *
 * `slotOf` maps a card index to its position in `moves` (`-1` for cards the set
 * leaves alone), which is what keeps the "does this land on a card that is not
 * moving?" test linear even for a rail-wide reorder.
 */
function movesAreLegal(state: RepairState, moves: Move[], next: CardPlacement[]): boolean {
  const gap = state.bounds.gap;
  const slotOf = state.slotScratch;
  for (let index = 0; index < moves.length; index += 1) {
    const candidate = next[index]!;
    if (!isInsideCanvas(candidate, state.bounds)) return false;
    if (hitsProtected(candidate, state.bounds)) return false;
    for (let other = index + 1; other < moves.length; other += 1) {
      if (overlaps(candidate, next[other]!, gap)) return false;
    }
    for (let card = 0; card < state.cards.length; card += 1) {
      if (slotOf[card]! >= 0) continue;
      if (overlaps(candidate, state.cards[card]!, gap)) return false;
    }
  }
  return true;
}

/**
 * Total crossings the board would have after `moves`, or `null` when illegal.
 *
 * Only pairs touching a moved card can change, so the delta is walked over
 * (moved × board) instead of the full pair matrix.
 */
function scoreMoves(state: RepairState, moves: Move[]): number | null {
  const size = state.cards.length;
  const slotOf = state.slotScratch;
  slotOf.fill(-1);
  for (let slot = 0; slot < moves.length; slot += 1) slotOf[moves[slot]!.index] = slot;

  const next = moves.map((move) => movedPlacement(state, move));
  if (!movesAreLegal(state, moves, next)) return null;
  const geometries = next.map((placement) => placementGeometry(placement, state.style));
  const boxes = geometries.map(connectorBounds);

  let removed = 0;
  let added = 0;
  for (let slot = 0; slot < moves.length; slot += 1) {
    const index = moves[slot]!.index;
    for (let other = 0; other < size; other += 1) {
      if (other === index) continue;
      // A pair of moved cards would otherwise be counted from both ends.
      const otherSlot = slotOf[other]!;
      if (otherSlot >= 0 && otherSlot < slot) continue;
      if (state.cross[index * size + other] === 1) removed += 1;
      if (connectorIntersects(
        geometries[slot]!,
        boxes[slot]!,
        otherSlot >= 0 ? geometries[otherSlot]! : state.geometries[other]!,
        otherSlot >= 0 ? boxes[otherSlot]! : state.boxes[other]!,
        state.clearance,
      )) added += 1;
    }
  }
  return state.total - removed + added;
}

function commitMoves(state: RepairState, moves: Move[]): void {
  const size = state.cards.length;
  for (const move of moves) {
    const placement = movedPlacement(state, move);
    state.cards[move.index] = placement;
    state.geometries[move.index] = placementGeometry(placement, state.style);
    state.boxes[move.index] = connectorBounds(state.geometries[move.index]!);
  }
  for (const move of moves) {
    const index = move.index;
    for (let other = 0; other < size; other += 1) {
      if (other === index) continue;
      const flag = connectorIntersects(
        state.geometries[index]!,
        state.boxes[index]!,
        state.geometries[other]!,
        state.boxes[other]!,
        state.clearance,
      ) ? 1 : 0;
      const slot = index * size + other;
      if (state.cross[slot] === flag) continue;
      state.total += flag === 1 ? 1 : -1;
      state.cross[slot] = flag;
      state.cross[other * size + index] = flag;
    }
  }
}

/** Crossing pairs in a stable order, capped so one round stays bounded. */
function crossingPairs(state: RepairState): Array<[number, number]> {
  const size = state.cards.length;
  const pairs: Array<[number, number]> = [];
  for (let left = 0; left < size && pairs.length < MAX_PAIRS_PER_ROUND; left += 1) {
    for (let right = left + 1; right < size && pairs.length < MAX_PAIRS_PER_ROUND; right += 1) {
      if (state.cross[left * size + right] === 1) pairs.push([left, right]);
    }
  }
  if (state.plan.reversePairs) pairs.reverse();
  return pairs;
}

/** Greedy descent over `state`, in place. Returns whether anything was committed. */
function descend(state: RepairState): boolean {
  let evaluations = 0;
  let improved = false;
  for (let round = 0; round < MAX_REPAIR_ROUNDS && state.total > 0; round += 1) {
    let roundImproved = false;
    for (const [left, right] of crossingPairs(state)) {
      if (state.cross[left * state.cards.length + right] !== 1) continue;
      let bestMoves: Move[] | null = null;
      let bestTotal = state.total;
      let bestTravel = Infinity;
      for (const moves of candidateMoves(state, left, right)) {
        if (evaluations >= MAX_MOVE_EVALUATIONS) break;
        const travel = moveDisplacement(state.cards, moves);
        if (travel === 0) continue;
        evaluations += moves.length;
        const total = scoreMoves(state, moves);
        if (total === null || total > bestTotal) continue;
        if (total === bestTotal && (bestMoves === null || travel >= bestTravel)) continue;
        bestMoves = moves;
        bestTotal = total;
        bestTravel = travel;
      }
      if (!bestMoves) continue;
      commitMoves(state, bestMoves);
      refreshRails(state);
      roundImproved = true;
      improved = true;
      if (state.total === 0) break;
    }
    if (!roundImproved || evaluations >= MAX_MOVE_EVALUATIONS) break;
  }
  return improved;
}

/**
 * Untangle crossing connectors in an already-placed board.
 *
 * The descent is greedy, so which repertoire it draws from decides which local
 * minimum it lands in: rail reordering unties runs the pairwise moves cannot
 * touch, but on some boards it also walks past a better pairwise-only basin.
 * Both repertoires are therefore run from the same starting board and the
 * result with fewer crossings wins, which makes adding a move kind a
 * monotone improvement rather than a trade.
 *
 * Returns the input array unchanged when crossings are not enforced (no
 * `connectorStyle`, or `forbidConnectorCrossing: false`), when the board is
 * already crossing-free, or when no legal move improves it.
 */
export function repairConnectorCrossings(
  placements: CardPlacement[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardPlacement[] {
  if (!crossingsEnforced(options)) return placements;
  if (placements.length < 2 || placements.length > MAX_REPAIR_CARDS) return placements;
  if (placements.some((placement) => !placement)) return placements;

  const clearance = connectorClearance(options);
  const style = options.connectorStyle!;
  let best: RepairState | null = null;
  for (const plan of REPAIR_PLANS) {
    const state = buildState(placements, bounds, style, clearance, plan);
    if (state.total === 0) return placements;
    if (!descend(state)) continue;
    if (best === null || state.total < best.total) best = state;
    if (best.total === 0) break;
  }

  return best ? best.cards : placements;
}
