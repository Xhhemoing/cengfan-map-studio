/**
 * Deterministic micro-benchmark for the card auto-layout solver.
 *
 * Run: npm run perf:layout
 * Save machine-readable output:
 * npx tsx scripts/perf-layout-bench.ts > .agent_workspace/round4/perf-baseline.json
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { UserAsset } from "../src/lib/assets";
import {
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardPlacement,
  type CardLayoutResult,
} from "../src/lib/card-layout";
import { createCardLayoutCacheKey } from "../src/lib/card-layout-cache";
import { layoutGrid, stackAtMargin, sweepPack } from "../src/lib/card-layout-pack";
import { LayoutSpace, PlacementIndex } from "../src/lib/card-layout-space";
import { posterPngExportSize } from "../src/lib/export-poster";
import {
  assertLayoutInvariants,
  makeLayoutHealthBenchmarkFixture,
  type LayoutHealthBenchmarkShape,
} from "../src/lib/layout-perf";
import {
  checkLayoutHealth,
  type LayoutHealthIssueKind,
} from "../src/lib/layout-health";
import { resolvePrintBleedGeometry } from "../src/lib/print-bleed";
import { runPrintPreflight } from "../src/lib/print-preflight";

export const DEFAULT_LAYOUT_BENCH_COUNTS = [16, 24, 36, 60, 100, 200, 400] as const;
export const DEFAULT_LAYOUT_BENCH_MODES: readonly CardLayoutMode[] = [
  "quadrant",
  "radial",
  "right-stack",
  "grid",
];
export const DEFAULT_LAYOUT_HEALTH_BENCH_LANES = [12, 30, 60, 120] as const;
export const LAYOUT_HEALTH_BENCH_SHAPES: readonly LayoutHealthBenchmarkShape[] = [
  "direct-bounds",
  "pinned-card-positions",
];
export const DEFAULT_MARGIN_STACK_BENCH_COLUMN_COUNTS = [16, 60, 120, 400] as const;
export const DEFAULT_SWEEP_PACK_BENCH_CARD_COUNTS = [16, 60, 120, 400] as const;
export const DEFAULT_GRID_LEFTOVER_SHAPE_CARD_COUNTS = [16, 60, 120, 400] as const;

export interface LayoutBenchmarkConfig {
  counts?: readonly number[];
  modes?: readonly CardLayoutMode[];
  warmupIterations?: number;
  iterations?: number;
  seed?: number;
}

export interface LayoutBenchmarkResult {
  count: number;
  mode: CardLayoutMode;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  fallbackRuns: number;
}

export interface LayoutBenchmarkReport {
  schemaVersion: 1;
  generatedAt: string;
  runtime: {
    node: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  seed: number;
  warmupIterations: number;
  iterations: number;
  counts: number[];
  modes: CardLayoutMode[];
  invariantChecks: {
    finiteNumbers: true;
    canvasBounds: true;
    placementCount: true;
    overlaps: "solved-results";
  };
  results: LayoutBenchmarkResult[];
}

export interface WorkerMessageBenchmarkResult {
  methodology: "worker_threads request and placement-shaped response; solver excluded";
  comparisonMethodology: "same-fixture main-thread solveCardLayout; invariant checks excluded from timing";
  count: number;
  mode: "quadrant";
  startupIterations: number;
  warmupIterations: number;
  iterations: number;
  startupP50Ms: number;
  startupP95Ms: number;
  warmP50Ms: number;
  warmP95Ms: number;
  mainThreadSolveP50Ms: number;
  mainThreadSolveP95Ms: number;
  startupToSolveP95Ratio: number;
  warmTransportToSolveP95Ratio: number;
}

export interface LayoutBenchmarkCliReport extends LayoutBenchmarkReport {
  adversarialFixture: AdversarialLayoutBenchmarkReport;
  clusteredAnchorFixture: ClusteredAnchorLayoutBenchmarkReport;
  workerMessageOverhead: WorkerMessageBenchmarkResult;
  cacheKeyGeneration: CardLayoutCacheKeyBenchmarkReport;
  layoutHealth: LayoutHealthBenchmarkReport;
  stackAtMargin: StackAtMarginBenchmarkReport;
  sweepPackBranches: SweepPackBenchmarkReport;
  layoutGridLeftovers: LayoutGridLeftoverShapeReport;
  printBleedExport: PrintBleedExportBenchmarkReport;
  printPreflight: PrintPreflightBenchmarkReport;
}

export interface CardLayoutCacheKeyBenchmarkReport {
  methodology: "stable cache-key serialization with and without pinned coordinates before worker dispatch; solver and cache lookup excluded";
  cardCount: number;
  polygonCount: number;
  verticesPerPolygon: number;
  warmupIterations: number;
  iterations: number;
  results: CardLayoutCacheKeyBenchmarkResult[];
}

export interface CardLayoutCacheKeyBenchmarkResult {
  fixedPositions: "absent" | "all-cards";
  fixedPositionCount: number;
  keyBytes: number;
  p50Ms: number;
  p95Ms: number;
}

export interface LayoutHealthBenchmarkConfig {
  laneCounts?: readonly number[];
  shapes?: readonly LayoutHealthBenchmarkShape[];
  warmupIterations?: number;
  iterations?: number;
}

export interface LayoutHealthBenchmarkResult {
  shape: LayoutHealthBenchmarkShape;
  laneCount: number;
  cardCount: number;
  connectorCount: number;
  pinnedPositionCount: number;
  segmentsPerConnector: number;
  issueCount: number;
  issueCounts: Partial<Record<LayoutHealthIssueKind, number>>;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface LayoutHealthBenchmarkReport {
  methodology: "synthetic card rectangles and three-segment polylines, with optional pinned card-position resolution; checkLayoutHealth only; fixture creation and issue summarization excluded";
  warmupIterations: number;
  iterations: number;
  laneCounts: number[];
  shapes: LayoutHealthBenchmarkShape[];
  results: LayoutHealthBenchmarkResult[];
}

export interface StackAtMarginBenchmarkConfig {
  columnCounts?: readonly number[];
  warmupIterations?: number;
  iterations?: number;
  gapPx?: number;
}

export interface StackAtMarginBenchmarkResult {
  columnCount: number;
  placedY: number;
  minimumClearancePx: number;
  gapClearanceResidualPx: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface StackAtMarginBenchmarkReport {
  methodology: "reverse-ordered margin-column filter, sort, scan, and side resolution in stackAtMargin; fixture construction, index insertion, and clearance summary excluded";
  fixture: "half-gap head clearance followed by a scalable margin column";
  warmupIterations: number;
  iterations: number;
  columnCounts: number[];
  cardWidth: number;
  cardHeight: number;
  requiredGapPx: number;
  results: StackAtMarginBenchmarkResult[];
}

export type SweepPackBenchmarkScenario = "clear-first-fit" | "full-obstacle-leftovers";

export interface SweepPackBenchmarkConfig {
  cardCounts?: readonly number[];
  warmupIterations?: number;
  iterations?: number;
}

export interface SweepPackBenchmarkResult {
  scenario: SweepPackBenchmarkScenario;
  cardCount: number;
  placementCount: number;
  blockedPlacementCount: number;
  distinctPositionCount: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface SweepPackBenchmarkReport {
  methodology: "same-card sweepPack on a clear canvas versus a canvas fully covered by one exact rectangular obstacle; fixture construction, LayoutSpace indexing, and output-shape summary excluded";
  warmupIterations: number;
  iterations: number;
  cardCounts: number[];
  cardWidth: number;
  cardHeight: number;
  results: SweepPackBenchmarkResult[];
}

export interface LayoutGridLeftoverShapeConfig {
  cardCounts?: readonly number[];
}

export interface LayoutGridLeftoverShapeResult {
  cardCount: number;
  placementCount: number;
  blockedPlacementCount: number;
  distinctPositionCount: number;
  maximumPileDepth: number;
}

export interface LayoutGridLeftoverShapeReport {
  methodology: "shape-only layoutGrid on a canvas fully covered by one exact rectangular obstacle; placement counts distinguish distributed margin stacking from a single shared fallback seat; elapsed time excluded";
  cardCounts: number[];
  cardWidth: number;
  cardHeight: number;
  results: LayoutGridLeftoverShapeResult[];
}

export interface PrintBleedExportBenchmarkResult {
  bleedMm: number;
  p50Ms: number;
  p95Ms: number;
  expandedWidth: number;
  expandedHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface PrintBleedExportBenchmarkReport {
  methodology: "poster PNG export-size calculation; DOM cloning, rasterization, and XML serialization excluded";
  warmupIterations: number;
  iterations: number;
  canvas: { width: number; height: number };
  scale: number;
  results: PrintBleedExportBenchmarkResult[];
}

export interface PrintPreflightBenchmarkReport {
  methodology: "resource and print-resolution preflight; file I/O and image decoding excluded";
  warmupIterations: number;
  iterations: number;
  referencedAssets: number;
  issueCount: number;
  p50Ms: number;
  p95Ms: number;
}

export interface DensePolygonBenchmarkFixture {
  cards: CardLayoutInput[];
  bounds: CardLayoutBounds;
}

export interface ClusteredAnchorBenchmarkFixture extends DensePolygonBenchmarkFixture {
  province: "北京市";
  anchor: { x: number; y: number };
}

export interface AdversarialLayoutBenchmarkReport {
  fixture: "dense-overlap-many-polygons";
  description: string;
  seed: number;
  cardCount: number;
  polygonCount: number;
  verticesPerPolygon: number;
  warmupIterations: number;
  iterations: number;
  modes: CardLayoutMode[];
  results: LayoutBenchmarkResult[];
}

export interface ClusteredAnchorLayoutBenchmarkReport {
  fixture: "clustered-anchor-single-province";
  description: string;
  province: "北京市";
  seed: number;
  cardCount: number;
  anchor: { x: number; y: number };
  warmupIterations: number;
  iterations: number;
  modes: CardLayoutMode[];
  results: LayoutBenchmarkResult[];
}

export type AdversarialLayoutBenchmarkConfig = Omit<LayoutBenchmarkConfig, "counts">;

export function makeLayoutBenchmarkCards(count: number, seed = 7): CardLayoutInput[] {
  const cards: CardLayoutInput[] = [];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const provinceAnchors = Array.from({ length: 34 }, (_, index) => ({
    x: 400 + ((index * 137) % 700),
    y: 150 + ((index * 89) % 560),
  }));
  for (let index = 0; index < count; index += 1) {
    const anchor = provinceAnchors[index % provinceAnchors.length]!;
    cards.push({
      id: `card-${index}`,
      anchorX: anchor.x + (random() - 0.5) * 60,
      anchorY: anchor.y + (random() - 0.5) * 60,
      width: 170 + Math.round(random() * 90),
      height: 70 + Math.round(random() * 60),
    });
  }
  return cards;
}

export function makeLayoutBenchmarkBounds(): CardLayoutBounds {
  return {
    width: 1500,
    height: 1000,
    map: { x: 350, y: 120, width: 800, height: 690 },
    margin: 32,
    gap: 14,
  };
}

/**
 * Isolates the contention caused when every destination resolves to one
 * province anchor. Card dimensions vary deterministically, but all anchor
 * coordinates are exactly equal.
 */
