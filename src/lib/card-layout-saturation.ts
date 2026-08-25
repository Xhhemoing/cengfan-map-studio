/**
 * What to do when the canvas cannot legally hold the cards.
 *
 * Two things live here:
 *
 *   1. {@link provablyInfeasible} — a sound, cheap proof that no legal layout
 *      exists at all, so the solver can skip a search ladder that is certain to
 *      fail and go straight to the best contained layout.
 *   2. {@link layeredPack} — the contained layout to return in that case. Cards
 *      are spread over slots that tile the whole canvas, so unavoidable overlap
 *      is shared out instead of piling into one column.
 *
 * Saturation policy: overlap is ranked worse than covering the map, because two
 * cards on top of each other are unreadable while a card over geography still
 * reads. {@link betterLayout} is the single place that decides this; flipping
 * the last two entries of {@link layoutQuality} reverses the trade.
 */
import { marginSeat, readingOrder, overlapPairs } from "./card-layout-pack";
import type { LayoutSpace } from "./card-layout-space";
import {
  EPSILON,
  type CardLayoutInput,
  type CardPlacement,
} from "./card-layout-types";

/**
 * Pixels each extra card in a slot is offset by, so its edge stays visible.
 *
 * The last entry is applied even when the slot has no room budgeted for it.
 * Two cards at identical coordinates read as one card and silently hide a
 * destination, which is worse than a slot bleeding a few pixels into its
 * neighbour on a canvas that is already over capacity.
 */
const CASCADE_STEPS = [12, 6, 3];

/**
 * True when no arrangement can satisfy the hard constraints, whatever the
 * solver tries.
 *
 * Cards that respect `gap` stay disjoint once every card is grown by `gap / 2`
 * on each side, and every grown card still fits inside the usable canvas grown
 * by the same amount. Disjoint rectangles cannot cover more than their
 * container, so a grown-area total above the grown-canvas area is a proof —
 * not a heuristic. Obstacles are deliberately ignored: they only shrink the
 * real capacity, so leaving them out keeps the test conservative.
 */
export function provablyInfeasible(cards: readonly CardLayoutInput[], space: LayoutSpace): boolean {
  const usableWidth = space.width - space.margin * 2;
  const usableHeight = space.height - space.margin * 2;
  const capacity = Math.max(0, usableWidth + space.gap) * Math.max(0, usableHeight + space.gap);
  let demand = 0;
  for (const card of cards) {
    if (card.width > usableWidth + EPSILON || card.height > usableHeight + EPSILON) return true;
    demand += (card.width + space.gap) * (card.height + space.gap);
    if (demand > capacity + EPSILON) return true;
  }
  return false;
}

interface Slot {
  x: number;
  y: number;
  members: CardLayoutInput[];
  /** Per-card offset within the slot; separate axes so a slot flat in one
   * direction can still fan its cards out along the other. */
  stepX: number;
  stepY: number;
}

/**
 * A slot while the packing is still being searched: the cards it would hold,
 * named as a range over the grouping's card order rather than copied out.
 *
 * {@link spreadSlots} tries every slot count from one-card-per-slot downwards
 * and all but the last of those attempts is thrown away, so materializing the
 * groups — a slice and, for the compact grouping, a sort per group — was the
 * whole cost of the search. A range answers the only question the packing asks
 * of a group, how large it is, without building it.
 */
interface SlotPlan {
  x: number;
  y: number;
  start: number;
  end: number;
  stepX: number;
  stepY: number;
}

function rangeSpan(
  order: readonly CardLayoutInput[],
  start: number,
  end: number,
  cascade: number,
): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (let index = start; index < end; index += 1) {
    width = Math.max(width, order[index]!.width);
    height = Math.max(height, order[index]!.height);
  }
  const spread = cascade * (end - start - 1);
  return { width: width + spread, height: height + spread };
}

/**
 * Where the `index`-th of `count` consecutive groups starts, for groups whose
 * sizes differ by at most one.
 *
 * Overlap grows with the square of a group's size, so the pairs a slotting
 * forces are minimized by making the groups as even as possible. Cutting the
 * list into fixed-size chunks instead leaves the last chunk short and — worse —
 * leaves whole slots unused whenever the canvas holds more of them than
 * `ceil(cards / size)`, paying for overlap the canvas had room to avoid.
 */
function groupStart(total: number, count: number, index: number): number {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return index * base + Math.min(index, remainder);
}

/**
 * How cards are shared between slots.
 *
 * `geographic` keeps neighbours together, so the poster still scans north-west
 * to south-east, but a slot is only as small as the largest card in it and
 * mixed rows leave ragged space above the short ones.
 * `compact` sorts by height instead: slots stay tight, every shelf row is
 * height-homogeneous, and the canvas holds more slots — which is what decides
 * how many cards are forced to share one. It trades geography for that.
 */
type Grouping = "geographic" | "compact";

