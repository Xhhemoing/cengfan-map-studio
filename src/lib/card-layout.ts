/**
 * Card auto-layout for the 蹭饭图 poster.
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
 * Soft goals: keep each card near its geographic anchor; deterministic output.
 */

import {
  buildConnectorGeometry,
  connectorGeometriesIntersect,
  segmentIntersectsRect,
  type ConnectorGeometry,
  type ConnectorStyle,
} from "./connector-geometry";

export type CardSide = "left" | "right" | "top" | "bottom";
export type CardLayoutMode = "quadrant" | "radial" | "right-stack" | "grid";

export interface CardLayoutInput {
  id: string;
  /** Anchor in canvas pixels (projected province center). */
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
}

export interface CardArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CardPoint {
  x: number;
  y: number;
}

/** One projected geographic polygon. The first ring is the shell; later rings are holes. */
export interface CardPolygon {
  rings: CardPoint[][];
  bounds?: CardArea;
}

export interface CardLayoutBounds {
  width: number;
  height: number;
  /** Actual geographic content rect in canvas pixels (province union or image alignment). */
  map: CardArea;
  margin: number;
  gap: number;
  /** Protected canvas areas. Falls back to the map frame when absent. */
  occupiedAreas?: CardArea[];
  /** Projected province geometry used for pixel-accurate vector-map avoidance. */
  occupiedPolygons?: CardPolygon[];
  /** Allow cards to overlap map geometry while preserving other occupied areas. */
  allowMapOverlap?: boolean;
}

export interface CardPlacement extends CardLayoutInput {
  x: number;
  y: number;
  side: CardSide;
}

export type CardLayoutStatus = "solved" | "fallback";

export interface CardLayoutOptions {
  mode?: CardLayoutMode;
  /** Optimize the left/right split line to equalize column heights (quadrant only). */
  autoBalance?: boolean;
  /** Override the vertical band that routes cards to top/bottom instead of left/right. */
  topBottomBandRatio?: number;
  /** Connector geometry used by both layout scoring and the renderer. */
  connectorStyle?: ConnectorStyle;
  /** Clearance used while comparing connector geometry. */
  connectorWidth?: number;
  /** @deprecated no backtracking budget anymore; accepted for back-compat. */
  searchBudget?: number;
}

export interface CardLayoutResult {
  status: CardLayoutStatus;
  placements: CardPlacement[];
  mode: CardLayoutMode;
}

const EPSILON = 1e-7;
const MIN_GAP = 4;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function overlaps(a: CardArea, b: CardArea, gap = 0): boolean {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function orientation(a: CardPoint, b: CardPoint, c: CardPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: CardPoint, start: CardPoint, end: CardPoint): boolean {
  return Math.abs(orientation(start, end, point)) <= EPSILON
    && point.x >= Math.min(start.x, end.x) - EPSILON
    && point.x <= Math.max(start.x, end.x) + EPSILON
    && point.y >= Math.min(start.y, end.y) - EPSILON
    && point.y <= Math.max(start.y, end.y) + EPSILON;
}

function segmentsIntersect(a: CardPoint, b: CardPoint, c: CardPoint, d: CardPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return pointOnSegment(c, a, b)
    || pointOnSegment(d, a, b)
    || pointOnSegment(a, c, d)
    || pointOnSegment(b, c, d);
}

function pointInRing(point: CardPoint, ring: CardPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]!;
    const end = ring[index]!;
    if (pointOnSegment(point, start, end)) return true;
    if ((start.y > point.y) !== (end.y > point.y)) {
      const x = start.x + (point.y - start.y) * (end.x - start.x) / (end.y - start.y);
      if (x >= point.x - EPSILON) inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: CardPoint, polygon: CardPolygon): boolean {
  const [shell, ...holes] = polygon.rings;
  return Boolean(shell && pointInRing(point, shell) && !holes.some((hole) => pointInRing(point, hole)));
}

function polygonBounds(polygon: CardPolygon): CardArea | null {
  if (polygon.bounds) return polygon.bounds;
  const points = polygon.rings.flat();
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectangleIntersectsPolygon(card: CardArea, polygon: CardPolygon, gap: number): boolean {
  const expanded = {
    x: card.x - gap,
    y: card.y - gap,
    width: card.width + gap * 2,
    height: card.height + gap * 2,
  };
  const bounds = polygonBounds(polygon);
  if (!bounds || !overlaps(expanded, bounds)) return false;
  const corners = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;

  const shell = polygon.rings[0] ?? [];
  if (shell.some((point) => point.x >= expanded.x - EPSILON
    && point.x <= expanded.x + expanded.width + EPSILON
    && point.y >= expanded.y - EPSILON
    && point.y <= expanded.y + expanded.height + EPSILON)) return true;

  const rectangleEdges = corners.map((corner, index) => [
    corner,
    corners[(index + 1) % corners.length]!,
  ] as const);
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && rectangleEdges.some(([start, end]) => segmentsIntersect(point, next, start, end)));
  }));
}

