/**
 * Connector-aware placement search for the quadrant / radial modes.
 *
 * Every card gets a shortlist of candidate rectangles (see
 * {@link ./card-layout-candidates}) scored by how the *rendered* connector
 * would behave — crossings, cards it would cut through, provinces it would
 * cross. Several deterministic insertion orders are tried and the best
 * complete, legal layout wins.
 *
 * Connector quality is only ever a score, never a veto: a card whose every
 * candidate collides is repaired into the nearest free spot instead of being
 * dropped, so a crossing penalty can never cost a card its place.
 */
import { buildConnectorGeometry, type ConnectorGeometry, type ConnectorStyle } from "./connector-geometry";
import { buildCandidates, DENSE_CARD_COUNT, type LayoutCandidate } from "./card-layout-candidates";
import {
  connectorBounds,
  connectorHitsCard,
  connectorIntersects,
  connectorMapIntersections,
  sameAnchorCluster,
} from "./card-layout-connectors";
import { compareScores, sideAxisSize, sideDistance } from "./card-layout-geometry";
import { classifyQuadrant, classifyRadial } from "./card-layout-modes";
import { containFree, orderResult } from "./card-layout-pack";
import { PlacementIndex, validateHard, type LayoutSpace } from "./card-layout-space";
import {
  SIDE_ORDER,
  type CardArea,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

/**
 * Card ceiling for the connector-aware search.
 *
 * Not a cost limit — {@link SEARCH_BUDGET} does that job — but the point past
 * which the search stops earning its keep. Above roughly eighty cards the
 * per-side shortlists are already trimmed hard enough that no insertion order
 * beats the packed layout it starts from: measured over 100- and 120-card
 * boards, both vector and rectangular, the search returned the seed unchanged
 * every time while adding hundreds of milliseconds. Dense boards get the
 * cheaper packing ladder instead, which is what they were getting anyway.
 */
export const MAX_OPTIMIZED_CARDS = 80;

/**
 * Work one solve may spend exploring insertion orders, counted in candidate
 * comparisons rather than milliseconds.
 *
 * A wall-clock budget would make the output depend on how loaded the machine
 * is, which breaks the determinism guarantee. Counting comparisons is
 * reproducible: the same input always stops in the same place. The budget only
 * decides how many *orders* are tried — an order that has started always runs
 * to the end, so no card can be left unplaced by exhaustion.
 *
 * The figure is where the measured quality curve flattens: below it a 60-card
 * vector board loses its best layout, above it nothing tested improves.
 */
const SEARCH_BUDGET = 2_500_000;

/**
 * What one scanned repair costs, in the same units.
 *
 * Repairs are by far the most expensive thing an order can do — a repair walks
 * a 12px lattice over the free canvas, and profiling a 60-card board with a
 * full-map obstacle puts a fifth of the whole solve inside that one scan — so
 * the budget has to price them or they crowd out everything else. Measured
 * across the obstacle boards, this figure is the knee: cheaper and the search
 * buys a few more crossings for a large slice of the frame budget, dearer and
 * the boards that genuinely need repairs stop getting them.
 */
const REPAIR_COST = 60_000;

/**
 * Repairs allowed per insertion order, as a fraction of the cards.
 *
 * A repaired card is placed by a scan of the free canvas, so it is legal and
 * gets scored like any other — repairs are expensive, not wrong. On boards
 * where obstacles leave only a narrow ring the rails cannot tile it, and a
 * fixed small budget declared those boards hopeless when they were merely
 * awkward. The share below lets such an order finish while
 * {@link SEARCH_BUDGET} keeps the total bounded.
 */
const REPAIR_SHARE = 0.4;
const MIN_REPAIRS_PER_ORDER = 3;

function homeSides(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): Map<string, CardSide> {
  const assignments = mode === "radial"
    ? classifyRadial(cards, space)
    : classifyQuadrant(cards, space, options);
  return new Map(assignments.flatMap(({ side, cards: assigned }) =>
    assigned.map((card) => [card.id, side] as const)));
}

function angularOrder(cards: CardLayoutInput[], space: LayoutSpace): CardLayoutInput[] {
  const centerX = space.map.x + space.map.width / 2;
  const centerY = space.map.y + space.map.height / 2;
  return [...cards].sort((left, right) => {
    const leftAngle = Math.atan2(left.anchorY - centerY, left.anchorX - centerX);
    const rightAngle = Math.atan2(right.anchorY - centerY, right.anchorX - centerX);
    return leftAngle - rightAngle
      || Math.hypot(left.anchorX - centerX, left.anchorY - centerY)
        - Math.hypot(right.anchorX - centerX, right.anchorY - centerY)
      || left.id.localeCompare(right.id);
  });
}

/** Deterministic insertion orders: rotations around the map, plus scarcity. */
function insertionOrders(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  candidateCounts: Map<string, number>,
): CardLayoutInput[][] {
  const ordered = angularOrder(cards, space);
  const orders: CardLayoutInput[][] = [];
  const starts = Math.min(ordered.length, cards.length > DENSE_CARD_COUNT ? 3 : 6);
  for (let index = 0; index < starts; index += 1) {
    const start = Math.floor((index * ordered.length) / starts);
    orders.push([...ordered.slice(start), ...ordered.slice(0, start)]);
  }
  orders.push([...ordered].reverse());
  orders.push([...cards].sort((left, right) =>
    (candidateCounts.get(left.id) ?? 0) - (candidateCounts.get(right.id) ?? 0)
    || left.id.localeCompare(right.id)));
  return orders;
}

/** Whole-layout quality, lowest first. Used to pick between complete layouts. */
function scoreLayout(
  placements: readonly CardPlacement[],
  assignedSides: Map<string, CardSide>,
  style: ConnectorStyle,
  clearance: number,
  space: LayoutSpace,
): number[] {
  const geometries = placements.map((placement) => buildConnectorGeometry({
    card: placement,
    anchor: { x: placement.anchorX, y: placement.anchorY },
    preferredSide: placement.side,
    style,
  }));
  const geometryBounds = geometries.map(connectorBounds);
  let crossings = 0;
  let throughCards = 0;
  let throughMap = 0;
  let splitClusters = 0;
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      if (connectorIntersects(
        geometries[left]!,
        geometryBounds[left]!,
        geometries[right]!,
        geometryBounds[right]!,
        clearance,
      )) crossings += 1;
      if (connectorHitsCard(geometries[left]!, geometryBounds[left]!, placements[right]!, clearance)) throughCards += 1;
      if (connectorHitsCard(geometries[right]!, geometryBounds[right]!, placements[left]!, clearance)) throughCards += 1;
      if (sameAnchorCluster(placements[left]!, placements[right]!)
        && placements[left]!.side !== placements[right]!.side) splitClusters += 1;
    }
  }
  let sideDeviation = 0;
  let distance = 0;
  const sideLoads = new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0]));
  for (const placement of placements) {
    sideDeviation += sideDistance(placement.side, assignedSides.get(placement.id) ?? placement.side);
    distance += Math.hypot(
      placement.x + placement.width / 2 - placement.anchorX,
      placement.y + placement.height / 2 - placement.anchorY,
    );
    sideLoads.set(
      placement.side,
      sideLoads.get(placement.side)! + sideAxisSize(placement, placement.side) + space.gap,
    );
  }
  for (let index = 0; index < geometries.length; index += 1) {
    throughMap += connectorMapIntersections(
      geometries[index]!,
      { x: placements[index]!.anchorX, y: placements[index]!.anchorY },
      space,
    );
  }
  const sideLoad = SIDE_ORDER.reduce((sum, side) => {
    const load = space.normalizedSideLoad(sideLoads.get(side)!, side);
    return sum + load * load;
  }, 0);
  return [splitClusters, crossings, throughCards, throughMap, sideDeviation, sideLoad, distance];
}

