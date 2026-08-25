# R16 fable-arch report

MODEL_SLUG: claude-fable-5-thinking-xhigh

## Outcome

Closed Round 16 gap #4: `repairPlacement` in `src/lib/card-layout-optimizer.ts`
no longer wraps `containFree` in `side: space.sideOf(...)` — neither on the
probe going in nor on the result coming out. It now passes the plain
placeholder probe and returns `containFree`'s result directly, matching how
`packSides` (card-layout-modes.ts) already calls it.

Equivalence was confirmed two ways before the edit:

1. **By reading:** `containFree` never reads the incoming `side` — all three
   exits overwrite it (`card-layout-pack.ts`: free fast path line 71, lattice
   scan line 103, `stackAtMargin` fallback line 135), each with
   `space.sideOf(<the exact rectangle being returned>)`. `sideOf` delegates to
   `sideForPlacement` (`card-layout-geometry.ts` 261–268), a pure function of
   the rect's center vs the map's center. So the inner wrapper fed a value that
   was ignored, and the outer wrapper recomputed a value that was already there.
2. **By test, run against the still-wrapped code first:** new
   `src/lib/card-layout-optimizer.test.ts` rebuilds `repairPlacement`'s probe
   verbatim (the helper is module-private) and asserts
   `containFree(probe) === { ...containFree({...probe, side: sideOf(probe)}),
   side: sideOf(...) }` — the literal old expression — plus the
   `side === space.sideOf(result)` invariant the wrappers were defending.
   Three tests: a 25-anchor sweep on an open board with parked cards (with
   `kept > 0` / `moved > 0` guards so fixture drift can't silently stop
   covering the free and scanned exits), a saturated board driving the
   stack-fallback exit, and an all-four-incoming-sides × all-three-exits check
   that the incoming side never matters. All three passed **before** the edit
   (equivalence proven), and after it.

Deliberately NOT asserted, to stay out of other agents' lanes and avoid false
pins:

- No concrete stacked seats — R16-opus-layout is fixing `stackAtMargin`'s
  insertion-order scan, and its in-tree changes touch no `side` lines; my
  tests pass against the already-patched `card-layout-pack.ts`.
- No blanket `side === sideOf` over `optimizedLayout` output: candidate-based
  placements keep the side they were *generated* for (it steers the connector
  exit), so that invariant only holds for repaired cards.

The optimizer is 346 lines (was 345; the two wrapper lines became one return
plus a two-line placeholder comment), under the 400 cap, so no split was
needed. `card-layout-pack.ts` was not touched.

## Files

- `src/lib/card-layout-optimizer.ts` (346 lines; 3 insertions, 2 deletions,
  all inside `repairPlacement`)
- `src/lib/card-layout-optimizer.test.ts` (118 lines, new — first test file
  for the optimizer)

## Verification

```text
npx vitest run src/lib/card-layout-optimizer.test.ts     (BEFORE the edit)
1 file, 3 tests passed — wrappers proven no-ops in place

npx vitest run src/lib/card-layout-optimizer.test.ts src/lib/card-layout.test.ts
  src/lib/card-layout-modes.test.ts src/lib/card-layout-pack.test.ts
  src/lib/card-layout-space.test.ts src/lib/card-layout-cache.test.ts
  src/lib/card-layout-index.test.ts src/lib/card-layout-worker-protocol.test.ts
8 files passed, 132 tests passed                          (AFTER the edit)

npx tsc -b
exit 0 (project-references build per the R15 note)

npx eslint src/lib/card-layout-optimizer.ts src/lib/card-layout-optimizer.test.ts
exit 0
```

Failure → cause → fix → recheck: no check failed at any point; the
equivalence test was green on its pre-edit run and every check ran green on
the first post-edit attempt.

## Acceptance and rollback

Acceptance: `npx vitest run src/lib/card-layout-optimizer.test.ts` — the tests
encode the removed expression itself, so they pass with either version and pin
the contract (`containFree` re-derives `side` on every exit) that makes the
bare call safe. Behavior-neutral refactor: no placement, score, or ordering
can change, since the dropped code produced byte-identical objects.

Rollback: revert the two files. No persisted data, export format, or API
shape changed; `repairPlacement` is module-private, so no external caller
exists.

No commit, stash, branch, or push was created.
