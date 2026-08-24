# R14 gpt-perf report

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Outcome

- Added an opt-in `pinned-card-positions` layout-health benchmark shape beside
  the existing `direct-bounds` shape.
- The pinned shape gives every synthetic card a `positionKey` and matching
  `cardsPositions` entry, exercising the hand-placed-card resolution performed
  by `checkLayoutHealth` while preserving the fixture's effective geometry.
- `runLayoutHealthBenchmark()` remains direct-only by default. The explicitly
  invoked `npm run perf:layout` CLI requests both shapes and labels every result
  with its shape and pinned-position count.
- Fixture construction, position-map construction, and issue summarization
  remain outside the timed region.
- No product or CI performance threshold changed. Tests assert fixture/report
  shape only and contain no elapsed-time budget.
- No `?raw` geography import was added.

## Files

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`
- `src/lib/layout-perf.test.ts`

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts
2 files passed, 13 tests passed

npx tsc --noEmit
passed

npx eslint scripts/perf-layout-bench.ts scripts/perf-layout-bench.test.ts \
  src/lib/layout-perf.ts src/lib/layout-perf.test.ts
0 errors; the two scripts remain ignored by the repository ESLint config

git diff --check -- <four scoped files>
passed
```

Failure → cause → fix → recheck: no scoped test, type-check, lint, or whitespace
failure occurred.

## Acceptance and rollback

Acceptance: run the two targeted Vitest files above for deterministic shape
coverage. Run `npm run perf:layout` manually to inspect both layout-health
shapes; reported durations are observations only.

Rollback: remove the pinned shape metadata/configuration and its shape tests.
There is no persisted-data, export-format, application-API, or product-threshold
change.

No commit, stash, branch, push, or CI timing was created.