function centerOf(area: CardArea): { x: number; y: number } {
  return { x: area.x + area.width / 2, y: area.y + area.height / 2 };
}

function protectedZones(bounds: CardLayoutBounds): CardArea[] {
  if (bounds.occupiedAreas && bounds.occupiedAreas.length) return bounds.occupiedAreas;
  if (bounds.occupiedPolygons && bounds.occupiedPolygons.length) return [];
  return bounds.allowMapOverlap ? [] : [bounds.map];
}

function isInsideCanvas(card: CardArea, bounds: CardLayoutBounds): boolean {
  return card.x >= bounds.margin - EPSILON
    && card.y >= bounds.margin - EPSILON
    && card.x + card.width <= bounds.width - bounds.margin + EPSILON
    && card.y + card.height <= bounds.height - bounds.margin + EPSILON;
}

function hitsProtected(card: CardArea, bounds: CardLayoutBounds): boolean {
  return protectedZones(bounds).some((zone) => overlaps(card, zone, bounds.gap))
    || (bounds.occupiedPolygons ?? []).some((polygon) =>
      rectangleIntersectsPolygon(card, polygon, bounds.gap));
}

function hitsPlaced(card: CardArea, placed: CardArea[], gap: number): boolean {
  return placed.some((other) => overlaps(card, other, gap));
}

/**
 * Forward + backward order-preserving 1D packing (isotonic).
 * Cards keep their sort order; positions are pushed apart to avoid overlap,
 * compressed if they overflow the available span, then centered as a block.
 *
 * `targets[i]` is the preferred primary coordinate for card i (already sorted
 * along the side axis). Returns the final primary coordinate for each card.
 */
function isotonicPack(
  targets: number[],
  sizes: number[],
  gap: number,
  span: { start: number; end: number },
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  const total = sizes.reduce((sum, s) => sum + s, 0) + gap * (n - 1);
  let g = gap;
  // Compress gap if the chain overflows the span (preserve card sizes).
  if (n > 1 && total > span.end - span.start) {
    g = Math.max(MIN_GAP, (span.end - span.start - sizes.reduce((s, x) => s + x, 0)) / (n - 1));
  }

  const pos = targets.slice();
  // Forward: push each card below the previous one's tail.
  for (let i = 1; i < n; i += 1) {
    const minStart = pos[i - 1]! + sizes[i - 1]! + g;
    if (pos[i]! < minStart) pos[i] = minStart;
  }
  // Backward: push each card above the next one's head.
  for (let i = n - 2; i >= 0; i -= 1) {
    const maxStart = pos[i + 1]! - sizes[i]! - g;
    if (pos[i]! > maxStart) pos[i] = maxStart;
  }
  // Clamp into span, then center the whole block.
  for (let i = 0; i < n; i += 1) {
    pos[i] = clamp(pos[i]!, span.start, Math.max(span.start, span.end - sizes[i]!));
  }
  const first = pos[0]!;
  const last = pos[n - 1]! + sizes[n - 1]!;
  const blockStart = first;
  const blockEnd = last;
  const mid = (span.start + span.end) / 2;
  const blockMid = (blockStart + blockEnd) / 2;
  let shift = mid - blockMid;
  // Keep the shifted block inside the span.
  if (blockStart + shift < span.start) shift = span.start - blockStart;
  if (blockEnd + shift > span.end) shift = span.end - blockEnd;
  for (let i = 0; i < n; i += 1) pos[i] = pos[i]! + shift;
  return pos;
}

interface SideAssignment {
  side: CardSide;
  cards: CardLayoutInput[];
}

/** Vertical band (top/bottom) height as a fraction of the content height. */
function bandRatio(options: CardLayoutOptions): number {
  const r = options.topBottomBandRatio;
  return Number.isFinite(r) && r! > 0 && r! < 0.5 ? r! : 0.28;
}