export function makeClusteredAnchorBenchmarkFixture(
  seed = 20260824,
): ClusteredAnchorBenchmarkFixture {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const anchor = { x: 860, y: 300 };
  const cards = Array.from({ length: 70 }, (_, index) => ({
    id: `beijing-card-${index}`,
    anchorX: anchor.x,
    anchorY: anchor.y,
    width: 122 + Math.round(random() * 18),
    height: 52 + Math.round(random() * 10),
  }));
  return {
    province: "北京市",
    anchor,
    cards,
    bounds: makeLayoutBenchmarkBounds(),
  };
}

/**
 * A deterministic stress fixture kept out of the CI timing matrix. Its cards
 * share a tiny anchor cluster while 96 polygon obstacles exercise the indexed
 * vector-map path; neither property is represented by the regular province-
 * distributed fixture.
 */
export function makeDensePolygonBenchmarkFixture(seed = 20260824): DensePolygonBenchmarkFixture {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const map = { x: 350, y: 120, width: 800, height: 690 };
  const polygonColumns = 12;
  const polygonRows = 8;
  const verticesPerPolygon = 16;
  const occupiedPolygons = Array.from(
    { length: polygonColumns * polygonRows },
    (_, index) => {
      const column = index % polygonColumns;
      const row = Math.floor(index / polygonColumns);
      const cellWidth = map.width / polygonColumns;
      const cellHeight = map.height / polygonRows;
      const centerX = map.x + (column + 0.5) * cellWidth;
      const centerY = map.y + (row + 0.5) * cellHeight;
      const radiusX = cellWidth * (0.3 + random() * 0.08);
      const radiusY = cellHeight * (0.3 + random() * 0.08);
      return {
        rings: [Array.from({ length: verticesPerPolygon }, (_, vertex) => {
          const angle = (vertex / verticesPerPolygon) * Math.PI * 2;
          const ripple = 0.86 + random() * 0.14;
          return {
            x: centerX + Math.cos(angle) * radiusX * ripple,
            y: centerY + Math.sin(angle) * radiusY * ripple,
          };
        })],
      };
    },
  );
  const cards = Array.from({ length: 70 }, (_, index) => ({
    id: `dense-card-${index}`,
    anchorX: 750 + (random() - 0.5) * 36,
    anchorY: 465 + (random() - 0.5) * 36,
    width: 122 + Math.round(random() * 18),
    height: 52 + Math.round(random() * 10),
  }));
  return {
    cards,
    bounds: {
      width: 1500,
      height: 1000,
      map,
      margin: 32,
      gap: 14,
      occupiedAreas: [],
      occupiedPolygons,
    },
  };
}

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]!;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

