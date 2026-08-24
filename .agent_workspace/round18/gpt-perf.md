MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R18 gpt-perf report

## Outcome

- Skipped source changes. Round 17 already added the only newly justified
  performance observation: opt-in `stackAtMargin` filter/sort/scan timings and
  signed gap-clearance residuals.
- The Round 18 `orderResult` fallback fix is a correctness change for a missing
  placement: clamp its seat to the layout margin and derive its side from that
  seat. Timing this rare fallback would not provide useful evidence; a focused
  `card-layout-pack` test should verify its coordinates and side directly.
- Existing whole-solver benchmarks already cover normal `orderResult` map and
  reorder work. A synthetic missing-id micro-benchmark would measure the same
  linear map construction plus one constant-time fallback, without representing
  a production scaling concern.
- `runLayoutHealthBenchmark()` remains `direct-bounds` by default. The manual
  CLI still opts into both health shapes, so no default benchmark scope changed.
- No CI elapsed-time or geometry threshold was introduced.

## Scoped files

No changes were made to:

- `scripts/perf-layout-bench.ts`
- `scripts/perf-layout-bench.test.ts`
- `src/lib/layout-perf.ts`

## Verification

Inspection confirmed that the existing solver matrix exercises normal
`orderResult` behavior, while the Round 17 `stackAtMargin` report already
captures the relevant fallback scaling and gap residual. No tests were run
because no source or test file changed; the Round 17 integrated baseline remains
210 files / 1831 tests passing.

## Acceptance

Review the focused `card-layout-pack` test for the missing-placement fallback.
The performance benchmark requires no Round 18 acceptance step.

No commit, stash, branch, push, or CI timing budget was created.
