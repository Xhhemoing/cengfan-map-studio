/**
 * `proximity` mode: every card takes the legal position closest to its anchor,
 * larger cards first so they claim the tight spots. Crossing-free candidates
 * always beat crossing ones, so a solvable board never ships a crossing.
 */

import type { ConnectorGeometry } from "./connector-geometry";
import {
  clamp,
  centerOf,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
} from "./card-layout-types";
import {
  containFree,
  hitsPlaced,
  hitsProtected,
  isInsideCanvas,
  orderResult,
  sideForPlacement,
} from "./card-layout-collision";
import {
  compareScores,
  connectorBounds,
  connectorClearance,
  connectorHitsCard,
  connectorIntersects,
  placementGeometry,
} from "./card-layout-connectors";

const PROXIMITY_CANDIDATE_LIMIT = 24;
const PROXIMITY_MAX_PROBES = 4200;

interface ProximitySpot {
  x: number;
  y: number;
  /** Squared distance from the card centre to its anchor. */
  distance: number;
}

/**
 * The obstacle-free positions closest to a card's anchor, nearest first.
 *
 * Probes walk outward in square rings around the ideal (anchor-centred) spot,
 * so the shortlist fills with genuinely near positions immediately and the
 * scan stops as soon as no farther ring can beat the worst kept candidate.
 */
function proximitySpots(card: CardLayoutInput, bounds: CardLayoutBounds): ProximitySpot[] {
  const maxX = bounds.width - bounds.margin - card.width;
  const maxY = bounds.height - bounds.margin - card.height;
  const centre = centerOf(bounds.map);
  const anchorX = Number.isFinite(card.anchorX) ? card.anchorX : centre.x;
  const anchorY = Number.isFinite(card.anchorY) ? card.anchorY : centre.y;
  const idealX = clamp(anchorX - card.width / 2, bounds.margin, maxX);
  const idealY = clamp(anchorY - card.height / 2, bounds.margin, maxY);
  const extent = Math.min(card.width, card.height);
  const step = Number.isFinite(extent) ? clamp(extent / 2, 8, 28) : 16;

  const spots: ProximitySpot[] = [];
  const seen = new Set<string>();
  let worst = Infinity;
  let probes = 0;

  const consider = (rawX: number, rawY: number) => {
    const x = clamp(rawX, bounds.margin, maxX);
    const y = clamp(rawY, bounds.margin, maxY);
    const key = `${x.toFixed(3)}:${y.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const dx = x + card.width / 2 - anchorX;
    const dy = y + card.height / 2 - anchorY;
    const distance = dx * dx + dy * dy;
    if (spots.length >= PROXIMITY_CANDIDATE_LIMIT && distance >= worst) return;
    probes += 1;
    const area: CardArea = { x, y, width: card.width, height: card.height };
    if (!isInsideCanvas(area, bounds) || hitsProtected(area, bounds)) return;
    spots.push({ x, y, distance });
    spots.sort((left, right) => left.distance - right.distance || left.y - right.y || left.x - right.x);
    if (spots.length > PROXIMITY_CANDIDATE_LIMIT) spots.length = PROXIMITY_CANDIDATE_LIMIT;
    worst = spots[spots.length - 1]!.distance;
  };

  const ringsX = Math.ceil(Math.max(idealX - bounds.margin, maxX - idealX) / step);
  const ringsY = Math.ceil(Math.max(idealY - bounds.margin, maxY - idealY) / step);
  const maxRing = Math.max(0, Math.min(400, Math.max(ringsX, ringsY)));
  for (let ring = 0; ring <= maxRing; ring += 1) {
    if (probes > PROXIMITY_MAX_PROBES) break;
    if (spots.length >= PROXIMITY_CANDIDATE_LIMIT) {
      const reach = Math.max(0, (ring - 1) * step);
      if (reach * reach >= worst) break;
    }
    if (ring === 0) {
      consider(idealX, idealY);
      continue;
    }
    for (let row = -ring; row <= ring; row += 1) {
      const edgeRow = row === -ring || row === ring;
      const y = idealY + row * step;
      if (y < bounds.margin - step || y > maxY + step) continue;
      for (let column = -ring; column <= ring; column += 1) {
        if (!edgeRow && column !== -ring && column !== ring) continue;
        const x = idealX + column * step;
        if (x < bounds.margin - step || x > maxX + step) continue;
        consider(x, y);
      }
    }
  }
  return spots;
}

export function layoutProximity(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions,
): CardPlacement[] {
  const style = options.connectorStyle ?? "curve";
  const clearance = connectorClearance(options);
  const order = cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) =>
      right.card.width * right.card.height - left.card.width * left.card.height
      || left.index - right.index);

  const placed: CardPlacement[] = [];
  const geometries: ConnectorGeometry[] = [];
  const geometryBounds: CardArea[] = [];

  for (const { card } of order) {
    let selected: CardPlacement | null = null;
    let selectedGeometry: ConnectorGeometry | null = null;
    let selectedBounds: CardArea | null = null;
    let selectedScore: number[] | null = null;

    for (const spot of proximitySpots(card, bounds)) {
      const area: CardArea = { x: spot.x, y: spot.y, width: card.width, height: card.height };
      if (hitsPlaced(area, placed, bounds.gap)) continue;
      const placement: CardPlacement = { ...card, x: spot.x, y: spot.y, side: sideForPlacement(area, bounds) };
      const geometry = placementGeometry(placement, style);
      const currentBounds = connectorBounds(geometry);
      let crossings = 0;
      let throughCards = 0;
      for (let index = 0; index < placed.length; index += 1) {
        if (connectorIntersects(
          geometry,
          currentBounds,
          geometries[index]!,
          geometryBounds[index]!,
          clearance,
        )) crossings += 1;
        if (connectorHitsCard(geometry, currentBounds, placed[index]!, clearance)) throughCards += 1;
        if (connectorHitsCard(geometries[index]!, geometryBounds[index]!, placement, clearance)) throughCards += 1;
      }
      const score = [crossings, throughCards, spot.distance, spot.y, spot.x];
      if (!selectedScore || compareScores(score, selectedScore) < 0) {
        selected = placement;
        selectedGeometry = geometry;
        selectedBounds = currentBounds;
        selectedScore = score;
      }
      // Nothing farther can beat a crossing-free, card-free nearest candidate.
      if (crossings === 0 && throughCards === 0) break;
    }

    if (!selected) {
      const probe: CardPlacement = {
        ...card,
        x: clamp(card.anchorX - card.width / 2, bounds.margin, bounds.width - bounds.margin - card.width),
        y: clamp(card.anchorY - card.height / 2, bounds.margin, bounds.height - bounds.margin - card.height),
        side: "right",
      };
      const free = containFree(probe, bounds, placed);
      selected = { ...free, side: sideForPlacement(free, bounds) };
      selectedGeometry = placementGeometry(selected, style);
      selectedBounds = connectorBounds(selectedGeometry);
    }

    placed.push(selected);
    geometries.push(selectedGeometry!);
    geometryBounds.push(selectedBounds!);
  }

  return orderResult(cards, placed);
}
