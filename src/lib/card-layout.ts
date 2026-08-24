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
  overlapPairs,
  repackAll,
  shelfLayout,
  stackAtMargin,
  sweepPack,
} from "./card-layout-pack";
import { MAX_OPTIMIZED_CARDS, optimizedLayout } from "./card-layout-optimizer";
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

/** [out of bounds, overlapping pairs, obstacle hits] — lower is better. */
function layoutQuality(placements: readonly CardPlacement[], space: LayoutSpace): [number, number, number] {
  let outside = 0;
  let obstacles = 0;
  for (const placement of placements) {
    if (!space.inside(placement)) outside += 1;
    if (space.blocked(placement)) obstacles += 1;
  }
  return [outside, overlapPairs(placements, space.gap), obstacles];
}

function betterLayout(
  left: CardPlacement[],
  right: CardPlacement[],
  space: LayoutSpace,
): CardPlacement[] {
  const leftQuality = layoutQuality(left, space);
  const rightQuality = layoutQuality(right, space);
  for (let index = 0; index < leftQuality.length; index += 1) {
    if (leftQuality[index] !== rightQuality[index]) {
      return leftQuality[index]! < rightQuality[index]! ? left : right;
    }
  }
  return left;
}

/**
 * Repair ladder for a layout that broke a hard constraint: an anchor-greedy
 * repack, then a dense obstacle-aware sweep. If neither is legal the canvas is
 * saturated, and the least-bad contained layout wins — a card that covers the
 * map still reads, a card buried under another one does not.
 */
function degrade(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  attempt: CardPlacement[],
): CardLayoutResult {
  const repacked = repackAll(cards, space);
  if (repacked) {
    const ordered = orderResult(cards, repacked);
    if (validateHard(ordered, space)) return { status: "solved", placements: ordered, mode };
  }
  const swept = sweepPack(cards, space);
  if (validateHard(swept, space)) return { status: "solved", placements: swept, mode };

  const contained = [swept, sweepPack(cards, space, { ignoreObstacles: true }), shelfLayout(cards, space), attempt];
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

  if (mode === "grid") {
    const grid = orderResult(inputs, layoutGrid(inputs, space));
    if (validateHard(grid, space)) return { status: "solved", placements: grid, mode };
    return degrade(inputs, space, mode, grid);
  }

  // Only explicit geography justifies the connector-aware search; the implicit
  // map-frame zone alone keeps the cheaper side packing.
  const hasObstacles = (space.bounds.occupiedAreas?.length ?? 0) > 0 || space.polygons.length > 0;
  if ((mode === "quadrant" || mode === "radial") && inputs.length <= MAX_OPTIMIZED_CARDS && hasObstacles) {
    const optimized = optimizedLayout(inputs, space, mode, options);
    if (optimized) return { status: "solved", placements: optimized, mode };
  }

  const packed = orderResult(inputs, packSides(inputs, space, mode, options));
  if (validateHard(packed, space)) return { status: "solved", placements: packed, mode };
  return degrade(inputs, space, mode, packed);
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
