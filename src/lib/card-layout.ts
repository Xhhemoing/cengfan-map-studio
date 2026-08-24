/**
 * Card auto-layout for the 蹭饭图 poster — public facade.
 *
 * A compact, deterministic replacement for the previous OPRL backtracking
 * solver. Inspired by uni.utities.online/map-creator's four-quadrant isotonic
 * packing, extended with our province-AABB obstacle avoidance and four
 * selectable layout modes.
 *
 * Hard constraints (every mode, every result):
 *   1. Every card stays inside the canvas margin.
 *   2. Cards never overlap (with `gap`).
 *   3. Cards never overlap protected `occupiedAreas`; map overlap is opt-in.
 *   4. The solver never throws; saturation degrades to a contained grid.
 *
 * Soft goals: keep each card near its geographic anchor; deterministic output —
 * the same input always yields the same placements, in input order.
 *
 * `status` is `"solved"` only when constraints 1–3 all hold. `"fallback"` means
 * the canvas could not hold the cards legally; the result is still contained
 * and every card is still present.
 *
 * Implementation lives in focused modules; this file only composes them:
 *   - `card-layout-types`     public value types and shared constants
 *   - `card-layout-geometry`  rectangle / segment / polygon math
 *   - `card-layout-space`     normalized canvas + indexed obstacle queries
 *   - `card-layout-modes`     side assignment and isotonic side packing
 *   - `card-layout-pack`      whole-canvas repack, sweep and shelf strategies
 *   - `card-layout-optimizer` connector-aware best-of-N placement search
 *   - `card-layout-manual`    clamping for hand-dragged cards
 */
import { finiteOr, overlaps } from "./card-layout-geometry";
import { clampCardPosition } from "./card-layout-manual";
import { classifySides, placeSide, neighborSide, type SideAssignment } from "./card-layout-modes";
import {
  containFree,
  layoutGrid,
  orderResult,
  repackAll,
  shelfLayout,
  stackAtMargin,
  sweepPack,
} from "./card-layout-pack";
import { MAX_OPTIMIZED_CARDS, optimizedLayout } from "./card-layout-optimizer";
import { betterLayout, layeredPack, provablyInfeasible } from "./card-layout-saturation";
import { LayoutSpace, PlacementIndex, validateHard } from "./card-layout-space";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutOptions,
  type CardLayoutResult,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

export type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutMode,
  CardLayoutOptions,
  CardLayoutResult,
  CardLayoutStatus,
  CardPlacement,
  CardPoint,
  CardPolygon,
  CardSide,
} from "./card-layout-types";
export type { Rect } from "./card-layout-geometry";
export { clampCardPosition } from "./card-layout-manual";

/** Order sides are packed in; earlier sides claim space first. */
const SIDE_PACK_ORDER: CardSide[] = ["right", "left", "top", "bottom"];
const MAX_OVERFLOW_ROUNDS = 4;

/** Guarantee finite geometry so a malformed card can never poison the solve. */
function sanitizeCards(cards: readonly CardLayoutInput[]): CardLayoutInput[] {
  return cards.filter((card): card is CardLayoutInput => Boolean(card)).map((card) => ({
    ...card,
    anchorX: finiteOr(card.anchorX, 0),
    anchorY: finiteOr(card.anchorY, 0),
    width: Math.max(0, finiteOr(card.width, 0)),
    height: Math.max(0, finiteOr(card.height, 0)),
  }));
}

/**
 * Pack each side once, collecting only cards that land in a valid,
 * non-overlapping spot. Cards that don't fit their side overflow to a
 * neighbour side and are re-packed there next round.
 */
function packSides(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial" | "right-stack",
  options: CardLayoutOptions,
): CardPlacement[] {
  const placed = PlacementIndex.forSpace(space);
  let pending: SideAssignment[] = classifySides(cards, space, mode, options)
    .map((assignment) => ({ ...assignment, cards: [...assignment.cards] }));

  for (let round = 0; round < MAX_OVERFLOW_ROUNDS && pending.some((a) => a.cards.length > 0); round += 1) {
    for (const side of SIDE_PACK_ORDER) {
      const assignment = pending.find((a) => a.side === side);
      if (!assignment || assignment.cards.length === 0) continue;
      const packed = placeSide(assignment, space, placed);
      const accepted: CardPlacement[] = [];
      const rejected: CardLayoutInput[] = [];
      // Accept packed cards in order while they stay valid; once one fails,
      // reject the rest so the side stays a contiguous block.
      let blockBroken = false;
      for (let index = 0; index < packed.length; index += 1) {
        const placement = packed[index]!;
        const valid = space.inside(placement)
          && !space.blocked(placement)
          && !placed.hits(placement, space.gap)
          && !accepted.some((other) => overlaps(other, placement, space.gap));
        if (valid && !blockBroken) accepted.push(placement);
        else {
          blockBroken = true;
          rejected.push(assignment.cards[index]!);
        }
      }
      for (const placement of accepted) placed.add(placement);
      const neighbor = neighborSide(side);
      pending = pending.map((entry) => {
        if (entry.side === side) return { ...entry, cards: [] };
        if (entry.side === neighbor) return { ...entry, cards: [...entry.cards, ...rejected] };
        return entry;
      });
    }
  }

  // Any cards still unplaced get a contained free spot (non-overlapping scan).
  // Once one scan comes up empty the canvas is saturated, so the rest skip
  // straight to the stacked last resort instead of rescanning a full canvas.
  const placedIds = new Set(placed.items.map((placement) => placement.id));
  let saturated = false;
  for (const card of cards) {
    if (placedIds.has(card.id)) continue;
    const probe: CardPlacement = { ...card, x: space.margin, y: space.margin, side: "right" };
    const placement = saturated ? stackAtMargin(probe, space, placed) : containFree(probe, space, placed);
    if (!saturated && (space.blocked(placement) || placed.hits(placement, space.gap))) saturated = true;
    placed.add(placement);
    placedIds.add(card.id);
  }
  return placed.items;
}