const ECHO_WORKER_SOURCE = `
  const { parentPort } = require("node:worker_threads");
  parentPort.on("message", (request) => {
    parentPort.postMessage({
      type: "result",
      requestId: request.requestId,
      key: request.key,
      result: {
        mode: request.options.mode,
        status: "solved",
        placements: request.cards.map((card) => ({
          ...card,
          x: card.anchorX,
          y: card.anchorY,
          side: "right",
        })),
      },
    });
  });
`;

function workerRoundTrip(worker: Worker, payload: object, requestId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const onError = (error: Error) => {
      worker.off("message", onMessage);
      reject(error);
    };
    const onMessage = () => {
      worker.off("error", onError);
      resolve(performance.now() - startedAt);
    };
    worker.once("error", onError);
    worker.once("message", onMessage);
    worker.postMessage({ ...payload, requestId });
  });
}

/**
 * Separates message/startup overhead from solver time. It deliberately uses a
 * placement-shaped response so both structured-clone directions scale with
 * roster size, while excluding solver work from the timing.
 */
export async function runWorkerMessageBenchmark(
  // Keep this default aligned with DEFAULT_WORKER_CARD_THRESHOLD.
  count = 24,
  startupIterations = 7,
  warmupIterations = 2,
  iterations = 30,
): Promise<WorkerMessageBenchmarkResult> {
  positiveInteger(count, "worker card count");
  positiveInteger(startupIterations, "worker startupIterations");
  positiveInteger(warmupIterations, "worker warmupIterations");
  positiveInteger(iterations, "worker iterations");
  const cards = makeLayoutBenchmarkCards(count);
  const bounds = makeLayoutBenchmarkBounds();
  const options = {
    mode: "quadrant" as const,
    autoBalance: true,
    connectorStyle: "curve" as const,
    connectorWidth: 1.5,
  };
  const payload = {
    type: "solve",
    key: `worker-probe-${count}`,
    cards,
    bounds,
    options,
  };
  const startupSamples: number[] = [];
  let requestId = 0;
  for (let iteration = 0; iteration < startupIterations; iteration += 1) {
    const worker = new Worker(ECHO_WORKER_SOURCE, { eval: true });
    try {
      startupSamples.push(await workerRoundTrip(worker, payload, requestId += 1));
    } finally {
      await worker.terminate();
    }
  }

  const worker = new Worker(ECHO_WORKER_SOURCE, { eval: true });
  const warmSamples: number[] = [];
  try {
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      await workerRoundTrip(worker, payload, requestId += 1);
    }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      warmSamples.push(await workerRoundTrip(worker, payload, requestId += 1));
    }
  } finally {
    await worker.terminate();
  }

  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    solveCardLayout(cards, bounds, options);
  }
  const mainThreadSolveSamples: number[] = [];
  let mainThreadResult: CardLayoutResult | undefined;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    mainThreadResult = solveCardLayout(cards, bounds, options);
    mainThreadSolveSamples.push(performance.now() - startedAt);
  }
  if (!mainThreadResult || mainThreadResult.placements.length !== cards.length) {
    throw new Error(`quadrant/${count}: main-thread comparison returned an invalid placement count`);
  }
  assertLayoutInvariants(
    mainThreadResult.placements,
    bounds,
    { checkOverlaps: mainThreadResult.status === "solved" },
  );

  const startupP50Ms = rounded(percentile(startupSamples, 0.5));
  const startupP95 = percentile(startupSamples, 0.95);
  const startupP95Ms = rounded(startupP95);
  const warmP50Ms = rounded(percentile(warmSamples, 0.5));
  const warmP95 = percentile(warmSamples, 0.95);
  const warmP95Ms = rounded(warmP95);
  const mainThreadSolveP50Ms = rounded(percentile(mainThreadSolveSamples, 0.5));
  const mainThreadSolveP95 = percentile(mainThreadSolveSamples, 0.95);
  const mainThreadSolveP95Ms = rounded(mainThreadSolveP95);
  return {
    methodology: "worker_threads request and placement-shaped response; solver excluded",
    comparisonMethodology: "same-fixture main-thread solveCardLayout; invariant checks excluded from timing",
    count,
    mode: "quadrant",
    startupIterations,
    warmupIterations,
    iterations,
    startupP50Ms,
    startupP95Ms,
    warmP50Ms,
    warmP95Ms,
    mainThreadSolveP50Ms,
    mainThreadSolveP95Ms,
    startupToSolveP95Ratio: rounded(startupP95 / mainThreadSolveP95),
    warmTransportToSolveP95Ratio: rounded(warmP95 / mainThreadSolveP95),
  };
}

