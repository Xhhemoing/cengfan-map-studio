/**
 * Whole-canvas packing strategies used when side packing is not enough.
 *
 * They form a ladder from "best looking" to "always produces something":
 *   1. {@link containFree}  – repair one card into the nearest free spot.
 *   2. {@link repackAll}    – anchor-greedy repack on obstacle/card edge rails.
 *   3. {@link sweepPack}    – dense first-fit row sweep (respects obstacles).
 *   4. {@link sweepPack} with `ignoreObstacles` – dense grid over the map.
 *   5. {@link shelfLayout}  – contained shelf that layers under saturation.
 */
import { clamp, overlaps } from "./card-layout-geometry";
import { PlacementIndex, type LayoutSpace } from "./card-layout-space";
import {
  EPSILON,
  type CardArea,
  type CardLayoutInput,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";

const CONTAIN_STEP = 12;
const SWEEP_STEP = 8;
const MAX_RAILS_PER_AXIS = 32;
const DENSE_RAILS_PER_AXIS = 16;
/** Above this card count the extra repack orders cost more than they gain. */
const DENSE_REPACK_CARDS = 60;

/** Seat for a card no placement came back for; the side follows the seat. */
function marginSeat(card: CardLayoutInput, space: LayoutSpace): CardPlacement {
  const seat = { ...card, x: space.clampX(space.margin, card.width), y: space.clampY(space.margin, card.height) };
  return { ...seat, side: space.sideOf(seat) };
}

/**
 * Reorder solver output back to the caller's input order, tolerating gaps.
 * Without a `space` a missing id can only fall back to the origin, which lies
 * outside the padded canvas with a side unrelated to where the card is drawn.
 */
export function orderResult(
  cards: readonly CardLayoutInput[],
  placements: readonly CardPlacement[],
  space?: LayoutSpace,
): CardPlacement[] {
  const byId = new Map<string, CardPlacement[]>();
  for (const placement of placements) {
    const bucket = byId.get(placement.id);
    if (bucket) bucket.push(placement);
    else byId.set(placement.id, [placement]);
  }
  return cards.map((card) => byId.get(card.id)?.shift()
    ?? (space ? marginSeat(card, space) : { ...card, x: 0, y: 0, side: "right" as CardSide }));
}

/** Candidate coordinates ordered by closeness to `target`, capped for cost. */
function nearestValues(values: Iterable<number>, target: number, limit = MAX_RAILS_PER_AXIS): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => Math.abs(left - target) - Math.abs(right - target) || left - right)
    .slice(0, limit);
}

function isFree(card: CardArea, space: LayoutSpace, placed: PlacementIndex): boolean {
  return space.inside(card) && !space.blocked(card) && !placed.hits(card, space.gap);
}

/**
 * Greedy containment repair: nudge a placement into the nearest free spot.
 * Rows and columns are visited by distance to the probe so the search can stop
 * as soon as no remaining track can beat the best hit.
 *
 * The repair is a fallback, so the incoming `side` is a placeholder rather than
 * a column assignment — `packSides` labels every card it could not seat
 * `"right"` before it has a position. Each exit therefore re-derives the side
 * from where the card actually lands, or the leader line would leave from an
 * edge facing away from the anchor.
 */
export function containFree(
  placement: CardPlacement,
  space: LayoutSpace,
  placed: PlacementIndex,
): CardPlacement {
  if (isFree(placement, space, placed)) return { ...placement, side: space.sideOf(placement) };

  const maxX = space.maxX(placement.width);
  const maxY = space.maxY(placement.height);
  const columns: number[] = [];
  for (let x = space.margin; x <= maxX + EPSILON; x += CONTAIN_STEP) columns.push(x);
  const rows: number[] = [];
  for (let y = space.margin; y <= maxY + EPSILON; y += CONTAIN_STEP) rows.push(y);
  const originX = placement.x;
  const originY = placement.y;
  columns.sort((left, right) => Math.abs(left - originX) - Math.abs(right - originX) || left - right);
  rows.sort((left, right) => Math.abs(left - originY) - Math.abs(right - originY) || left - right);

  let best: CardPlacement | null = null;
  // Squared throughout: the scan compares far more distances than it keeps, and
  // squaring orders them the same way a square root would.
  let bestDistance = Infinity;
  // The scan probes thousands of lattice points and only one of them survives,
  // so it tests a bare rectangle and pays for a placement object once.
  const probe: CardArea = { x: 0, y: 0, width: placement.width, height: placement.height };
  for (const y of rows) {
    const dy = (y - originY) ** 2;
    if (dy >= bestDistance) break;
    for (const x of columns) {
      const dx = (x - originX) ** 2;
      if (dx >= bestDistance) break;
      const distance = dx + dy;
      if (distance >= bestDistance) continue;
      probe.x = x;
      probe.y = y;
      if (!isFree(probe, space, placed)) continue;
      bestDistance = distance;
      best = { ...placement, x, y, side: space.sideOf(probe) };
    }
  }
  return best ?? stackAtMargin(placement, space, placed);
}

