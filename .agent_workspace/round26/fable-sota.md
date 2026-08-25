MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 26 — GuestsInspector IconButton icon a11y pinning

## Files changed

- `src/components/inspector/GuestsInspector.tsx`
  - Added `aria-hidden` at the call site to three Lucide icons passed into `IconButton`:
    - visibility toggle in the panel header: `<EyeOff size={15} aria-hidden />` / `<Eye size={15} aria-hidden />`
    - clear-avatar button: `<X size={14} aria-hidden />`
    - delete-person button: `<Trash2 size={14} aria-hidden />`
  - The `CompactButton` `Plus` icon for “添加老师 / 嘉宾” already had `aria-hidden` and was left untouched.
  - Note: `IconButton` in `StudioUi.tsx` already clones `aria-hidden` onto icons via `decorativeIcon`, so runtime behavior was already correct; the call-site attributes are written explicitly so the tests pin the contract regardless of the wrapper.
- `src/components/inspector/GuestsInspector.test.tsx`
  - Added one test, "keeps IconButton Lucide icons aria-hidden while buttons keep their accessible names", using the file's existing `createRoot` + `flushSync` + `unmount` pattern and the existing 王老师 fixture (given an `avatarSrc` so the clear button renders). It asserts:
    - the visibility header button's `svg` has `aria-hidden="true"`
    - the clear-avatar button keeps `aria-label="清除 王老师 的头像"` and its `svg` is `aria-hidden="true"`
    - the delete-person button keeps `aria-label="删除 王老师"` and its `svg` is `aria-hidden="true"`

## Tests run

```
npx vitest run src/components/inspector/GuestsInspector.test.tsx

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  1.06s
```

## Evidence chain (failure → cause → fix → recheck)

- Failure: none observed. Baseline inspection confirmed the three icons lacked call-site `aria-hidden` (task was not already done), while the `Plus` icon already had it.
- Cause: call sites relied solely on `IconButton`'s `decorativeIcon` cloning in `StudioUi.tsx`; nothing pinned the icons as decorative at the call site or in tests.
- Fix: added `aria-hidden` to `Eye`, `EyeOff`, `X`, and `Trash2` at their call sites and added a test asserting `aria-hidden="true"` on each button's `svg` alongside the existing `aria-label` accessible names.
- Recheck: reran `npx vitest run src/components/inspector/GuestsInspector.test.tsx` — 6/6 tests pass on the first run after the change.

## Delivery notes

- Acceptance: the targeted Vitest file passes locally (output above); no behavior change for users since `decorativeIcon` already applied `aria-hidden` at runtime — this change pins the contract at call sites and in tests.
- No destructive changes (no data, export-format, or API-shape changes), so no rollback plan needed beyond reverting the two files.
- Per task rules: no git commit/push/branch operations were performed; only the two allowed source files plus this report were touched.
