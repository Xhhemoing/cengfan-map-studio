import type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
  CardLayoutResult,
  CardPolygon,
} from "./card-layout";

export interface CardLayoutCacheInput {
  cards: readonly CardLayoutInput[];
  bounds: CardLayoutBounds;
  options: CardLayoutOptions;
}

function areaKey(area: CardArea): [number, number, number, number] {
  return [area.x, area.y, area.width, area.height];
}

function polygonKey(polygon: CardPolygon): { rings: number[][][]; bounds?: [number, number, number, number] } {
  return {
    rings: polygon.rings.map((ring) => ring.map((point) => [point.x, point.y])),
    ...(polygon.bounds ? { bounds: areaKey(polygon.bounds) } : {}),
  };
}

function fixedPositionsKey(
  positions: CardLayoutOptions["fixedPositions"],
): Array<[string, number, number]> | undefined {
  if (!positions) return undefined;
  const entries = Object.entries(positions)
    .filter((entry): entry is [string, { x: number; y: number }] => {
      const point = entry[1];
      return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, point]) => [id, point.x, point.y] as [string, number, number]);
  return entries.length === 0 ? undefined : entries;
}

/** Creates a stable key for solver inputs without including renderer-only styling. */
export function createCardLayoutCacheKey({ cards, bounds, options }: CardLayoutCacheInput): string {
  const fixedPositions = fixedPositionsKey(options.fixedPositions);
  return JSON.stringify({
    cards: cards.map(({ id, anchorX, anchorY, width, height }) => [id, anchorX, anchorY, width, height]),
    bounds: {
      width: bounds.width,
      height: bounds.height,
      map: areaKey(bounds.map),
      margin: bounds.margin,
      gap: bounds.gap,
      allowMapOverlap: bounds.allowMapOverlap === true,
      occupiedAreas: (bounds.occupiedAreas ?? []).map(areaKey),
      occupiedPolygons: (bounds.occupiedPolygons ?? []).map(polygonKey),
    },
    options: {
      mode: options.mode ?? "quadrant",
      autoBalance: options.autoBalance === true,
      ...(options.topBottomBandRatio === undefined ? {} : { topBottomBandRatio: options.topBottomBandRatio }),
      connectorStyle: options.connectorStyle ?? "curve",
      connectorWidth: options.connectorWidth ?? 1.5,
      ...(fixedPositions ? { fixedPositions } : {}),
    },
  });
}

export class CardLayoutCache {
  private readonly entries = new Map<string, CardLayoutResult>();

  private readonly capacity: number;

  constructor(capacity = 12) {
    this.capacity = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 1;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): CardLayoutResult | undefined {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: CardLayoutResult): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const cardLayoutCache = new CardLayoutCache();