function solveAndAssert(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  mode: CardLayoutMode,
): CardLayoutResult {
  const result = solveCardLayout(cards, bounds, {
    mode,
    autoBalance: true,
    connectorStyle: "curve",
    connectorWidth: 1.5,
  });
  if (result.placements.length !== cards.length) {
    throw new Error(
      `${mode}/${cards.length}: expected ${cards.length} placements, received ${result.placements.length}`,
    );
  }
  assertLayoutInvariants(result.placements, bounds, { checkOverlaps: result.status === "solved" });
  return result;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function runBenchmarkCases(
  cards: CardLayoutInput[],
  bounds: CardLayoutBounds,
  modes: readonly CardLayoutMode[],
  warmupIterations: number,
  iterations: number,
): LayoutBenchmarkResult[] {
  const results: LayoutBenchmarkResult[] = [];
  for (const mode of modes) {
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      solveAndAssert(cards, bounds, mode);
    }

    const samples: number[] = [];
    let fallbackRuns = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      const result = solveAndAssert(cards, bounds, mode);
      samples.push(performance.now() - startedAt);
      if (result.status === "fallback") fallbackRuns += 1;
    }
    results.push({
      count: cards.length,
      mode,
      p50Ms: rounded(percentile(samples, 0.5)),
      p95Ms: rounded(percentile(samples, 0.95)),
      minMs: rounded(Math.min(...samples)),
      maxMs: rounded(Math.max(...samples)),
      fallbackRuns,
    });
  }
  return results;
}

export function runLayoutBenchmark(config: LayoutBenchmarkConfig = {}): LayoutBenchmarkReport {
  const counts = [...(config.counts ?? DEFAULT_LAYOUT_BENCH_COUNTS)]
    .map((count) => positiveInteger(count, "card count"));
  const modes = [...(config.modes ?? DEFAULT_LAYOUT_BENCH_MODES)];
  const warmupIterations = positiveInteger(config.warmupIterations ?? 2, "warmupIterations");
  const iterations = positiveInteger(config.iterations ?? 12, "iterations");
  const seed = config.seed ?? 7;
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (counts.length === 0) throw new Error("counts must not be empty");
  if (modes.length === 0) throw new Error("modes must not be empty");

  const bounds = makeLayoutBenchmarkBounds();
  const results: LayoutBenchmarkResult[] = [];
  for (const count of counts) {
    const cards = makeLayoutBenchmarkCards(count, seed);
    results.push(...runBenchmarkCases(cards, bounds, modes, warmupIterations, iterations));
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    seed,
    warmupIterations,
    iterations,
    counts,
    modes,
    invariantChecks: {
      finiteNumbers: true,
      canvasBounds: true,
      placementCount: true,
      overlaps: "solved-results",
    },
    results,
  };
}