function classifyQuadrant(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions,
): SideAssignment[] {
  const content = bounds.map;
  const cx = options.autoBalance ? autoSplitX(cards, bounds) : content.x + content.width / 2;
  const bandH = content.height * bandRatio(options);
  const topMax = content.y + bandH;
  const bottomMin = content.y + content.height - bandH;
  const horizCenterMin = content.x + content.width * 0.3;
  const horizCenterMax = content.x + content.width * 0.7;

  const sides: Record<CardSide, CardLayoutInput[]> = { left: [], right: [], top: [], bottom: [] };
  for (const card of cards) {
    if (card.anchorY <= topMax && card.anchorX > horizCenterMin && card.anchorX < horizCenterMax) {
      sides.top.push(card);
    } else if (card.anchorY >= bottomMin && card.anchorX > horizCenterMin && card.anchorX < horizCenterMax) {
      sides.bottom.push(card);
    } else if (card.anchorX < cx) {
      sides.left.push(card);
    } else {
      sides.right.push(card);
    }
  }
  return (["left", "right", "top", "bottom"] as CardSide[]).map((side) => ({ side, cards: sides[side] }));
}

/**
 * Choose the vertical split line that minimizes the maximum of the left and
 * right column heights. Scans candidate split lines at the anchors' x values.
 */
