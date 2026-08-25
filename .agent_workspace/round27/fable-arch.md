MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 27 — AssetInspector icon a11y polish (R27-fable-arch)

## Files changed

- `src/components/inspector/AssetInspector.tsx` — added call-site `aria-hidden` to the four Lucide icons inside `IconButton`: 删除素材 (`Trash2`), 素材上移 (`ArrowUp`), 素材下移 (`ArrowDown`), 复制素材 (`Copy`). `IconButton` already clones `aria-hidden` via `decorativeIcon` as a safety net, but call sites are required to write it explicitly per repo convention.
- `src/components/inspector/AssetInspector.test.tsx` — added test "keeps action button accessible names while hiding their icons from the a11y tree": renders the existing 北京地标 landmark fixture with the existing `createRoot` + `flushSync` render helper (roots are unmounted in `afterEach`), then for each of the four labels asserts the button is still reachable by `aria-label` and its `svg` has `aria-hidden="true"`. Existing fixtures (北京地标 / 校徽装饰) untouched.

## Tests run

```
npx vitest run src/components/inspector/AssetInspector.test.tsx
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

## Evidence chain (failure → cause → fix → recheck)

- No failures occurred: the suite passed on the first run after the edits (4/4, including the new assertion test). No retry-to-pass; the four-step chain was not triggered.
- Pre-change verification: read `src/components/StudioUi.tsx` to confirm `decorativeIcon` only clones `aria-hidden` when the call site omits it (`element.props["aria-hidden"] !== undefined` returns the element as-is), so explicit call-site `aria-hidden` is compatible and the rendered `svg` carries `aria-hidden="true"` either way — the new test asserts the final DOM state.

## Constraints honored

- Only the two allowed files touched; no commits, branches, stash, or pushes made by this agent.
- No Playwright, no payment-related code. Fixture labels 北京地标 / 校徽装饰 preserved.