function makeStackAtMarginBenchmarkFixture(columnCount: number, gapPx: number): {
  space: LayoutSpace;
  placed: PlacementIndex;
  placement: CardPlacement;
} {
  const margin = 20;
  const cardWidth = 120;
  const cardHeight = 48;
  const firstCardY = margin + cardHeight + gapPx / 2;
  const cards: CardPlacement[] = Array.from({ length: columnCount }, (_, index) => ({
    id: `margin-column-${index}`,
    anchorX: margin,
    anchorY: firstCardY + index * (cardHeight + gapPx),
    width: cardWidth,
    height: cardHeight,
    x: margin,
    y: firstCardY + index * (cardHeight + gapPx),
    side: "left",
  }));
  const lastCard = cards.at(-1)!;
  const height = lastCard.y + lastCard.height + gapPx + cardHeight + margin;
  const space = new LayoutSpace({
    width: 640,
    height,
    map: { x: 240, y: height / 2 - 80, width: 160, height: 160 },
    occupiedAreas: [],
    margin,
    gap: gapPx,
  });
  const placed = PlacementIndex.forSpace(space);
  // Reverse insertion makes the sort observable while preserving fixed geometry.
  for (const card of [...cards].reverse()) placed.add(card);
  return {
    space,
    placed,
    placement: {
      id: "margin-stack-probe",
      anchorX: 520,
      anchorY: margin,
      width: cardWidth,
      height: cardHeight,
      x: margin,
      y: margin,
      side: "right",
    },
  };
}

function verticalClearance(left: CardPlacement, right: CardPlacement): number {
  return Math.max(
    right.y - (left.y + left.height),
    left.y - (right.y + right.height),
  );
}

/**
 * Observes the filter/sort/scan cost introduced by the margin-stack fallback
 * and the signed residual from its configured gap. A negative residual means
 * the seat is clear of pixel overlap but closer than `requiredGapPx`; it is
 * deliberately reported rather than asserted as a machine-dependent gate.
 */
export function runStackAtMarginBenchmark(
  config: StackAtMarginBenchmarkConfig = {},
): StackAtMarginBenchmarkReport {
  const columnCounts = [...(config.columnCounts ?? DEFAULT_MARGIN_STACK_BENCH_COLUMN_COUNTS)]
    .map((count) => positiveInteger(count, "margin stack column count"));
  const warmupIterations = positiveInteger(
    config.warmupIterations ?? 3,
    "margin stack warmupIterations",
  );
  const iterations = positiveInteger(config.iterations ?? 20, "margin stack iterations");
  const gapPx = config.gapPx ?? 12;
  if (columnCounts.length === 0) throw new Error("margin stack columnCounts must not be empty");
  if (!Number.isFinite(gapPx) || gapPx <= 0) {
    throw new Error("margin stack gapPx must be a positive finite number");
  }

  const results = columnCounts.map((columnCount): StackAtMarginBenchmarkResult => {
    const fixture = makeStackAtMarginBenchmarkFixture(columnCount, gapPx);
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      stackAtMargin(fixture.placement, fixture.space, fixture.placed);
    }

    const samples: number[] = [];
    let placement = fixture.placement;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      placement = stackAtMargin(fixture.placement, fixture.space, fixture.placed);
      samples.push(performance.now() - startedAt);
    }
    const minimumClearancePx = Math.min(
      ...fixture.placed.items.map((other) => verticalClearance(placement, other)),
    );
    return {
      columnCount,
      placedY: rounded(placement.y),
      minimumClearancePx: rounded(minimumClearancePx),
      gapClearanceResidualPx: rounded(minimumClearancePx - gapPx),
      p50Ms: rounded(percentile(samples, 0.5)),
      p95Ms: rounded(percentile(samples, 0.95)),
      minMs: rounded(Math.min(...samples)),
      maxMs: rounded(Math.max(...samples)),
    };
  });

  return {
    methodology: "reverse-ordered margin-column filter, sort, scan, and side resolution in stackAtMargin; fixture construction, index insertion, and clearance summary excluded",
    fixture: "half-gap head clearance followed by a scalable margin column",
    warmupIterations,
    iterations,
    columnCounts,
    cardWidth: 120,
    cardHeight: 48,
    requiredGapPx: gapPx,
    results,
  };
}

function makeSweepPackBenchmarkFixture(
  cardCount: number,
  scenario: SweepPackBenchmarkScenario,
): {
  cards: CardLayoutInput[];
  space: LayoutSpace;
} {
  const width = 1500;
  const height = 1000;
  const margin = 8;
  const cards = Array.from({ length: cardCount }, (_, index): CardLayoutInput => ({
    id: `sweep-${scenario}-${index}`,
    anchorX: 200 + (index % 12) * 90,
    anchorY: 120 + Math.floor(index / 12) * 42,
    width: 48,
    height: 28,
  }));
  return {
    cards,
    space: new LayoutSpace({
      width,
      height,
      map: { x: 0, y: 0, width: 0, height: 0 },
      occupiedAreas: scenario === "clear-first-fit"
        ? []
        : [{ x: 0, y: 0, width, height }],
      margin,
      gap: 4,
    }),
  };
}

/**
 * Isolates the two shapes hidden inside whole-solver timings: an unconstrained
 * sweep where every card finds a legal seat, and a saturated sweep where every
 * card exhausts the rows and enters the leftover margin-stack pass.
 */
