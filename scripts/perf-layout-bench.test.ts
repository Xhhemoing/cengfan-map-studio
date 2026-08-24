import { describe, expect, it } from "vitest";
import { DEFAULT_WORKER_CARD_THRESHOLD } from "../src/components/canvas/useCardLayoutWorker";
import {
  DEFAULT_LAYOUT_BENCH_MODES,
  makeClusteredAnchorBenchmarkFixture,
  makeDensePolygonBenchmarkFixture,
  makeLayoutBenchmarkCards,
  runCardLayoutCacheKeyBenchmark,
  runLayoutBenchmark,
  runWorkerMessageBenchmark,
} from "./perf-layout-bench";

describe("layout performance benchmark", () => {
  it("uses a reproducible card fixture", () => {
    expect(makeLayoutBenchmarkCards(3, 42)).toEqual(makeLayoutBenchmarkCards(3, 42));
    expect(makeLayoutBenchmarkCards(3, 42)).not.toEqual(makeLayoutBenchmarkCards(3, 43));
  });

  it("keeps the adversarial fixture deterministic without timing it in CI", () => {
    const fixture = makeDensePolygonBenchmarkFixture();
    expect(fixture).toEqual(makeDensePolygonBenchmarkFixture());
    expect(fixture.cards).toHaveLength(70);
    expect(fixture.bounds.occupiedPolygons).toHaveLength(96);
    expect(Math.max(...fixture.cards.map(({ anchorX }) => anchorX))
      - Math.min(...fixture.cards.map(({ anchorX }) => anchorX))).toBeLessThanOrEqual(36);
    expect(Math.max(...fixture.cards.map(({ anchorY }) => anchorY))
      - Math.min(...fixture.cards.map(({ anchorY }) => anchorY))).toBeLessThanOrEqual(36);
  });

  it("keeps the single-province fixture clustered without timing it in CI", () => {
    const fixture = makeClusteredAnchorBenchmarkFixture();
    expect(fixture).toEqual(makeClusteredAnchorBenchmarkFixture());
    expect(fixture.province).toBe("北京市");
    expect(fixture.cards).toHaveLength(70);
    expect(new Set(fixture.cards.map(({ anchorX, anchorY }) => `${anchorX},${anchorY}`)))
      .toEqual(new Set([`${fixture.anchor.x},${fixture.anchor.y}`]));
  });

  it("reports cache-key serialization metadata without asserting elapsed time", () => {
    const report = runCardLayoutCacheKeyBenchmark(40, 1, 2);

    expect(report).toMatchObject({
      methodology: "stable cache-key serialization with and without pinned coordinates before worker dispatch; solver and cache lookup excluded",
      cardCount: 40,
      polygonCount: 96,
      verticesPerPolygon: 16,
      warmupIterations: 1,
      iterations: 2,
      results: [
        {
          fixedPositions: "absent",
          fixedPositionCount: 0,
          keyBytes: expect.any(Number),
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
        },
        {
          fixedPositions: "all-cards",
          fixedPositionCount: 40,
          keyBytes: expect.any(Number),
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
        },
      ],
    });
  });

  it("reports worker transport beside the same-fixture main-thread solve without timing budgets", async () => {
    const report = await runWorkerMessageBenchmark(undefined, 1, 1, 2);

    expect(report).toMatchObject({
      methodology: "worker_threads request and placement-shaped response; solver excluded",
      comparisonMethodology: "same-fixture main-thread solveCardLayout; invariant checks excluded from timing",
      count: DEFAULT_WORKER_CARD_THRESHOLD,
      mode: "quadrant",
      startupIterations: 1,
      warmupIterations: 1,
      iterations: 2,
      startupP50Ms: expect.any(Number),
      startupP95Ms: expect.any(Number),
      warmP50Ms: expect.any(Number),
      warmP95Ms: expect.any(Number),
      mainThreadSolveP50Ms: expect.any(Number),
      mainThreadSolveP95Ms: expect.any(Number),
      startupToSolveP95Ratio: expect.any(Number),
      warmTransportToSolveP95Ratio: expect.any(Number),
    });
  });

  it("runs the small layout matrix without a machine-dependent time budget", () => {
    const report = runLayoutBenchmark({
      counts: [36, 60],
      warmupIterations: 1,
      iterations: 3,
      seed: 20260824,
    });

    expect(report.results).toHaveLength(2 * DEFAULT_LAYOUT_BENCH_MODES.length);
    expect(new Set(report.results.map(({ count }) => count))).toEqual(new Set([36, 60]));
    expect(new Set(report.results.map(({ mode }) => mode))).toEqual(new Set(DEFAULT_LAYOUT_BENCH_MODES));
    expect(report.invariantChecks).toEqual({
      finiteNumbers: true,
      canvasBounds: true,
      placementCount: true,
      overlaps: "solved-results",
    });
  });
});
