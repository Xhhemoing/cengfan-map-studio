MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R19 gpt-perf report

## Outcome

- Skipped benchmark source and test changes. Round 17 already provides the
  opt-in `stackAtMargin` filter/sort/scan timings and signed gap-residual
  observation requested for that fallback.
- Round 19 makes `orderResult`'s `space` argument mandatory and removes the
  legacy no-space origin branch. This does not introduce a new scaling shape:
  normal solver paths already pass `space`, and the branch is reached only when
  a placement id is missing.
- A synthetic missing-id benchmark would primarily measure the existing
  `Map` construction and ordered lookup over the card list, plus one
  constant-time `marginSeat` call. It would neither represent a production
  performance risk nor add evidence beyond the whole-solver matrix and the
  focused `orderResult` correctness tests.
- No machine-dependent elapsed-time or geometry threshold was added to CI.

## Scoped files

No changes were made to:

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`

## Verification

Inspection confirmed that every production `orderResult` caller already has a
`LayoutSpace` available and that existing benchmark solver cases exercise the
normal ordering path. No tests were run because benchmark source and tests were
unchanged; the Round 18 baseline remains 210 files / 1846 tests passing.

## Acceptance

Review the Round 19 focused `orderResult` tests that make `space` mandatory and
remove the no-space origin expectation. There is no separate performance
acceptance step for this round.

No commit, stash, branch, push, Playwright run, or CI timing budget was created.
