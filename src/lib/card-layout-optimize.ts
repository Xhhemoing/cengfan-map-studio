/**
 * The optimizing solver used by `quadrant` and `radial` when the board carries
 * real obstacles.
 *
 * Cards are placed one at a time from a shortlist of rail candidates, scored
 * against everything already on the board; several placement orders are tried
 * and the best complete board wins. There is no backtracking, so the cost is
 * bounded by (orders × cards × candidates).
 */

import type { ConnectorGeometry, ConnectorStyle } from "./connector-geometry";
import {
  centerOf,
  SIDE_ORDER,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
  type CardPolygon,
  type CardSide,
} from "./card-layout-types";
import { hitsPlaced, orderResult, validateGeometry } from "./card-layout-collision";
import {
  compareScores,
  connectorBounds,
  connectorHitsCard,
  connectorIntersects,
  connectorMapIntersections,
  crossingsEnforced,
  normalizedSideLoad,
  placementGeometry,
  sameAnchorCluster,
  sideAxisSize,
  sideDistance,
} from "./card-layout-connectors";
import {
  buildCandidates,
  homeSides,
  type LayoutCandidate,
} from "./card-layout-candidates";

function angularOrder(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardLayoutInput[] {
  const center = centerOf(bounds.map);
  return [...cards].sort((left, right) => {
    const leftAngle = Math.atan2(left.anchorY - center.y, left.anchorX - center.x);
    const rightAngle = Math.atan2(right.anchorY - center.y, right.anchorX - center.x);
    return leftAngle - rightAngle
      || Math.hypot(left.anchorX - center.x, left.anchorY - center.y)
        - Math.hypot(right.anchorX - center.x, right.anchorY - center.y)
      || left.id.localeCompare(right.id);
  });
}

function scoreLayout(
  placements: CardPlacement[],
  assignedSides: Map<string, CardSide>,
  style: ConnectorStyle,
  clearance: number,
  polygons: CardPolygon[],
  bounds: CardLayoutBounds,
  crossingFirst: boolean,
): number[] {
  const geometries = placements.map((placement) => placementGeometry(placement, style));
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
      sideLoads.get(placement.side)! + sideAxisSize(placement, placement.side) + bounds.gap,
    );
  }
  for (let index = 0; index < geometries.length; index += 1) {
    throughMap += connectorMapIntersections(
      geometries[index]!,
      geometryBounds[index]!,
      { x: placements[index]!.anchorX, y: placements[index]!.anchorY },
      polygons,
    );
  }
  const sideLoad = SIDE_ORDER.reduce((sum, side) => {
    const load = normalizedSideLoad(sideLoads.get(side)!, side, bounds);
    return sum + load * load;
  }, 0);
  const cohesion = crossingFirst
    ? [crossings, splitClusters]
    : [splitClusters, crossings];
  return [...cohesion, throughCards, throughMap, sideDeviation, sideLoad, distance];
}

export function optimizedLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): CardPlacement[] | null {
  const style = options.connectorStyle ?? "curve";
  const clearance = Math.max(0, options.connectorWidth ?? 1.5);
  // When crossings are a hard constraint they outrank the soft cluster-cohesion
  // goal, so a crossing-free candidate can never lose to a crossing one.
  const crossingFirst = crossingsEnforced(options);
  const assignedSides = homeSides(cards, bounds, mode, options);
  const candidates = new Map(cards.map((card) => [
    card.id,
    buildCandidates(card, cards, bounds, assignedSides.get(card.id)!, style),
  ]));
  if ([...candidates.values()].some((items) => items.length === 0)) return null;

  const ordered = angularOrder(cards, bounds);
  const orders: CardLayoutInput[][] = [];
  const starts = Math.min(ordered.length, cards.length > 36 ? 3 : 6);
  for (let index = 0; index < starts; index += 1) {
    const start = Math.floor(index * ordered.length / starts);
    orders.push([...ordered.slice(start), ...ordered.slice(0, start)]);
  }
  orders.push([...ordered].reverse());
  orders.push([...cards].sort((left, right) =>
    candidates.get(left.id)!.length - candidates.get(right.id)!.length
    || left.id.localeCompare(right.id)));

  let best: CardPlacement[] | null = null;
  let bestScore: number[] | null = null;
  const seenOrders = new Set<string>();
  for (const order of orders) {
    const signature = order.map((card) => card.id).join("\0");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);
    const placed: CardPlacement[] = [];
    const geometries: ConnectorGeometry[] = [];
    const geometryBounds: CardArea[] = [];
    const sideLoads = new Map<CardSide, number>(SIDE_ORDER.map((side) => [side, 0]));

    for (const card of order) {
      let selected: LayoutCandidate | null = null;
      let selectedScore: number[] | null = null;
      for (const candidate of candidates.get(card.id)!) {
        if (hitsPlaced(candidate.placement, placed, bounds.gap)) continue;
        let crossings = 0;
        let throughCards = 0;
        let splitClusters = 0;
        for (let index = 0; index < placed.length; index += 1) {
          if (connectorIntersects(
            candidate.geometry,
            candidate.geometryBounds,
            geometries[index]!,
            geometryBounds[index]!,
            clearance,
          )) crossings += 1;
          if (connectorHitsCard(candidate.geometry, candidate.geometryBounds, placed[index]!, clearance)) throughCards += 1;
          if (connectorHitsCard(geometries[index]!, geometryBounds[index]!, candidate.placement, clearance)) throughCards += 1;
          if (sameAnchorCluster(candidate.placement, placed[index]!)
            && candidate.placement.side !== placed[index]!.side) splitClusters += 1;
        }
        const score = [
          ...(crossingFirst ? [crossings, splitClusters] : [splitClusters, crossings]),
          throughCards,
          candidate.mapIntersections,
          candidate.sideDeviation,
          normalizedSideLoad(
            sideLoads.get(candidate.placement.side)!,
            candidate.placement.side,
            bounds,
          ),
          candidate.distance,
          candidate.placement.y,
          candidate.placement.x,
        ];
        if (!selectedScore || compareScores(score, selectedScore) < 0) {
          selected = candidate;
          selectedScore = score;
        }
      }
      if (!selected) break;
      placed.push(selected.placement);
      geometries.push(selected.geometry);
      geometryBounds.push(selected.geometryBounds);
      sideLoads.set(
        selected.placement.side,
        sideLoads.get(selected.placement.side)!
          + sideAxisSize(selected.placement, selected.placement.side)
          + bounds.gap,
      );
    }

    if (placed.length !== cards.length || !validateGeometry(placed, bounds)) continue;
    const score = scoreLayout(
      placed,
      assignedSides,
      style,
      clearance,
      bounds.occupiedPolygons ?? [],
      bounds,
      crossingFirst,
    );
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = placed;
      bestScore = score;
    }
  }
  return best ? orderResult(cards, best) : null;
}
