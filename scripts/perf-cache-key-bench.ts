/**
 * Micro-benchmark for card-layout cache-key construction (R2-9).
 * Run with: npx tsx scripts/perf-cache-key-bench.ts
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { CardLayoutBounds, CardLayoutInput, CardPoint, CardPolygon } from "../src/lib/card-layout";
import { createCardLayoutCacheKey } from "../src/lib/card-layout-cache";

interface GeoJsonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

interface GeoJsonFeatureCollection {
  features: Array<{ geometry: GeoJsonGeometry }>;
}

const RUNS = 5;
const BUILDS_PER_RUN = 20;

function makeCards(count: number): CardLayoutInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    anchorX: 360 + ((index * 137) % 780),
    anchorY: 120 + ((index * 89) % 690),
    width: 170 + (index % 7) * 12,
    height: 70 + (index % 5) * 10,
  }));
}

function toRing(coordinates: number[][]): CardPoint[] {
  return coordinates.map(([x = 0, y = 0]) => ({ x, y }));
}

function toPolygon(geometry: GeoJsonGeometry): CardPolygon {
  const sourceRings = geometry.type === "Polygon"
    ? geometry.coordinates as number[][][]
    : (geometry.coordinates as number[][][][]).flat();
  const rings = sourceRings.map(toRing);
  const points = rings.flat();
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    rings,
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]!;
}

const geoJson = JSON.parse(
  readFileSync(new URL("../src/assets/china.geojson", import.meta.url), "utf8"),
) as GeoJsonFeatureCollection;
const occupiedPolygons = geoJson.features.slice(0, 34).map(({ geometry }) => toPolygon(geometry));
if (occupiedPolygons.length !== 34) {
  throw new Error(`Expected 34 province geometries, received ${occupiedPolygons.length}`);
}

const input = {
  cards: makeCards(400),
  bounds: {
    width: 1500,
    height: 1000,
    map: { x: 350, y: 120, width: 800, height: 690 },
    margin: 32,
    gap: 14,
    occupiedPolygons,
  } satisfies CardLayoutBounds,
  options: {
    mode: "quadrant" as const,
    autoBalance: true,
    connectorStyle: "curve" as const,
    connectorWidth: 1.5,
  },
};

for (let index = 0; index < 5; index += 1) {
  createCardLayoutCacheKey(input);
}

const samples = Array.from({ length: RUNS }, () => {
  const start = performance.now();
  for (let index = 0; index < BUILDS_PER_RUN; index += 1) {
    createCardLayoutCacheKey(input);
  }
  return (performance.now() - start) / BUILDS_PER_RUN;
});

const vertexCount = occupiedPolygons.reduce(
  (total, polygon) => total + polygon.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
  0,
);
console.log(`geometry=34-provinces vertices=${vertexCount} cards=400 builds-per-run=${BUILDS_PER_RUN}`);
console.log(`samples-ms=${samples.map((sample) => sample.toFixed(3)).join(",")}`);
console.log(`median-ms=${median(samples).toFixed(3)}`);
