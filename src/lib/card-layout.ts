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
 *   - `card-layout-index`     uniform grid index over rectangles
 *   - `card-layout-raster`    province-outline edge index and occupancy raster
 *   - `card-layout-space`     normalized canvas + indexed obstacle queries
 *   - `card-layout-modes`     side assignment and isotonic side packing
 *   - `card-layout-pack`      whole-canvas repack, sweep and shelf strategies
 *   - `card-layout-scoring`   connector-quality scores for layouts and candidates
 *   - `card-layout-optimizer` connector-aware best-of-N placement search
 *   - `card-layout-pinned`    hand-placed cards as obstacles for the solve
 *   - `card-layout-manual`    clamping for hand-dragged cards
 */
import { finiteOr } from "./card-layout-geometry";
import { clampCardPosition } from "./card-layout-manual";
import { packSides } from "./card-layout-modes";
import {
  layoutGrid,
  orderResult,
  repackAll,
  shelfLayout,
  sweepPack,
} from "./card-layout-pack";
import {
  MAX_OPTIMIZED_CARDS,
  optimizedLayout,
  type ConnectorSearchTrace,
} from "./card-layout-optimizer";
import { mergePinnedCards, planPinnedCards } from "./card-layout-pinned";
import { betterLayout, layeredPack, provablyInfeasible } from "./card-layout-saturation";
import { LayoutSpace, validateHard } from "./card-layout-space";
import {
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutOptions,
  type CardLayoutResult,
  type CardLayoutStatus,
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
export type { ConnectorSearchTrace } from "./card-layout-optimizer";
export { clampCardPosition } from "./card-layout-manual";

/**
 * Why one solve did or did not pay for the connector-aware search.
 *
 * Every reason but `"ran"` is a place the search is provably unable to help,
 * so skipping it costs nothing and saves the whole candidate build.
 */
export type ConnectorSearchDecision =
  | "ran"
  /** `grid` and `right-stack` place by rule; a connector score cannot move a card. */
  | "skipped-mode"
  /** Nothing to route around, so every candidate is as clear as the packed spot. */
  | "skipped-no-geography"
  /** Above {@link MAX_OPTIMIZED_CARDS} no order has ever beaten the packed seed. */
  | "skipped-card-count"
  /** No legal layout to defend: the search accepts only layouts the ladder failed to find. */
  | "skipped-no-legal-layout"
  /** The canvas provably cannot hold the cards. */
  | "skipped-infeasible"
  /** No cards at all. */
  | "skipped-empty";

/** Diagnostics for one solve. See {@link __layoutDebug}. */
export interface LayoutDebugRecord {
  mode: CardLayoutMode;
  status: CardLayoutStatus;
  cards: number;
  decision: ConnectorSearchDecision;
  /** Present only when the search ran. */
  trace: ConnectorSearchTrace | null;
  /** `true` when the search shipped a layout the packing ladder had not found. */
  improved: boolean;
}

/**
 * Last solve's diagnostics, for tests only.
 *
 * Not part of the public API and not covered by its stability promise: it
 * exists so a test can assert *which path* a solve took instead of timing it,
 * which on a shared machine is far too flaky to assert on. Recording it costs
 * one small object per solve and nothing in the solver ever reads it back.
 */
export const __layoutDebug: { last: LayoutDebugRecord | null } = { last: null };

interface SearchDebug {
  decision: ConnectorSearchDecision;
  trace: ConnectorSearchTrace | null;
  improved: boolean;
}

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
    const ordered = orderResult(cards, repacked, space);
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

type SearchPlan =
  | { decision: "ran"; mode: "quadrant" | "radial" }
  | { decision: Exclude<ConnectorSearchDecision, "ran"> };

/** Whether the search can help at all, and if not, which guard turned it away. */
function searchPlan(cards: CardLayoutInput[], space: LayoutSpace, mode: CardLayoutMode): SearchPlan {
  if (mode !== "quadrant" && mode !== "radial") return { decision: "skipped-mode" };
  if ((space.bounds.occupiedAreas?.length ?? 0) === 0 && space.polygons.length === 0) {
    return { decision: "skipped-no-geography" };
  }
  if (cards.length > MAX_OPTIMIZED_CARDS) return { decision: "skipped-card-count" };
  return { decision: "ran", mode };
}

/**
 * Offer a legal layout to the connector-aware search, which either returns
 * something that scores better or nothing at all.
 *
 * The search is skipped unless the mode routes connectors at all, there is real
 * geography to route around, the board is small enough for its quadratic
 * bookkeeping, and — enforced by the caller — a legal layout already exists.
 * That last condition matters for cost as much as for quality: the search only
 * accepts orders that pass the same hard-constraint check the ladder just
 * failed, so on a saturated canvas it is guaranteed to come back empty after
 * paying full price.
 */
function refine(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  options: CardLayoutOptions,
  legal: CardPlacement[],
  debug: SearchDebug,
): CardLayoutResult {
  const plan = searchPlan(cards, space, mode);
  debug.decision = plan.decision;
  if (plan.decision !== "ran") return { status: "solved", placements: legal, mode };

  const { placements, trace } = optimizedLayout(cards, space, plan.mode, options, legal);
  debug.trace = trace;
  debug.improved = placements !== null;
  return { status: "solved", placements: placements ?? legal, mode };
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

function solve(
  inputs: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: CardLayoutMode,
  options: CardLayoutOptions,
  debug: SearchDebug,
): CardLayoutResult {
  const space = new LayoutSpace(bounds);
  if (provablyInfeasible(inputs, space)) {
    debug.decision = "skipped-infeasible";
    return saturated(inputs, space, mode);
  }

  if (mode === "grid") {
    debug.decision = "skipped-mode";
    const grid = orderResult(inputs, layoutGrid(inputs, space), space);
    if (validateHard(grid, space)) return { status: "solved", placements: grid, mode };
    return degrade(inputs, space, mode, grid);
  }

  // Side packing first, then the repair ladder: whichever legal layout comes
  // out is both what the solver ships and what the connector-aware search has
  // to beat, so the search can only ever improve the result.
  const packed = orderResult(inputs, packSides(inputs, space, mode, options), space);
  if (validateHard(packed, space)) return refine(inputs, space, mode, options, packed, debug);
  const { legal, swept } = repairLadder(inputs, space);
  if (legal) return refine(inputs, space, mode, options, legal, debug);
  debug.decision = "skipped-no-legal-layout";
  return contain(inputs, space, mode, packed, swept);
}

export function solveCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const mode: CardLayoutMode = options.mode ?? "quadrant";
  const inputs = sanitizeCards(cards);
  const debug: SearchDebug = { decision: "skipped-empty", trace: null, improved: false };
  // Hand-placed cards keep their coordinates and are solved around, not for.
  const pinned = planPinnedCards(inputs, bounds, options.fixedPositions);
  const solvable = pinned?.free ?? inputs;
  const solved = solvable.length === 0
    ? { status: "solved" as const, placements: [], mode }
    : solve(solvable, pinned?.bounds ?? bounds, mode, options, debug);
  const result = pinned
    ? { ...solved, placements: mergePinnedCards(pinned, solved.placements) }
    : solved;
  __layoutDebug.last = { mode, status: result.status, cards: inputs.length, ...debug };
  return result;
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
  const result = solveCardLayout(cards, bounds, {
    mode: options.mode ?? "quadrant",
    autoBalance: options.autoBalance,
    fixedPositions: options.fixedPositions,
  });
  return { status: result.status === "solved" ? "solved" : "crossing-fallback", placements: result.placements };
}

export function layoutDestinationCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): CardPlacement[] {
  return layoutCards(cards, bounds, {
    mode: options.mode ?? "quadrant",
    autoBalance: options.autoBalance,
    fixedPositions: options.fixedPositions,
  });
}

export function clampDestinationCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  return clampCardPosition(position, bounds);
}
