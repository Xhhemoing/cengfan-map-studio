/**
 * Saturation recovery layouts.
 *
 * `layoutGrid` is the `grid` mode itself; `repackAll` is the last attempt every
 * mode falls back to when side packing leaves fragmented holes. Both are
 * deliberately anchor-agnostic: their job is to guarantee a contained,
 * non-overlapping board, not a pretty one.
 */

import {
  clamp,
  EPSILON,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardPlacement,
  type CardSide,
} from "./card-layout-types";
import {
  hitsPlaced,
  hitsProtected,
  isInsideCanvas,
  obstacleZones,
  sideForPlacement,
} from "./card-layout-collision";

export function layoutGrid(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] {
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

/**
 * Repack every card from an empty canvas when side packing leaves fragmented
 * holes. Candidate coordinates come from obstacle/card edges, so narrow but
 * valid tracks are not skipped by a fixed-step grid.
 */
export function repackAll(cards: CardLayoutInput[], bounds: CardLayoutBounds): CardPlacement[] | null {
  const indexed = cards.map((card, index) => ({ card, index }));
  const candidateOrders = [
    indexed,
    [...indexed].sort((a, b) => b.card.width * b.card.height - a.card.width * a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => Math.max(b.card.width, b.card.height) - Math.max(a.card.width, a.card.height) || a.index - b.index),
    [...indexed].sort((a, b) => b.card.height - a.card.height || a.index - b.index),
    [...indexed].sort((a, b) => b.card.width - a.card.width || a.index - b.index),
  ];
  const zones = obstacleZones(bounds);
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