/**
 * Repair ladder for a layout that broke a hard constraint: an anchor-greedy
 * repack, then a dense obstacle-aware sweep. The sweep is handed back when it
 * had to run, because the saturated path scores it too and it is much the most
 * expensive rung to compute twice.
 */
function repairLadder(
  cards: CardLayoutInput[],
  space: LayoutSpace,
): { legal: CardPlacement[] | null; swept: CardPlacement[] | null } {
  const repacked = repackAll(cards, space);
  if (repacked) {
    const ordered = orderResult(cards, repacked);
    if (validateHard(ordered, space)) return { legal: ordered, swept: null };
  }
  const swept = sweepPack(cards, space);
  return { legal: validateHard(swept, space) ? swept : null, swept };
}

/**
 * No legal arrangement was found, so the least-bad contained layout wins — a
 * card that covers the map still reads, a card buried under another one does
 * not.
 */
function contain(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  attempt: CardPlacement[],
  swept: CardPlacement[] | null,
): CardLayoutResult {
  const contained = [
    swept ?? sweepPack(cards, space),
    sweepPack(cards, space, { ignoreObstacles: true }),
    shelfLayout(cards, space),
    attempt,
    layeredPack(cards, space),
  ];
  return {
    status: "fallback",
    placements: contained.reduce((best, candidate) => betterLayout(best, candidate, space)),
    mode,
  };
}

function degrade(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  attempt: CardPlacement[],
): CardLayoutResult {
  const { legal, swept } = repairLadder(cards, space);
  if (legal) return { status: "solved", placements: legal, mode };
  return contain(cards, space, mode, attempt, swept);
}

/**
 * Offer a legal layout to the connector-aware search, which either returns
 * something that scores better or nothing at all.
 *
 * The search is skipped unless there is real geography to route around, the
 * board is small enough for its quadratic bookkeeping, and — enforced by the
 * caller — a legal layout already exists. That last condition matters for cost
 * as much as for quality: the search only accepts orders that pass the same
 * hard-constraint check the ladder just failed, so on a saturated canvas it is
 * guaranteed to come back empty after paying full price.
 */
function refine(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  options: CardLayoutOptions,
  legal: CardPlacement[],
): CardLayoutResult {
  const hasObstacles = (space.bounds.occupiedAreas?.length ?? 0) > 0 || space.polygons.length > 0;
  if ((mode !== "quadrant" && mode !== "radial") || !hasObstacles || cards.length > MAX_OPTIMIZED_CARDS) {
    return { status: "solved", placements: legal, mode };
  }
  const optimized = optimizedLayout(cards, space, mode, options, legal);
  return { status: "solved", placements: optimized ?? legal, mode };
}

/**
 * The canvas provably cannot hold the cards, so every search below would fail
 * after paying for itself. Skip straight to the least-bad contained layout.
 */
function saturated(cards: CardLayoutInput[], space: LayoutSpace, mode: CardLayoutMode): CardLayoutResult {
  const contained = [shelfLayout(cards, space), layeredPack(cards, space)];
  return {
    status: "fallback",
    placements: contained.reduce((best, candidate) => betterLayout(best, candidate, space)),
    mode,
  };
}

export function solveCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const mode: CardLayoutMode = options.mode ?? "quadrant";
  const inputs = sanitizeCards(cards);
  if (inputs.length === 0) return { status: "solved", placements: [], mode };
  const space = new LayoutSpace(bounds);
  if (provablyInfeasible(inputs, space)) return saturated(inputs, space, mode);

  if (mode === "grid") {
    const grid = orderResult(inputs, layoutGrid(inputs, space));
    if (validateHard(grid, space)) return { status: "solved", placements: grid, mode };
    return degrade(inputs, space, mode, grid);
  }

  // Side packing first, then the repair ladder: whichever legal layout comes
  // out is both what the solver ships and what the connector-aware search has
  // to beat, so the search can only ever improve the result.
  const packed = orderResult(inputs, packSides(inputs, space, mode, options));
  if (validateHard(packed, space)) return refine(inputs, space, mode, options, packed);
  const { legal, swept } = repairLadder(inputs, space);
  if (legal) return refine(inputs, space, mode, options, legal);
  return contain(inputs, space, mode, packed, swept);
}

export function layoutCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardPlacement[] {
  return solveCardLayout(cards, bounds, options).placements;
}

// ----- Back-compat aliases (drop-in for the previous destination-layout API) -----

export type DestinationCardInput = CardLayoutInput;
export type DestinationCardArea = CardArea;
export type DestinationCardBounds = CardLayoutBounds;
export type DestinationCardSide = CardSide;
export type DestinationCardPlacement = CardPlacement;
/** Legacy status vocabulary (maps the new `CardLayoutStatus` back). */
export type DestinationLayoutStatus = "solved" | "crossing-fallback" | "search-budget-exhausted";
export interface DestinationLayoutResult {
  status: DestinationLayoutStatus;
  placements: CardPlacement[];
}
export type DestinationLayoutOptions = CardLayoutOptions;

/** Previous solve signature, now delegating to {@link solveCardLayout}. */
export function solveDestinationCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): DestinationLayoutResult {
  const result = solveCardLayout(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
  return { status: result.status === "solved" ? "solved" : "crossing-fallback", placements: result.placements };
}

export function layoutDestinationCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): CardPlacement[] {
  return layoutCards(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
}

export function clampDestinationCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  return clampCardPosition(position, bounds);
}
