import type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutOptions,
  CardLayoutResult,
  CardPolygon,
} from "./card-layout";

/**
 * Pre-translation form of `bounds.occupiedPolygons`: geometry stated as offsets from an
 * origin, plus that origin. Callers that pan by moving the origin keep the same polygon
 * array instance, which is what lets the key reuse an already serialized ring segment.
 *
 * The caller owns the invariant that `bounds.occupiedPolygons` is exactly `polygons`
 * translated by `originX`/`originY`; the key trusts it instead of re-walking the rings.
 */
export interface CardLayoutPolygonOrigin {
  polygons: readonly CardPolygon[];
  originX: number;
  originY: number;
}

export interface CardLayoutCacheInput {
  cards: readonly CardLayoutInput[];
  bounds: CardLayoutBounds;
  options: CardLayoutOptions;
  polygonOrigin?: CardLayoutPolygonOrigin;
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

const EMPTY_POLYGONS: readonly CardPolygon[] = [];

// Province outlines dominate the key: every ring point is folded into the hash. Map styling
// edits (colors, labels) keep the same polygon array instance, so memoizing on that
// identity skips the whole traversal for the most common re-key.
const hashedPolygons = new WeakMap<object, string>();

function polygonsKey(polygons: readonly CardPolygon[]): string {
  const memoized = hashedPolygons.get(polygons);
  if (memoized !== undefined) return memoized;
  const hashed = geometryHash(polygons);
  hashedPolygons.set(polygons, hashed);
  return hashed;
}

// A pan hands over freshly translated polygons — a new array of new points every frame —
// so keying on those defeats the memo above and re-stringifies every ring. Keying the
// origin-relative geometry instead keeps one array instance alive across the whole gesture
// and reduces the pan to appending two numbers. Origin-relative rings and the origin
// together pin down the translated geometry, so the key stays as discriminating as before.
function occupiedPolygonsSegment({ bounds, polygonOrigin }: CardLayoutCacheInput): string {
  if (!polygonOrigin) return polygonsKey(bounds.occupiedPolygons ?? EMPTY_POLYGONS);
  const rings = polygonsKey(polygonOrigin.polygons);
  // With nothing to translate the origin cannot change the solver input, and folding it in
  // would miss the cache on every pan of a map whose provinces are not obstacles.
  if (polygonOrigin.polygons.length === 0) return rings;
  return `${polygonOrigin.originX},${polygonOrigin.originY}@${rings}`;
}

/** Creates a stable key for solver inputs without including renderer-only styling. */
export function createCardLayoutCacheKey(input: CardLayoutCacheInput): string {
  const { cards, bounds, options } = input;
  // The polygon segment is appended rather than nested so it can be reused verbatim;
  // it only ever contains hex digits, numbers and `,`/`@`, so the `|` separator
  // stays unambiguous.
  return `${JSON.stringify({
    cards: cards.map(({ id, anchorX, anchorY, width, height }) => [id, anchorX, anchorY, width, height]),
    bounds: {
      width: bounds.width,
      height: bounds.height,
      map: areaKey(bounds.map),
      margin: bounds.margin,
      gap: bounds.gap,
      // Both overlap switches change which obstacles the solver honours without changing the
      // obstacle arrays themselves, so both belong in the key alongside the two arrays they gate.
      allowMapOverlap: bounds.allowMapOverlap === true,
      allowElementOverlap: bounds.allowElementOverlap === true,
      occupiedAreas: (bounds.occupiedAreas ?? []).map(areaKey),
      elementAreas: (bounds.elementAreas ?? []).map(areaKey),
    },
    options: {
      mode: options.mode ?? "quadrant",
      autoBalance: options.autoBalance === true,
      ...(options.topBottomBandRatio === undefined ? {} : { topBottomBandRatio: options.topBottomBandRatio }),
      connectorStyle: options.connectorStyle ?? "curve",
      connectorWidth: options.connectorWidth ?? 1.5,
    },
  })}|${occupiedPolygonsSegment(input)}`;
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
