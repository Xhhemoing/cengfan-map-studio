MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 1 layout and canvas performance report

## Delivered

- Replaced the one-shot quadrant timer with a deterministic matrix benchmark covering 36, 60, 100, 200, and 400 cards in quadrant, radial, right-stack, and grid modes.
- Added two warmups and 12 measured iterations by default, with p50/p95/min/max JSON output.
- Added reusable layout invariant guards for finite geometry, positive dimensions, canvas containment, and optional card-overlap checks.
- Added a small Vitest benchmark for 36/60 cards across all modes with a generous 500 ms p95 CI budget.
- Strengthened PosterCanvas coverage: 250 pointer moves coalesce to one transform write, do not re-render the map, and do not request layout again; referentially new but geometrically identical input hits the layout cache.

Save a fresh baseline with:

```sh
npx tsx scripts/perf-layout-bench.ts > .agent_workspace/round1/perf-baseline.json
```

## Baseline timings

Node v22.14.0, Linux x64, seed 7, 2 warmups, 12 measured iterations. Times are milliseconds.

| cards | mode | p50 | p95 |
|---:|---|---:|---:|
| 36 | quadrant | 13.343 | 14.358 |
| 36 | radial | 9.920 | 10.514 |
| 36 | right-stack | 10.283 | 10.528 |
| 36 | grid | 2.908 | 3.990 |
| 60 | quadrant | 15.540 | 16.766 |
| 60 | radial | 14.805 | 15.127 |
| 60 | right-stack | 14.908 | 15.121 |
| 60 | grid | 2.709 | 3.033 |
| 100 | quadrant | 23.479 | 23.879 |
| 100 | radial | 23.263 | 23.885 |
| 100 | right-stack | 23.466 | 24.031 |
| 100 | grid | 3.014 | 3.177 |
| 200 | quadrant | 46.197 | 46.416 |
| 200 | radial | 44.588 | 45.456 |
| 200 | right-stack | 45.384 | 50.714 |
| 200 | grid | 4.446 | 4.960 |
| 400 | quadrant | 92.497 | 103.447 |
| 400 | radial | 88.145 | 90.065 |
| 400 | right-stack | 87.823 | 91.327 |
| 400 | grid | 6.966 | 7.246 |

The intentionally dense fixture reports fallback for all measured runs. Placement count, finiteness, and containment are always checked; overlap is additionally checked whenever the solver reports `solved`. The overlap guard itself has direct solved-layout unit coverage.

Full machine-readable results are in `perf-baseline.json`.

## Verification

```text
npx vitest run src/lib/card-layout-cache.test.ts src/components/canvas/PosterCanvas.performance.test.tsx src/lib/layout-perf.test.ts scripts/perf-layout-bench.test.ts
Test Files  4 passed (4)
Tests       10 passed (10)
Duration    1.60s
```

```text
npx tsx scripts/perf-layout-bench.ts
Completed all 20 cases and wrote valid JSON to perf-baseline.json.
```

Failure → cause → fix → recheck: no check failed; the focused suite and full benchmark both passed on their first post-change run.

Acceptance: run the focused Vitest command in CI, then regenerate and compare `perf-baseline.json` manually when solver or canvas layout behavior changes.