/**
 * Last resort for a card with nowhere legal to go: stack it along the left
 * margin, skipping past cards already there so nothing fully coincides. The
 * card stays visible and inside the canvas; any overlap here means the canvas
 * is saturated, which the caller reports as `fallback`.
 *
 * The column is walked top down rather than in insertion order. The cursor only
 * ever moves down, so on a sorted column every card it skips as "below" stays
 * below — whereas in insertion order a later card could push the cursor onto
 * one already skipped and seat the two exactly on top of each other.
 *
 * A card occupies its rectangle grown by the gap, on both axes, which is the
 * clearance `isFree` asks of every other candidate in this file. Reading
 * occupancy as bare pixels while advancing the cursor by `height + gap` let a
 * card whose top fell inside that band pass as "below", and the seat came to
 * rest closer to it than the gap allows.
 *
 * Like {@link containFree}, this is reached with a placeholder `side`, so the
 * seat it picks decides the side rather than whatever the caller passed in.
 */
export function stackAtMargin(
  placement: CardPlacement,
  space: LayoutSpace,
  placed: PlacementIndex,
): CardPlacement {
  const gap = space.gap;
  const columnRight = space.margin + placement.width;
  const column = placed.items
    .filter((other) => other.x < columnRight + gap && other.x + other.width + gap > space.margin)
    .sort((left, right) => left.y - right.y);
  let y = space.margin;
  for (const other of column) {
    // Sharing the gap between the test and the advance is what keeps the
    // cursor monotone: a card only counts when its own bottom edge, gap
    // included, is still below the cursor, so every push lands strictly lower.
    if (other.y < y + placement.height + gap && other.y + other.height + gap > y) {
      y = other.y + other.height + gap;
    }
  }
  const seat: CardArea = {
    x: space.margin,
    y: space.clampY(y, placement.height),
    width: placement.width,
    height: placement.height,
  };
  return { ...placement, x: seat.x, y: seat.y, side: space.sideOf(seat) };
}

/**
 * Repack every card from an empty canvas when side packing leaves fragmented
 * holes. Candidate coordinates come from obstacle/card edges, so narrow but
 * valid tracks are not skipped by a fixed-step grid. Rails are capped to the
 * ones nearest each anchor, which bounds the cost on dense boards.
 */
