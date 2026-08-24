/**
 * Deterministic micro-benchmark for the card auto-layout solver.
 *
 * Run: npm run perf:layout
 * Save machine-readable output:
 * npx tsx scripts/perf-layout-bench.ts > .agent_workspace/round1/perf-baseline.json
 */
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  solveCardLayout,
  type CardLayoutBounds,
  type CardLayoutInput,
  type CardLayoutMode,
  type CardLayoutResult,
} from "../src/lib/card-layout";
import { assertLayoutInvariants } from "../src/lib/layout-perf";

export const DEFAULT_LAYOUT_BENCH_COUNTS = [36, 60, 100, 200, 400] as const;
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

function percentile(samples: readonly number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]!;
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
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
        count,
        mode,
        p50Ms: rounded(percentile(samples, 0.5)),
        p95Ms: rounded(percentile(samples, 0.95)),
        minMs: rounded(Math.min(...samples)),
        maxMs: rounded(Math.max(...samples)),
        fallbackRuns,
      });
    }
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

const isDirectRun = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  console.log(JSON.stringify(runLayoutBenchmark(), null, 2));
}
