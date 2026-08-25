MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 32 worker crossover win

## Outcome

- Raised `DEFAULT_WORKER_CARD_THRESHOLD` from 24 to 49. Cold cache misses with
  24–48 cards now use the measured frame-safe synchronous path instead of
  waiting for worker startup; 49+ cards, cache hits, `forceSync`, and the Round
  31 LRU control path are unchanged.
- Kept the opt-in worker benchmark's default count aligned at 49.
- No cache-key schema, packing source, geometry constant, sweep/contain step, or
  rail limit changed.

## Measurement

The existing `runWorkerMessageBenchmark` fixture was run in seven alternating
rounds at 24, 48, and 49 cards. Each round used 7 fresh-worker samples, 5
warmups, and 60 same-fixture main-thread solves. The table reports medians of
the seven run-level measurements:

| Cards | Worker startup p50 | Main solve p50 | Main solve p95 | Cold worker model (startup + solve p50) | Sync completion reduction |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 24 | 20.873 ms | 10.323 ms | 10.389 ms | 31.196 ms | **-66.91%** |
| 48 | 20.648 ms | 12.734 ms | 12.905 ms | 33.382 ms | **-61.85%** |

The cold model adds the probe's placement-shaped startup round trip to the
same-fixture solve because a first real worker response must perform both.
Structured-clone transport is included; invariant checks are excluded from
these timings.

A separate 5-warmup/60-iteration matrix at 48 cards covered every production
mode. Its p95 values were 12.968 ms (`quadrant`), 12.960 ms (`radial`), 12.567
ms (`right-stack`), and 10.375 ms (`grid`). This matrix conservatively includes
the benchmark invariant checks inside the timed region. All remained below a
16.7 ms frame.

After the change, the default probe reported `count: 49`, confirming benchmark
and product thresholds are aligned. With 9 startup samples, 5 warmups, and 80
solves it measured startup p50/p95 of 20.965/22.108 ms and main-thread solve
p50/p95 of 13.154/14.410 ms. Keeping 49 as the first worker count leaves a
safety margin beyond the repeatedly measured 48-card synchronous range.

## Verification

```text
node scripts/run-heavy.mjs npx vitest run \
  src/components/canvas/useCardLayoutWorker.test.tsx \
  src/components/canvas/PosterCanvas.performance.test.tsx \
  scripts/perf-layout-bench.test.ts \
  src/lib/card-layout-cache.test.ts

Test Files  4 passed (4)
Tests       25 passed (25)

node scripts/run-heavy.mjs npx tsc -p tsconfig.app.json --noEmit
node scripts/run-heavy.mjs npx tsc -p tsconfig.node.json --noEmit
npx eslint --max-warnings 0 src/components/canvas/useCardLayoutWorker.ts
git diff --check

Passed
```

The first ad-hoc probe failed before measurement because a static import under
`tsx -e` compiled the benchmark's top-level await as CommonJS. Running the
parent as ESM then made the eval worker inherit an ESM context, where its
intentional CommonJS `require` was unavailable. Switching the eval snippet to
dynamic `import()` retained the benchmark module as ESM and the eval worker as
CommonJS; the smoke probe and all subsequent matrices completed.

Acceptance is the targeted tests, both type-check projects, strict production
lint, and the repeated crossover measurements above. Rollback is limited to
restoring both aligned threshold defaults from 49 to 24. No commit, stash,
checkout, push, new branch, or Playwright command was run.
