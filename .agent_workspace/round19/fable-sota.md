MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 19 — aria-hidden on decorative Lucide icons in labelled toolbar buttons

## What changed

All decorative Lucide icons sitting inside labelled buttons in the two target files now pass `aria-hidden` explicitly, matching the MapStyleWorkspace / HistoryControls convention (`icon={<Undo2 size={…} aria-hidden />}`). Live-region / `announceHistory` logic untouched.

### `src/components/studio-editor/LegacyEditorChrome.tsx` (4 icons)

| Icon | Button label source |
| --- | --- |
| `<Undo2 size={18} aria-hidden />` | `ToolbarButton label={ctx.undoLabel}` |
| `<Redo2 size={18} aria-hidden />` | `ToolbarButton label={ctx.redoLabel}` |
| `<PanelRightClose size={17} aria-hidden />` / `<PanelRight size={17} aria-hidden />` | `ToolbarButton label="关闭/打开属性面板"` |
| `<ImageDown size={16} aria-hidden />` | plain `.primary-button`, named by visible text 「导出 PNG」 |

### `src/components/studio-editor/StudioTopbarActions.tsx` (3 icons)

| Icon | Button label source |
| --- | --- |
| `<Bot size={17} aria-hidden />` | plain button, `aria-label="打开AI助手与高级功能"` (AssistantEntryButton) |
| `<Undo2 size={18} aria-hidden />` | `ToolbarButton label={history.undoLabel}` (HistoryActionsGroup) |
| `<Redo2 size={18} aria-hidden />` | `ToolbarButton label={history.redoLabel}` (HistoryActionsGroup) |

Note on severity: `ToolbarButton` icon slots already run through `StudioUi.decorativeIcon()`, which force-clones `aria-hidden: true` at runtime, so the five slot icons were a style/consistency fix. The two genuine runtime gaps were `<ImageDown>` (plain export button) and `<Bot>` (AssistantEntryButton) — neither goes through an icon slot, so those SVGs previously reached the accessibility tree unhidden.

## Tests

- `src/components/studio-editor/LegacyEditorChrome.test.tsx` — added `describe("LegacyEditorChrome decorative topbar icons")` asserting `aria-hidden="true"` on the rendered SVGs of the undo, redo, inspector-toggle and export-PNG buttons. Existing announcement tests unchanged.
- `src/components/studio-editor/StudioTopbarActions.test.tsx` — new colocated test file (none existed) asserting `aria-hidden="true"` on the Bot icon inside AssistantEntryButton and on the undo/redo icons inside HistoryActionsGroup.

## Verification (failure → cause → fix → recheck)

No failures occurred; straight pass:

```
npx vitest run src/components/studio-editor/LegacyEditorChrome.test.tsx src/components/studio-editor/StudioTopbarActions.test.tsx
Test Files  2 passed (2)
     Tests  5 passed (5)
```

`npx eslint` on the four touched files: clean (exit 0).

## Scope compliance

- Only the two target files + colocated tests touched; report file added.
- Live region / `announceHistory` untouched in both files.
- No git commit/stash/push performed (per instructions). No Playwright.

## Rollback

Non-destructive markup-only change (adds `aria-hidden` attributes); revert the two component files and the two test files to undo.