/** Cards whose anchors sit in the same province cluster, by card id. */
type ClusterMap = Map<string, string[]>;

function anchorClusters(cards: readonly CardLayoutInput[]): ClusterMap {
  const clusters: ClusterMap = new Map(cards.map((card) => [card.id, [] as string[]]));
  for (let left = 0; left < cards.length; left += 1) {
    for (let right = left + 1; right < cards.length; right += 1) {
      if (!sameAnchorCluster(cards[left]!, cards[right]!)) continue;
      clusters.get(cards[left]!.id)!.push(cards[right]!.id);
      clusters.get(cards[right]!.id)!.push(cards[left]!.id);
    }
  }
  return clusters;
}

interface OrderState {
  placed: PlacementIndex;
  geometries: ConnectorGeometry[];
  geometryBounds: CardArea[];
  sideLoads: Map<CardSide, number>;
  sides: Map<string, CardSide>;
}

/** Deterministic work meter shared by every order of one solve. */
interface Budget {
  spent: number;
}

/**
 * Best candidate for one card given what is already on the canvas.
 *
 * Anchor clustering compares geography rather than pixels, so it cannot be
 * derived from the placements on the fly; `cluster` lists the card's cluster
 * peers and the scan only has to look up which side each already took.
 */
function selectCandidate(
  candidates: readonly LayoutCandidate[],
  cluster: readonly string[],
  state: OrderState,
  clearance: number,
  space: LayoutSpace,
  budget: Budget,
): LayoutCandidate | null {
  let selected: LayoutCandidate | null = null;
  let selectedScore: number[] | null = null;
  for (const candidate of candidates) {
    if (state.placed.hits(candidate.placement, space.gap)) continue;
    let splitClusters = 0;
    for (const neighbour of cluster) {
      const side = state.sides.get(neighbour);
      if (side !== undefined && side !== candidate.placement.side) splitClusters += 1;
    }
    // The score is lexicographic and its first three terms only ever grow as
    // the scan proceeds, so a candidate that has already fallen behind the
    // incumbent on one of them can never catch up on the rest. Splitting a
    // cluster is decided up front and rules the candidate out before it costs
    // anything; crossings and through-card hits cut the scan short mid-way.
    // Pure pruning — the winner is whatever the full scan would have picked.
    const tieSplit = selectedScore !== null && splitClusters === selectedScore[0];
    if (selectedScore !== null && splitClusters > selectedScore[0]!) continue;
    budget.spent += state.placed.size;
    let crossings = 0;
    let throughCards = 0;
    let outscored = false;
    for (let index = 0; index < state.placed.size; index += 1) {
      const other = state.placed.items[index]!;
      if (connectorIntersects(
        candidate.geometry,
        candidate.geometryBounds,
        state.geometries[index]!,
        state.geometryBounds[index]!,
        clearance,
      )) crossings += 1;
      if (connectorHitsCard(candidate.geometry, candidate.geometryBounds, other, clearance)) throughCards += 1;
      if (connectorHitsCard(state.geometries[index]!, state.geometryBounds[index]!, candidate.placement, clearance)) {
        throughCards += 1;
      }
      if (tieSplit && (crossings > selectedScore![1]!
        || (crossings === selectedScore![1] && throughCards > selectedScore![2]!))) {
        outscored = true;
        break;
      }
    }
    if (outscored) continue;
    const score: number[] = [
      splitClusters,
      crossings,
      throughCards,
      candidate.mapIntersections,
      candidate.sideDeviation,
      space.normalizedSideLoad(state.sideLoads.get(candidate.placement.side)!, candidate.placement.side),
      candidate.distance,
      candidate.placement.y,
      candidate.placement.x,
    ];
    if (!selectedScore || compareScores(score, selectedScore) < 0) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return selected;
}

function repairPlacement(card: CardLayoutInput, space: LayoutSpace, placed: PlacementIndex): CardPlacement {
  const probe: CardPlacement = {
    ...card,
    x: space.clampX(card.anchorX - card.width / 2, card.width),
    y: space.clampY(card.anchorY - card.height / 2, card.height),
    side: "right",
  };
  const repaired = containFree({ ...probe, side: space.sideOf(probe) }, space, placed);
  return { ...repaired, side: space.sideOf(repaired) };
}

/** Run one insertion order; `null` when it had to give up. */
function runOrder(
  order: readonly CardLayoutInput[],
  candidates: Map<string, LayoutCandidate[]>,
  clusters: ClusterMap,
  space: LayoutSpace,
  style: ConnectorStyle,
  clearance: number,
  budget: Budget,
): CardPlacement[] | null {
  const state: OrderState = {
    placed: PlacementIndex.forSpace(space),
    geometries: [],
    geometryBounds: [],
    sideLoads: new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0])),
    sides: new Map<string, CardSide>(),
  };
  let repairs = 0;
  const repairLimit = Math.max(MIN_REPAIRS_PER_ORDER, Math.ceil(order.length * REPAIR_SHARE));

  for (const card of order) {
    const selected = selectCandidate(
      candidates.get(card.id) ?? [],
      clusters.get(card.id) ?? [],
      state,
      clearance,
      space,
      budget,
    );
    // Every candidate collided (or the card had none). Repairs are scanned
    // searches, so an order that needs more than its share of them costs more
    // than the whole packing ladder; abandoning it here loses nothing, because
    // the caller keeps the packed layout it was trying to beat.
    if (!selected && ((repairs += 1) > repairLimit || (budget.spent += REPAIR_COST) > SEARCH_BUDGET)) return null;
    const placement = selected?.placement ?? repairPlacement(card, space, state.placed);
    const geometry = selected?.geometry ?? buildConnectorGeometry({
      card: placement,
      anchor: { x: card.anchorX, y: card.anchorY },
      preferredSide: placement.side,
      style,
    });
    const geometryBounds = selected?.geometryBounds ?? connectorBounds(geometry);
    state.placed.add(placement);
    state.geometries.push(geometry);
    state.geometryBounds.push(geometryBounds);
    state.sides.set(placement.id, placement.side);
    state.sideLoads.set(
      placement.side,
      state.sideLoads.get(placement.side)! + sideAxisSize(placement, placement.side) + space.gap,
    );
  }
  return state.placed.items;
}

