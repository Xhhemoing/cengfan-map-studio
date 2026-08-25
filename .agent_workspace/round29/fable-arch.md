MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 29 — MapInspector icon aria-hidden polish (R29-fable-arch)

## Files changed
- `src/components/inspector/MapInspector.tsx` — added `aria-hidden` to five Lucide icons at their call sites (per convention, even though `IconButton`'s `decorativeIcon` would clone it as a fallback):
  - 重置地图 `RotateCcw size={15}` (InspectorHeader actions)
  - 地图上移 `ArrowUp size={14}`
  - 地图下移 `ArrowDown size={14}`
  - 地图置顶 `ChevronsUp size={14}`
  - 地图置底 `ChevronsDown size={14}`
  - 「恢复原始地图」CompactButton `RotateCcw` and 「自动适配」`Maximize2` already had `aria-hidden`; left untouched. File remains 348 lines (≤400).
- `src/components/inspector/MapInspector.test.tsx` — new test "keeps names on layer and reset buttons while hiding their icons from assistive tech": renders the default (`mode="all"`) inspector once, and for each of 重置地图 / 地图上移 / 地图下移 / 地图置顶 / 地图置底 asserts the button is found by its `aria-label` (accessible name kept) and its `svg` has `aria-hidden="true"`. Root is unmounted at the end, matching the file's existing pattern (all existing tests already unmount).

## Tests run
```
npx vitest run src/components/inspector/MapInspector.test.tsx
 Test Files  1 passed (1)
      Tests  13 passed (13)
```
(12 pre-existing tests + 1 new, all green on first run.)

## Evidence chain (failure → cause → fix → recheck)
No failures occurred: the targeted vitest run passed on the first attempt after the edits, so no failure/cause/fix cycle was needed. Recheck evidence is the passing run above. Constraints verified: only the two allowed files were touched for this task (`git status` shows other dirty files pre-dated this work), `MapInspector.tsx` is 348 lines, no Playwright/payments added, no git commit/push performed.