export function repackAll(cards: readonly CardLayoutInput[], space: LayoutSpace): CardPlacement[] | null {
  const indexed = cards.map((card, index) => ({ card, index }));
  const dense = cards.length > DENSE_REPACK_CARDS;
  const railLimit = dense ? DENSE_RAILS_PER_AXIS : MAX_RAILS_PER_AXIS;
  const candidateOrders = [
    indexed,
    [...indexed].sort((a, b) => b.card.width * b.card.height - a.card.width * a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => Math.max(b.card.width, b.card.height) - Math.max(a.card.width, a.card.height) || a.index - b.index),
    [...indexed].sort((a, b) => b.card.height - a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => b.card.width - a.card.width || a.index - b.index),
  ].slice(0, dense ? 2 : undefined);
  const seenOrders = new Set<string>();

  for (const order of candidateOrders) {
    const signature = order.map(({ index }) => index).join(",");
    if (seenOrders.has(signature)) continue;
    seenOrders.add(signature);
    const placed = PlacementIndex.forSpace(space);
    const inputIndexes = new Map<CardPlacement, number>();

    for (const { card, index } of order) {
      const maxX = space.maxX(card.width);
      const maxY = space.maxY(card.height);
      const preferredX = clamp(card.anchorX - card.width / 2, space.margin, maxX);
      const preferredY = clamp(card.anchorY - card.height / 2, space.margin, maxY);
      const xCandidates = new Set<number>([space.margin, maxX, preferredX]);
      const yCandidates = new Set<number>([space.margin, maxY, preferredY]);

      for (const area of [...space.zones, ...space.polygons.map((entry) => entry.area), ...placed.items]) {
        xCandidates.add(area.x - space.gap - card.width);
        xCandidates.add(area.x);
        xCandidates.add(area.x + area.width - card.width);
        xCandidates.add(area.x + area.width + space.gap);
        yCandidates.add(area.y - space.gap - card.height);
        yCandidates.add(area.y);
        yCandidates.add(area.y + area.height - card.height);
        yCandidates.add(area.y + area.height + space.gap);
      }

      let best: CardPlacement | null = null;
      let bestDistance = Infinity;
      for (const x of nearestValues(xCandidates, preferredX, railLimit)) {
        for (const y of nearestValues(yCandidates, preferredY, railLimit)) {
          const area = { x, y, width: card.width, height: card.height };
          if (!isFree(area, space, placed)) continue;
          const distance = (x + card.width / 2 - card.anchorX) ** 2 + (y + card.height / 2 - card.anchorY) ** 2;
          if (distance < bestDistance - EPSILON
            || (Math.abs(distance - bestDistance) <= EPSILON && best && (y < best.y || (y === best.y && x < best.x)))) {
            bestDistance = distance;
            best = { ...card, x, y, side: space.sideOf(area) };
          }
        }
      }
      if (!best) break;
      inputIndexes.set(best, index);
      placed.add(best);
    }

    if (placed.size === cards.length) {
      return [...placed.items].sort((a, b) => inputIndexes.get(a)! - inputIndexes.get(b)!);
    }
  }
  return null;
}

/** Reading order over anchors; keeps a dense pack roughly geographic. */
export function readingOrder(cards: readonly CardLayoutInput[]): CardLayoutInput[] {
  return [...cards].sort((left, right) =>
    left.anchorY - right.anchorY || left.anchorX - right.anchorX || left.id.localeCompare(right.id));
}

function trackValues(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  if (end < start - EPSILON) return values;
  for (let value = start; value < end - EPSILON; value += step) values.push(value);
  values.push(end);
  return values;
}

/**
 * First-fit row sweep. Each row is scanned left to right, jumping past the
 * rectangle that rejected the probe instead of stepping pixel by pixel, so the
 * cost is proportional to the obstacles in the row rather than its width.
 */
function sweepPlace(
  card: CardLayoutInput,
  space: LayoutSpace,
  placed: PlacementIndex,
  rows: number[],
  ignoreObstacles: boolean,
  step: number,
): CardPlacement | null {
  const maxX = space.maxX(card.width);
  if (maxX < space.margin - EPSILON) return null;
  for (const y of rows) {
    let x = space.margin;
    while (x <= maxX + EPSILON) {
      const area = { x, y, width: card.width, height: card.height };
      const obstacle = ignoreObstacles ? null : space.firstBlocker(area);
      const neighbor = placed.blocker(area, space.gap);
      if (!obstacle && !neighbor) return { ...card, x, y, side: space.sideOf(area) };
      let next = x + step;
      if (neighbor) next = Math.max(next, neighbor.x + neighbor.width + space.gap);
      if (obstacle?.exact) next = Math.max(next, obstacle.area.x + obstacle.area.width + space.gap);
      x = next > x + EPSILON ? next : x + step;
    }
  }
  return null;
}

/**
 * Dense first-fit packing of every card. Cards the sweep cannot fit are
 * repaired into the nearest free spot instead of failing the whole pass, so
 * the caller always gets a complete layout to score.
 */