function autoSplitX(cards: CardLayoutInput[], bounds: CardLayoutBounds): number {
  const content = bounds.map;
  if (cards.length <= 1) return content.x + content.width / 2;
  const xs = [...new Set(cards.map((c) => Math.round(c.anchorX)))].sort((a, b) => a - b);
  const candidates = [content.x + content.width / 2, ...xs, ...xs.map((x) => x + 1)];
  let best = content.x + content.width / 2;
  let bestCost = Infinity;
  for (const x of candidates) {
    if (x < content.x || x > content.x + content.width) continue;
    let leftH = 0;
    let rightH = 0;
    for (const card of cards) {
      if (card.anchorX < x) leftH += card.height + bounds.gap;
      else rightH += card.height + bounds.gap;
    }
    const cost = Math.max(leftH, rightH);
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

function classifyRadial(cards: CardLayoutInput[], bounds: CardLayoutBounds): SideAssignment[] {
  const c = centerOf(bounds.map);
  const sides: Record<CardSide, CardLayoutInput[]> = { left: [], right: [], top: [], bottom: [] };
  for (const card of cards) {
    const angle = Math.atan2(card.anchorY - c.y, card.anchorX - c.x);
    const deg = ((angle * 180) / Math.PI + 360) % 360;
    if (deg >= 315 || deg < 45) sides.right.push(card);
    else if (deg < 135) sides.bottom.push(card);
    else if (deg < 225) sides.left.push(card);
    else sides.top.push(card);
  }
  return (["left", "right", "top", "bottom"] as CardSide[]).map((side) => ({ side, cards: sides[side] }));
}

function classifyRightStack(cards: CardLayoutInput[]): SideAssignment[] {
  return [{ side: "right", cards }];
}

/** Primary-axis span for a side: the range along which cards are packed. */
function primarySpan(side: CardSide, bounds: CardLayoutBounds): { start: number; end: number } {
  if (side === "left" || side === "right") {
    return { start: bounds.margin, end: bounds.height - bounds.margin };
  }
  return { start: bounds.margin, end: bounds.width - bounds.margin };
}

/** Sort key along a side's primary axis (the axis cards slide along). */
function primaryKey(card: CardLayoutInput, side: CardSide): number {
  return side === "left" || side === "right" ? card.anchorY : card.anchorX;
}

/** Preferred normal (perpendicular) coordinate for a side, just outside content. */
function normalForSide(side: CardSide, bounds: CardLayoutBounds, card: CardLayoutInput): number {
  const m = bounds.map;
  if (side === "right") return m.x + m.width + bounds.gap;
  if (side === "left") return m.x - bounds.gap - card.width;
  if (side === "bottom") return m.y + m.height + bounds.gap;
  return m.y - bounds.gap - card.height;
}

function placeSide(
  assignment: SideAssignment,
  bounds: CardLayoutBounds,
  placed: CardPlacement[],
): CardPlacement[] {
  const { side, cards } = assignment;
  if (cards.length === 0) return [];
  const sorted = [...cards].sort((a, b) => primaryKey(a, side) - primaryKey(b, side));
  const span = primarySpan(side, bounds);
  const targets = sorted.map((c) => {
    const key = primaryKey(c, side);
    const size = side === "left" || side === "right" ? c.height : c.width;
    return clamp(key - size / 2, span.start, span.end - size);
  });
  const sizes = sorted.map((c) => (side === "left" || side === "right" ? c.height : c.width));
  const positions = isotonicPack(targets, sizes, bounds.gap, span);
  const result: CardPlacement[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const card = sorted[i]!;
    const normal = normalForSide(side, bounds, card);
    const x = side === "left" || side === "right" ? normal : positions[i]!;
    const y = side === "left" || side === "right" ? positions[i]! : normal;
    result.push({ ...card, x, y, side });
  }
  // Push cards outward to clear province AABBs and existing placements.
  return result.map((p) => resolveObstacles(p, bounds, placed));
}

/**
 * Move a single placement along its normal axis until it no longer overlaps
 * any province AABB or already-placed card. Keeps the primary coordinate.
 */
function resolveObstacles(
  placement: CardPlacement,
  bounds: CardLayoutBounds,
  placed: CardPlacement[],
): CardPlacement {
  let { x, y } = placement;
  const zones = protectedZones(bounds);
  const allPlaced = [...placed];
  for (let step = 0; step < 24; step += 1) {
    const cur: CardArea = { x, y, width: placement.width, height: placement.height };
    const hitZone = zones.find((z) => overlaps(cur, z, 0));
    const hitCard = allPlaced.some((o) => overlaps(cur, o, 0));
    if (!hitZone && !hitCard) break;
    const away = placement.side === "left" || placement.side === "top" ? -1 : 1;
    if (placement.side === "left" || placement.side === "right") {
      x = clamp(x + away * (bounds.gap + 4), bounds.margin, bounds.width - bounds.margin - placement.width);
    } else {
      y = clamp(y + away * (bounds.gap + 4), bounds.margin, bounds.height - bounds.margin - placement.height);
    }
  }
  return { ...placement, x, y };
}

/** Greedy containment repair: nudge a placement into a free spot, canvas-first. */
function containFree(placement: CardPlacement, bounds: CardLayoutBounds, placed: CardPlacement[]): CardPlacement {
  if (isInsideCanvas(placement, bounds) && !hitsProtected(placement, bounds) && !hitsPlaced(placement, placed, bounds.gap)) {
    return placement;
  }
  const step = 12;
  // Scan a fine grid of candidate anchors, keeping the nearest free one to the
  // original probe so the card lands close to its preferred region.
  let best: CardPlacement | null = null;
  let bestDist = Infinity;
  const ox = placement.x;
  const oy = placement.y;
  for (let ry = bounds.margin; ry <= bounds.height - bounds.margin - placement.height; ry += step) {
    for (let rx = bounds.margin; rx <= bounds.width - bounds.margin - placement.width; rx += step) {
      const cand: CardPlacement = { ...placement, x: rx, y: ry };
      if (!isInsideCanvas(cand, bounds)) continue;
      if (hitsProtected(cand, bounds)) continue;
      if (hitsPlaced(cand, placed, bounds.gap)) continue;
      const dist = Math.hypot(rx - ox, ry - oy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  if (best) return best;
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

function sideForPlacement(placement: CardArea, bounds: CardLayoutBounds): CardSide {
  const mapCenter = centerOf(bounds.map);
  const cardCenter = centerOf(placement);
  const horizontal = (cardCenter.x - mapCenter.x) / Math.max(1, bounds.map.width / 2);
  const vertical = (cardCenter.y - mapCenter.y) / Math.max(1, bounds.map.height / 2);
  if (Math.abs(horizontal) >= Math.abs(vertical)) return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

/**
 * Repack every card from an empty canvas when side packing leaves fragmented
 * holes. Candidate coordinates come from obstacle/card edges, so narrow but
 * valid tracks are not skipped by a fixed-step grid.
 */
function repackAll(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] | null {
  const indexed = cards.map((card, index) => ({ card, index }));
  const candidateOrders = [
    indexed,
    [...indexed].sort((a, b) => b.card.width * b.card.height - a.card.width * a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => Math.max(b.card.width, b.card.height) - Math.max(a.card.width, a.card.height) || a.index - b.index),
    [...indexed].sort((a, b) => b.card.height - a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => b.card.width - a.card.width || a.index - b.index),
  ];
  const zones = protectedZones(bounds);
  const seenOrders = new Set<string>();

  for (const order of candidateOrders) {
    const signature = order.map(({ index }) => index).join(",");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);
    const placed: Array<CardPlacement & { inputIndex: number }> = [];

    for (const { card, index } of order) {
      const maxX = bounds.width - bounds.margin - card.width;
      const maxY = bounds.height - bounds.margin - card.height;
      const xCandidates = new Set<number>([
        bounds.margin,
        maxX,
        clamp(card.anchorX - card.width / 2, bounds.margin, maxX),
      ]);
      const yCandidates = new Set<number>([
        bounds.margin,
        maxY,
        clamp(card.anchorY - card.height / 2, bounds.margin, maxY),
      ]);

      for (const area of [...zones, ...placed]) {
        xCandidates.add(area.x - bounds.gap - card.width);
        xCandidates.add(area.x);
        xCandidates.add(area.x + area.width - card.width);
        xCandidates.add(area.x + area.width + bounds.gap);
        yCandidates.add(area.y - bounds.gap - card.height);
        yCandidates.add(area.y);
        yCandidates.add(area.y + area.height - card.height);
        yCandidates.add(area.y + area.height + bounds.gap);
      }

      let best: (CardPlacement & { inputIndex: number }) | null = null;
      let bestDistance = Infinity;
      for (const x of xCandidates) {
        for (const y of yCandidates) {
          const area = { x, y, width: card.width, height: card.height };
          if (!isInsideCanvas(area, bounds) || hitsProtected(area, bounds) || hitsPlaced(area, placed, bounds.gap)) continue;
          const distance = (x + card.width / 2 - card.anchorX) ** 2 + (y + card.height / 2 - card.anchorY) ** 2;
          if (distance < bestDistance - EPSILON
            || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
            bestDistance = distance;
            best = { ...card, x, y, side: sideForPlacement(area, bounds), inputIndex: index };
          }
        }
      }
      if (!best) break;
      placed.push(best);
    }

    if (placed.length === cards.length) {
      return [...placed]
        .sort((a, b) => a.inputIndex - b.inputIndex)
        .map(({ inputIndex: _inputIndex, ...placement }) => placement);
    }
  }
  return null;
}

function layoutGrid(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] {
  if (cards.length === 0) return [];
  const maxW = Math.max(...cards.map((c) => c.width), 1);
  const maxH = Math.max(...cards.map((c) => c.height), 1);
  const cols = Math.max(1, Math.floor((bounds.width - bounds.margin * 2 + bounds.gap) / (maxW + bounds.gap)));
  const placed: CardPlacement[] = [];
  let col = 0;
  let row = 0;
  for (const card of cards) {
    let placedThis = false;
    for (let attempt = 0; attempt < cols * 40 && !placedThis; attempt += 1) {
      const x = bounds.margin + col * (maxW + bounds.gap);
      const y = bounds.margin + row * (maxH + bounds.gap);
      const side: CardSide = x + card.width / 2 >= bounds.map.x + bounds.map.width / 2 ? "right" : "left";
      const cand: CardPlacement = {
        ...card,
        x: clamp(x, bounds.margin, bounds.width - bounds.margin - card.width),
        y: clamp(y, bounds.margin, bounds.height - bounds.margin - card.height),
        side,
      };
      col += 1;
      if (col >= cols) { col = 0; row += 1; }
      if (!isInsideCanvas(cand, bounds)) continue;
      if (hitsProtected(cand, bounds)) continue;
      if (hitsPlaced(cand, placed, bounds.gap)) continue;
      placed.push(cand);
      placedThis = true;
    }
    if (!placedThis) {
      placed.push({ ...card, x: bounds.margin, y: bounds.margin, side: "left" });
    }
  }
  return placed;
}

function orderResult(cards: CardLayoutInput[], placements: CardPlacement[]): CardPlacement[] {
  return cards.map((card) => placements.find((p) => p.id === card.id)!);
}

function validateHard(placements: CardPlacement[], bounds: CardLayoutBounds): boolean {
  for (const card of placements) {
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

interface LayoutCandidate {
  placement: CardPlacement;
  geometry: ConnectorGeometry;
  geometryBounds: CardArea;
  mapIntersections: number;
  distance: number;
  sideDeviation: number;
}

const SIDE_ORDER: CardSide[] = ["top", "right", "bottom", "left"];
const MAX_OPTIMIZED_CARDS = 80;
const MAX_CANDIDATES_PER_SIDE = 36;
const DENSE_CANDIDATES_PER_SIDE = 12;
const MAX_RAILS_PER_AXIS = 14;

function connectorBounds(geometry: ConnectorGeometry): CardArea {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of geometry.segments) {
    minX = Math.min(minX, segment.start.x, segment.end.x);
    minY = Math.min(minY, segment.start.y, segment.end.y);
    maxX = Math.max(maxX, segment.start.x, segment.end.x);
    maxY = Math.max(maxY, segment.start.y, segment.end.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boundsTouch(left: CardArea, right: CardArea, clearance: number): boolean {
  return left.x <= right.x + right.width + clearance
    && left.x + left.width + clearance >= right.x
    && left.y <= right.y + right.height + clearance
    && left.y + left.height + clearance >= right.y;
}

function connectorIntersects(
  left: ConnectorGeometry,
  leftBounds: CardArea,
  right: ConnectorGeometry,
  rightBounds: CardArea,
  clearance: number,
): boolean {
  return boundsTouch(leftBounds, rightBounds, clearance)
    && connectorGeometriesIntersect(left, right, clearance);
}

function segmentIntersectsPolygon(
  segment: { start: CardPoint; end: CardPoint },
  polygon: CardPolygon,
): boolean {
  if (pointInPolygon(segment.start, polygon) || pointInPolygon(segment.end, polygon)) return true;
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && segmentsIntersect(segment.start, segment.end, point, next));
  }));
}

function connectorMapIntersections(
  geometry: ConnectorGeometry,
  anchor: CardPoint,
  polygons: CardPolygon[],
): number {
  const geometryArea = connectorBounds(geometry);
  let intersections = 0;
  for (const polygon of polygons) {
    if (pointInPolygon(anchor, polygon)) continue;
    const area = polygonBounds(polygon);
    if (!area || !boundsTouch(geometryArea, area, 0)) continue;
    if (geometry.segments.some((segment) => segmentIntersectsPolygon(segment, polygon))) intersections += 1;
  }
  return intersections;
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = left[index]! - right[index]!;
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return left.length - right.length;
}

function sideDistance(left: CardSide, right: CardSide): number {
  const difference = Math.abs(SIDE_ORDER.indexOf(left) - SIDE_ORDER.indexOf(right));
  return Math.min(difference, SIDE_ORDER.length - difference);
}

function sideAxisSize(card: CardArea, side: CardSide): number {
  return side === "left" || side === "right" ? card.height : card.width;
}

function normalizedSideLoad(load: number, side: CardSide, bounds: CardLayoutBounds): number {
  const capacity = side === "left" || side === "right"
    ? bounds.height - bounds.margin * 2
    : bounds.width - bounds.margin * 2;
  return capacity > EPSILON ? load / capacity : load;
}

function sameAnchorCluster(left: CardLayoutInput, right: CardLayoutInput): boolean {
  const tolerance = Math.max(24, Math.min(left.width, left.height, right.width, right.height) * 0.35);
  return Math.hypot(left.anchorX - right.anchorX, left.anchorY - right.anchorY) <= tolerance;
}

function homeSides(
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

function buildCandidates(
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
  const zones = protectedZones(bounds);
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
    const geometry = buildConnectorGeometry({
      card: placement,
      anchor: { x: card.anchorX, y: card.anchorY },
      preferredSide: placement.side,
      style,
    });
    const candidate: LayoutCandidate = {
      placement,
      geometry,
      geometryBounds: connectorBounds(geometry),
      mapIntersections: connectorMapIntersections(
        geometry,
        { x: card.anchorX, y: card.anchorY },
        bounds.occupiedPolygons ?? [],
      ),
      distance: Math.hypot(
        placement.x + placement.width / 2 - placement.anchorX,
        placement.y + placement.height / 2 - placement.anchorY,
      ),
      sideDeviation: sideDistance(placement.side, homeSide),
    };
    candidatesBySide.get(placement.side)!.push(candidate);
    }
  }

  return SIDE_ORDER.flatMap((side) => candidatesBySide.get(side)!
    .sort((left, right) => compareScores(
      [left.mapIntersections, left.sideDeviation, left.distance, left.placement.y, left.placement.x],
      [right.mapIntersections, right.sideDeviation, right.distance, right.placement.y, right.placement.x],
    ))
    .slice(0, candidateLimit));
}

function connectorHitsCard(geometry: ConnectorGeometry, card: CardArea, clearance: number): boolean {
  return boundsTouch(connectorBounds(geometry), card, clearance)
    && geometry.segments.some((segment) => segmentIntersectsRect(segment, card, clearance));
}

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
      sideLoads.get(placement.side)! + sideAxisSize(placement, placement.side) + bounds.gap,
    );
  }
  for (let index = 0; index < geometries.length; index += 1) {
    throughMap += connectorMapIntersections(
      geometries[index]!,
      { x: placements[index]!.anchorX, y: placements[index]!.anchorY },
      polygons,
    );
  }
  const sideLoad = SIDE_ORDER.reduce((sum, side) => {
    const load = normalizedSideLoad(sideLoads.get(side)!, side, bounds);
    return sum + load * load;
  }, 0);
  return [splitClusters, crossings, throughCards, throughMap, sideDeviation, sideLoad, distance];
}

function optimizedLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: "quadrant" | "radial",
  options: CardLayoutOptions,
): CardPlacement[] | null {
  const style = options.connectorStyle ?? "curve";
  const clearance = Math.max(0, options.connectorWidth ?? 1.5);
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
          if (connectorHitsCard(candidate.geometry, placed[index]!, clearance)) throughCards += 1;
          if (connectorHitsCard(geometries[index]!, candidate.placement, clearance)) throughCards += 1;
          if (sameAnchorCluster(candidate.placement, placed[index]!)
            && candidate.placement.side !== placed[index]!.side) splitClusters += 1;
        }
        const score = [
          splitClusters,
          crossings,
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

    if (placed.length !== cards.length || !validateHard(placed, bounds)) continue;
    const score = scoreLayout(
      placed,
      assignedSides,
      style,
      clearance,
      bounds.occupiedPolygons ?? [],
      bounds,
    );
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = placed;
      bestScore = score;
    }
  }
  return best ? orderResult(cards, best) : null;
}

