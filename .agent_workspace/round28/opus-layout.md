MODEL_SLUG: claude-opus-5-thinking-high-fast

# R28 opus-layout — saturated fallback keeps caller order

## Files changed

- `src/lib/card-layout.ts`
- `src/lib/card-layout.test.ts`

No other file touched. No git commit / stash / checkout / push / branch.

## Line count

`src/lib/card-layout.ts`: **370** lines (was 361, limit 400).

## What changed in `card-layout.ts`

Both saturated exits — `contain()` (full contained ladder) and `saturated()`
(the provably-infeasible shortcut) — built the same `reduce(betterLayout)` and
returned the winner straight to the caller. Neither re-imposed input order,
unlike every solved path (`sweepPack`, `layoutGrid`, `packSides`, `repackAll`
all end in `orderResult`).

The two duplicated `reduce` bodies are now one helper:

```ts
function leastBad(
  cards: CardLayoutInput[],
  space: LayoutSpace,
  mode: CardLayoutMode,
  contained: CardPlacement[][],
): CardLayoutResult {
  const winner = contained.reduce((best, candidate) => betterLayout(best, candidate, space));
  return { status: "fallback", placements: orderResult(cards, winner, space), mode };
}
```

`contain()` and `saturated()` now just hand it their candidate lists. Wrapping
`saturated()` too is deliberate: it is the path the `provablyInfeasible`
fixtures actually reach, so leaving it unwrapped would have meant the new
infeasible-path assertion guarded code that had not been changed. Both wraps
are no-ops against today's candidates (every strategy already ends in
`orderResult` or maps over `cards`), which the mutation check below confirms.

Untouched as instructed: `stackAtMargin` clamp / second column, and the
optimizer's `repairPlacement` `side: "right"`.

## What changed in `card-layout.test.ts`

1. **Extended** the existing `reports fallback but stays contained when the
   canvas cannot hold the cards` case rather than cloning its fixture: it now
   asserts `__layoutDebug.last!.decision === "skipped-infeasible"` (pinning that
   this board exercises the `saturated()` shortcut, not the ladder) and that
   `placements.map(p => p.id)` equals the input ids.

2. **Added** `keeps caller order when obstacles, not area, are what make the
   canvas unsolvable`. No existing fixture reached `contain()` — every
   saturation fixture in the file is caught by the area proof first and diverted
   to `saturated()`. The new board is 800×600, margin 20, gap 10, with an
   obstacle covering `20,20 760×500`, leaving a 60px strip too shallow for any
   card. Six 200×100 cards demand ~139k of ~439k grown capacity, so
   `provablyInfeasible` is false, the repair ladder runs and comes back empty,
   and the solve lands in `contain()`. Anchors descend so `readingOrder` — what
   the sweep, shelf and layered pack all sort by — is the reverse of input
   order, making the assertion non-vacuous. All four modes are checked with
   their exact decisions pinned: `quadrant` / `radial` / `right-stack` →
   `skipped-no-legal-layout`, `grid` → `skipped-mode` (degrade → contain).

## Evidence chain (failure → cause → fix → recheck)

No pre-existing failure to repair; the discipline was applied as a deliberate
mutation test, because the wrap is a no-op today and would otherwise ship
unverified.

1. **Baseline.** `npx vitest run src/lib/card-layout.test.ts
   src/lib/card-layout-saturation.test.ts` → 2 files, 76 tests passed, with the
   wrap and both new assertions in place.
2. **Mutation A (wrap present, candidate permuted).** Reversed the winner inside
   `leastBad` before `orderResult`, simulating a future contained strategy that
   packs in its own order. → 76 passed. The wrap absorbs the permutation.
3. **Mutation B (wrap removed, candidate permuted).** Same reversed winner,
   `orderResult` dropped from the return. → **6 failed / 70 passed**, including
   both of the cases this task touches:
   - `reports fallback but stays contained when the canvas cannot hold the cards`
     (the `saturated()` path)
   - `keeps caller order when obstacles, not area, are what make the canvas
     unsolvable` (the `contain()` path)
   plus 4 pre-existing order assertions elsewhere. So the wrap is exactly what
   holds the invariant, and the new test is load-bearing against the failure
   mode it was written for.
4. **Recheck after reverting the mutation.** Same command → 2 files, 76 passed.
   Widened to `npx vitest run src/lib/card-layout` → 9 files, 163 passed.
   `npx tsc --noEmit` → clean. `npx eslint` on both changed files → clean.

## Delivery / acceptance

- Acceptance: `npx vitest run src/lib/card-layout.test.ts
  src/lib/card-layout-saturation.test.ts` (76 passing), plus the wider
  `npx vitest run src/lib/card-layout` (163 passing), type check and lint.
- Not a breaking change: no API shape, export or data-format change. Placement
  order on the fallback path is unchanged today (verified by mutation A/B — the
  wrap only becomes observable once a candidate stops self-ordering).
- Rollback: revert the two edits in `src/lib/card-layout.ts` (inline the
  `reduce` back into `contain()` and `saturated()` without `orderResult`) and
  drop the added test plus the two extended assertions. No data or migration
  concerns.
