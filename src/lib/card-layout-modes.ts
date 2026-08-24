/**
 * Side assignment and order-preserving side packing.
 *
 * These are the "shape" strategies: which side of the map a card belongs to
 * (quadrant / radial / right-stack), how a side's cards are packed along its
 * primary axis without reordering them, and — in {@link packSides} — how the
 * four sides are packed in turn so that cards a full side rejects overflow to a
 * neighbour instead of being lost.
 */
import { centerOf, clamp, overlaps } from "./card-layout-geometry";
import { containFree, stackAtMargin } from "./card-layout-pack";
import { PlacementIndex, type LayoutSpace } from "./card-layout-space";
import {
  MIN_GAP,
  type CardLayoutInput,
  type CardLayoutOptions,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

export interface SideAssignment {
  side: CardSide;
  cards: CardLayoutInput[];
}

/** Order the four sides appear in every {@link SideAssignment} list. */
const ASSIGNMENT_ORDER: CardSide[] = ["left", "right", "top", "bottom"];

function emptySides(): Record<CardSide, CardLayoutInput[]> {
  return { left: [], right: [], top: [], bottom: [] };
}

function toAssignments(sides: Record<CardSide, CardLayoutInput[]>): SideAssignment[] {
  return ASSIGNMENT_ORDER.map((side) => ({ side, cards: sides[side] }));
}

/**
 * Forward + backward order-preserving 1D packing (isotonic).
 * Cards keep their sort order; positions are pushed apart to avoid overlap,
 * compressed if they overflow the available span, then centered as a block.
 *
 * `targets[i]` is the preferred primary coordinate for card i (already sorted
 * along the side axis). Returns the final primary coordinate for each card.
 */
export function isotonicPack(
  targets: number[],
  sizes: number[],
  gap: number,
  span: { start: number; end: number },
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  const totalSize = sizes.reduce((sum, size) => sum + size, 0);
  const total = totalSize + gap * (n - 1);
  let packedGap = gap;
  // Compress gap if the chain overflows the span (preserve card sizes).
  if (n > 1 && total > span.end - span.start) {
    packedGap = Math.max(MIN_GAP, (span.end - span.start - totalSize) / (n - 1));
  }

  const positions = targets.slice();
  // Forward: push each card below the previous one's tail.
  for (let i = 1; i < n; i += 1) {
    const minStart = positions[i - 1]! + sizes[i - 1]! + packedGap;
    if (positions[i]! < minStart) positions[i] = minStart;
  }
  // Backward: push each card above the next one's head.
  for (let i = n - 2; i >= 0; i -= 1) {
    const maxStart = positions[i + 1]! - sizes[i]! - packedGap;
    if (positions[i]! > maxStart) positions[i] = maxStart;
  }
  // Clamp into span, then center the whole block.
  for (let i = 0; i < n; i += 1) {
    positions[i] = clamp(positions[i]!, span.start, Math.max(span.start, span.end - sizes[i]!));
  }
  const blockStart = positions[0]!;
  const blockEnd = positions[n - 1]! + sizes[n - 1]!;
  const mid = (span.start + span.end) / 2;
  let shift = mid - (blockStart + blockEnd) / 2;
  // Keep the shifted block inside the span.
  if (blockStart + shift < span.start) shift = span.start - blockStart;
  if (blockEnd + shift > span.end) shift = span.end - blockEnd;
  for (let i = 0; i < n; i += 1) positions[i] = positions[i]! + shift;
  return positions;
}

/** Vertical band (top/bottom) height as a fraction of the content height. */
function bandRatio(options: CardLayoutOptions): number {
  const ratio = options.topBottomBandRatio;
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 && ratio < 0.5 ? ratio : 0.28;
}

/**
 * Choose the vertical split line that minimizes the maximum of the left and
 * right column heights. Scans candidate split lines at the anchors' x values.
 */
export function autoSplitX(cards: CardLayoutInput[], space: LayoutSpace): number {
  const content = space.map;
  const middle = content.x + content.width / 2;
  if (cards.length <= 1) return middle;
  const xs = [...new Set(cards.map((card) => Math.round(card.anchorX)))].sort((a, b) => a - b);
  const candidates = [middle, ...xs, ...xs.map((x) => x + 1)];
  let best = middle;
  let bestCost = Infinity;
  for (const x of candidates) {
    if (x < content.x || x > content.x + content.width) continue;
    let leftHeight = 0;
    let rightHeight = 0;
    for (const card of cards) {
      if (card.anchorX < x) leftHeight += card.height + space.gap;
      else rightHeight += card.height + space.gap;
    }
    const cost = Math.max(leftHeight, rightHeight);
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

export function classifyQuadrant(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  options: CardLayoutOptions,
): SideAssignment[] {
  const content = space.map;
  const splitX = options.autoBalance ? autoSplitX(cards, space) : content.x + content.width / 2;
  const bandHeight = content.height * bandRatio(options);
  const topMax = content.y + bandHeight;
  const bottomMin = content.y + content.height - bandHeight;
  const horizontalCenterMin = content.x + content.width * 0.3;
  const horizontalCenterMax = content.x + content.width * 0.7;

  const sides = emptySides();
  for (const card of cards) {
    const inCenterColumn = card.anchorX > horizontalCenterMin && card.anchorX < horizontalCenterMax;
    if (card.anchorY <= topMax && inCenterColumn) sides.top.push(card);
    else if (card.anchorY >= bottomMin && inCenterColumn) sides.bottom.push(card);
    else if (card.anchorX < splitX) sides.left.push(card);
    else sides.right.push(card);
  }
  return toAssignments(sides);
}

export function classifyRadial(cards: CardLayoutInput[], space: LayoutSpace): SideAssignment[] {
  const center = centerOf(space.map);
  const sides = emptySides();
  for (const card of cards) {
    const angle = Math.atan2(card.anchorY - center.y, card.anchorX - center.x);
    const degrees = ((angle * 180) / Math.PI + 360) % 360;
    if (degrees >= 315 || degrees < 45) sides.right.push(card);
    else if (degrees < 135) sides.bottom.push(card);
    else if (degrees < 225) sides.left.push(card);
    else sides.top.push(card);
  }
  return toAssignments(sides);
}

export function classifyRightStack(cards: CardLayoutInput[]): SideAssignment[] {
  return [{ side: "right", cards }];
}

export function classifySides(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial" | "right-stack",
  options: CardLayoutOptions,
): SideAssignment[] {
  if (mode === "radial") return classifyRadial(cards, space);
  if (mode === "right-stack") return classifyRightStack(cards);
  return classifyQuadrant(cards, space, options);
}

/** Primary-axis span for a side: the range along which cards are packed. */
function primarySpan(side: CardSide, space: LayoutSpace): { start: number; end: number } {
  if (side === "left" || side === "right") {
    return { start: space.margin, end: space.height - space.margin };
  }
  return { start: space.margin, end: space.width - space.margin };
}

/** Sort key along a side's primary axis (the axis cards slide along). */
function primaryKey(card: CardLayoutInput, side: CardSide): number {
  return side === "left" || side === "right" ? card.anchorY : card.anchorX;
}

/** Preferred normal (perpendicular) coordinate for a side, just outside content. */
function normalForSide(side: CardSide, space: LayoutSpace, card: CardLayoutInput): number {
  const map = space.map;
  if (side === "right") return map.x + map.width + space.gap;
  if (side === "left") return map.x - space.gap - card.width;
  if (side === "bottom") return map.y + map.height + space.gap;
  return map.y - space.gap - card.height;
}

/**
 * Move a single placement along its normal axis until it no longer overlaps
 * an obstacle or an already-placed card. Keeps the primary coordinate.
 */
function resolveObstacles(
  placement: CardPlacement,
  space: LayoutSpace,
  placed: PlacementIndex,
): CardPlacement {
  let { x, y } = placement;
  const away = placement.side === "left" || placement.side === "top" ? -1 : 1;
  const horizontal = placement.side === "left" || placement.side === "right";
  for (let step = 0; step < 24; step += 1) {
    const current = { x, y, width: placement.width, height: placement.height };
    if (!space.blocked(current, 0) && !placed.hits(current, 0)) break;
    if (horizontal) x = space.clampX(x + away * (space.gap + 4), placement.width);
    else y = space.clampY(y + away * (space.gap + 4), placement.height);
  }
  return { ...placement, x, y };
}

/**
 * One packed card together with the input it came from.
 *
 * Packing sorts along the side axis, so position `i` of the result is *not*
 * card `i` of the assignment. Callers that have to map a packed card back to
 * its input — {@link packSides}, when it overflows a rejected card to a
 * neighbour side — must follow this pairing rather than the index.
 */
export interface SidePlacement {
  card: CardLayoutInput;
  placement: CardPlacement;
}

/** Pack one side's cards along its primary axis, then push them clear. */
export function packSideCards(
  assignment: SideAssignment,
  space: LayoutSpace,
  placed: PlacementIndex,
): SidePlacement[] {
  const { side, cards } = assignment;
  if (cards.length === 0) return [];
  const horizontal = side === "left" || side === "right";
  const sorted = [...cards].sort((a, b) => primaryKey(a, side) - primaryKey(b, side));
  const span = primarySpan(side, space);
  const sizes = sorted.map((card) => (horizontal ? card.height : card.width));
  const targets = sorted.map((card, index) =>
    clamp(primaryKey(card, side) - sizes[index]! / 2, span.start, span.end - sizes[index]!));
  const positions = isotonicPack(targets, sizes, space.gap, span);
  return sorted.map((card, index) => {
    const normal = normalForSide(side, space, card);
    const placement: CardPlacement = {
      ...card,
      x: horizontal ? normal : positions[index]!,
      y: horizontal ? positions[index]! : normal,
      side,
    };
    return { card, placement: resolveObstacles(placement, space, placed) };
  });
}

/**
 * Where a card rejected by its side overflows to. The pairs are swaps
 * (right↔bottom, left↔top) so a rejected card is retried on an adjacent side
 * that is packed later in the same round.
 */
export function neighborSide(side: CardSide): CardSide {
  if (side === "right") return "bottom";
  if (side === "left") return "top";
  if (side === "top") return "left";
  return "right";
}

/** Order sides are packed in; earlier sides claim space first. */
const SIDE_PACK_ORDER: CardSide[] = ["right", "left", "top", "bottom"];
const MAX_OVERFLOW_ROUNDS = 4;

/**
 * Pack each side once, collecting only cards that land in a valid,
 * non-overlapping spot. Cards that don't fit their side overflow to a
 * neighbour side and are re-packed there next round.
 */
export function packSides(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: "quadrant" | "radial" | "right-stack",
  options: CardLayoutOptions,
): CardPlacement[] {
  const placed = PlacementIndex.forSpace(space);
  let pending: SideAssignment[] = classifySides(cards, space, mode, options)
    .map((assignment) => ({ ...assignment, cards: [...assignment.cards] }));

  for (let round = 0; round < MAX_OVERFLOW_ROUNDS && pending.some((a) => a.cards.length > 0); round += 1) {
    for (const side of SIDE_PACK_ORDER) {
      const assignment = pending.find((a) => a.side === side);
      if (!assignment || assignment.cards.length === 0) continue;
      const packed = packSideCards(assignment, space, placed);
      const accepted: CardPlacement[] = [];
      const rejected: CardLayoutInput[] = [];
      // Accept packed cards in order while they stay valid; once one fails,
      // reject the rest so the side stays a contiguous block. The rejected
      // input is the one paired with the packed card, not the assignment entry
      // at the same index: packing runs in side-axis order.
      let blockBroken = false;
      for (const { card, placement } of packed) {
        const valid = space.inside(placement)
          && !space.blocked(placement)
          && !placed.hits(placement, space.gap)
          && !accepted.some((other) => overlaps(other, placement, space.gap));
        if (valid && !blockBroken) accepted.push(placement);
        else {
          blockBroken = true;
          rejected.push(card);
        }
      }
      for (const placement of accepted) placed.add(placement);
      const neighbor = neighborSide(side);
      pending = pending.map((entry) => {
        if (entry.side === side) return { ...entry, cards: [] };
        if (entry.side === neighbor) return { ...entry, cards: [...entry.cards, ...rejected] };
        return entry;
      });
    }
  }

  // Any cards still unplaced get a contained free spot (non-overlapping scan).
  // Once one scan comes up empty the canvas is saturated, so the rest skip
  // straight to the stacked last resort instead of rescanning a full canvas.
  const placedIds = new Set(placed.items.map((placement) => placement.id));
  let saturated = false;
  for (const card of cards) {
    if (placedIds.has(card.id)) continue;
    const probe: CardPlacement = { ...card, x: space.margin, y: space.margin, side: "right" };
    const placement = saturated ? stackAtMargin(probe, space, placed) : containFree(probe, space, placed);
    if (!saturated && (space.blocked(placement) || placed.hits(placement, space.gap))) saturated = true;
    placed.add(placement);
    placedIds.add(card.id);
  }
  return placed.items;
}
