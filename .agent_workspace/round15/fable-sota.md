# R15 fable-sota report

MODEL_SLUG: claude-fable-5-thinking-xhigh

## Outcome

Closed brief gap 2: the global topbar undo/redo (the「历史与缩放」group shown across
every focused stage) now announces 已撤销：xx / 已重做：xx through a persistent
polite live region, mirroring the pattern R14 established in `MapStyleRail`.

## Changes

- `src/components/studio-editor/StudioTopbarActions.tsx` — `HistoryActionsGroup`
  (the owner of the topbar group asserted by the workflow test
  "keeps global undo/redo visible in the topbar across every focused stage"):
  - Added `historyAnnouncement` state; both buttons announce `已${label}` using
    the **pre-click** label (the closure captures the current render's
    `history.undoLabel`/`redoLabel`, so the announced step name is the one that
    was actually undone/redone, per WCAG 4.1.3 status messages).
  - Rendered a persistent `sr-only` `role="status"` `aria-live="polite"` span
    tagged `data-topbar-history-announcement` as a sibling of the group inside
    `.topbar-actions` (fragment return). It exists before any interaction — a
    live region must be in the DOM ahead of the change to announce reliably.
  - The tick-based invisible NBSP suffix toggles between announcements so two
    consecutive same-labelled undos still mutate the DOM text (aria-live does
    not re-read identical text).
  - Placement notes: the span is outside the `role="group"` so group content
    stays just the two buttons; the ≤760px CSS hides `.topbar-actions
    .icon-button` and the theme group but not this span, so narrow screens keep
    announcing. `data-topbar-history-announcement` is deliberately distinct from
    MapStyleRail's `data-history-announcement` — in the map stage both regions
    coexist in the DOM.
- `src/App.workflow.test.tsx` — new test under "Topbar action layering (T4)":
  "announces global undo/redo through a persistent polite live region".
  Verifies the region exists on first render (role/aria-live/sr-only/empty),
  then commits two identically labelled map patches (`#map-labels` +
  `#map-collapse-south-sea`; same label 更新地图 but different `historyGroup`
  keys, so `applyTransaction` does not coalesce them), asserts 已撤销：更新地图
  after undo, asserts the second identical undo still changes `textContent`
  (NBSP toggle), and asserts 已重做：更新地图 after redo.

## Verification

```text
npx vitest run src/App.workflow.test.tsx
  1 file, 24 tests passed (includes the new live-region test)
npx vitest run src/App.settings.test.tsx src/App.navigation.test.tsx src/App.shell.test.tsx
  3 files, 37 tests passed (suites that click/query the topbar undo/redo —
  confirms the fragment restructuring broke no existing selector)
npx vitest run src/components/StudioTopbar.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx
  2 files, 12 tests passed (topbar slot contract + the untouched MapStyle region)
npx tsc -b --force  → exit 0
npx eslint src/components/studio-editor/StudioTopbarActions.tsx src/App.workflow.test.tsx  → exit 0
```

No check failed, so no failure → cause → fix → recheck cycle was needed. One
verification correction along the way: bare `npx tsc --noEmit` on this repo's
solution-style root `tsconfig.json` (`files: []` + references) checks nothing
and returns 0 in ~0.3s; the real typecheck is `tsc -b`.

验收方式：跑上面列出的定向 vitest / tsc -b / eslint 命令；或手动开启读屏
（VoiceOver/NVDA），在任一聚焦阶段做一次修改后点顶栏撤销/重做，应听到
「已撤销：更新地图」等播报。回滚方案：改动为纯增量（无数据/导出/API 形状
变更），revert 这两个文件即可。

## Scope

- Did NOT edit `MapStyleWorkspace` (already has its region), `DeliveryWorkspace`,
  `DataUploadWorkspace`, or `App.tsx` (its `HistoryActionsGroup` wiring needed
  no change).
- Known remaining gap (out of my mandate): `LegacyEditorChrome.tsx` renders its
  own inline「历史与缩放」undo/redo for the classic-skin content stage and still
  has no live region. Same pattern would apply there if a later round wants it.
- No commit / stash / branch / push. No Playwright.
