import { expect } from "vitest";
import type {
  CardArea,
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutMode,
  CardPlacement,
  CardPoint,
  CardPolygon,
} from "./card-layout";

export const bounds: CardLayoutBounds = {
  width: 1500,
  height: 1000,
  map: { x: 350, y: 120, width: 800, height: 690 },
  margin: 32,
  gap: 14,
};

export function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

export function cardInput(input: Omit<CardLayoutInput, "width" | "height"> & Partial<Pick<CardLayoutInput, "width" | "height">>): CardLayoutInput {
  return { width: 220, height: 110, ...input };
}

export function assertHardConstraints(
  placements: CardPlacement[],
  b: CardLayoutBounds,
  occupied: { x: number; y: number; width: number; height: number }[] = [],
) {
  for (const card of placements) {
    expect(card.x).toBeGreaterThanOrEqual(b.margin - 1e-6);
    expect(card.y).toBeGreaterThanOrEqual(b.margin - 1e-6);
    expect(card.x + card.width).toBeLessThanOrEqual(b.width - b.margin + 1e-6);
    expect(card.y + card.height).toBeLessThanOrEqual(b.height - b.margin + 1e-6);
    for (const zone of occupied) {
      expect(overlaps(card, zone)).toBe(false);
    }
  }
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      expect(overlaps(placements[i]!, placements[j]!)).toBe(false);
    }
  }
}

// ----- Hard-constraint oracle -----
//
// A deliberately naive, object-allocating rectangle/polygon test kept
// independent of the solver's own broad-phase implementation, so the property
// fuzz below cannot pass by agreeing with a bug in the fast path.

const ORACLE_EPSILON = 1e-7;

function oracleOrientation(a: CardPoint, b: CardPoint, c: CardPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function oraclePointOnSegment(point: CardPoint, start: CardPoint, end: CardPoint): boolean {
  return Math.abs(oracleOrientation(start, end, point)) <= ORACLE_EPSILON
    && point.x >= Math.min(start.x, end.x) - ORACLE_EPSILON
    && point.x <= Math.max(start.x, end.x) + ORACLE_EPSILON
    && point.y >= Math.min(start.y, end.y) - ORACLE_EPSILON
    && point.y <= Math.max(start.y, end.y) + ORACLE_EPSILON;
}

function oracleSegmentsIntersect(a: CardPoint, b: CardPoint, c: CardPoint, d: CardPoint): boolean {
  const abC = oracleOrientation(a, b, c);
  const abD = oracleOrientation(a, b, d);
  const cdA = oracleOrientation(c, d, a);
  const cdB = oracleOrientation(c, d, b);
  if (((abC > ORACLE_EPSILON && abD < -ORACLE_EPSILON) || (abC < -ORACLE_EPSILON && abD > ORACLE_EPSILON))
    && ((cdA > ORACLE_EPSILON && cdB < -ORACLE_EPSILON) || (cdA < -ORACLE_EPSILON && cdB > ORACLE_EPSILON))) return true;
  return oraclePointOnSegment(c, a, b)
    || oraclePointOnSegment(d, a, b)
    || oraclePointOnSegment(a, c, d)
    || oraclePointOnSegment(b, c, d);
}

function oraclePointInRing(point: CardPoint, ring: CardPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const start = ring[previous]!;
    const end = ring[index]!;
    if (oraclePointOnSegment(point, start, end)) return true;
    if ((start.y > point.y) !== (end.y > point.y)) {
      const x = start.x + (point.y - start.y) * (end.x - start.x) / (end.y - start.y);
      if (x >= point.x - ORACLE_EPSILON) inside = !inside;
    }
  }
  return inside;
}

function oraclePointInPolygon(point: CardPoint, polygon: CardPolygon): boolean {
  const [shell, ...holes] = polygon.rings;
  return Boolean(shell && oraclePointInRing(point, shell) && !holes.some((hole) => oraclePointInRing(point, hole)));
}

