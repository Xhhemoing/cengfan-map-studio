MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R17 gpt-perf report

## Outcome

- Added an opt-in `runStackAtMarginBenchmark()` observation because the existing
  whole-solver matrix cannot expose the next layout change's gap-clearance
  behavior.
- The fixture uses a reverse-inserted margin column whose first card begins
  half a configured gap below the probe. It reports `minimumClearancePx` and
  signed `gapClearanceResidualPx`, alongside p50/p95/min/max filter-sort-scan
  cost for 16, 60, 120, and 400 cards.
- The manual `npm run perf:layout` report includes the new `stackAtMargin`
  section. `runLayoutBenchmark()` and the default `runLayoutHealthBenchmark()`
  are unchanged; the latter remains `direct-bounds` only.
- No elapsed-time or clearance threshold fails CI. Tests assert report shape
  and metric arithmetic only.
- No worker threshold, `?raw` geography import, or packing algorithm changed.
  `src/lib/layout-perf.ts` did not need modification.

## Observation

Before the parallel gap-hit fix, a manual ESM probe with a required 12 px gap
reported 6 px minimum clearance and a -6 px residual for both 16- and 400-card
columns. After the parallel layout fix landed, the same probe reported 12 px
clearance and a 0 px residual for both sizes. These are observations, not test
expectations, so CI remains uncoupled from either the residual or machine speed.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts
2 files passed, 14 tests passed
```

An ad-hoc TypeScript check of the two benchmark files also passed after
including Vite declarations. The first attempt omitted `--ignoreConfig`
(TypeScript 6 rejected file arguments), and a second attempt omitted
`src/vite-env.d.ts` (so the existing `china.geojson?raw` declaration was
unavailable); correcting the invocation passed without source changes.

The first manual observation command used `tsx -e`, which transformed the
import to CommonJS and rejected the benchmark module's existing top-level
`await`. Re-running the same observation through Node's ESM `tsx` loader
passed and produced the residual above.

Targeted ESLint reported that `scripts/**` has no matching lint configuration;
it returned no lint errors, but this is not counted as lint coverage.

## Acceptance

Run the targeted Vitest command above. Run `npm run perf:layout` manually and
inspect `stackAtMargin.results`; durations and gap residuals remain
observations only.

No commit, stash, branch, push, Playwright run, or CI timing budget was created.
