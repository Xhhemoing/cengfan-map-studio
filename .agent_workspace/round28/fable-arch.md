MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 28 — 重置画布 RotateCcw aria-hidden

## Files changed
- `src/components/inspector/CanvasInspector.tsx` — the 重置画布 `IconButton` icon is now `<RotateCcw size={15} aria-hidden />`. Although `IconButton` clones `aria-hidden` onto icon elements via `decorativeIcon`, call sites are still required to write it explicitly per repo convention; `ImageUp` and `Trash2` in this file already did, so only `RotateCcw` needed the fix.
- `src/components/inspector/CanvasInspector.test.tsx` — added a `describe("CanvasInspector reset button accessibility")` block with one test: renders via the existing `renderInspector` helper (createRoot + flushSync), asserts `button[aria-label="重置画布"]` exists, asserts its `svg` has `aria-hidden="true"`, then unmounts with `flushSync(() => root.unmount())`.

## Tests run
```
npx vitest run src/components/inspector/CanvasInspector.test.tsx
 Test Files  1 passed (1)
      Tests  7 passed (7)
```
6 pre-existing print-bleed tests plus the new accessibility test, all green on the first run.

## Evidence chain (failure → cause → fix → recheck)
No check failed at any step, so the chain is: edit applied → `IconButton` in `src/components/StudioUi.tsx` confirmed to render `aria-label={label}` on the `<button>` and pass the icon through `decorativeIcon` (call-site `aria-hidden` preserved) → targeted vitest run passed 7/7.

## Constraints honored
- Only the two permitted source files touched (plus this report).
- No git commit/stash/checkout/push/branch operations.
- No Playwright, no payments.
