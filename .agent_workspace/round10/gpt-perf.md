MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 10 worker transport comparison

## Outcome

- Extended the opt-in `npm run perf:layout` worker section with a same-fixture,
  same-options main-thread `solveCardLayout` comparison at the current 24-card
  worker threshold.
- The worker probe still excludes solver work. It round-trips the production
  request shape and a placement-shaped response so both structured-clone
  directions scale with the roster.
- Kept `DEFAULT_WORKER_CARD_THRESHOLD` at 24. The local comparison does not show
  an order-of-magnitude mismatch that would justify changing product behavior.
- Added only report-shape coverage; no CI timing assertion or Playwright
  dependency was introduced.

## Local opt-in sample

Linux x64 / Node v22.14.0, quadrant mode, 24 cards:

| Measurement | p50 | p95 |
| --- | ---: | ---: |
| Worker startup + first message round trip (7 workers) | 20.830 ms | 22.488 ms |
| Warm worker message round trip (2 warmups, 30 samples) | 0.062 ms | 0.441 ms |
| Main-thread `solveCardLayout` (2 warmups, 30 samples) | 12.717 ms | 12.835 ms |

- Startup/solve p95 ratio: `1.752`
- Warm transport/solve p95 ratio: `0.034` (3.4%)

This is observational output, not a CI baseline or pass/fail budget. The
transport probe uses Node `worker_threads`, not a browser Web Worker. It excludes
layout solving but necessarily includes worker scheduling, response-object
construction/allocation, and structured cloning in both directions. The payload
contains no transferable buffers, matching the current production request.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/card-layout-cache.test.ts src/components/canvas/useCardLayoutWorker.test.tsx src/lib/layout-perf.test.ts
Test Files  4 passed (4)
Tests       23 passed (23)

npx tsc --ignoreConfig --noEmit --target ES2023 --module ESNext \
  --moduleResolution Bundler --skipLibCheck --types node \
  src/vite-env.d.ts scripts/perf-layout-bench.ts
Passed

npm run perf:layout --silent
Passed; sample above captured from workerMessageOverhead.
```

No check failed, so no failure → cause → fix → recheck cycle was needed.
No git commit, stash, checkout, branch, or push operation was run.
