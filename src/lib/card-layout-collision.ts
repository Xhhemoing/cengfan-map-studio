/**
 * Obstacle sets and containment repair.
 *
 * The two overlap switches (`allowMapOverlap`, `allowElementOverlap`) relax
 * independent obstacle sets, so every "may this rectangle live here?" question
 * routes through {@link hitsProtected} rather than reading the bounds fields
 * directly. The broad-phase index and the `containFree` scan below are the hot
 * path for saturated boards.
 */

import {
  clamp,
  centerOf,
  overlaps,
  EPSILON,
  type CardArea,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";
import { polygonsHitRectangle } from "./card-layout-polygons";

const derivedZones = new WeakMap<CardLayoutBounds, CardArea[]>();
const mergedZones = new WeakMap<CardLayoutBounds, CardArea[]>();
const NO_ZONES: CardArea[] = [];

/**
 * Map-side obstacles: caller-supplied `occupiedAreas` plus, when nothing more
 * precise is available, the map frame itself. `allowMapOverlap` only relaxes
 * the derived frame — callers drop map rects from `occupiedAreas` themselves.
 */
export function protectedZones(bounds: CardLayoutBounds): CardArea[] {
  if (bounds.occupiedAreas !== undefined) return bounds.occupiedAreas;
  if (bounds.occupiedPolygons && bounds.occupiedPolygons.length) return NO_ZONES;
  if (bounds.allowMapOverlap) return NO_ZONES;
  const cached = derivedZones.get(bounds);
  if (cached) return cached;
  const zones = [bounds.map];
  derivedZones.set(bounds, zones);
  return zones;
}

/** Element obstacles, relaxed by the second (independent) overlap switch. */
export function elementZones(bounds: CardLayoutBounds): CardArea[] {
  if (bounds.allowElementOverlap) return NO_ZONES;
  const areas = bounds.elementAreas;
  return areas && areas.length > 0 ? areas : NO_ZONES;
}

/** Every rectangle a card must avoid under the current pair of switches. */
export function obstacleZones(bounds: CardLayoutBounds): CardArea[] {
  const map = protectedZones(bounds);
  const elements = elementZones(bounds);
  if (elements.length === 0) return map;
  if (map.length === 0) return elements;
  const cached = mergedZones.get(bounds);
  if (cached) return cached;
  const merged = [...map, ...elements];
  mergedZones.set(bounds, merged);
  return merged;
}

export function isInsideCanvas(card: CardArea, bounds: CardLayoutBounds): boolean {
  return card.x >= bounds.margin - EPSILON
    && card.y >= bounds.margin - EPSILON
    && card.x + card.width <= bounds.width - bounds.margin + EPSILON
    && card.y + card.height <= bounds.height - bounds.margin + EPSILON;
}

export function hitsProtected(card: CardArea, bounds: CardLayoutBounds): boolean {
  const gap = bounds.gap;
  for (const zone of obstacleZones(bounds)) {
    if (overlaps(card, zone, gap)) return true;
  }
  const polygons = bounds.occupiedPolygons;
  if (!polygons || polygons.length === 0) return false;
  return polygonsHitRectangle(
    polygons,
    card.x - gap,
    card.y - gap,
    card.x + card.width + gap,
    card.y + card.height + gap,
  );
}

export function hitsPlaced(card: CardArea, placed: CardArea[], gap: number): boolean {
  for (const other of placed) {
    if (overlaps(card, other, gap)) return true;
  }
  return false;
}

/**
 * Uniform-grid broad phase over a fixed set of placed cards. Built once per
 * repair scan so the 12px probe grid stops rescanning every prior placement.
 */
interface RectIndex {
  hits(x: number, y: number, width: number, height: number, gap: number): boolean;
}

export function buildRectIndex(rects: readonly CardArea[], bounds: CardLayoutBounds): RectIndex {
  if (rects.length < 12) {
    return {
      hits(x, y, width, height, gap) {
        for (const other of rects) {
          if (x < other.x + other.width + gap
            && x + width + gap > other.x
            && y < other.y + other.height + gap
            && y + height + gap > other.y) return true;
        }
        return false;
      },
    };
  }
  const axis = Math.max(1, Math.min(48, Math.ceil(Math.sqrt(rects.length))));
  const cellWidth = Math.max(1, bounds.width / axis);
  const cellHeight = Math.max(1, bounds.height / axis);
  const lists: number[][] = Array.from({ length: axis * axis }, () => []);
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]!;
    const minColumn = clamp(Math.floor(rect.x / cellWidth), 0, axis - 1);
    const maxColumn = clamp(Math.floor((rect.x + rect.width) / cellWidth), 0, axis - 1);
    const minRow = clamp(Math.floor(rect.y / cellHeight), 0, axis - 1);
    const maxRow = clamp(Math.floor((rect.y + rect.height) / cellHeight), 0, axis - 1);
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        lists[row * axis + column]!.push(index);
      }
    }
  }
  const buckets = lists.map((list) => Int32Array.from(list));
  const visited = new Int32Array(rects.length);
  let epoch = 0;
  return {
    hits(x, y, width, height, gap) {
      const minColumn = clamp(Math.floor((x - gap) / cellWidth), 0, axis - 1);
      const maxColumn = clamp(Math.floor((x + width + gap) / cellWidth), 0, axis - 1);
      const minRow = clamp(Math.floor((y - gap) / cellHeight), 0, axis - 1);
      const maxRow = clamp(Math.floor((y + height + gap) / cellHeight), 0, axis - 1);
      epoch += 1;
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          for (const candidate of buckets[row * axis + column]!) {
            if (visited[candidate] === epoch) continue;
            visited[candidate] = epoch;
            const other = rects[candidate]!;
            if (x < other.x + other.width + gap
              && x + width + gap > other.x
              && y < other.y + other.height + gap
              && y + height + gap > other.y) return true;
          }
        }
      }
      return false;
    },
  };
}