/**
 * Best-of-N insertion search. Returns `null` when no order produced a layout
 * that satisfies the hard constraints, letting the caller fall back.
 *
 * `seed` is the layout the caller would otherwise ship — the side-packed one,
 * already known to be legal. Scoring it alongside the insertion orders makes
 * the search a strict improvement: it can only return something that beats the
 * packed layout on connector quality, never something merely different. Pass
 * `null` when the caller has no legal layout to defend.
 */
export function optimizedLayout(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
  seed: readonly CardPlacement[] | null = null,
): CardPlacement[] | null {
  const style = options.connectorStyle ?? "curve";
  const clearance = Math.max(0, options.connectorWidth ?? 1.5);
  const assignedSides = homeSides(cards, space, mode, options);
  const candidates = new Map(cards.map((card) => [
    card.id,
    buildCandidates(card, cards, space, assignedSides.get(card.id) ?? "right", style),
  ]));
  const candidateCounts = new Map([...candidates].map(([id, items]) => [id, items.length]));
  const clusters = anchorClusters(cards);

  let best: CardPlacement[] | null = seed ? [...seed] : null;
  let bestScore = seed ? scoreLayout(seed, assignedSides, style, clearance, space) : null;
  const seeded = best;
  const budget: Budget = { spent: 0 };
  const seenOrders = new Set<string>();
  for (const order of insertionOrders(cards, space, candidateCounts)) {
    // An order already under way always finishes, so exhaustion costs
    // exploration and never a card's place.
    if (budget.spent > SEARCH_BUDGET) break;
    const signature = order.map((card) => card.id).join("\0");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);

    const placed = runOrder(order, candidates, clusters, space, style, clearance, budget);
    if (!placed || placed.length !== cards.length || !validateHard(placed, space)) continue;
    const score = scoreLayout(placed, assignedSides, style, clearance, space);
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = [...placed];
      bestScore = score;
    }
  }
  // Nothing beat the layout the caller already had; say so rather than handing
  // back a copy, so the caller keeps its own status and ordering.
  if (best === seeded) return null;
  return best ? orderResult(cards, best) : null;
}