export function solveCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardLayoutResult {
  const mode: CardLayoutMode = options.mode ?? "quadrant";
  if (cards.length === 0) return { status: "solved", placements: [], mode };

  if (mode === "grid") {
    const grid = layoutGrid(cards, bounds);
    const orderedGrid = orderResult(cards, grid);
    if (validateHard(orderedGrid, bounds)) return { status: "solved", placements: orderedGrid, mode };
    const repacked = repackAll(cards, bounds);
    return repacked
      ? { status: "solved", placements: repacked, mode }
      : { status: "fallback", placements: orderedGrid, mode };
  }

  if ((mode === "quadrant" || mode === "radial")
    && cards.length <= MAX_OPTIMIZED_CARDS
    && ((bounds.occupiedAreas?.length ?? 0) > 0
      || (bounds.occupiedPolygons?.length ?? 0) > 0)) {
    const optimized = optimizedLayout(cards, bounds, mode, options);
    if (optimized) return { status: "solved", placements: optimized, mode };
  }

  const assignments = mode === "radial"
    ? classifyRadial(cards, bounds)
    : mode === "right-stack"
      ? classifyRightStack(cards)
      : classifyQuadrant(cards, bounds, options);

  // Pack each side once, collecting only cards that land in a valid,
  // non-overlapping spot. Cards that don't fit their side overflow to a
  // neighbor side and are re-packed there next round.
  const order: CardSide[] = ["right", "left", "top", "bottom"];
  let placed: CardPlacement[] = [];
  let pending = assignments.map((a) => ({ ...a, cards: [...a.cards] }));
  for (let round = 0; round < 4 && pending.some((a) => a.cards.length > 0); round += 1) {
    for (const side of order) {
      const assignment = pending.find((a) => a.side === side);
      if (!assignment || assignment.cards.length === 0) continue;
      const packed = placeSide(assignment, bounds, placed);
      const accepted: CardPlacement[] = [];
      const rejected: CardLayoutInput[] = [];
      // Accept packed cards in order while they stay valid; once one fails,
      // reject the rest so the side stays a contiguous block.
      let blockBroken = false;
      for (let i = 0; i < packed.length; i += 1) {
        const p = packed[i]!;
        const valid = isInsideCanvas(p, bounds) && !hitsProtected(p, bounds) && !hitsPlaced(p, placed, bounds.gap)
          && !accepted.some((a) => overlaps(a, p, bounds.gap));
        if (valid && !blockBroken) {
          accepted.push(p);
        } else {
          blockBroken = true;
          rejected.push(assignment.cards[i]!);
        }
      }
      placed = placed.concat(accepted);
      const neighbor: CardSide = side === "right" ? "bottom" : side === "left" ? "top" : side === "top" ? "left" : "right";
      pending = pending.map((a) => {
        if (a.side === side) return { ...a, cards: [] };
        if (a.side === neighbor) return { ...a, cards: [...a.cards, ...rejected] };
        return a;
      });
    }
  }

  // Any cards still unplaced get a contained free spot (non-overlapping scan).
  const placedIds = new Set(placed.map((p) => p.id));
  for (const card of cards) {
    if (placedIds.has(card.id)) continue;
    const probe: CardPlacement = { ...card, x: bounds.margin, y: bounds.margin, side: "right" };
    const free = containFree(probe, bounds, placed);
    placed.push(free);
    placedIds.add(card.id);
  }

  const ordered = orderResult(cards, placed);
  if (validateHard(ordered, bounds)) return { status: "solved", placements: ordered, mode };
  const repacked = repackAll(cards, bounds);
  return repacked
    ? { status: "solved", placements: repacked, mode }
    : { status: "fallback", placements: ordered, mode };
}

