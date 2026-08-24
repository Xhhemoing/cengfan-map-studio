MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 2 worker threshold and performance report

## Outcome

- `DEFAULT_WORKER_CARD_THRESHOLD` is 24 cards.
- Rosters with 0–23 cards solve synchronously and do not construct a worker.
- Rosters with 24+ cards retain the existing worker path; cache hits and
  `forceSync` still bypass worker startup.
- The cache key has direct coverage for referentially new, deep-equal option
  objects whose properties were inserted in a different order.
- The 500 ms CI p95 limit remains intentionally generous. Its source comment
  records Round 1's 16.766 ms worst small-matrix p95.

## Threshold calibration

The benchmark now includes 16/24-card crossover rows and a Node `worker_threads`
probe. The probe round-trips the real request shape and a placement-shaped
response while excluding solver work, so it measures worker startup plus
structured-clone/message overhead.

Node v22.14.0, Linux x64:

| measurement | p50 (ms) | p95 (ms) |
|---|---:|---:|
| 24-card worker startup + first round trip | 21.397 | 24.109 |
| 24-card warm round trip | 0.063 | 0.423 |

Main-thread p95 at the crossover:

| cards | quadrant | radial | right-stack | grid |
|---:|---:|---:|---:|---:|
| 16 | 4.041 | 2.988 | 10.836 | 10.335 |
| 24 | 29.206 | 18.577 | 28.492 | 16.147 |

At 16 cards every measured mode stays below 11 ms, so worker startup would cost
more than the solve. At 24 cards all modes approach or exceed one 16.7 ms frame,
while warm message overhead remains below 0.5 ms p95. This makes 24 a
conservative offload boundary that avoids startup for tiny rosters without
keeping clearly frame-blocking solves on the main thread.

## Full benchmark

The complete JSON is in `perf-baseline.json` (2 warmups, 12 measured iterations,
seed 7). Selected p95 values:

| cards | quadrant | radial | right-stack | grid |
|---:|---:|---:|---:|---:|
| 36 | 29.709 | 35.606 | 29.683 | 16.284 |
| 60 | 34.941 | 36.617 | 34.636 | 22.411 |
| 100 | 32.455 | 32.558 | 31.948 | 22.411 |
| 200 | 54.271 | 55.813 | 49.948 | 47.856 |
| 400 | 94.991 | 95.524 | 90.252 | 97.946 |

Round 1's 400-card p95 values were 103.447 / 90.065 / 91.327 / 7.246 ms.
The current grid result is substantially slower than Round 1. This run measures
the solver state supplied by the shared branch; no solver code was changed in
this task, per ownership restrictions.

## Verification

```text
npx vitest run src/lib/card-layout-cache.test.ts src/lib/layout-perf.test.ts scripts/perf-layout-bench.test.ts src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/useCardLayoutWorker.test.tsx
Test Files  5 passed (5)
Tests       20 passed (20)
Duration    2.02s
```

```text
npx tsx scripts/perf-layout-bench.ts > .agent_workspace/round2/perf-baseline.json
Completed all 28 solver cases plus the worker-message probe in 15.10s.
```

Failure → cause → fix → recheck: the first ad-hoc crossover probe used top-level
`await` under `tsx -e`, which emits CommonJS; wrapping it in an async function
made the same probe pass. The focused suite and the integrated benchmark then
passed on their first runs.

Acceptance: run the focused Vitest command in CI and inspect the checked-in
machine-readable baseline when solver behavior changes. No commit was created,
as requested.
