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

export const MAX_OPTIMIZED_CARDS = 80;
/** Scanned repairs allowed per insertion order before abandoning it. */
const MAX_REPAIRS_PER_ORDER = 3;

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
      if (connectorHitsCard(geometries[left]!, placements[right]!, clearance)) throughCards += 1;
      if (connectorHitsCard(geometries[right]!, placements[left]!, clearance)) throughCards += 1;
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

interface OrderState {
  placed: PlacementIndex;
  geometries: ConnectorGeometry[];
  geometryBounds: CardArea[];
  sideLoads: Map<CardSide, number>;
}

/** Best candidate for one card given what is already on the canvas. */
function selectCandidate(
  candidates: readonly LayoutCandidate[],
  state: OrderState,
  clearance: number,
  space: LayoutSpace,
): LayoutCandidate | null {
  let selected: LayoutCandidate | null = null;
  let selectedScore: number[] | null = null;
  for (const candidate of candidates) {
    if (state.placed.hits(candidate.placement, space.gap)) continue;
    let crossings = 0;
    let throughCards = 0;
    let splitClusters = 0;
    for (let index = 0; index < state.placed.size; index += 1) {
      const other = state.placed.items[index]!;
      if (connectorIntersects(
        candidate.geometry,
        candidate.geometryBounds,
        state.geometries[index]!,
        state.geometryBounds[index]!,
        clearance,
      )) crossings += 1;
      if (connectorHitsCard(candidate.geometry, other, clearance)) throughCards += 1;
      if (connectorHitsCard(state.geometries[index]!, candidate.placement, clearance)) throughCards += 1;
      if (sameAnchorCluster(candidate.placement, other) && candidate.placement.side !== other.side) {
        splitClusters += 1;
      }
    }
    const score = [
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
  space: LayoutSpace,
  style: ConnectorStyle,
  clearance: number,
): CardPlacement[] | null {
  const state: OrderState = {
    placed: PlacementIndex.forSpace(space),
    geometries: [],
    geometryBounds: [],
    sideLoads: new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0])),
  };
  let repairs = 0;

  for (const card of order) {
    const selected = selectCandidate(candidates.get(card.id) ?? [], state, clearance, space);
    // Every candidate collided (or the card had none). Repairs are scanned
    // searches, so past the budget the order is hopeless and the cheaper
    // packing ladder takes over.
    if (!selected && (repairs += 1) > MAX_REPAIRS_PER_ORDER) return null;
    const placement = selected?.placement ?? repairPlacement(card, space, state.placed);
    const geometry = selected?.geometry ?? buildConnectorGeometry({
      card: placement,
      anchor: { x: card.anchorX, y: card.anchorY },
      preferredSide: placement.side,
      style,
    });
    state.placed.add(placement);
    state.geometries.push(geometry);
    state.geometryBounds.push(selected?.geometryBounds ?? connectorBounds(geometry));
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
 */
export function optimizedLayout(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): CardPlacement[] | null {
  const style = options.connectorStyle ?? "curve";
  const clearance = Math.max(0, options.connectorWidth ?? 1.5);
  const assignedSides = homeSides(cards, space, mode, options);
  const candidates = new Map(cards.map((card) => [
    card.id,
    buildCandidates(card, cards, space, assignedSides.get(card.id) ?? "right", style),
  ]));
  const candidateCounts = new Map([...candidates].map(([id, items]) => [id, items.length]));

  let best: CardPlacement[] | null = null;
  let bestScore: number[] | null = null;
  const seenOrders = new Set<string>();
  for (const order of insertionOrders(cards, space, candidateCounts)) {
    const signature = order.map((card) => card.id).join("\0");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);

    const placed = runOrder(order, candidates, space, style, clearance);
    if (!placed || placed.length !== cards.length || !validateHard(placed, space)) continue;
    const score = scoreLayout(placed, assignedSides, style, clearance, space);
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = [...placed];
      bestScore = score;
    }
  }
  return best ? orderResult(cards, best) : null;
}
