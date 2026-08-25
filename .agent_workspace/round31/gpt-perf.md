MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 31 worker/cache control-path win

## Outcome

- Shipped a measured cache-hit and synchronous-layout control-path reduction in
  `src/components/canvas/useCardLayoutWorker.ts`.
- The render phase already has the exact resolved result. The effect now reuses
  it instead of performing a second LRU `get`, an unnecessary `set`, and a
  duplicate state-object update.
- Null requests also retain an already-equal state object.
- `PosterCanvas.performance.test.tsx` locks the resulting traffic: initial
  synchronous layout performs one cache get/set pair, while a deep-equal rerender
  performs one cache hit and no cache write.
- No cache-key schema, worker threshold, packing source, geometry constant, or
  rail limit changed.

## Measurement

A same-process alternating probe modeled the exact cached resolution path with a
full 12-entry `CardLayoutCache`. Baseline performed the render-phase `get`
followed by the old effect-phase `get`/`set`; candidate performed only the
render-phase `get`. After 10 warmups, 11 alternating blocks each ran 2,000,000
resolutions:

| Path | Median |
| --- | ---: |
| Baseline duplicate resolution | 232.069 ms |
| Candidate single resolution | 80.348 ms |
| Change | **-65.38%** |

A temporary (not shipped) jsdom probe mounted a cache-hit `PosterCanvas` 300
times per process after 30 warmups. In a warmed reverse-order comparison of six
processes per implementation, the median of run-level p50s was 20.602 ms
baseline versus 20.571 ms candidate (-0.15%); median run-level p95 was
22.260 ms versus 21.921 ms (-1.52%). The end-to-end median was not slower even
though SVG/jsdom rendering dominates the removed cache bookkeeping.

The unchanged saturated sweep control was run nine times with 5 warmups and 60
measured iterations. Median p50 was 1.245 ms at 120 cards and 5.182 ms at 400
cards, versus the Round 30 controls of 1.277 ms and 5.183 ms. Output shape was
unchanged at both sizes: every placement remained blocked and there were 31
distinct fallback positions. The hook is not imported by the sweep benchmark,
so this also confirms no saturated-case regression outside the changed path.

## Verification

```text
node scripts/run-heavy.mjs npx vitest run \
  src/components/canvas/useCardLayoutWorker.test.tsx \
  src/components/canvas/PosterCanvas.performance.test.tsx \
  src/lib/card-layout-cache.test.ts \
  scripts/perf-layout-bench.test.ts

Test Files  4 passed (4)
Tests       25 passed (25)

node scripts/run-heavy.mjs npx tsc -p tsconfig.app.json --noEmit
npx eslint src/components/canvas/useCardLayoutWorker.ts \
  src/components/canvas/PosterCanvas.performance.test.tsx
git diff --check

Passed
```

The first timing command failed before test collection because this Vitest
version interpreted `--reporter=basic` as an unresolved custom reporter. The
cause was the unsupported reporter name; removing that option fixed the command,
and the same probe then passed in every baseline and candidate run.

Acceptance is the targeted test command plus the alternating cache probe and
saturated controls above. No commit, stash, push, checkout, new branch, or
Playwright command was run.
