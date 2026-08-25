/**
 * Candidate slot generation for the optimizing solver.
 *
 * Positions are not sampled on a fixed grid: they come from the rails that
 * matter (canvas margin, map edges, obstacle edges, other anchors), so narrow
 * but legal tracks survive. Each shortlisted slot carries its connector
 * geometry so the placement loop never rebuilds it.
 */

import type { ConnectorGeometry, ConnectorStyle } from "./connector-geometry";
import {
  clamp,
  SIDE_ORDER,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";
import { polygonBounds } from "./card-layout-polygons";
import {
  hitsProtected,
  isInsideCanvas,
  obstacleZones,
  sideForPlacement,
} from "./card-layout-collision";
import {
  compareScores,
  connectorBounds,
  connectorMapIntersections,
  placementGeometry,
  sideDistance,
} from "./card-layout-connectors";
import { classifyQuadrant, classifyRadial } from "./card-layout-pack";

export interface LayoutCandidate {
  placement: CardPlacement;
  geometry: ConnectorGeometry;
  geometryBounds: CardArea;
  mapIntersections: number;
  distance: number;
  sideDeviation: number;
}

export const MAX_OPTIMIZED_CARDS = 80;
const MAX_CANDIDATES_PER_SIDE = 36;
const DENSE_CANDIDATES_PER_SIDE = 12;
const MAX_RAILS_PER_AXIS = 14;

export function homeSides(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): Map<string, CardSide> {
  const assignments = mode === "radial"
    ? classifyRadial(cards, bounds)
    : classifyQuadrant(cards, bounds, options);
  return new Map(assignments.flatMap(({ side, cards: assigned }) =>
    assigned.map((card) => [card.id, side] as const)));
}

function addRail(rails: Set<number>, value: number, minimum: number, maximum: number): void {
  if (Number.isFinite(value)) rails.add(clamp(value, minimum, maximum));
}

function nearestRails(rails: Set<number>, target: number): number[] {
  return [...rails]
    .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right)
    .slice(0, MAX_RAILS_PER_AXIS);
}

export function buildCandidates(
  card: CardLayoutInput,
  allCards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  homeSide: CardSide,
  style: ConnectorStyle,
): LayoutCandidate[] {
  const maxX = bounds.width - bounds.margin - card.width;
  const maxY = bounds.height - bounds.margin - card.height;
  const preferredX = card.anchorX - card.width / 2;
  const preferredY = card.anchorY - card.height / 2;
  const xRails = new Set<number>();
  const yRails = new Set<number>();
  const zones = obstacleZones(bounds);
  const map = bounds.map;

  for (const x of [
    bounds.margin,
    maxX,
    preferredX,
    map.x - bounds.gap - card.width,
    map.x,
    map.x + map.width - card.width,
    map.x + map.width + bounds.gap,
  ]) addRail(xRails, x, bounds.margin, maxX);
  for (const y of [
    bounds.margin,
    maxY,
    preferredY,
    map.y - bounds.gap - card.height,
    map.y,
    map.y + map.height - card.height,
    map.y + map.height + bounds.gap,
  ]) addRail(yRails, y, bounds.margin, maxY);

  for (const area of zones) {
    for (const x of [
      area.x - bounds.gap - card.width,
      area.x,
      area.x + area.width - card.width,
      area.x + area.width + bounds.gap,
    ]) addRail(xRails, x, bounds.margin, maxX);
    for (const y of [
      area.y - bounds.gap - card.height,
      area.y,
      area.y + area.height - card.height,
      area.y + area.height + bounds.gap,
    ]) addRail(yRails, y, bounds.margin, maxY);
  }
  for (const polygon of bounds.occupiedPolygons ?? []) {
    const area = polygonBounds(polygon);
    if (!area) continue;
    for (const x of [
      area.x - bounds.gap - card.width,
      area.x + area.width + bounds.gap,
    ]) addRail(xRails, x, bounds.margin, maxX);
    for (const y of [
      area.y - bounds.gap - card.height,
      area.y + area.height + bounds.gap,
    ]) addRail(yRails, y, bounds.margin, maxY);
  }
  for (const input of allCards) {
    addRail(xRails, input.anchorX - card.width / 2, bounds.margin, maxX);
    addRail(yRails, input.anchorY - card.height / 2, bounds.margin, maxY);
  }

  const candidateX = nearestRails(xRails, preferredX);
  const candidateY = nearestRails(yRails, preferredY);

  const raw = new Map<string, CardPlacement>();
  const addCandidate = (x: number, y: number) => {
    const area = {
      x: clamp(x, bounds.margin, maxX),
      y: clamp(y, bounds.margin, maxY),
      width: card.width,
      height: card.height,
    };
    if (!isInsideCanvas(area, bounds) || hitsProtected(area, bounds)) return;
    raw.set(`${area.x.toFixed(3)}:${area.y.toFixed(3)}`, {
      ...card,
      x: area.x,
      y: area.y,
      side: sideForPlacement(area, bounds),
    });
  };

  addCandidate(preferredX, preferredY);
  for (const x of candidateX) {
    addCandidate(x, preferredY);
    for (const y of candidateY) addCandidate(x, y);
  }
  for (const y of candidateY) {
    addCandidate(preferredX, y);
    for (const x of candidateX) addCandidate(x, y);
  }

  const placementsBySide = new Map<CardSide, CardPlacement[]>(
    SIDE_ORDER.map((side) => [side, []]),
  );
  for (const placement of raw.values()) {
    placementsBySide.get(placement.side)!.push(placement);
  }

  const candidateLimit = allCards.length > 36 ? DENSE_CANDIDATES_PER_SIDE : MAX_CANDIDATES_PER_SIDE;
  const candidatesBySide = new Map<CardSide, LayoutCandidate[]>(
    SIDE_ORDER.map((side) => [side, []]),
  );
  for (const side of SIDE_ORDER) {
    const shortlisted = placementsBySide.get(side)!
      .sort((left, right) => compareScores(
        [
          sideDistance(left.side, homeSide),
          Math.hypot(left.x + left.width / 2 - left.anchorX, left.y + left.height / 2 - left.anchorY),
          left.y,
          left.x,
        ],
        [
          sideDistance(right.side, homeSide),
          Math.hypot(right.x + right.width / 2 - right.anchorX, right.y + right.height / 2 - right.anchorY),
          right.y,
          right.x,
        ],
      ))
      .slice(0, candidateLimit);
    for (const placement of shortlisted) {
      // `placement` spreads `card`, so its anchor is the card's own anchor.
      const geometry = placementGeometry(placement, style);
      const geometryBounds = connectorBounds(geometry);
      candidatesBySide.get(placement.side)!.push({
        placement,
        geometry,
        geometryBounds,
        mapIntersections: connectorMapIntersections(
          geometry,
          geometryBounds,
          { x: card.anchorX, y: card.anchorY },
          bounds.occupiedPolygons ?? [],
        ),
        distance: Math.hypot(
          placement.x + placement.width / 2 - placement.anchorX,
          placement.y + placement.height / 2 - placement.anchorY,
        ),
        sideDeviation: sideDistance(placement.side, homeSide),
      });
    }
  }

  return SIDE_ORDER.flatMap((side) => candidatesBySide.get(side)!
    .sort((left, right) => compareScores(
      [left.mapIntersections, left.sideDeviation, left.distance, left.placement.y, left.placement.x],
      [right.mapIntersections, right.sideDeviation, right.distance, right.placement.y, right.placement.x],
    ))
    .slice(0, candidateLimit));
}