/** Greedy containment repair: nudge a placement into a free spot, canvas-first. */
export function containFree(
  placement: CardPlacement,
  bounds: CardLayoutBounds,
  placed: CardPlacement[],
): CardPlacement {
  if (isInsideCanvas(placement, bounds) && !hitsProtected(placement, bounds) && !hitsPlaced(placement, placed, bounds.gap)) {
    return placement;
  }
  const step = 12;
  // Scan a fine grid of candidate anchors, keeping the nearest free one to the
  // original probe so the card lands close to its preferred region. Distance is
  // compared squared and checked *before* any collision test, so once a free
  // spot is known every farther probe (and every farther row) is skipped
  // outright instead of paying for polygon and placement tests.
  const ox = placement.x;
  const oy = placement.y;
  const maxRx = bounds.width - bounds.margin - placement.width;
  const maxRy = bounds.height - bounds.margin - placement.height;
  const occupied = buildRectIndex(placed, bounds);
  const probe: CardArea = { x: 0, y: 0, width: placement.width, height: placement.height };
  let bestX = 0;
  let bestY = 0;
  let bestDistance = Infinity;
  let found = false;
  for (let ry = bounds.margin; ry <= maxRy; ry += step) {
    const dy = ry - oy;
    const rowDistance = dy * dy;
    if (rowDistance >= bestDistance) continue;
    for (let rx = bounds.margin; rx <= maxRx; rx += step) {
      const dx = rx - ox;
      const distance = dx * dx + rowDistance;
      if (!(distance < bestDistance)) continue;
      probe.x = rx;
      probe.y = ry;
      if (!isInsideCanvas(probe, bounds)) continue;
      if (hitsProtected(probe, bounds)) continue;
      if (occupied.hits(rx, ry, placement.width, placement.height, bounds.gap)) continue;
      bestDistance = distance;
      bestX = rx;
      bestY = ry;
      found = true;
    }
  }
  if (found) return { ...placement, x: bestX, y: bestY };
  // Last resort: stack at the margin along y, deduplicating so cards never
  // fully overlap. The card is guaranteed visible; overlaps here only happen
  // under total canvas saturation, reported as `fallback`.
  let y = bounds.margin;
  for (const p of placed) {
    if (p.x < bounds.margin + placement.width && p.y < y + placement.height && p.y + p.height > y) {
      y = p.y + p.height + bounds.gap;
    }
  }
  return { ...placement, x: bounds.margin, y: clamp(y, bounds.margin, bounds.height - bounds.margin - placement.height) };
}

export function sideForPlacement(placement: CardArea, bounds: CardLayoutBounds): CardSide {
  const mapCenter = centerOf(bounds.map);
  const cardCenter = centerOf(placement);
  const horizontal = (cardCenter.x - mapCenter.x) / Math.max(1, bounds.map.width / 2);
  const vertical = (cardCenter.y - mapCenter.y) / Math.max(1, bounds.map.height / 2);
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

export function orderResult(cards: CardLayoutInput[], placements: CardPlacement[]): CardPlacement[] {
  // Keeps `find`'s first-match semantics for duplicate ids without the O(n²) scan.
  const byId = new Map<string, CardPlacement>();
  for (const placement of placements) {
    if (!byId.has(placement.id)) byId.set(placement.id, placement);
  }
  return cards.map((card) => byId.get(card.id)!);
}

/** Canvas containment, card spacing and obstacle avoidance. */
export function validateGeometry(placements: CardPlacement[], bounds: CardLayoutBounds): boolean {
  for (const card of placements) {
    if (!card) return false;
    if (!isInsideCanvas(card, bounds)) return false;
    if (hitsProtected(card, bounds)) return false;
  }
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (overlaps(placements[i]!, placements[j]!, bounds.gap)) return false;
    }
  }
  return true;
}
