MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 9 layout request instrumentation

## Outcome

- Added an opt-in `cacheKeyGeneration` section to `npm run perf:layout`.
- The fixture measures production `createCardLayoutCacheKey` serialization for
  400 cards and 96 polygons (16 vertices each), the main-thread preparation
  performed before cache lookup or worker dispatch.
- Solver, cache lookup, worker startup, and worker transfer are explicitly
  excluded so this report can be compared with the existing solver and worker
  sections.
- Removed the existing CI p95 budget. Benchmark tests now assert deterministic
  fixture/report structure and layout invariants only; they do not assert time.
- No worker-threshold change was justified by this probe, and no Playwright
  test or dependency was added.

## Local opt-in sample

Linux / Node 22, 50 warmups and 500 measured iterations:

```text
cards: 400
polygons: 96 × 16 vertices
stable key size: 80,369 bytes
p50: 0.417 ms
p95: 0.504 ms
```

This sample is observational, not a CI baseline or pass/fail budget.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)

npx tsc --ignoreConfig --noEmit --target ES2023 --module ESNext \
  --moduleResolution Bundler --skipLibCheck --types node \
  src/vite-env.d.ts scripts/perf-layout-bench.ts
Passed
```

## Failure → cause → fix → recheck

1. A direct Node smoke import of `listContentLayoutIssues` failed with
   `ERR_UNKNOWN_FILE_EXTENSION` for `china.geojson`. Its facade transitively
   loads a Vite `?raw` map asset, so it is not runnable by the existing `tsx`
   benchmark CLI without adding a bundler-specific harness.
2. The report was narrowed to the exact stable cache-key API used before the
   24-card worker threshold. The same Node benchmark path then produced the
   sample above, the targeted benchmark test passed, and standalone TypeScript
   validation passed.

No git, commit, stash, branch, or Playwright command was run.
