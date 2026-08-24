MODEL_SLUG: claude-fable-5-thinking-xhigh

# R17 fable-arch — `slotPlacements` fallback side derived from geometry

## Problem

In `src/lib/card-layout-saturation.ts`, `slotPlacements` (used by `layeredPack`)
fell back with a hardcoded `side: "right"` when a card id was missing from the
slot map:

```ts
?? { ...card, x: space.clampX(space.margin, card.width), y: space.clampY(space.margin, card.height), side: "right" }
```

The fallback seat is the margin corner (top-left of the canvas). On a standard
China-map board that seat sits left of the map center, so the connector side
must be `"left"` (or `"top"` when the map is wide/shallow and the seat lands
above the map center). Hardcoding `"right"` points the leader away from the map.

## Fix

The fallback now builds the clamped seat rectangle and reads the side with
`space.sideOf(seat)` — the exact same rule the slotted path already uses:

```ts
const seat = {
  x: space.clampX(space.margin, card.width),
  y: space.clampY(space.margin, card.height),
  width: card.width,
  height: card.height,
};
return { ...card, x: seat.x, y: seat.y, side: space.sideOf(seat) };
```

`slotPlacements` is now exported (with a doc comment saying why): the slotless
fallback is unreachable through `layeredPack` — `spreadSlots` always slots
every card from `groupingOrder`, a permutation of the input — so tests must
call `slotPlacements` directly with a slot list that omits a card. No new API
was invented; an existing internal function was exposed, and `Slot` arguments
are satisfied structurally by the test literals. Implementation file is 382
lines (≤400). Coordinates of the fallback seat are unchanged; only the `side`
value changes, and only on the defensive path.

## Tests (`src/lib/card-layout-saturation.test.ts`, new)

1. **Fallback, standard board** (map `{300,200,400,300}` on 1000×800, margin
   20): a card absent from every slot seats at the clamped margin corner and
   asserts `side === space.sideOf(seat)` and concretely `"left"`.
2. **Fallback, wide/shallow map** (map `{50,500,900,200}`): same reproduction,
   asserts `side === space.sideOf(seat)` and concretely `"top"`.
3. **Mixed call**: one card in a slot, one missing. The slotted card keeps its
   slot position and `sideOf`-derived side (happy path unchanged); only the
   missing card is reseated, with a geometry-derived side.
4. **Happy path via `layeredPack`**: three cards, all placements in bounds and
   every `side` consistent with `space.sideOf(placement)`.

## Verification (failure → cause → fix → recheck)

- **Failure**: with the fallback temporarily reverted to `side: "right"`, the
  new suite fails 3/4 — `expected 'right' to be 'left'` (tests 1, 3) and
  `expected 'right' to be 'top'` (test 2); the `layeredPack` happy-path test
  still passes, confirming the tests isolate the fallback.
- **Cause**: the fallback ignored seat geometry and hardcoded `"right"` while
  seating the card at the left margin.
- **Fix**: compute the clamped seat rect and use `space.sideOf(seat)`, matching
  the slotted path.
- **Recheck**:
  - `npx vitest run src/lib/card-layout-saturation.test.ts` → 4/4 passed.
  - `npx vitest run src/lib/card-layout.test.ts` (solver exercises
    `layeredPack`) → 70/70 passed, no regression.
  - `npx tsc --noEmit -p tsconfig.app.json` → clean.
  - `npx eslint src/lib/card-layout-saturation.ts src/lib/card-layout-saturation.test.ts` → clean.

## Files touched (git-canonical, per `git ls-files`)

- `src/lib/card-layout-saturation.ts` (modified)
- `src/lib/card-layout-saturation.test.ts` (new)
- `.agent_workspace/round17/fable-arch.md` (this report)

Not committed, per instructions. Rollback: revert the two `src/lib` files; the
change is behavior-compatible for every reachable `layeredPack` path (slotted
cards are untouched), so no data or export format is affected.
