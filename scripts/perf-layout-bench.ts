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
  type CardLayoutResult,
} from "../src/lib/card-layout";
import { posterPngExportSize } from "../src/lib/export-poster";
import { assertLayoutInvariants } from "../src/lib/layout-perf";
import { resolvePrintBleedGeometry } from "../src/lib/print-bleed";
import { runPrintPreflight } from "../src/lib/print-preflight";

export const DEFAULT_LAYOUT_BENCH_COUNTS = [16, 24, 36, 60, 100, 200, 400] as const;
export const DEFAULT_LAYOUT_BENCH_MODES: readonly CardLayoutMode[] = [
  "quadrant",
  "radial",
  "right-stack",
  "grid",
];

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
  count: number;
  startupIterations: number;
  warmupIterations: number;
  iterations: number;
  startupP50Ms: number;
  startupP95Ms: number;
  warmP50Ms: number;
  warmP95Ms: number;
}

export interface LayoutBenchmarkCliReport extends LayoutBenchmarkReport {
  adversarialFixture: AdversarialLayoutBenchmarkReport;
  clusteredAnchorFixture: ClusteredAnchorLayoutBenchmarkReport;
  workerMessageOverhead: WorkerMessageBenchmarkResult;
  printBleedExport: PrintBleedExportBenchmarkReport;
  printPreflight: PrintPreflightBenchmarkReport;
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
  count = 24,
  startupIterations = 7,
  warmupIterations = 2,
  iterations = 30,
): Promise<WorkerMessageBenchmarkResult> {
  positiveInteger(count, "worker card count");
  positiveInteger(startupIterations, "worker startupIterations");
  positiveInteger(warmupIterations, "worker warmupIterations");
  positiveInteger(iterations, "worker iterations");
  const payload = {
    type: "solve",
    key: `worker-probe-${count}`,
    cards: makeLayoutBenchmarkCards(count),
    bounds: makeLayoutBenchmarkBounds(),
    options: {
      mode: "quadrant",
      autoBalance: true,
      connectorStyle: "curve",
      connectorWidth: 1.5,
    },
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

  return {
    methodology: "worker_threads request and placement-shaped response; solver excluded",
    count,
    startupIterations,
    warmupIterations,
    iterations,
    startupP50Ms: rounded(percentile(startupSamples, 0.5)),
    startupP95Ms: rounded(percentile(startupSamples, 0.95)),
    warmP50Ms: rounded(percentile(warmSamples, 0.5)),
    warmP95Ms: rounded(percentile(warmSamples, 0.95)),
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
    printBleedExport: runPrintBleedExportBenchmark(),
    printPreflight: runPrintPreflightBenchmark(),
  };
  console.log(JSON.stringify(report, null, 2));
}