export function runSweepPackBenchmark(
  config: SweepPackBenchmarkConfig = {},
): SweepPackBenchmarkReport {
  const cardCounts = [...(config.cardCounts ?? DEFAULT_SWEEP_PACK_BENCH_CARD_COUNTS)]
    .map((count) => positiveInteger(count, "sweep pack card count"));
  const warmupIterations = positiveInteger(
    config.warmupIterations ?? 2,
    "sweep pack warmupIterations",
  );
  const iterations = positiveInteger(config.iterations ?? 10, "sweep pack iterations");
  if (cardCounts.length === 0) throw new Error("sweep pack cardCounts must not be empty");

  const scenarios: readonly SweepPackBenchmarkScenario[] = [
    "clear-first-fit",
    "full-obstacle-leftovers",
  ];
  const results = cardCounts.flatMap((cardCount) =>
    scenarios.map((scenario): SweepPackBenchmarkResult => {
      const fixture = makeSweepPackBenchmarkFixture(cardCount, scenario);
      for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
        sweepPack(fixture.cards, fixture.space);
      }

      const samples: number[] = [];
      let placements: CardPlacement[] = [];
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const startedAt = performance.now();
        placements = sweepPack(fixture.cards, fixture.space);
        samples.push(performance.now() - startedAt);
      }
      return {
        scenario,
        cardCount,
        placementCount: placements.length,
        blockedPlacementCount: placements.filter((placement) =>
          fixture.space.blocked(placement)).length,
        distinctPositionCount: new Set(
          placements.map(({ x, y }) => `${rounded(x)},${rounded(y)}`),
        ).size,
        p50Ms: rounded(percentile(samples, 0.5)),
        p95Ms: rounded(percentile(samples, 0.95)),
        minMs: rounded(Math.min(...samples)),
        maxMs: rounded(Math.max(...samples)),
      };
    }),
  );

  return {
    methodology: "same-card sweepPack on a clear canvas versus a canvas fully covered by one exact rectangular obstacle; fixture construction, LayoutSpace indexing, and output-shape summary excluded",
    warmupIterations,
    iterations,
    cardCounts,
    cardWidth: 48,
    cardHeight: 28,
    results,
  };
}

/**
 * Reports the saturated layoutGrid fallback shape without treating elapsed
 * time as a CI budget. A single piled seat has one distinct position and a
 * maximum pile depth equal to the card count; margin stacking spreads those
 * same leftovers across multiple positions.
 */
export function runLayoutGridLeftoverShapeReport(
  config: LayoutGridLeftoverShapeConfig = {},
): LayoutGridLeftoverShapeReport {
  const cardCounts = [...(config.cardCounts ?? DEFAULT_GRID_LEFTOVER_SHAPE_CARD_COUNTS)]
    .map((count) => positiveInteger(count, "layout grid leftover card count"));
  if (cardCounts.length === 0) {
    throw new Error("layout grid leftover cardCounts must not be empty");
  }

  const results = cardCounts.map((cardCount): LayoutGridLeftoverShapeResult => {
    const fixture = makeSweepPackBenchmarkFixture(cardCount, "full-obstacle-leftovers");
    const placements = layoutGrid(fixture.cards, fixture.space);
    const pileDepths = new Map<string, number>();
    for (const { x, y } of placements) {
      const key = `${rounded(x)},${rounded(y)}`;
      pileDepths.set(key, (pileDepths.get(key) ?? 0) + 1);
    }
    return {
      cardCount,
      placementCount: placements.length,
      blockedPlacementCount: placements.filter((placement) =>
        fixture.space.blocked(placement)).length,
      distinctPositionCount: pileDepths.size,
      maximumPileDepth: Math.max(0, ...pileDepths.values()),
    };
  });

  return {
    methodology: "shape-only layoutGrid on a canvas fully covered by one exact rectangular obstacle; placement counts distinguish distributed margin stacking from a single shared fallback seat; elapsed time excluded",
    cardCounts,
    cardWidth: 48,
    cardHeight: 28,
    results,
  };
}

/**
 * Times the full layout-health pass against a scalable synthetic scene. The
 * production map and content-layout builders are intentionally absent: plain
 * rectangles and polylines are sufficient to exercise connector conflicts and
 * connector-crosses-card checks without a Vite-only geography import.
 */
export function runLayoutHealthBenchmark(
  config: LayoutHealthBenchmarkConfig = {},
): LayoutHealthBenchmarkReport {
  const laneCounts = [...(config.laneCounts ?? DEFAULT_LAYOUT_HEALTH_BENCH_LANES)]
    .map((count) => positiveInteger(count, "layout health lane count"));
  const shapes = [...(config.shapes ?? ["direct-bounds" satisfies LayoutHealthBenchmarkShape])];
  const warmupIterations = positiveInteger(
    config.warmupIterations ?? 3,
    "layout health warmupIterations",
  );
  const iterations = positiveInteger(config.iterations ?? 20, "layout health iterations");
  if (laneCounts.length === 0) throw new Error("layout health laneCounts must not be empty");
  if (shapes.length === 0) throw new Error("layout health shapes must not be empty");

  const results = shapes.flatMap((shape) => laneCounts.map((laneCount): LayoutHealthBenchmarkResult => {
    const fixture = makeLayoutHealthBenchmarkFixture(laneCount, shape);
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      checkLayoutHealth(fixture.input);
    }

    const samples: number[] = [];
    let issues: ReturnType<typeof checkLayoutHealth> = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      issues = checkLayoutHealth(fixture.input);
      samples.push(performance.now() - startedAt);
    }
    const issueCounts: Partial<Record<LayoutHealthIssueKind, number>> = {};
    for (const issue of issues) {
      issueCounts[issue.kind] = (issueCounts[issue.kind] ?? 0) + 1;
    }
    if (!issueCounts["connector-crosses-card"]) {
      throw new Error(`layout health/${laneCount}: fixture did not exercise connector-crosses-card`);
    }

    return {
      shape,
      laneCount,
      cardCount: fixture.cardCount,
      connectorCount: fixture.connectorCount,
      pinnedPositionCount: fixture.pinnedPositionCount,
      segmentsPerConnector: fixture.segmentsPerConnector,
      issueCount: issues.length,
      issueCounts,
      p50Ms: rounded(percentile(samples, 0.5)),
      p95Ms: rounded(percentile(samples, 0.95)),
      minMs: rounded(Math.min(...samples)),
      maxMs: rounded(Math.max(...samples)),
    };
  }));

  return {
    methodology: "synthetic card rectangles and three-segment polylines, with optional pinned card-position resolution; checkLayoutHealth only; fixture creation and issue summarization excluded",
    warmupIterations,
    iterations,
    laneCounts,
    shapes,
    results,
  };
}

