MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 27 — TextInspector aria-hidden polish

## Files changed
- `src/components/inspector/TextInspector.tsx` — added `aria-hidden` to the Lucide icons passed into `IconButton`: `<Trash2 size={15} aria-hidden />` on the deletable (custom/note) 删除文本 button, and `<EyeOff size={15} aria-hidden />` / `<Eye size={15} aria-hidden />` on the visibility toggle for non-deletable roles. `IconButton` already clones `aria-hidden` via `decorativeIcon`, but call sites still write it explicitly per repo convention.
- `src/components/inspector/TextInspector.test.tsx` — added a new test `hides header action icons from the accessibility tree while keeping accessible names` using the existing `createRoot` + `flushSync` + `unmount` pattern:
  - Deletable case: via `renderInspector()` (renders `text-note`, which is deletable), asserts the 删除文本 button keeps `aria-label="删除文本"` and its `svg` has `aria-hidden="true"`.
  - Non-deletable case: renders `text-title` from `createProjectDocument`, asserts the visibility toggle button's `aria-label` is 隐藏文本/显示文本 and its `svg` has `aria-hidden="true"`.

## Tests run
```
npx vitest run src/components/inspector/TextInspector.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Evidence chain (failure → cause → fix → recheck)
- No failures occurred: the targeted vitest run passed on the first attempt after the edits (3/3 tests, exit code 0), so no cause/fix/recheck cycle was needed.

## Constraints honored
- Only the two allowed files touched; no git commit/stash/checkout/push/branch operations; no Playwright or payments.
