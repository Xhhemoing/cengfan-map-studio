MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 2 Round 3 — title-width and polygon-pan probes

## Added tests

- `src/lib/prepared-card-content.photo-title.cycle2.test.ts`
  - Supplies otherwise-identical metric options with the resolved standard
    (`0`) and photo (`32`) header offsets.
  - Requires the photo title wrap width to be narrower by
    `destinationCardHeaderOffset("photo")` while card and body content widths
    remain unchanged.
- `src/components/canvas/PosterCanvas.polygon-pan.cycle2.test.tsx`
  - Uses the existing `card-layout` module mock seam to observe real solver
    inputs, without adding a production hook.
  - Requires every projected province ring point and cached polygon bound to
    translate by exactly the map pan delta.

## Validation

Combined command:

```sh
npx vitest run \
  src/lib/prepared-card-content.photo-title.cycle2.test.ts \
  src/components/canvas/PosterCanvas.polygon-pan.cycle2.test.tsx \
  src/components/canvas/PosterCanvas.pan-wrap.cycle2.test.tsx
```

Final result: **3 passed** test files; **6 passed** tests.

| Probe | Result | Evidence |
| --- | --- | --- |
| Photo title wrap width | PASS | Standard returns `titleWidth = 254`; the photo header offset narrows it by `32` to `222`, without changing card or body content width. |
| Province polygons under pan | PASS | All polygon ring points and bounds translated by `(73, -41)` with width and height unchanged. |
| Existing pan-wrap suite | PASS | All four title/body wrapping and frozen-position tests passed in the combined run. |

Requested standalone pan-wrap re-run:

```sh
npx vitest run src/components/canvas/PosterCanvas.pan-wrap.cycle2.test.tsx
# Test Files  1 passed (1)
# Tests       4 passed (4)
```

Standalone polygon-pan confirmation:

```sh
npx vitest run src/components/canvas/PosterCanvas.polygon-pan.cycle2.test.tsx
# Test Files  1 passed (1)
# Tests       1 passed (1)
```

The first combined run reproduced the pre-implementation failure (`254`
received versus `222` expected). While this probe was running, the concurrent
production implementation added `PreparedCardContentOptions.headerOffset`.
The test was updated to exercise that actual option, and the same combined
command then passed all six tests. This probe made no production edits and no
Git commit was created.
