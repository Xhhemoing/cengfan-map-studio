MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 3 layout performance report

## Outcome

- The solver skip is present on the shared branch. No solver-owned file was
  edited in this task.
- The regular 16–400-card matrix was re-baselined in `perf-baseline.json`.
- The full CLI benchmark now also runs one deterministic adversarial fixture:
  70 cards whose anchors occupy a 36 px cluster, against 96 polygons with 16
  vertices each.
- The adversarial timing case is intentionally absent from the CI performance
  matrix. CI only checks that the fixture is deterministic, dense, and retains
  its card/polygon counts.
- The worker threshold remains 24. Its behavior and measured worker overhead
  did not require a threshold-only edit in this round.

## Round 2 comparison

Node v22.14.0, Linux x64. Regular-matrix p95 values are milliseconds:

| cards | mode | Round 2 | Round 3 | change |
|---:|---|---:|---:|---:|
| 60 | quadrant | 34.941 | 1.374 | -96.1% |
| 60 | radial | 36.617 | 0.548 | -98.5% |
| 60 | right-stack | 34.636 | 0.549 | -98.4% |
| 60 | grid | 22.411 | 1.030 | -95.4% |
| 200 | quadrant | 54.271 | 7.746 | -85.7% |
| 200 | radial | 55.813 | 7.719 | -86.2% |
| 200 | right-stack | 49.948 | 8.152 | -83.7% |
| 200 | grid | 47.856 | 8.625 | -82.0% |
| 400 | quadrant | 94.991 | 68.193 | -28.2% |
| 400 | radial | 95.524 | 56.330 | -41.0% |
| 400 | right-stack | 90.252 | 58.605 | -35.1% |
| 400 | grid | 97.946 | 55.376 | -43.5% |

The requested grid/400 drop is present: p95 fell from 97.946 ms to
55.376 ms. The 60-card cliff is the new proven-saturation short circuit; the
400-card fallback still pays for contained-layout construction and remains the
largest regular case.

At the worker crossover, 24-card p95 is now 8.800–14.401 ms versus Round 2's
16.147–29.206 ms. Worker startup p95 remained similar at 23.575 ms (Round 2:
24.109 ms), while warm message p95 was 0.380 ms (Round 2: 0.423 ms).

## Adversarial fixture baseline

One warmup and six measured iterations:

| mode | p50 (ms) | p95 (ms) | fallback runs |
|---|---:|---:|---:|
| quadrant | 192.634 | 238.683 | 6/6 |
| radial | 163.207 | 163.393 | 6/6 |
| right-stack | 161.688 | 162.364 | 6/6 |
| grid | 99.561 | 100.920 | 6/6 |

This fixture is descriptive rather than a CI budget. It exercises dense anchor
contention and the indexed many-polygon path without making loaded CI runners
pass or fail on sub-second timing variance.

## Verification

```text
npx vitest run src/lib/card-layout-cache.test.ts src/lib/layout-perf.test.ts scripts/perf-layout-bench.test.ts src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/useCardLayoutWorker.test.tsx
Test Files  5 passed (5)
Tests       21 passed (21)
Duration    1.75s
```

```text
npx tsx scripts/perf-layout-bench.ts
Completed 28 regular cases, 4 adversarial cases, and the worker-message probe
in 9.54s; emitted valid JSON captured in perf-baseline.json.
```

Failure → cause → fix → recheck: the artifact-directory creation command
reported that `round3` already existed; no repository change was needed. The
focused test suite and full benchmark both passed on their first runs.

Acceptance: rerun the focused Vitest command in CI and inspect the checked-in
JSON baseline when solver behavior changes. No commit was created, as required.
