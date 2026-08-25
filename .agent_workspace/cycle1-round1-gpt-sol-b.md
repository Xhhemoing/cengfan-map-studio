# Cycle 1 Round 1 — Display-frame boundary tests (gpt-sol-B)

Model: `gpt-5.6-sol-xhigh-fast`

## Cases added

Added 13 non-snapshot boundary cases across the three allowed test files:

- `PosterCanvas.boundary.test.tsx`
  - Renders 24 province groups with three students each and requires exactly one
    `data-destination-card` plus one `data-display-frame-surface` per province.
  - Characterizes the intentional no-card behavior for `visibleFields: []` and
    `dataView: "pins"`.
  - Exercises missing `displayFrame` legacy derivation, including inherited opacity.
  - Keeps the borderless SVG surface while requiring `stroke="none"` and `rx="0"`.
  - Requires both fixed and flow modes to produce a tagged surface.
  - Renders normalized 8px and 240px custom text on an opacity-zero frame whose huge
    padding normalizes to 120.
  - Requires custom text, line decoration, and rectangle decoration nodes to appear.
- `display-frame.boundary.test.ts`
  - Sends finite overflows plus `NaN`/infinities through `normalizeDisplayFrame` and
    checks style, geometry, flow spacing/line-height, and z-index boundaries without a
    throw.
  - Verifies empty persisted fixed/flow collections safely restore complete variants.
  - Derives a title-only legacy frame when visible fields and persisted frame are absent.
- `DisplayFrameSubcanvas.boundary.test.tsx`
  - Drives the real RAF drag-preview path, requires the pointer-delta
    `transform="translate(40 30)"`, then requires one final absolute
    `{ x: 52, y: 42 }` commit without throwing.
  - Separately selects custom text and decoration nodes and verifies distinct IDs,
    semantics, and accessible labels.

## Verification and failures

- Requested command passed before later concurrent production edits:
  `5 files / 67 tests passed`, total Vitest duration `6.09s`.
- Targeted ESLint for all three new boundary files passed.
- Initial normalization run had one fixture error: `-Infinity` correctly takes the
  persisted-value fallback (12) because it is non-finite; it does not clamp to 8. The
  fixture was changed to finite `-Number.MAX_VALUE`, and the same requested command then
  passed `67/67`. This was not a product bug.
- The boundary assertions exposed incomplete concurrent production refactors twice:
  1. `DisplayFrameSubcanvas.tsx` temporarily removed `itemTextX`/`itemTextAnchor` while
     still calling them, causing a render-time `ReferenceError`. A concurrent edit later
     replaced those call sites, after which both subcanvas boundary tests passed.
  2. At the last isolated timing run, `PosterCanvas.tsx` had removed its local
     `renderDisplayFrameItem` but still called it at the custom-frame-item site, causing
     `ReferenceError: renderDisplayFrameItem is not defined` in the two custom-item/extreme
     render cases. This is a real current production failure in the shared working tree,
     not an assertion to weaken; production files were outside this agent's write scope.
- A final requested-command rerun during the same concurrent extraction was blocked even
  earlier by a `PosterCanvas.tsx:443` parse error (`Expected ',' or ')' but found ';'`).
  The subcanvas drag implementation also intentionally changed its preview transform from
  absolute coordinates to a delta while retaining the absolute final commit; the boundary
  assertion was updated to distinguish those two values.
- Once that parse error cleared, the final requested-command retry reached React rendering
  but failed with `ReferenceError: customFrameItems is not defined` at
  `PosterCanvas.tsx:1259`: `3/5` files passed, `20/67` tests passed, and both the existing
  PosterCanvas suite and new PosterCanvas boundary suite failed. The independent
  normalization/subcanvas boundary rerun remained green (`2 files / 5 tests`).

## Performance observations

Latest verbose isolated timings before the concurrent `PosterCanvas` failure:

- 24 cards / 72 students stress render: `879ms` in jsdom.
- Ordinary single-card boundary renders: `24–25ms`; two suppressed-card renders: `46ms`.
- Subcanvas transform drag: `35ms`; text/decoration selection: `6ms`.
- Pure normalization boundary cases: `1–3ms`.

No timing threshold is asserted because shared CI load would make it flaky. The 24-card
case stays well under the repository's 20-second test timeout while still exercising
layout and 24 surface/card SVG pairs.

## Acceptance

Run:

```sh
npx vitest run src/components/canvas/PosterCanvas.boundary.test.tsx src/lib/display-frame.boundary.test.ts src/components/workspaces/DisplayFrameSubcanvas.boundary.test.tsx src/lib/display-frame.test.ts src/components/canvas/PosterCanvas.test.tsx
```

After the concurrent `PosterCanvas` extraction is completed, the expected result is
`5 files / 67 tests passed`. Targeted ESLint and `git diff --check` are currently green.
