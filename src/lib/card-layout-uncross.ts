/**
 * Connector crossing repair.
 *
 * Side packing (`columns`, `quadrant`, `right-stack`) and the grid fallback
 * place cards from anchor order alone, so two cards can end up in an order that
 * forces their connectors to cross even when the canvas has room for a clean
 * arrangement. This pass takes such a board and fixes the crossings it can:
 * for each crossing pair it tries a small, fixed set of geometric moves (slide
 * along the rail, exchange one axis, swap the two slots, mirror one card to the
 * opposite side) and applies the one that lowers the total crossing count the
 * most, preferring the smallest displacement when several tie.
 *
 * The search is deliberately greedy and budgeted — rounds, pairs per round and
 * total move evaluations are all capped — so it never degenerates into
 * exponential backtracking. Every candidate is re-validated against the same
 * hard constraints the solver uses, so a repair can never trade a crossing for
 * an overlap or an out-of-canvas card.
 */

import type { ConnectorGeometry, ConnectorStyle } from "./connector-geometry";
import {
  centerOf,
  clamp,
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

/** Boards larger than this are left alone; the pass is a polish step, not a solver. */
const MAX_REPAIR_CARDS = 96;
const MAX_REPAIR_ROUNDS = 12;
const MAX_PAIRS_PER_ROUND = 64;
const MAX_MOVE_EVALUATIONS = 4000;

interface Move {
  index: number;
  x: number;
  y: number;
}

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
}

function buildState(
  placements: CardPlacement[],
  bounds: CardLayoutBounds,
  style: ConnectorStyle,
  clearance: number,
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
  };
}

/** The placement a move produces, with its side re-derived from the new spot. */
function movedPlacement(state: RepairState, move: Move): CardPlacement {
  const card = state.cards[move.index]!;
  const area: CardArea = { x: move.x, y: move.y, width: card.width, height: card.height };
  return { ...card, x: move.x, y: move.y, side: sideForPlacement(area, state.bounds) };
}

/** A move set is only worth scoring when it keeps every hard geometric rule. */
function movesAreLegal(state: RepairState, moves: Move[], next: CardPlacement[]): boolean {
  const gap = state.bounds.gap;
  for (let index = 0; index < moves.length; index += 1) {
    const candidate = next[index]!;
    if (!isInsideCanvas(candidate, state.bounds)) return false;
    if (hitsProtected(candidate, state.bounds)) return false;
    for (let other = index + 1; other < moves.length; other += 1) {
      if (overlaps(candidate, next[other]!, gap)) return false;
    }
    for (let card = 0; card < state.cards.length; card += 1) {
      if (moves.some((move) => move.index === card)) continue;
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
  const next = moves.map((move) => movedPlacement(state, move));
  if (!movesAreLegal(state, moves, next)) return null;
  const size = state.cards.length;
  const geometries = next.map((placement) => placementGeometry(placement, state.style));
  const boxes = geometries.map(connectorBounds);
  const slotOf = state.slotScratch;
  slotOf.fill(-1);
  for (let slot = 0; slot < moves.length; slot += 1) slotOf[moves[slot]!.index] = slot;

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

/** Reflection of a card across the map centre, on whichever axis its side rides. */
function mirroredMove(state: RepairState, index: number): Move {
  const card = state.cards[index]!;
  const centre = centerOf(state.bounds.map);
  const bounds = state.bounds;
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
function railSlides(state: RepairState, index: number, neighbour: number): Move[][] {
  const card = state.cards[index]!;
  const other = state.cards[neighbour]!;
  const gap = state.bounds.gap;
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

/**
 * The fixed repertoire tried for one crossing pair: exchange the two slots
 * (whole, or one axis at a time), slide either card past the other along its
 * rail, then push either card to the opposite side of the map.
 */
function candidateMoves(state: RepairState, left: number, right: number): Move[][] {
  const a = state.cards[left]!;
  const b = state.cards[right]!;
  // Each card keeps its own size, so the swap targets the other card's centre.
  const swapA: Move = {
    index: left,
    x: b.x + b.width / 2 - a.width / 2,
    y: b.y + b.height / 2 - a.height / 2,
  };
  const swapB: Move = {
    index: right,
    x: a.x + a.width / 2 - b.width / 2,
    y: a.y + a.height / 2 - b.height / 2,
  };
  // Ordered cheapest-looking first: ties are broken by this order, so a repair
  // that keeps both cards on their rail wins over one that rearranges the board.
  return [
    [{ index: left, x: a.x, y: swapA.y }, { index: right, x: b.x, y: swapB.y }],
    [{ index: left, x: swapA.x, y: a.y }, { index: right, x: swapB.x, y: b.y }],
    ...railSlides(state, left, right),
    ...railSlides(state, right, left),
    [swapA, swapB],
    [mirroredMove(state, left)],
    [mirroredMove(state, right)],
  ];
}

/** Manhattan travel a move set costs, used to prefer the least disruptive repair. */
function moveDisplacement(state: RepairState, moves: Move[]): number {
  let travel = 0;
  for (const move of moves) {
    const card = state.cards[move.index]!;
    travel += Math.abs(card.x - move.x) + Math.abs(card.y - move.y);
  }
  return travel;
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
  return pairs;
}

/**
 * Untangle crossing connectors in an already-placed board.
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

  const state = buildState(placements, bounds, options.connectorStyle!, connectorClearance(options));
  if (state.total === 0) return placements;

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
        const travel = moveDisplacement(state, moves);
        if (travel === 0) continue;
        evaluations += 1;
        const total = scoreMoves(state, moves);
        if (total === null || total > bestTotal) continue;
        if (total === bestTotal && (bestMoves === null || travel >= bestTravel)) continue;
        bestMoves = moves;
        bestTotal = total;
        bestTravel = travel;
      }
      if (!bestMoves) continue;
      commitMoves(state, bestMoves);
      roundImproved = true;
      improved = true;
      if (state.total === 0) break;
    }
    if (!roundImproved || evaluations >= MAX_MOVE_EVALUATIONS) break;
  }

  return improved ? state.cards : placements;
}
