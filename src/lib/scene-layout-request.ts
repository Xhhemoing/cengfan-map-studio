import type { CardLayoutBounds, CardLayoutOptions, CardPlacement } from "./card-layout";
import { createCardLayoutCacheKey } from "./card-layout-cache";
import type { CardLayoutWorkerRequest } from "./card-layout-worker-protocol";
import type { PreparedCard } from "./prepared-card-content";
import { placementSide } from "./resolved-scene-geometry";

export type CardPositions = Record<string, { x: number; y: number }>;

export function storedCardPlacements(cards: PreparedCard[], bounds: CardLayoutBounds, positions: CardPositions = {}): CardPlacement[] {
  return cards.flatMap((card) => {
    const position = positions[card.group.key];
    if (!position) return [];
    const box = { ...position, width: card.width, height: card.height };
    return [{ id: card.group.key, anchorX: card.anchorX, anchorY: card.anchorY, ...box, side: placementSide(box, bounds.map) }];
  });
}

/** Stored positions participate as obstacles, rather than overriding a solved card afterward. */
export function createSceneLayoutRequest(
  preparedCards: PreparedCard[], bounds: CardLayoutBounds, options: CardLayoutOptions, positions: CardPositions = {},
  polygonOrigin?: Parameters<typeof createCardLayoutCacheKey>[0]["polygonOrigin"],
): CardLayoutWorkerRequest | null {
  const stored = storedCardPlacements(preparedCards, bounds, positions);
  const fixedIds = new Set(stored.map((card) => card.id));
  const cards = preparedCards.filter((card) => !fixedIds.has(card.group.key)).map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height }));
  if (cards.length === 0) return null;
  const effectiveBounds = stored.length === 0 ? bounds : { ...bounds, occupiedAreas: [...(bounds.occupiedAreas ?? (bounds.occupiedPolygons?.length ? [] : bounds.allowMapOverlap ? [] : [bounds.map])), ...stored] };
  return { key: createCardLayoutCacheKey({ cards, bounds: effectiveBounds, options, polygonOrigin }), cards, bounds: effectiveBounds, options };
}

export function mergeScenePlacements(cards: PreparedCard[], bounds: CardLayoutBounds, placements: CardPlacement[], positions: CardPositions = {}) {
  const byId = new Map([...placements, ...storedCardPlacements(cards, bounds, positions)].map((placement) => [placement.id, placement]));
  return cards.flatMap((card) => {
    const placement = byId.get(card.group.key);
    return placement ? [{ ...card, placement }] : [];
  });
}