const GROUPINGS: Grouping[] = ["geographic", "compact"];

/** The card order a grouping slices its slots out of. */
function groupingOrder(cards: readonly CardLayoutInput[], grouping: Grouping): CardLayoutInput[] {
  if (grouping === "geographic") return readingOrder(cards);
  return [...cards].sort((left, right) =>
    right.height - left.height || right.width - left.width || left.id.localeCompare(right.id));
}

/** Fill in the cards a planned slot holds, in the order they will be stacked. */
function fillSlots(plans: readonly SlotPlan[], order: readonly CardLayoutInput[], grouping: Grouping): Slot[] {
  return plans.map((plan) => {
    const members = order.slice(plan.start, plan.end);
    // The compact grouping picks its slot-mates by height, so the poster still
    // reads north-west to south-east only if each slot is re-sorted.
    return { ...plan, members: grouping === "compact" ? readingOrder(members) : members };
  });
}

/** Shelf-pack `count` slots; `null` when they do not all fit inside the margin. */
function packSlots(
  order: readonly CardLayoutInput[],
  count: number,
  space: LayoutSpace,
  cascade: number,
): SlotPlan[] | null {
  const left = space.margin;
  const right = space.width - space.margin;
  const bottom = space.height - space.margin;
  const slots: SlotPlan[] = [];
  let x = left;
  let y = space.margin;
  let rowHeight = 0;
  for (let index = 0; index < count; index += 1) {
    const start = groupStart(order.length, count, index);
    const end = groupStart(order.length, count, index + 1);
    const { width, height } = rangeSpan(order, start, end, cascade);
    if (width > right - left + EPSILON) return null;
    if (x > left && x + width > right + EPSILON) {
      x = left;
      y += rowHeight + space.gap;
      rowHeight = 0;
    }
    if (y + height > bottom + EPSILON) return null;
    slots.push({ x, y, start, end, stepX: cascade, stepY: cascade });
    x += width + space.gap;
    rowHeight = Math.max(rowHeight, height);
  }
  return slots;
}

/**
 * Smallest fan worth applying when the gap cannot pay for a real one.
 *
 * Two cards at identical coordinates read as one card, and the one underneath
 * cannot be clicked; a hundredth of a pixel apart they are still two objects
 * the editor can tell apart and the renderer draws separately.
 */
const HAIRLINE_STEP = 0.01;

/**
 * Fan for a slot that could not afford any of {@link CASCADE_STEPS}.
 *
 * The fan is kept inside the slot's own footprint plus the gap that separates
 * it from the next one — space that is empty by construction, so spreading into
 * it cannot collide with another slot's cards. On a badly over-full canvas that
 * leaves a sub-pixel step, which is still worth having.
 *
 * A canvas with `gap: 0` budgets nothing at all that way, and the cards would
 * go back to sharing coordinates — the one outcome the saturation policy ranks
 * below overlapping. Such a slot falls back to a {@link HAIRLINE_STEP} taken
 * out of the slack it has to the canvas edge, which keeps every card inside the
 * margin and distinguishable.
 */
function affordableCascade(slot: Slot, space: LayoutSpace, preferred: number): Slot {
  const layers = slot.members.length - 1;
  if (layers <= 0) return slot;
  let width = 0;
  let height = 0;
  for (const member of slot.members) {
    width = Math.max(width, member.width);
    height = Math.max(height, member.height);
  }
  const fit = (slack: number) => {
    const affordable = Math.min(preferred, Math.min(space.gap, slack) / layers);
    if (affordable > 0) return affordable;
    return Math.max(0, Math.min(HAIRLINE_STEP, slack / layers));
  };
  return {
    ...slot,
    stepX: fit(space.maxX(width) - slot.x),
    stepY: fit(space.maxY(height) - slot.y),
  };
}

/**
 * The most slots the canvas can hold, with the cards shared evenly between
 * them.
 *
 * Searching down from one slot per card rather than up from one card per slot
 * matters: the two agree on how many cards a slot must hold, but only this
 * direction uses every slot that fits. Fewer, fuller slots would leave the
 * spare ones empty and charge the poster for overlap it had room to avoid.
 * Group sizes shrink monotonically as the count rises, so the first count that
 * packs is the best one.
 */
function spreadSlots(
  cards: readonly CardLayoutInput[],
  space: LayoutSpace,
  grouping: Grouping,
): Slot[] {
  const order = groupingOrder(cards, grouping);
  const smallest = CASCADE_STEPS[CASCADE_STEPS.length - 1]!;
  for (let slots = cards.length; slots >= 1; slots -= 1) {
    const plain = packSlots(order, slots, space, 0);
    if (!plain) continue;
    // Cards in a slot overlap no matter what, so buy every one of them a
    // visible edge — preferring an offset the slot can actually afford.
    for (const cascade of CASCADE_STEPS) {
      const spread = packSlots(order, slots, space, cascade);
      if (spread) return fillSlots(spread, order, grouping);
    }
    return fillSlots(plain, order, grouping).map((slot) => affordableCascade(slot, space, smallest));
  }
  return [affordableCascade(
    { x: space.margin, y: space.margin, members: readingOrder(cards), stepX: 0, stepY: 0 },
    space,
    smallest,
  )];
}

