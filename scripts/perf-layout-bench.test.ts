import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT_BENCH_MODES,
  makeLayoutBenchmarkCards,
  runLayoutBenchmark,
} from "./perf-layout-bench";

// Round 1's worst 36/60-card p95 was 16.766 ms. Keep this deliberately
// generous: CI should catch pathological regressions, not machine variance.
const CI_P95_BUDGET_MS = 500;

describe("layout performance benchmark", () => {
  it("uses a reproducible card fixture", () => {
    expect(makeLayoutBenchmarkCards(3, 42)).toEqual(makeLayoutBenchmarkCards(3, 42));
    expect(makeLayoutBenchmarkCards(3, 42)).not.toEqual(makeLayoutBenchmarkCards(3, 43));
  });

  it("keeps the small layout matrix below the pathological-regression budget", () => {
    const report = runLayoutBenchmark({
      counts: [36, 60],
      warmupIterations: 1,
      iterations: 3,
      seed: 20260824,
    });

    expect(report.results).toHaveLength(2 * DEFAULT_LAYOUT_BENCH_MODES.length);
    expect(new Set(report.results.map(({ count }) => count))).toEqual(new Set([36, 60]));
    expect(new Set(report.results.map(({ mode }) => mode))).toEqual(new Set(DEFAULT_LAYOUT_BENCH_MODES));
    for (const result of report.results) {
      expect(
        result.p95Ms,
        `${result.mode}/${result.count} p95 exceeded ${CI_P95_BUDGET_MS}ms`,
      ).toBeLessThan(CI_P95_BUDGET_MS);
    }
  });
});
