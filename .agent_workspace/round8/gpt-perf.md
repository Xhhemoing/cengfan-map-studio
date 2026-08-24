MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# Round 8 print preflight / bleed export report

## Outcome

- Added a browserless print-preflight journey against the production
  `runPrintPreflight` API: a 3 mm, 300 dpi export reports a low-resolution
  background and transparent bleed, then becomes ready after both risks are
  corrected.
- Added exact PNG dimensions for 0 mm trim, 3 mm bleed without crop marks,
  and the full crop-mark media box at 300 dpi. Also checks PNG dimensions
  remain aligned with serialized SVG dimensions for custom crop marks.
- Extended the opt-in layout benchmark report with:
  - production `posterPngExportSize` timing and exact raster dimensions;
  - a deterministic 48-resource print-preflight fixture.
- No timing assertion was added to CI, and no Playwright dependency/test was
  added.

## Verification

```text
npx vitest run src/lib/print-preflight.journey.test.ts src/lib/export-poster.test.ts src/lib/print-bleed.test.ts
Test Files  3 passed (3)
Tests       31 passed (31)

npx vitest run scripts/perf-layout-bench.test.ts
Test Files  1 passed (1)
Tests       4 passed (4)

npx eslint src/lib/print-preflight.journey.test.ts src/lib/export-poster.test.ts
Passed

npx tsc --ignoreConfig ... src/vite-env.d.ts scripts/perf-layout-bench.ts
Passed
```

Small benchmark smoke fixture (5 warmups / 20 samples):

```text
0 mm @ 300dpi: 4688 × 3125
3 mm @ 300dpi: 4829 × 3267
Print preflight: 48 referenced assets, 2 expected issues
```

## Failure → cause → fix → recheck

1. The first direct benchmark smoke failed with `ERR_UNKNOWN_FILE_EXTENSION`
   for `china.geojson`: importing `createProjectDocument` pulled a Vite-only
   raw asset into the Node benchmark CLI. The fixture was changed to a minimal
   deterministic project shape, avoiding runtime app-data imports; the same
   smoke command then passed.
2. Standalone TypeScript initially rejected file arguments under TypeScript 6,
   then lacked the Vite raw-module declaration. Adding `--ignoreConfig` and
   including `src/vite-env.d.ts` made the same benchmark type-check pass.

No commit, stash, branch, or Playwright command was run.
