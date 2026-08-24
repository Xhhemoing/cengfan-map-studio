/**
 * Candidate generation for the connector-aware search.
 *
 * A card's candidates are rail-aligned rectangles: the rails come from the
 * canvas edges, the map frame, every obstacle edge and every anchor, so narrow
 * but legal tracks survive while the search space stays small. Each surviving
 * rectangle is paired with the connector it would produce.
 */
import { buildConnectorGeometry, type ConnectorGeometry, type ConnectorStyle } from "./connector-geometry";
import { clamp, compareScores, sideDistance } from "./card-layout-geometry";
import { connectorBounds, connectorMapIntersections } from "./card-layout-connectors";
import type { LayoutSpace } from "./card-layout-space";
import {
  SIDE_ORDER,
  type CardArea,
  type CardLayoutInput,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

const MAX_CANDIDATES_PER_SIDE = 36;
const DENSE_CANDIDATES_PER_SIDE = 12;
/** Above this card count the shortlists shrink to keep the search tractable. */
export const DENSE_CARD_COUNT = 36;
const MAX_RAILS_PER_AXIS = 14;
/** Obstacle rails kept even when the anchor rails already fill the budget. */
const MIN_OBSTACLE_RAILS = 4;

export interface LayoutCandidate {
  placement: CardPlacement;
  geometry: ConnectorGeometry;
  geometryBounds: CardArea;
  mapIntersections: number;
  distance: number;
  sideDeviation: number;
}

function addRail(rails: Set<number>, value: number, minimum: number, maximum: number): void {
  if (Number.isFinite(value)) rails.add(clamp(value, minimum, maximum));
}

function byDistanceTo(target: number) {
  return (left: number, right: number) => Math.abs(left - target) - Math.abs(right - target) || left - right;
}

/**
 * Rails nearest the anchor, capped for cost.
 *
 * `keepFrame` exempts the canvas-edge and map-frame rails from the cap. A
 * vector map contributes two rails per province, and on a 34-province board
 * those crowd around the anchor and evict the frame rails — the only ones
 * reliably clear of geography. A card left with nothing but blocked rails
 * yields no candidates, which silently drops the connector-aware search on
 * exactly the boards it matters most on. Widening costs candidates elsewhere,
 * so it is only used for cards that came up empty.
 */
function mergeRails(frame: Set<number>, obstacles: Set<number>, target: number, keepFrame: boolean): number[] {
  const extra = [...obstacles].filter((value) => !frame.has(value)).sort(byDistanceTo(target));
  if (!keepFrame) return [...frame, ...extra].sort(byDistanceTo(target)).slice(0, MAX_RAILS_PER_AXIS);
  return [...frame, ...extra.slice(0, Math.max(MIN_OBSTACLE_RAILS, MAX_RAILS_PER_AXIS - frame.size))]
    .sort(byDistanceTo(target));
}

function collectRails(
  card: CardLayoutInput,
  allCards: readonly CardLayoutInput[],
  space: LayoutSpace,
  keepFrame: boolean,
): { x: number[]; y: number[] } {
  const maxX = space.maxX(card.width);
  const maxY = space.maxY(card.height);
  const preferredX = card.anchorX - card.width / 2;
  const preferredY = card.anchorY - card.height / 2;
  const xFrame = new Set<number>();
  const yFrame = new Set<number>();
  const xRails = new Set<number>();
  const yRails = new Set<number>();
  const map = space.map;

  for (const x of [
    space.margin,
    maxX,
    preferredX,
    map.x - space.gap - card.width,
    map.x,
    map.x + map.width - card.width,
    map.x + map.width + space.gap,
  ]) addRail(xFrame, x, space.margin, maxX);
  for (const y of [
    space.margin,
    maxY,
    preferredY,
    map.y - space.gap - card.height,
    map.y,
    map.y + map.height - card.height,
    map.y + map.height + space.gap,
  ]) addRail(yFrame, y, space.margin, maxY);

  for (const area of space.zones) {
    for (const x of [
      area.x - space.gap - card.width,
      area.x,
      area.x + area.width - card.width,
      area.x + area.width + space.gap,
    ]) addRail(xRails, x, space.margin, maxX);
    for (const y of [
      area.y - space.gap - card.height,
      area.y,
      area.y + area.height - card.height,
      area.y + area.height + space.gap,
    ]) addRail(yRails, y, space.margin, maxY);
  }
  // Polygon AABBs only contribute the two clear-of-the-shape rails; their
  // inner edges are meaningless for a non-rectangular province.
  for (const { area } of space.polygons) {
    addRail(xRails, area.x - space.gap - card.width, space.margin, maxX);
    addRail(xRails, area.x + area.width + space.gap, space.margin, maxX);
    addRail(yRails, area.y - space.gap - card.height, space.margin, maxY);
    addRail(yRails, area.y + area.height + space.gap, space.margin, maxY);
  }
  for (const input of allCards) {
    addRail(xRails, input.anchorX - card.width / 2, space.margin, maxX);
    addRail(yRails, input.anchorY - card.height / 2, space.margin, maxY);
  }

  return {
    x: mergeRails(xFrame, xRails, preferredX, keepFrame),
    y: mergeRails(yFrame, yRails, preferredY, keepFrame),
  };
}

/** Legal rectangles for one card on the given rail set, keyed by position. */
function railPlacements(
  card: CardLayoutInput,
  allCards: readonly CardLayoutInput[],
  space: LayoutSpace,
  keepFrame: boolean,
): Map<string, CardPlacement> {
  const preferredX = card.anchorX - card.width / 2;
  const preferredY = card.anchorY - card.height / 2;
  const rails = collectRails(card, allCards, space, keepFrame);

  const raw = new Map<string, CardPlacement>();
  const addCandidate = (x: number, y: number) => {
    const area = {
      x: space.clampX(x, card.width),
      y: space.clampY(y, card.height),
      width: card.width,
      height: card.height,
    };
    if (!space.inside(area) || space.blocked(area)) return;
    raw.set(`${area.x.toFixed(3)}:${area.y.toFixed(3)}`, {
      ...card,
      x: area.x,
      y: area.y,
      side: space.sideOf(area),
    });
  };

  addCandidate(preferredX, preferredY);
  for (const x of rails.x) {
    addCandidate(x, preferredY);
    for (const y of rails.y) addCandidate(x, y);
  }
  for (const y of rails.y) {
    addCandidate(preferredX, y);
    for (const x of rails.x) addCandidate(x, y);
  }
  return raw;
}

export function buildCandidates(
  card: CardLayoutInput,
  allCards: readonly CardLayoutInput[],
  space: LayoutSpace,
  homeSide: CardSide,
  style: ConnectorStyle,
): LayoutCandidate[] {
  const nearest = railPlacements(card, allCards, space, false);
  const raw = nearest.size > 0 ? nearest : railPlacements(card, allCards, space, true);

  const placementsBySide = new Map<CardSide, CardPlacement[]>(SIDE_ORDER.map((side) => [side, []]));
  for (const placement of raw.values()) placementsBySide.get(placement.side)!.push(placement);

  const limit = allCards.length > DENSE_CARD_COUNT ? DENSE_CANDIDATES_PER_SIDE : MAX_CANDIDATES_PER_SIDE;
  const anchorDistance = (placement: CardPlacement) => Math.hypot(
    placement.x + placement.width / 2 - placement.anchorX,
    placement.y + placement.height / 2 - placement.anchorY,
  );

  // Shortlist per side first so a crowded home side cannot starve the others.
  const candidates: LayoutCandidate[] = [];
  for (const side of SIDE_ORDER) {
    const shortlisted = placementsBySide.get(side)!
      .sort((left, right) => compareScores(
        [sideDistance(left.side, homeSide), anchorDistance(left), left.y, left.x],
        [sideDistance(right.side, homeSide), anchorDistance(right), right.y, right.x],
      ))
      .slice(0, limit);
    for (const placement of shortlisted) {
      const geometry = buildConnectorGeometry({
        card: placement,
        anchor: { x: card.anchorX, y: card.anchorY },
        preferredSide: placement.side,
        style,
      });
      candidates.push({
        placement,
        geometry,
        geometryBounds: connectorBounds(geometry),
        mapIntersections: connectorMapIntersections(geometry, { x: card.anchorX, y: card.anchorY }, space),
        distance: anchorDistance(placement),
        sideDeviation: sideDistance(placement.side, homeSide),
      });
    }
  }

  return SIDE_ORDER.flatMap((side) => candidates
    .filter((candidate) => candidate.placement.side === side)
    .sort((left, right) => compareScores(
      [left.mapIntersections, left.sideDeviation, left.distance, left.placement.y, left.placement.x],
      [right.mapIntersections, right.sideDeviation, right.distance, right.placement.y, right.placement.x],
    ))
    .slice(0, limit));
}