export function runPrintBleedExportBenchmark(
  warmupIterations = 500,
  iterations = 5_000,
  scale = 300 / 96,
): PrintBleedExportBenchmarkReport {
  positiveInteger(warmupIterations, "print bleed warmupIterations");
  positiveInteger(iterations, "print bleed iterations");
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("print bleed scale must be positive");
  const canvas = { width: 1500, height: 1000 };
  const results = [0, 3].map((bleedMm) => {
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      posterPngExportSize(canvas, { printBleedMm: bleedMm, scale });
    }
    const samples: number[] = [];
    let exportSize = posterPngExportSize(canvas, { printBleedMm: bleedMm, scale });
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      exportSize = posterPngExportSize(canvas, { printBleedMm: bleedMm, scale });
      samples.push(performance.now() - startedAt);
    }
    const geometry = resolvePrintBleedGeometry(
      { x: 0, y: 0, ...canvas },
      { printBleedMm: bleedMm },
    );
    return {
      bleedMm,
      p50Ms: rounded(percentile(samples, 0.5)),
      p95Ms: rounded(percentile(samples, 0.95)),
      expandedWidth: rounded(geometry.media.width),
      expandedHeight: rounded(geometry.media.height),
      pixelWidth: exportSize.width,
      pixelHeight: exportSize.height,
    };
  });
  return {
    methodology: "poster PNG export-size calculation; DOM cloning, rasterization, and XML serialization excluded",
    warmupIterations,
    iterations,
    canvas,
    scale,
    results,
  };
}

/**
 * Measures work that remains on the main thread before a large layout can be
 * served from cache or dispatched to the worker. The dense polygon bounds make
 * the stable-key fixture include the largest structured input used elsewhere
 * in this benchmark. It compares the base request with every card pinned so
 * the fixedPositions serialization added to the production key is observable.
 *
 * Do not import buildContentLayoutInput/listContentLayoutIssues here: their
 * poster-card-rows dependency imports china.geojson?raw through map-data, which
 * the standalone tsx CLI cannot load without a Vite-specific harness.
 */
export function runCardLayoutCacheKeyBenchmark(
  cardCount = 400,
  warmupIterations = 50,
  iterations = 500,
): CardLayoutCacheKeyBenchmarkReport {
  positiveInteger(cardCount, "cache-key cardCount");
  positiveInteger(warmupIterations, "cache-key warmupIterations");
  positiveInteger(iterations, "cache-key iterations");
  const cards = makeLayoutBenchmarkCards(cardCount, 20260824);
  const { bounds } = makeDensePolygonBenchmarkFixture(20260824);
  const options = {
    mode: "quadrant" as const,
    autoBalance: true,
    connectorStyle: "curve" as const,
    connectorWidth: 1.5,
  };
  const fixedPositions = Object.fromEntries(cards.map((card) => [
    card.id,
    {
      x: card.anchorX - card.width / 2,
      y: card.anchorY - card.height / 2,
    },
  ]));
  const variants = [
    {
      fixedPositions: "absent" as const,
      fixedPositionCount: 0,
      input: { cards, bounds, options },
    },
    {
      fixedPositions: "all-cards" as const,
      fixedPositionCount: cards.length,
      input: { cards, bounds, options: { ...options, fixedPositions } },
    },
  ];
  const results = variants.map((variant): CardLayoutCacheKeyBenchmarkResult => {
    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      createCardLayoutCacheKey(variant.input);
    }
    const samples: number[] = [];
    let key = createCardLayoutCacheKey(variant.input);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now();
      key = createCardLayoutCacheKey(variant.input);
      samples.push(performance.now() - startedAt);
    }
    return {
      fixedPositions: variant.fixedPositions,
      fixedPositionCount: variant.fixedPositionCount,
      keyBytes: Buffer.byteLength(key),
      p50Ms: rounded(percentile(samples, 0.5)),
      p95Ms: rounded(percentile(samples, 0.95)),
    };
  });
  return {
    methodology: "stable cache-key serialization with and without pinned coordinates before worker dispatch; solver and cache lookup excluded",
    cardCount,
    polygonCount: bounds.occupiedPolygons?.length ?? 0,
    verticesPerPolygon: bounds.occupiedPolygons?.[0]?.rings[0]?.length ?? 0,
    warmupIterations,
    iterations,
    results,
  };
}

