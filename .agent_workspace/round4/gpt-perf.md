MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 4 layout performance report

## Outcome

- Added a deterministic `clustered-anchor-single-province` benchmark: 70
  variable-size cards share the exact Beijing province anchor.
- Kept adversarial timing out of CI. CI verifies both adversarial fixtures
  structurally and retains the deliberately generous 500 ms p95 budget for the
  36/60-card matrix.
- Re-baselined the full CLI benchmark in `perf-baseline.json` after the solver
  split. No solver-owned file was edited.
- The measured worker crossover remains 24 cards. Startup p95 was 23.873 ms,
  so no threshold change was justified.

## Round 3 comparison

Node v22.14.0, Linux x64. Regular-matrix p95 values are milliseconds:

| cards | mode | Round 3 | Round 4 | change |
|---:|---|---:|---:|---:|
| 24 | quadrant | 14.401 | 13.628 | -5.4% |
| 24 | radial | 10.958 | 11.788 | +7.6% |
| 24 | right-stack | 14.348 | 14.467 | +0.8% |
| 24 | grid | 8.800 | 8.944 | +1.6% |
| 400 | quadrant | 68.193 | 5.218 | -92.3% |
| 400 | radial | 56.330 | 4.253 | -92.4% |
| 400 | right-stack | 58.605 | 3.957 | -93.2% |
| 400 | grid | 55.376 | 4.139 | -92.5% |

The 24-card crossover stayed broadly flat, while every 400-card mode improved
by more than 92%. Small-case percentage changes reflect sub-millisecond to
low-millisecond timing variance and remain far below the CI guard.

The existing dense-polygon adversarial p95 values were 163.308, 163.102,
160.605, and 101.392 ms for quadrant, radial, right-stack, and grid. Relative
to Round 3 these changed by -31.6%, -0.2%, -1.1%, and +0.5%.

## Clustered-anchor baseline

One warmup and six measured iterations:

| mode | p50 (ms) | p95 (ms) | fallback runs |
|---|---:|---:|---:|
| quadrant | 28.411 | 29.316 | 6/6 |
| radial | 27.853 | 28.106 | 6/6 |
| right-stack | 27.188 | 27.808 | 6/6 |
| grid | 6.392 | 6.479 | 6/6 |

This benchmark isolates same-province anchor contention from polygon obstacle
cost. It is descriptive rather than a CI timing budget.

## Verification

```text
npx vitest run src/lib/card-layout-cache.test.ts src/lib/layout-perf.test.ts scripts/perf-layout-bench.test.ts src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/useCardLayoutWorker.test.tsx
Test Files  5 passed (5)
Tests       22 passed (22)
Duration    1.78s
```

The requested worker-test path used a `.ts` suffix, but the repository file is
`useCardLayoutWorker.test.tsx`; the existing test file was run.

```text
npx tsx scripts/perf-layout-bench.ts > .agent_workspace/round4/perf-baseline.json
Completed 28 regular cases, 4 dense-polygon cases, 4 clustered-anchor cases,
and the worker-message probe in 7.24s; emitted valid JSON.
```

Both checks passed on their first run, so no failure/cause/fix/recheck cycle
was needed. Acceptance is to rerun the focused tests in CI and inspect the
saved JSON baseline when solver behavior changes. I ran no commit command. The
concurrent solver agent swept the shared pre-split performance files into its
split commit; this report and JSON were then updated in the working tree with
the required post-split measurements.
