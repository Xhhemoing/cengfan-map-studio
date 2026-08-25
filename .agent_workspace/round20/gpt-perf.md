MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R20 gpt-perf report

## Outcome

- Skipped benchmark source and test changes. The Round 20 `layoutGrid` fix is a
  correctness change, not a new performance shape.
- Replacing the pre-clamp horizontal comparison with
  `space.sideOf(clampedArea)` adds one constant-time geometry classification
  per accepted grid placement. `sideOf` delegates to `sideForPlacement`, which
  performs only center, normalization, absolute-value, and comparison
  arithmetic.
- A wide, shallow map fixture is needed to prove `top`/`bottom` side selection
  after clamping, but timing that fixture would not expose a distinct scaling
  dimension. It belongs in the focused `layoutGrid` correctness tests.
- The existing opt-in layout benchmark already includes `grid` in every card
  count, as well as clustered-anchor and dense-polygon solver fixtures. No
  machine-dependent elapsed-time budget was added to CI.

## Scoped files

No changes were made to:

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`

## Verification

Inspected the `layoutGrid` placement loop, `LayoutSpace.sideOf`,
`sideForPlacement`, the default benchmark mode matrix, and the benchmark test
coverage. No tests were run because the benchmark implementation and tests
were intentionally unchanged.

## Acceptance

Validate the Round 20 behavior through a focused wide/shallow-map unit test
that asserts each accepted grid placement reports
`placement.side === space.sideOf(placement)`. There is no separate performance
acceptance step for this round.

No commit, stash, branch, push, or CI timing budget was created.