/**
 * Overlapping pairs the slotting forces. Slots are disjoint by construction, so
 * only cards sharing one can collide and the count is exact without an O(n²)
 * sweep over the placements.
 */
function forcedOverlaps(slots: readonly Slot[]): number {
  return slots.reduce((pairs, slot) => pairs + (slot.members.length * (slot.members.length - 1)) / 2, 0);
}

/**
 * Materialize slot assignments into concrete placements.
 *
 * A card no slot claims — defensive only, {@link layeredPack} slots every card
 * — gets the shared {@link marginSeat}, so its connector side is read off that
 * seat's geometry rather than hardcoded. A fixed side would point the leader
 * away from the map: the corner seat is typically left of the map center, or
 * above it when the map is wide and shallow. Exported so tests can reproduce
 * the slotless fallback, which is unreachable through {@link layeredPack}.
 */
export function slotPlacements(slots: readonly Slot[], cards: readonly CardLayoutInput[], space: LayoutSpace): CardPlacement[] {
  const placements = new Map<string, CardPlacement[]>();
  for (const slot of slots) {
    slot.members.forEach((card, layer) => {
      const area = {
        x: space.clampX(slot.x + slot.stepX * layer, card.width),
        y: space.clampY(slot.y + slot.stepY * layer, card.height),
        width: card.width,
        height: card.height,
      };
      const placement: CardPlacement = { ...card, x: area.x, y: area.y, side: space.sideOf(area) };
      const bucket = placements.get(card.id);
      if (bucket) bucket.push(placement);
      else placements.set(card.id, [placement]);
    });
  }
  return cards.map((card) => {
    const seated = placements.get(card.id)?.shift();
    return seated ?? marginSeat(card, space);
  });
}

/**
 * Contained layout for a canvas that cannot hold its cards.
 *
 * Slots tile the whole canvas and every slot takes the same number of cards, so
 * the overlap count is the unavoidable minimum for that slot count instead of
 * one deep pile at the margin. The geography-preserving grouping is tried
 * first and only gives way when a tighter one genuinely removes overlap.
 */
export function layeredPack(cards: readonly CardLayoutInput[], space: LayoutSpace): CardPlacement[] {
  if (cards.length === 0) return [];
  let best: Slot[] | null = null;
  let bestOverlaps = Infinity;
  for (const grouping of GROUPINGS) {
    const slots = spreadSlots(cards, space, grouping);
    const overlaps = forcedOverlaps(slots);
    if (overlaps < bestOverlaps) {
      best = slots;
      bestOverlaps = overlaps;
    }
  }
  return slotPlacements(best ?? [], cards, space);
}

/**
 * [out of bounds, hidden cards, overlapping pairs, obstacle hits, anchor
 * distance] — lower is better, compared in that order.
 *
 * "Hidden" counts cards sharing a position with an earlier one exactly, and it
 * outranks the overlap count on purpose. A partly covered card is degraded but
 * still on the poster; a card at the exact coordinates of another is gone —
 * unreadable, unselectable, and indistinguishable from the card on top, so a
 * destination silently disappears. Trading a few more overlapping pairs to
 * bring one back is always worth it. Distance stays last, so geography is the
 * first thing traded away and the last thing fought over.
 */
export function layoutQuality(placements: readonly CardPlacement[], space: LayoutSpace): number[] {
  let outside = 0;
  let obstacles = 0;
  let distance = 0;
  const seen = new Set<string>();
  let hidden = 0;
  for (const placement of placements) {
    if (!space.inside(placement)) outside += 1;
    if (space.blocked(placement)) obstacles += 1;
    const position = `${placement.x}:${placement.y}`;
    if (seen.has(position)) hidden += 1;
    else seen.add(position);
    distance += Math.hypot(
      placement.x + placement.width / 2 - placement.anchorX,
      placement.y + placement.height / 2 - placement.anchorY,
    );
  }
  return [outside, hidden, overlapPairs(placements, space.gap), obstacles, distance];
}

/** Pick the least-bad of two layouts; ties keep `left`. */
export function betterLayout(
  left: CardPlacement[],
  right: CardPlacement[],
  space: LayoutSpace,
): CardPlacement[] {
  const leftQuality = layoutQuality(left, space);
  const rightQuality = layoutQuality(right, space);
  for (let index = 0; index < leftQuality.length; index += 1) {
    if (leftQuality[index] !== rightQuality[index]) {
      return leftQuality[index]! < rightQuality[index]! ? left : right;
    }
  }
  return left;
}
