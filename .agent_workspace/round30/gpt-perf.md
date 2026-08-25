MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 30 cache-key serialization win

## Outcome

- Shipped a measured allocation reduction in `src/lib/card-layout-cache.ts`.
- The stable cache key now serializes a positional array schema instead of
  allocating key-only nested objects. Optional values retain explicit,
  collision-free markers.
- Valid fixed positions are collected directly into their final tuples instead
  of allocating separate `filter` and `map` arrays. Sorting and invalid-point
  filtering are unchanged.
- No packing geometry, constants, worker threshold, or rail limits changed.

## Measurement

The existing 400-card cache-key fixture was used with 96 polygons × 16
vertices. A same-process alternating A/B probe ran 11 blocks of 500 calls per
implementation after 300 warmups. The baseline implementation was copied
verbatim from `HEAD`; every paired block favored the candidate.

| Fixture | Baseline p50 | Candidate p50 | Change |
| --- | ---: | ---: | ---: |
| No fixed positions | 0.419303 ms | 0.415907 ms | -0.81% |
| All 400 cards fixed | 0.552825 ms | 0.545953 ms | -1.24% |

Nine independent runs of the repository cache-key benchmark agreed: median
p50 was 0.414 → 0.411 ms without pins and 0.547 → 0.538 ms with all cards
pinned. Key size also fell from 80,369 → 79,916 bytes and from
100,029 → 99,554 bytes, respectively.

The sweep-only before/after control was effectively flat: saturated p50 was
1.273 → 1.277 ms at 120 cards (+0.004 ms) and 5.192 → 5.183 ms at 400 cards
(-0.009 ms), with identical placement counts, blocked counts, and 31 distinct
positions. Longer isolated runs moved in opposite directions because
`runSweepPackBenchmark` never calls the changed cache-key function.

A relevant saturated A/B therefore timed cache-key generation plus the same
full-obstacle `sweepPack`, excluding fixture construction. The 120-card median
was 1.171092 → 1.170559 ms (-0.05%; 11 alternating blocks × 1,000 calls), and
the 400-card median was 4.923239 → 4.919829 ms (-0.07%; 11 blocks × 200 calls).
Packing files and output shape remained unchanged, with no saturated-case
regression.

## Verification

```text
node scripts/run-heavy.mjs npx vitest run \
  src/lib/card-layout-cache.test.ts \
  src/components/canvas/useCardLayoutWorker.test.tsx \
  src/components/canvas/PosterCanvas.performance.test.tsx \
  scripts/perf-layout-bench.test.ts

Test Files  4 passed (4)
Tests       25 passed (25)

node scripts/run-heavy.mjs npx tsc -p tsconfig.app.json --noEmit
Passed

git diff --check
Passed
```

No test, type, or diff check failed, so no failure → cause → fix → recheck
cycle was needed. Acceptance is the targeted command above plus the
alternating cache-key probe numbers. No commit, stash, push, checkout, new
branch, or Playwright command was run.
