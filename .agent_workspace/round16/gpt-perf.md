# R16 gpt-perf report

MODEL_SLUG: gpt-5.6-sol-xhigh-fast

## Outcome

- Skipped source changes because the requested opt-in layout-health shape is
  already implemented.
- `runLayoutHealthBenchmark()` remains `direct-bounds` only by default.
- The manually invoked `npm run perf:layout` CLI opts into both
  `direct-bounds` and `pinned-card-positions`; results identify their `shape`
  and `pinnedPositionCount`.
- A `stackAtMargin` benchmark section would not provide useful evidence for
  the insertion-order overlap defect: it is a fallback correctness invariant,
  best reproduced directly in `card-layout-pack.test.ts`.
- A leftover-side benchmark section was also skipped because side/seat
  agreement is a geometry correctness property already covered by direct pack
  and mode tests. Timing it would not strengthen that coverage.
- No worker threshold, CI timing budget, or `?raw` geography import changed.

## Scoped files

No changes were made to:

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`
- `src/lib/layout-perf.test.ts`

## Verification

```text
npx vitest run scripts/perf-layout-bench.test.ts src/lib/layout-perf.test.ts
2 files passed, 13 tests passed
```

No failure occurred, so no failure → cause → fix → recheck cycle was needed.

## Acceptance

Run the targeted Vitest command above to verify the deterministic fixture and
report shapes. Run `npm run perf:layout` manually to inspect both opt-in
layout-health variants; elapsed durations remain observations, not CI gates.

No commit, stash, branch, push, or CI timing was created.
