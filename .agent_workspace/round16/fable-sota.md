# R16 fable-sota report

MODEL_SLUG: claude-fable-5-thinking-xhigh

## Outcome

Closed brief gap 2: the legacy (classic-skin) editor chrome's topbar undo/redo —
the inline「历史与缩放」group in `LegacyEditorChrome.tsx` (the `onClick={ctx.onUndo}`
around line 208) — now announces 已撤销：xx / 已重做：xx through a persistent
polite live region, mirroring the pattern R15 shipped in
`StudioTopbarActions.HistoryActionsGroup` (which R15 explicitly left this file
out of scope for).

## Changes

- `src/components/studio-editor/LegacyEditorChrome.tsx` (385 → 397 lines, under
  the 400-line split threshold):
  - Added `historyAnnouncement` state + `announceHistory`; both buttons announce
    `已${label}` using the **pre-click** label (`ctx.undoLabel` / `ctx.redoLabel`
    captured by the render closure), so the announced step is the one actually
    undone/redone (WCAG 4.1.3 status messages), then call `ctx.onUndo`/`onRedo`.
  - Rendered a persistent `sr-only` `role="status"` `aria-live="polite"` span
    inside `.topbar-actions` as a **sibling** of the 历史与缩放 group. Placement
    matters twice over: (a) a live region must be in the DOM before the change
    to announce reliably; (b) the ≤760px CSS rule
    `.topbar-actions .topbar-action-group[aria-label="历史与缩放"] { display: none; }`
    (styles.css ~1520) hides the whole group on narrow screens — the span sits
    outside the group so announcements survive.
  - The tick-based invisible NBSP suffix toggles between announcements so two
    consecutive same-labelled undos still mutate the DOM text (aria-live does
    not re-read identical text).
  - Attribute choice: reused `data-topbar-history-announcement` (same as
    `HistoryActionsGroup`) rather than minting a new one — `LegacyEditorChrome`
    and `StudioStageScreen` are mutually exclusive full-page returns in
    `App.tsx` (`nav.activeStage !== "content" || !nav.legacyEditorEnabled`
    branches), so the selector can never double-match, and AT/test tooling gets
    one stable hook for "the topbar history announcement" in both chromes. It
    stays distinct from MapStyleRail's `data-history-announcement`, which can
    coexist in the DOM.
- `src/components/studio-editor/LegacyEditorChrome.test.tsx` (new; repo
  convention: `createRoot` + `flushSync`, no testing-library). Heavy children
  irrelevant to the topbar (`PosterCanvas`, `InspectorPanel`,
  `LegacySidebarPanels`, `LegacyProjectExportDialog`, both steppers) are
  stubbed via `vi.mock`; `ToolbarButton`/`ToolbarGroup`, `ZoomControls`,
  `SkinSelector`, `ThemeToggle`, `ResizablePanelDivider` render real. The `ctx`
  fixture uses a real `createProjectDocument`. Two tests:
  1. "announces undo/redo through a persistent polite live region in the
     topbar" — region exists before interaction (role/aria-live/sr-only/empty),
     sits outside any `role="group"`, undo announces 已撤销：更新地图 and calls
     `ctx.onUndo`, a second identical undo still mutates `textContent` (NBSP
     toggle), redo announces 已重做：更新地图, same node throughout.
  2. "announces the pre-click label and keeps it when history labels move on
     afterwards" — after undo the parent re-renders with the next history top
     (`撤销：移动卡片`); the region keeps the step actually undone, and the next
     click announces the new label.
- `USER_GUIDE.md` — appended one sentence to the existing 撤销/重做播报 bullet:
  the topbar 历史与缩放 undo/redo (including the classic-skin editor) also
  announces.

## Verification

```text
npx vitest run src/components/studio-editor/LegacyEditorChrome.test.tsx
  1 file, 2 tests passed (the new suite)
npx vitest run src/App.workflow.test.tsx
  1 file, 24 tests passed (covers classic-skin switching + the focused-stage
  region that shares the data attribute — confirms no selector collision)
npx vitest run src/App.shell.test.tsx src/App.navigation.test.tsx src/App.settings.test.tsx
  3 files, 37 tests passed (App suites that render/click the legacy topbar —
  confirms the wrapped onClick handlers broke no existing behavior)
npx tsc -b --force  → exit 0
npx eslint src/components/studio-editor/LegacyEditorChrome.tsx \
  src/components/studio-editor/LegacyEditorChrome.test.tsx  → exit 0
```

No check failed, so no failure → cause → fix → recheck cycle was needed.

验收方式：跑上面列出的定向 vitest / tsc -b / eslint 命令；或手动开启读屏
（VoiceOver/NVDA），切到经典界面（顶栏「切换到经典界面」）后做一次修改并点
顶栏撤销/重做，应听到「已撤销：更新地图」等播报。回滚方案：改动为纯增量
（无数据/导出/API 形状变更），revert 这三个文件即可。

## Scope

- Edited only `LegacyEditorChrome.tsx`, its new co-located test, and one
  sentence in `USER_GUIDE.md`.
- Did NOT edit `StudioTopbarActions`, `MapStyleWorkspace`, `DeliveryWorkspace`,
  `DataUploadWorkspace`.
- No commit / stash / branch / push. No Playwright.
