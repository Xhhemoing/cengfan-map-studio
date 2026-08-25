/**
 * Isotonic side packing: the shared engine behind `quadrant`, `radial`,
 * `right-stack` and `columns`.
 *
 * Anchors are classified onto sides, each side is packed as one order-preserving
 * block, and cards that cannot fit overflow to a neighbouring side.
 */

import {
  clamp,
  centerOf,
  overlaps,
  MIN_GAP,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutOptions,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";
import {
  containFree,
  hitsPlaced,
  hitsProtected,
  isInsideCanvas,
  obstacleZones,
  orderResult,
} from "./card-layout-collision";

export interface SideAssignment {
  side: CardSide;
  cards: CardLayoutInput[];
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

/** Vertical band (top/bottom) height as a fraction of the content height. */
function bandRatio(options: CardLayoutOptions): number {
  const r = options.topBottomBandRatio;
  return Number.isFinite(r) && r! > 0 && r! < 0.5 ? r! : 0.28;
}

export function classifyQuadrant(
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

export function classifyRadial(cards: CardLayoutInput[], bounds: CardLayoutBounds): SideAssignment[] {
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

/**
 * Two tidy columns hugging the map's left and right outer edges. The split line
 * is the map centre, or the height-balancing line when `autoBalance` is on.
 */
function classifyColumns(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  options: CardLayoutOptions,
): SideAssignment[] {
  const content = bounds.map;
  const splitX = options.autoBalance ? autoSplitX(cards, bounds) : content.x + content.width / 2;
  const left: CardLayoutInput[] = [];
  const right: CardLayoutInput[] = [];
  for (const card of cards) {
    if (card.anchorX < splitX) left.push(card);
    else right.push(card);
  }
  return [{ side: "left", cards: left }, { side: "right", cards: right }];
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
  const zones = obstacleZones(bounds);
  const allPlaced = [...placed];
  for (let step = 0; step < 24; step += 1) {
    const cur = { x, y, width: placement.width, height: placement.height };
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

/** Neighbouring side that absorbs cards a side could not fit. */
function overflowSide(side: CardSide, mode: CardLayoutMode): CardSide {
  if (mode === "columns") return side === "right" ? "left" : "right";
  if (side === "right") return "bottom";
  if (side === "left") return "top";
  if (side === "top") return "left";
  return "right";
}

export function sidePackLayout(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: CardLayoutMode,
  options: CardLayoutOptions,
): CardPlacement[] {
  const assignments = mode === "radial"
    ? classifyRadial(cards, bounds)
    : mode === "right-stack"
      ? classifyRightStack(cards)
      : mode === "columns"
        ? classifyColumns(cards, bounds, options)
        : classifyQuadrant(cards, bounds, options);

  // Pack each side once, collecting only cards that land in a valid,
  // non-overlapping spot. Cards that don't fit their side overflow to a
  // neighbor side and are re-packed there next round.
  const order: CardSide[] = mode === "columns"
    ? ["right", "left"]
    : ["right", "left", "top", "bottom"];
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
      const neighbor = overflowSide(side, mode);
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

  return orderResult(cards, placed);
}