function oraclePolygonBounds(polygon: CardPolygon): CardArea | null {
  if (polygon.bounds) return polygon.bounds;
  const points = polygon.rings.flat();
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function oracleRectHitsPolygon(card: CardArea, polygon: CardPolygon, gap: number): boolean {
  const expanded = {
    x: card.x - gap,
    y: card.y - gap,
    width: card.width + gap * 2,
    height: card.height + gap * 2,
  };
  // A ring that cannot enclose an area is not an obstacle, and a card that only
  // touches the polygon's bounding box exactly (the rail coordinates the solver
  // emits) counts as clear — both are load-bearing contract details.
  const polygonArea = oraclePolygonBounds(polygon);
  if (!polygonArea || !overlapsWithGap(expanded, polygonArea, 0)) return false;
  const corners: CardPoint[] = [
    { x: expanded.x, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y },
    { x: expanded.x + expanded.width, y: expanded.y + expanded.height },
    { x: expanded.x, y: expanded.y + expanded.height },
  ];
  if (corners.some((corner) => oraclePointInPolygon(corner, polygon))) return true;
  const shell = polygon.rings[0] ?? [];
  if (shell.some((point) => point.x >= expanded.x - ORACLE_EPSILON
    && point.x <= expanded.x + expanded.width + ORACLE_EPSILON
    && point.y >= expanded.y - ORACLE_EPSILON
    && point.y <= expanded.y + expanded.height + ORACLE_EPSILON)) return true;
  const rectangleEdges = corners.map((corner, index) => [corner, corners[(index + 1) % corners.length]!] as const);
  return polygon.rings.some((ring) => ring.some((point, index) => {
    const next = ring[(index + 1) % ring.length];
    return Boolean(next && rectangleEdges.some(([start, end]) => oracleSegmentsIntersect(point, next, start, end)));
  }));
}

export function overlapsWithGap(left: CardArea, right: CardArea, gap: number): boolean {
  return left.x < right.x + right.width + gap
    && left.x + left.width + gap > right.x
    && left.y < right.y + right.height + gap
    && left.y + left.height + gap > right.y;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export const FUZZ_MODES: CardLayoutMode[] = [
  "proximity",
  "columns",
  "quadrant",
  "radial",
  "right-stack",
  "grid",
];

export function fuzzScenario(seed: number) {
  const random = seededRandom(seed);
  const width = 700 + Math.round(random() * 1200);
  const height = 500 + Math.round(random() * 900);
  const margin = 10 + Math.round(random() * 40);
  const gap = Math.round(random() * 18);
  const map = {
    x: margin + random() * width * 0.2,
    y: margin + random() * height * 0.2,
    width: width * (0.3 + random() * 0.4),
    height: height * (0.3 + random() * 0.4),
  };
  const polygons: CardPolygon[] = [];
  const polygonCount = Math.floor(random() * 7);
  for (let index = 0; index < polygonCount; index += 1) {
    const cx = map.x + random() * map.width;
    const cy = map.y + random() * map.height;
    const radiusX = 10 + random() * 110;
    const radiusY = 10 + random() * 110;
    // 2-vertex rings are intentionally reachable so degenerate geometry is fuzzed too.
    const vertices = 2 + Math.floor(random() * 22);
    const ring: CardPoint[] = [];
    for (let step = 0; step < vertices; step += 1) {
      const angle = (step / vertices) * Math.PI * 2;
      ring.push({
        x: cx + Math.cos(angle) * radiusX * (0.6 + random() * 0.8),
        y: cy + Math.sin(angle) * radiusY * (0.6 + random() * 0.8),
      });
    }
    if (random() < 0.5) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of ring) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      polygons.push({ rings: [ring], bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } });
    } else {
      polygons.push({ rings: [ring] });
    }
  }
  const occupiedAreas = Array.from({ length: Math.floor(random() * 4) }, () => ({
    x: margin + random() * (width - margin * 2) * 0.7,
    y: margin + random() * (height - margin * 2) * 0.7,
    width: 40 + random() * 220,
    height: 40 + random() * 180,
  }));
  const layoutBounds: CardLayoutBounds = {
    width,
    height,
    map,
    margin,
    gap,
    ...(random() < 0.75 ? { occupiedAreas } : {}),
    ...(polygons.length ? { occupiedPolygons: polygons } : {}),
    ...(random() < 0.2 ? { allowMapOverlap: true } : {}),
  };
  const cards: CardLayoutInput[] = Array.from({ length: 1 + Math.floor(random() * 13) }, (_, index) => ({
    id: `fuzz-${index}`,
    anchorX: random() * width,
    anchorY: random() * height,
    width: 50 + Math.round(random() * 180),
    height: 30 + Math.round(random() * 110),
  }));
  return {
    cards,
    bounds: layoutBounds,
    options: {
      mode: FUZZ_MODES[Math.floor(random() * FUZZ_MODES.length)]!,
      autoBalance: random() < 0.5,
      connectorStyle: (["straight", "elbow", "curve"] as const)[Math.floor(random() * 3)]!,
      connectorWidth: random() * 4,
    },
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
