# Cycle 1 Round 2 — gpt-sol-B

Model slug: `gpt-5.6-sol-xhigh-fast`

## Scope

Added regression coverage only. No production files were edited and no commit was created.

New test files:

- `src/lib/card-templates.presentation.test.ts`
- `src/components/canvas/useCardLayoutWorker.stale.test.tsx`
- `src/components/canvas/ReferenceCardVisual.round2.test.tsx`

The optional `App.canvas-callbacks.round2.test.tsx` was skipped: callback identity is only observable through the large `App` mount, and the allowed scope does not permit extracting a smaller production seam.

## P0 regression results

| Case | Result | Evidence / cause |
| --- | --- | --- |
| `applyCardTemplate`: color-pill → standard/builtin non-reference | **FAIL** (9/9 assertions) | Every non-reference builtin patch leaves `presentation` undefined. Applying that patch onto color-pill state therefore preserves `color-pill`, so `PosterCanvas` stays on the reference visual path instead of `DestinationCard`. |
| `useCardLayoutWorker`: stale-while-revalidate after key change | **FAIL** (1/1) | Once the first worker result exists, changing to an uncached key produces render snapshots with `result: null`; the hook explicitly replaces state with `{ result: null, pending: true }`. |
| Reference color-pill multiline row | **FAIL** (1/1) | The controlled university+names row wraps to 5 lines, but the SVG contains only 1 body `<text>` node. The renderer concatenates all wrapped lines through `textFor` and renders one node per row. |

These are desired-behavior tests and were not weakened to match current product behavior.

## Existing boundary results

| File | Result |
| --- | --- |
| `src/components/canvas/PosterCanvas.boundary.test.tsx` | **PASS** — 8/8 |
| `src/lib/display-frame.boundary.test.ts` | **PASS** — 3/3 |
| `src/components/workspaces/DisplayFrameSubcanvas.boundary.test.tsx` | **PASS** — 2/2 |

Combined requested run: **3 files passed, 3 files failed; 13 tests passed, 11 tests failed (24 total)**.

Command:

```sh
npx vitest run src/components/canvas/PosterCanvas.boundary.test.tsx src/lib/display-frame.boundary.test.ts src/components/workspaces/DisplayFrameSubcanvas.boundary.test.tsx src/lib/card-templates.presentation.test.ts src/components/canvas/useCardLayoutWorker.stale.test.tsx src/components/canvas/ReferenceCardVisual.round2.test.tsx --reporter=verbose
```

## Failure → cause → fix → recheck

1. Failures were reproduced in both the initial combined run and the verbose recheck.
2. Root causes were localized to the existing template patch, worker pending-state, and reference row rendering logic described above.
3. Product fixes were intentionally not applied because this round authorizes new test files only.
4. The same six-file command was rerun after refining the worker assertion to avoid requiring object identity; all 13 boundary tests still passed and the three P0 behaviors still failed.

An existing React development warning also appeared during the reference render: ``key` is not a prop``. It is independent of the new multiline assertion.