export function runPrintPreflightBenchmark(
  warmupIterations = 50,
  iterations = 500,
): PrintPreflightBenchmarkReport {
  positiveInteger(warmupIterations, "print preflight warmupIterations");
  positiveInteger(iterations, "print preflight iterations");
  const assets: Array<UserAsset & { naturalWidth: number; naturalHeight: number }> = Array.from(
    { length: 48 },
    (_, index) => ({
      id: `print-bench-asset-${index}`,
      label: `print benchmark asset ${index}`,
      kind: "decoration",
      src: `data:image/png;base64,print-bench-${index}`,
      provinceIds: [],
      source: "user",
      naturalWidth: 600,
      naturalHeight: 400,
    }),
  );
  const project = {
    canvas: {
      width: 1500,
      height: 1000,
      backgroundImageSrc: assets[0]!.src,
      backgroundFit: "cover",
    },
    map: {
      provinceStyles: {},
    },
    cards: {
      fieldFonts: { name: "missing-print-bench-font" },
    },
    guests: {
      people: [],
    },
    textElements: [],
    assetElements: assets.map((asset, index) => ({
      id: `print-bench-element-${index}`,
      assetId: asset.id,
      label: asset.label,
      src: asset.src,
      kind: "decoration",
      x: (index % 8) * 150,
      y: Math.floor(index / 8) * 100,
      width: 120,
      height: 80,
      rotation: 0,
      opacity: 1,
      zIndex: index,
      visibility: true,
    })),
  } as unknown as Parameters<typeof runPrintPreflight>[0];
  const options = {
    assets,
    fonts: [],
    pngScale: 300 / 96,
    transparentExport: false,
  };
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    runPrintPreflight(project, options);
  }
  const samples: number[] = [];
  let preflight = runPrintPreflight(project, options);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    preflight = runPrintPreflight(project, options);
    samples.push(performance.now() - startedAt);
  }
  return {
    methodology: "resource and print-resolution preflight; file I/O and image decoding excluded",
    warmupIterations,
    iterations,
    referencedAssets: assets.length,
    issueCount: preflight.issues.length,
    p50Ms: rounded(percentile(samples, 0.5)),
    p95Ms: rounded(percentile(samples, 0.95)),
  };
}

export function runDensePolygonBenchmark(
  config: AdversarialLayoutBenchmarkConfig = {},
): AdversarialLayoutBenchmarkReport {
  const modes = [...(config.modes ?? DEFAULT_LAYOUT_BENCH_MODES)];
  const warmupIterations = positiveInteger(config.warmupIterations ?? 1, "adversarial warmupIterations");
  const iterations = positiveInteger(config.iterations ?? 6, "adversarial iterations");
  const seed = config.seed ?? 20260824;
  if (!Number.isInteger(seed)) throw new Error("adversarial seed must be an integer");
  if (modes.length === 0) throw new Error("adversarial modes must not be empty");
  const fixture = makeDensePolygonBenchmarkFixture(seed);
  const polygonCount = fixture.bounds.occupiedPolygons?.length ?? 0;
  const verticesPerPolygon = fixture.bounds.occupiedPolygons?.[0]?.rings[0]?.length ?? 0;

  return {
    fixture: "dense-overlap-many-polygons",
    description: "70 cards in a 36px anchor cluster against 96 vector-map polygons",
    seed,
    cardCount: fixture.cards.length,
    polygonCount,
    verticesPerPolygon,
    warmupIterations,
    iterations,
    modes,
    results: runBenchmarkCases(
      fixture.cards,
      fixture.bounds,
      modes,
      warmupIterations,
      iterations,
    ),
  };
}

export function runClusteredAnchorBenchmark(
  config: AdversarialLayoutBenchmarkConfig = {},
): ClusteredAnchorLayoutBenchmarkReport {
  const modes = [...(config.modes ?? DEFAULT_LAYOUT_BENCH_MODES)];
  const warmupIterations = positiveInteger(
    config.warmupIterations ?? 1,
    "clustered-anchor warmupIterations",
  );
  const iterations = positiveInteger(config.iterations ?? 6, "clustered-anchor iterations");
  const seed = config.seed ?? 20260824;
  if (!Number.isInteger(seed)) throw new Error("clustered-anchor seed must be an integer");
  if (modes.length === 0) throw new Error("clustered-anchor modes must not be empty");
  const fixture = makeClusteredAnchorBenchmarkFixture(seed);

  return {
    fixture: "clustered-anchor-single-province",
    description: "70 cards sharing the exact Beijing province anchor",
    province: fixture.province,
    seed,
    cardCount: fixture.cards.length,
    anchor: fixture.anchor,
    warmupIterations,
    iterations,
    modes,
    results: runBenchmarkCases(
      fixture.cards,
      fixture.bounds,
      modes,
      warmupIterations,
      iterations,
    ),
  };
}

const isDirectRun = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const report: LayoutBenchmarkCliReport = {
    ...runLayoutBenchmark(),
    adversarialFixture: runDensePolygonBenchmark(),
    clusteredAnchorFixture: runClusteredAnchorBenchmark(),
    workerMessageOverhead: await runWorkerMessageBenchmark(),
    cacheKeyGeneration: runCardLayoutCacheKeyBenchmark(),
    layoutHealth: runLayoutHealthBenchmark({ shapes: LAYOUT_HEALTH_BENCH_SHAPES }),
    stackAtMargin: runStackAtMarginBenchmark(),
    sweepPackBranches: runSweepPackBenchmark(),
    layoutGridLeftovers: runLayoutGridLeftoverShapeReport(),
    printBleedExport: runPrintBleedExportBenchmark(),
    printPreflight: runPrintPreflightBenchmark(),
  };
  console.log(JSON.stringify(report, null, 2));
}
