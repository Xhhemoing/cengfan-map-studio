import { describe, expect, it } from "vitest";
import { DEFAULT_WORKER_CARD_THRESHOLD } from "../src/components/canvas/useCardLayoutWorker";
import {
  DEFAULT_LAYOUT_BENCH_MODES,
  makeClusteredAnchorBenchmarkFixture,
  makeDensePolygonBenchmarkFixture,
  makeLayoutBenchmarkCards,
  runCardLayoutCacheKeyBenchmark,
  runLayoutHealthBenchmark,
  runLayoutBenchmark,
  runStackAtMarginBenchmark,
  runSweepPackBenchmark,
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

  it("reports the 400-card cache-key fixture shape without asserting elapsed time", () => {
    const report = runCardLayoutCacheKeyBenchmark(undefined, 1, 2);

    expect(report).toMatchObject({
      methodology: "stable cache-key serialization with and without pinned coordinates before worker dispatch; solver and cache lookup excluded",
      cardCount: 400,
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
          fixedPositionCount: 400,
          keyBytes: expect.any(Number),
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
        },
      ],
    });
  });

  it("reports synthetic layout-health cost shape without asserting elapsed time", () => {
    const report = runLayoutHealthBenchmark({
      laneCounts: [2, 4],
      shapes: ["direct-bounds", "pinned-card-positions"],
      warmupIterations: 1,
      iterations: 2,
    });

    expect(report).toMatchObject({
      methodology: "synthetic card rectangles and three-segment polylines, with optional pinned card-position resolution; checkLayoutHealth only; fixture creation and issue summarization excluded",
      warmupIterations: 1,
      iterations: 2,
      laneCounts: [2, 4],
      shapes: ["direct-bounds", "pinned-card-positions"],
      results: [
        {
          shape: "direct-bounds",
          laneCount: 2,
          cardCount: 4,
          connectorCount: 2,
          pinnedPositionCount: 0,
          segmentsPerConnector: 3,
          issueCount: expect.any(Number),
          issueCounts: {
            "connector-crosses-card": expect.any(Number),
          },
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          shape: "direct-bounds",
          laneCount: 4,
          cardCount: 8,
          connectorCount: 4,
          pinnedPositionCount: 0,
          segmentsPerConnector: 3,
          issueCount: expect.any(Number),
          issueCounts: {
            "connector-crosses-card": expect.any(Number),
          },
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          shape: "pinned-card-positions",
          laneCount: 2,
          cardCount: 4,
          connectorCount: 2,
          pinnedPositionCount: 4,
          segmentsPerConnector: 3,
          issueCount: expect.any(Number),
          issueCounts: {
            "connector-crosses-card": expect.any(Number),
          },
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          shape: "pinned-card-positions",
          laneCount: 4,
          cardCount: 8,
          connectorCount: 4,
          pinnedPositionCount: 8,
          segmentsPerConnector: 3,
          issueCount: expect.any(Number),
          issueCounts: {
            "connector-crosses-card": expect.any(Number),
          },
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
      ],
    });
  });

  it("reports margin-stack gap residual and sort cost without turning either into a budget", () => {
    const report = runStackAtMarginBenchmark({
      columnCounts: [2, 4],
      warmupIterations: 1,
      iterations: 2,
      gapPx: 12,
    });

    expect(report).toMatchObject({
      methodology: "reverse-ordered margin-column filter, sort, scan, and side resolution in stackAtMargin; fixture construction, index insertion, and clearance summary excluded",
      fixture: "half-gap head clearance followed by a scalable margin column",
      warmupIterations: 1,
      iterations: 2,
      columnCounts: [2, 4],
      cardWidth: 120,
      cardHeight: 48,
      requiredGapPx: 12,
      results: [
        {
          columnCount: 2,
          placedY: expect.any(Number),
          minimumClearancePx: expect.any(Number),
          gapClearanceResidualPx: expect.any(Number),
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          columnCount: 4,
          placedY: expect.any(Number),
          minimumClearancePx: expect.any(Number),
          gapClearanceResidualPx: expect.any(Number),
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
      ],
    });
    for (const result of report.results) {
      expect(result.gapClearanceResidualPx)
        .toBeCloseTo(result.minimumClearancePx - report.requiredGapPx, 8);
    }
  });

  it("reports successful sweeps beside all-leftover sweeps without asserting elapsed time", () => {
    const report = runSweepPackBenchmark({
      cardCounts: [2, 4],
      warmupIterations: 1,
      iterations: 2,
    });

    expect(report).toMatchObject({
      methodology: "same-card sweepPack on a clear canvas versus a canvas fully covered by one exact rectangular obstacle; fixture construction, LayoutSpace indexing, and output-shape summary excluded",
      warmupIterations: 1,
      iterations: 2,
      cardCounts: [2, 4],
      cardWidth: 48,
      cardHeight: 28,
      results: [
        {
          scenario: "clear-first-fit",
          cardCount: 2,
          placementCount: 2,
          blockedPlacementCount: 0,
          distinctPositionCount: 2,
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          scenario: "full-obstacle-leftovers",
          cardCount: 2,
          placementCount: 2,
          blockedPlacementCount: 2,
          distinctPositionCount: 2,
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          scenario: "clear-first-fit",
          cardCount: 4,
          placementCount: 4,
          blockedPlacementCount: 0,
          distinctPositionCount: 4,
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
        },
        {
          scenario: "full-obstacle-leftovers",
          cardCount: 4,
          placementCount: 4,
          blockedPlacementCount: 4,
          distinctPositionCount: 4,
          p50Ms: expect.any(Number),
          p95Ms: expect.any(Number),
          minMs: expect.any(Number),
          maxMs: expect.any(Number),
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
