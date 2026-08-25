import { adaptCardLayout } from "../../lib/card-layout-adapt";
import type { CardLayoutBounds, CardPlacement } from "../../lib/card-layout";

export type CardDropPositions = Record<string, { x: number; y: number }>;

/**
 * Positions a drop should commit: the dragged card plus every neighbour that had to step aside
 * for it. `undefined` means nothing but the dragged card moved, and the caller then commits that
 * single card the way it always has — one undo entry either way.
 */
export function adaptCardDrop(
  placements: readonly CardPlacement[],
  movedId: string,
  nextPosition: { x: number; y: number },
  bounds: CardLayoutBounds,
): CardDropPositions | undefined {
  if (placements.length < 2) return undefined;
  const adapted = adaptCardLayout(placements.map((placement) => ({ ...placement })), movedId, nextPosition, bounds);
  const before = new Map(placements.map((placement) => [placement.id, placement]));
  const moved: CardDropPositions = {};
  for (const placement of adapted) {
    const previous = before.get(placement.id);
    if (!previous) continue;
    const unchanged = previous.x === placement.x && previous.y === placement.y;
    if (placement.id !== movedId && unchanged) continue;
    moved[placement.id] = { x: Math.round(placement.x), y: Math.round(placement.y) };
  }
  return Object.keys(moved).length > 1 ? moved : undefined;
}
