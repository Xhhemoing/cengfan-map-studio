# Cycle 1 Round 3 — gpt-sol-B

Model: `gpt-5.6-sol-xhigh-fast`

## Contract coverage added

- `serializePosterSvg`: removes grid plus selection/editor overlays while preserving
  `data-destination-card`, `data-display-frame-surface`, and a visible
  `data-guests-layer`.
- `DestinationCard`: a fixed frame with `align: "center"` renders its title with
  `text-anchor="middle"` (and the title box midpoint at `x="102"`).
- `useCardLayoutWorker`: while a new key that adds 浙江省 is pending, the previous
  北京市-only result remains visible; the new province appears after the worker result.

This Round 3 work changed no production implementation. The connector filter and
display-frame workspace were not touched.

## Verification

1. Initial focused run:
   - Command: `npx vitest run src/lib/export-poster.round3.test.ts src/components/canvas/DestinationCard.align.round3.test.tsx src/components/canvas/useCardLayoutWorker.swr-boundary.round3.test.tsx`
   - Result: **FAIL** — 2 passed, 1 failed.
   - Cause: the export test reparsed serialized markup as XML; in jsdom the implicit
     SVG namespace plus the serializer's explicit namespace produced a duplicate
     `xmlns`, so the parser returned `parsererror` and the selector saw `undefined`.
   - Fix: inspect the serialized markup directly, consistent with the existing export
     tests and the requested data-attribute contract.

2. Focused recheck after the test-only fix:
   - Same command.
   - Result: **PASS** — 3 files, 3 tests.

3. Requested regression run:
   - Command: `npx vitest run src/lib/export-poster.test.ts src/components/canvas/PosterCanvas.boundary.test.tsx`
   - Result: **PASS** — 2 files, 16 tests.

The SWR test deliberately records the Round 2 boundary: a newly added province is
absent from the stale result until revalidation completes, while existing cards do
not disappear.