export function layoutCards(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions = {},
): CardPlacement[] {
  return solveCardLayout(cards, bounds, options).placements;
}

/**
 * Clamp a manually dragged card position so it stays inside the canvas margin
 * and outside protected areas. Map geometry is optional via `allowMapOverlap`.
 */
export function clampCardPosition(
  position: { x: number; y: number; width: number; height: number },
  bounds: CardLayoutBounds,
): { x: number; y: number } {
  const blockers = bounds.allowMapOverlap
    ? [...(bounds.occupiedAreas ?? [])]
    : bounds.occupiedAreas && bounds.occupiedAreas.length
      ? [bounds.map, ...protectedZones(bounds)]
      : [bounds.map];
  const minX = bounds.margin;
  const minY = bounds.margin;
  const maxX = bounds.width - bounds.margin - position.width;
  const maxY = bounds.height - bounds.margin - position.height;
  const origin = {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  };
  const isFree = (x: number, y: number) => !blockers.some((blocker) => overlaps({
    x,
    y,
    width: position.width,
    height: position.height,
  }, blocker));
  if (isFree(origin.x, origin.y)) return origin;

  const xCandidates = new Set([origin.x, minX, maxX]);
  const yCandidates = new Set([origin.y, minY, maxY]);
  for (const blocker of blockers) {
    xCandidates.add(clamp(blocker.x - position.width, minX, maxX));
    xCandidates.add(clamp(blocker.x + blocker.width, minX, maxX));
    yCandidates.add(clamp(blocker.y - position.height, minY, maxY));
    yCandidates.add(clamp(blocker.y + blocker.height, minY, maxY));
  }

  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  for (const x of xCandidates) {
    for (const y of yCandidates) {
      if (!isFree(x, y)) continue;
      const distance = (x - origin.x) ** 2 + (y - origin.y) ** 2;
      if (distance < bestDistance - EPSILON
        || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best ?? origin;
}

// ----- Back-compat aliases (drop-in for the previous destination-layout API) -----

export interface DestinationCardInput extends CardLayoutInput {}
export interface DestinationCardArea extends CardArea {}
export interface DestinationCardBounds extends CardLayoutBounds {}
export type DestinationCardSide = CardSide;
export interface DestinationCardPlacement extends CardPlacement {}
/** Legacy status vocabulary (maps the new {@link CardLayoutStatus} back). */
export type DestinationLayoutStatus = "solved" | "crossing-fallback" | "search-budget-exhausted";
export interface DestinationLayoutResult {
  status: DestinationLayoutStatus;
  placements: CardPlacement[];
}
export interface DestinationLayoutOptions extends CardLayoutOptions {}

function legacyStatus(status: CardLayoutStatus): DestinationLayoutStatus {
  return status === "solved" ? "solved" : "crossing-fallback";
}

/** Previous solve signature, now delegating to {@link solveCardLayout}. */
export function solveDestinationCardLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: DestinationLayoutOptions = {},
): DestinationLayoutResult {
  const result = solveCardLayout(cards, bounds, { mode: options.mode ?? "quadrant", autoBalance: options.autoBalance });
  return { status: legacyStatus(result.status), placements: result.placements };
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
