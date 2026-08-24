/**
 * Connector-quality scoring for the placement search.
 *
 * Two scores live here and they answer different questions. {@link scoreLayout}
 * ranks whole finished layouts, so the search can pick between the insertion
 * orders it tried and the seed it was handed. {@link selectCandidate} ranks the
 * shortlisted rectangles for one card against what is already on the canvas,
 * which is what an insertion order calls once per card.
 *
 * Both are lexicographic over the same idea of quality — split clusters first,
 * then crossings, then connectors cutting through cards — and both are pure:
 * nothing here places a card or rejects one. {@link ./card-layout-optimizer}
 * drives them.
 */
import { buildConnectorGeometry, type ConnectorGeometry, type ConnectorStyle } from "./connector-geometry";
import { type LayoutCandidate } from "./card-layout-candidates";
import {
  connectorBounds,
  connectorHitsCard,
  connectorIntersects,
  connectorMapIntersections,
  sameAnchorCluster,
} from "./card-layout-connectors";
import { compareScores, sideAxisSize, sideDistance } from "./card-layout-geometry";
import { type PlacementIndex, type LayoutSpace } from "./card-layout-space";
import {
  SIDE_ORDER,
  type CardArea,
  type CardLayoutInput,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

/** What one insertion order has committed to so far. */
export interface OrderState {
  placed: PlacementIndex;
  geometries: ConnectorGeometry[];
  geometryBounds: CardArea[];
  sideLoads: Map<CardSide, number>;
  sides: Map<string, CardSide>;
}

/** Deterministic work meter shared by every order of one solve. */
export interface Budget {
  spent: number;
}

/** Cards whose anchors sit in the same province cluster, by card id. */
export type ClusterMap = Map<string, string[]>;

export function anchorClusters(cards: readonly CardLayoutInput[]): ClusterMap {
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

/** Whole-layout quality, lowest first. Used to pick between complete layouts. */
export function scoreLayout(
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

/**
 * Best candidate for one card given what is already on the canvas.
 *
 * Anchor clustering compares geography rather than pixels, so it cannot be
 * derived from the placements on the fly; `cluster` lists the card's cluster
 * peers and the scan only has to look up which side each already took.
 */
export function selectCandidate(
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
