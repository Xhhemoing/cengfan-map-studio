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

const numberBytes = new DataView(new ArrayBuffer(8));

function geometryHash(polygons: readonly CardPolygon[]): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;

  const addUint32 = (value: number) => {
    hashA = Math.imul(hashA ^ value, 0x01000193);
    hashB = Math.imul(hashB + value, 0x85ebca6b);
  };
  const addNumber = (value: number) => {
    numberBytes.setFloat64(0, value === 0 ? 0 : value, true);
    addUint32(numberBytes.getUint32(0, true));
    addUint32(numberBytes.getUint32(4, true));
  };

  addUint32(polygons.length);
  for (const polygon of polygons) {
    addUint32(polygon.rings.length);
    for (const ring of polygon.rings) {
      addUint32(ring.length);
      for (const point of ring) {
        addNumber(point.x);
        addNumber(point.y);
      }
    }
    addUint32(polygon.bounds ? 1 : 0);
    if (polygon.bounds) {
      addNumber(polygon.bounds.x);
      addNumber(polygon.bounds.y);
      addNumber(polygon.bounds.width);
      addNumber(polygon.bounds.height);
    }
  }

  hashA ^= hashA >>> 16;
  hashA = Math.imul(hashA, 0x85ebca6b);
  hashA ^= hashA >>> 13;
  hashB ^= hashB >>> 16;
  hashB = Math.imul(hashB, 0xc2b2ae35);
  hashB ^= hashB >>> 13;
  return `${(hashA >>> 0).toString(16).padStart(8, "0")}${(hashB >>> 0).toString(16).padStart(8, "0")}`;
}

/** Creates a stable key for solver inputs without including renderer-only styling. */
export function createCardLayoutCacheKey({ cards, bounds, options }: CardLayoutCacheInput): string {
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
      occupiedPolygonHash: geometryHash(bounds.occupiedPolygons ?? []),
    },
    options: {
      mode: options.mode ?? "quadrant",
      autoBalance: options.autoBalance === true,
      ...(options.topBottomBandRatio === undefined ? {} : { topBottomBandRatio: options.topBottomBandRatio }),
      connectorStyle: options.connectorStyle ?? "curve",
      connectorWidth: options.connectorWidth ?? 1.5,
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
