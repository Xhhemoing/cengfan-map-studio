# R13 gpt-perf report

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Outcome

- Added an opt-in `layoutHealth` section to `npm run perf:layout`.
- The section measures `checkLayoutHealth` across 12, 30, 60, and 120
  synthetic lanes (24–240 cards), reporting p50/p95/min/max and issue counts.
- The fixture uses only card rectangles and three-segment polylines. Every lane
  exercises `connector-crosses-card`; no production map data or GeoJSON import
  is involved.
- Fixture creation and issue summarization are excluded from the timed region.
- Tests assert report/fixture shape only and contain no elapsed-time budgets.

## Files

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`
- `src/lib/layout-perf.test.ts`

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts
2 files passed, 12 tests passed

npx tsc --noEmit
passed

npx eslint <four scoped files> && git diff --check -- <four scoped files>
passed with two pre-existing configuration warnings: scripts/*.ts are ignored
by the repository ESLint configuration; no errors and no whitespace failures

node --import tsx --input-type=module -e '<run layout-health section>'
passed; all four rows reported connector-crosses-card issue counts
```

Failure → cause → fix → recheck: the first smoke command used `tsx -e`, which
loads imports through CommonJS and cannot transform the benchmark module's
existing top-level `await`. Running the same check through Node's ESM `tsx`
loader succeeded.

## Acceptance and rollback

Acceptance: run `npm run perf:layout` and inspect the `layoutHealth` JSON
section, or run the two targeted Vitest files above. Timings are observations,
not CI pass/fail thresholds.

Rollback: remove `layoutHealth` from the CLI report and delete the synthetic
fixture/runner plus their shape tests. No persisted data, export format, or
application API changes are involved.

No commit, stash, branch, or push was created.