export function sweepPack(
  cards: readonly CardLayoutInput[],
  space: LayoutSpace,
  { ignoreObstacles = false, step = SWEEP_STEP }: { ignoreObstacles?: boolean; step?: number } = {},
): CardPlacement[] {
  if (cards.length === 0) return [];
  const placed = PlacementIndex.forSpace(space);
  const leftovers: CardLayoutInput[] = [];
  for (const card of readingOrder(cards)) {
    const rows = trackValues(space.margin, space.maxY(card.height), step);
    const placement = sweepPlace(card, space, placed, rows, ignoreObstacles, step);
    if (placement) placed.add(placement);
    else leftovers.push(card);
  }
  // A card the sweep rejected has no free spot at all: the sweep already
  // scanned every row under the same constraints, so re-scanning would only
  // burn time. Stack it instead.
  for (const card of leftovers) {
    const probe: CardPlacement = { ...card, x: space.margin, y: space.margin, side: "left" };
    placed.add(stackAtMargin(probe, space, placed));
  }
  return orderResult(cards, placed.items, space);
}

/**
 * Contained shelf packing: rows of cards left to right, wrapping to a new row
 * and finally back to the top. Always returns a placement for every card and
 * never leaves the canvas; cards only overlap once the canvas is saturated.
 */
export function shelfLayout(cards: readonly CardLayoutInput[], space: LayoutSpace): CardPlacement[] {
  const left = space.margin;
  const right = space.width - space.margin;
  const bottom = space.height - space.margin;
  const placements: CardPlacement[] = [];
  let x = left;
  let y = space.margin;
  let rowHeight = 0;
  for (const card of readingOrder(cards)) {
    if (x > left && x + card.width > right + EPSILON) {
      x = left;
      y += rowHeight + space.gap;
      rowHeight = 0;
    }
    if (y > space.margin && y + card.height > bottom + EPSILON) {
      x = left;
      y = space.margin;
      rowHeight = 0;
    }
    const area = {
      x: space.clampX(x, card.width),
      y: space.clampY(y, card.height),
      width: card.width,
      height: card.height,
    };
    placements.push({ ...card, x: area.x, y: area.y, side: space.sideOf(area) });
    x += card.width + space.gap;
    rowHeight = Math.max(rowHeight, card.height);
  }
  return orderResult(cards, placements, space);
}

/** Uniform grid layout (the `grid` mode), skipping obstacles and collisions. */
export function layoutGrid(cards: readonly CardLayoutInput[], space: LayoutSpace): CardPlacement[] {
  if (cards.length === 0) return [];
  const maxWidth = Math.max(...cards.map((card) => card.width), 1);
  const maxHeight = Math.max(...cards.map((card) => card.height), 1);
  const columns = Math.max(1, Math.floor((space.width - space.margin * 2 + space.gap) / (maxWidth + space.gap)));
  const placed = PlacementIndex.forSpace(space);
  const placements: CardPlacement[] = [];
  let column = 0;
  let row = 0;
  for (const card of cards) {
    let done = false;
    for (let attempt = 0; attempt < columns * 40 && !done; attempt += 1) {
      const x = space.margin + column * (maxWidth + space.gap);
      const y = space.margin + row * (maxHeight + space.gap);
      const side: CardSide = x + card.width / 2 >= space.map.x + space.map.width / 2 ? "right" : "left";
      const candidate: CardPlacement = {
        ...card,
        x: space.clampX(x, card.width),
        y: space.clampY(y, card.height),
        side,
      };
      column += 1;
      if (column >= columns) {
        column = 0;
        row += 1;
      }
      if (!isFree(candidate, space, placed)) continue;
      placed.add(candidate);
      placements.push(candidate);
      done = true;
    }
    if (!done) {
      const fallback: CardPlacement = { ...card, x: space.margin, y: space.margin, side: "left" };
      placements.push(fallback);
      placed.add(fallback);
    }
  }
  return placements;
}

/** Pairwise overlap count; used to pick the least-bad saturated layout. */
export function overlapPairs(placements: readonly CardPlacement[], gap: number): number {
  let pairs = 0;
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      if (overlaps(placements[left]!, placements[right]!, gap)) pairs += 1;
    }
  }
  return pairs;
}
