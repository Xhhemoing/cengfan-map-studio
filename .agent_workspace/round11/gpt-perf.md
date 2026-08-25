MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 11 pinned cache-key serialization probe

## Outcome

- Kept `buildContentLayoutInput` and `listContentLayoutIssues` out of the
  standalone benchmark CLI. Their runtime dependency chain is
  `content-layout-objects` → `poster-card-rows` → `map-data` →
  `china.geojson?raw`, which requires Vite-specific asset handling.
- Extended the opt-in `cacheKeyGeneration` probe to compare production
  `createCardLayoutCacheKey` serialization with no `fixedPositions` and with
  deterministic pinned coordinates for all 400 cards.
- The fixture still includes 96 polygons with 16 vertices each. Solver work,
  cache lookup, and worker dispatch are excluded.
- Tests assert report shape only; no CI timing budget or Playwright coverage was
  added.
- Kept `DEFAULT_WORKER_CARD_THRESHOLD` unchanged at 24. The pinned-coordinate
  comparison is not an order-of-magnitude finding.

## Local opt-in sample

Linux x64 / Node v22.14.0, 50 warmups and 500 measured iterations:

| Fixed positions | Coordinates | Key size | p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| Absent | 0 | 80,369 bytes | 0.416 ms | 0.514 ms |
| All cards | 400 | 100,029 bytes | 0.551 ms | 0.707 ms |

This sample is observational, not a CI baseline or pass/fail budget.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts src/lib/card-layout-cache.test.ts
Test Files  3 passed (3)
Tests       14 passed (14)

npx tsc --ignoreConfig --noEmit --target ES2023 --module ESNext \
  --moduleResolution Bundler --skipLibCheck --types node \
  src/vite-env.d.ts scripts/perf-layout-bench.ts
Passed

node --import tsx --input-type=module -e \
  'import { runCardLayoutCacheKeyBenchmark } from "./scripts/perf-layout-bench.ts"; ...'
Passed; sample above captured from the 400-card comparison.
```

## Failure → cause → fix → recheck

1. `npx tsx -e` failed while loading the benchmark because eval mode transformed
   the imported file to CommonJS, while the existing CLI contains top-level
   `await`.
2. The benchmark was rerun through Node's ESM `tsx` loader. The same probe then
   completed and produced the sample above; no source fix was required.

No git commit, stash, branch, checkout, or push operation was run.
