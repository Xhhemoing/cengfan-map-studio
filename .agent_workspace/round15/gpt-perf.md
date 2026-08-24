# R15 gpt-perf report

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Outcome

- Skipped source changes because the requested pinned + layout-health opt-in
  report shape already exists from Round 14.
- `makeLayoutHealthBenchmarkFixture()` supports the
  `pinned-card-positions` shape with `positionKey` and matching
  `cardsPositions` entries.
- `runLayoutHealthBenchmark()` remains `direct-bounds` only by default, while
  the manually invoked `npm run perf:layout` CLI explicitly requests both
  shapes.
- The report identifies each result by `shape` and includes
  `pinnedPositionCount`; tests verify those fields without elapsed-time
  assertions.
- Adding another section would duplicate the existing `layoutHealth` report
  and make the opt-in output less clear.

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts
2 files passed, 13 tests passed
```

No failure occurred, so no failure → cause → fix → recheck cycle was needed.

## Scope

No changes were made to:

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`
- `src/lib/layout-perf.test.ts`

The worker threshold remains unchanged. No CI timing budget, `?raw` geography
import, commit, stash, branch, or push was created.
