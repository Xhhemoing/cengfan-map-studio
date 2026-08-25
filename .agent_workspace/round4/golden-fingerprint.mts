/**
 * Behaviour fingerprint for the card-layout split (Round 4).
 *
 * Runs a fixed board matrix through `solveCardLayout` and prints a stable JSON
 * digest of every placement plus the search diagnostics. Run it before and
 * after the module split; the two outputs must be byte-identical, which is a
 * stronger guarantee than the test suite alone (it pins exact coordinates, the
 * search decision and the trace counters for every board).
 *
 *   npx tsx .agent_workspace/round4/golden-fingerprint.mts > before.json
 */
import { createHash } from "node:crypto";
import { solveCardLayout, __layoutDebug } from "../../src/lib/card-layout.ts";
import type {
  CardLayoutBounds,
  CardLayoutInput,
  CardLayoutMode,
  CardLayoutOptions,
  CardPolygon,
} from "../../src/lib/card-layout-types.ts";

/** Deterministic pseudo-random source; no Math.random anywhere in a fingerprint. */
function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCards(count: number, seed: number, map: { x: number; y: number; width: number; height: number }): CardLayoutInput[] {
  const random = mulberry(seed);
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    anchorX: map.x + random() * map.width,
    anchorY: map.y + random() * map.height,
    width: 180 + Math.round(random() * 80),
    height: 90 + Math.round(random() * 40),
  }));
}

/** A blobby province outline, so the raster and edge index both get exercised. */
function province(cx: number, cy: number, radius: number, points: number, seed: number): CardPolygon {
  const random = mulberry(seed);
  const ring = Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * Math.PI * 2;
    const r = radius * (0.55 + random() * 0.6);
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.75 };
  });
  return { rings: [ring] };
}

const map = { x: 350, y: 120, width: 800, height: 690 };
const base: CardLayoutBounds = { width: 1500, height: 1000, map, margin: 32, gap: 14 };

interface Board {
  name: string;
  cards: CardLayoutInput[];
  bounds: CardLayoutBounds;
  options: CardLayoutOptions;
}

const modes: CardLayoutMode[] = ["quadrant", "radial", "right-stack", "grid"];
const boards: Board[] = [];

for (const mode of modes) {
  for (const count of [1, 6, 18, 34, 60]) {
    boards.push({
      name: `${mode}-plain-${count}`,
      cards: makeCards(count, count * 31 + mode.length, map),
      bounds: base,
      options: { mode },
    });
    boards.push({
      name: `${mode}-rect-obstacle-${count}`,
      cards: makeCards(count, count * 17 + mode.length, map),
      bounds: { ...base, occupiedAreas: [map, { x: 60, y: 700, width: 260, height: 220 }] },
      options: { mode, connectorStyle: "elbow", connectorWidth: 2 },
    });
    boards.push({
      name: `${mode}-vector-${count}`,
      cards: makeCards(count, count * 13 + mode.length, map),
      bounds: {
        ...base,
        occupiedAreas: [],
        occupiedPolygons: [
          province(600, 320, 220, 40, 7),
          province(950, 560, 180, 64, 11),
          province(480, 680, 120, 24, 5),
        ],
      },
      options: { mode, autoBalance: true },
    });
  }
}

// Saturation and degenerate boards: the fallback ladder, the infeasible guard
// and the input sanitiser all have to keep producing the same answers.
boards.push({
  name: "saturated-tiny-canvas",
  cards: makeCards(40, 99, { x: 40, y: 40, width: 200, height: 160 }),
  bounds: { width: 320, height: 260, map: { x: 40, y: 40, width: 200, height: 160 }, margin: 8, gap: 6 },
  options: { mode: "quadrant" },
});
boards.push({
  name: "saturated-vector",
  cards: makeCards(70, 4242, map),
  bounds: {
    ...base,
    width: 900,
    height: 700,
    occupiedAreas: [],
    occupiedPolygons: [province(450, 350, 400, 80, 3)],
  },
  options: { mode: "radial" },
});
boards.push({
  name: "degenerate-geometry",
  cards: [
    { id: "nan", anchorX: Number.NaN, anchorY: Number.NaN, width: Number.NaN, height: 40 },
    { id: "negative", anchorX: -500, anchorY: -500, width: -20, height: -20 },
    { id: "huge", anchorX: 600, anchorY: 400, width: 5000, height: 4000 },
  ],
  bounds: { ...base, margin: 900 },
  options: { mode: "quadrant" },
});
boards.push({
  name: "allow-map-overlap",
  cards: makeCards(24, 555, map),
  bounds: { ...base, allowMapOverlap: true },
  options: { mode: "quadrant", autoBalance: true },
});

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

const report = boards.map((board) => {
  const result = solveCardLayout(board.cards, board.bounds, board.options);
  const debug = __layoutDebug.last;
  return {
    board: board.name,
    status: result.status,
    mode: result.mode,
    cards: result.placements.length,
    decision: debug?.decision ?? null,
    improved: debug?.improved ?? null,
    trace: debug?.trace
      ? {
        candidates: debug.trace.candidates,
        ordersRun: debug.trace.ordersRun,
        ordersScored: debug.trace.ordersScored,
        improvingOrders: debug.trace.improvingOrders,
        stop: debug.trace.stop,
        budgetSpent: debug.trace.budgetSpent,
      }
      : null,
    placements: result.placements.map((placement) => ({
      id: placement.id,
      x: round(placement.x),
      y: round(placement.y),
      side: placement.side,
    })),
  };
});

const digest = createHash("sha256").update(JSON.stringify(report)).digest("hex");
process.stdout.write(`${JSON.stringify({ digest, report }, null, 2)}\n`);
