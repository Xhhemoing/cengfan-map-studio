MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 1 — R1-fable-sota: editor chrome / drawers / controls a11y polish

Branch: `cursor/agent-sota-polish-cbcd` (working tree only, NOT committed per instructions).

## What changed

### Components
- `SearchCombobox.tsx` — `aria-expanded` now derives from `displayOptions` (was `options`, so the
  combobox reported "collapsed" while the `allowFreeInput` custom entry was visibly open); added
  `aria-haspopup="listbox"`; listbox popup now has an accessible name (`${label}建议`);
  `aria-activedescendant` is only exposed while the popup is open.
- `ResizablePanelDivider.tsx` — Escape cancels an in-progress pointer drag and restores the
  starting width (releases pointer capture, fires `onResizeEnd`); added `aria-valuetext`
  (`N 像素`). Keyboard Arrow/Home/End + `role="separator"` + `aria-valuenow` already existed.
- `StudioAssistantRail.tsx` — tablist now follows the ARIA tabs pattern: roving tabindex
  (selected tab `0`, others `-1`), ArrowLeft/ArrowRight with wrap, Home/End, focus follows
  activation; re-entering 高级功能 via keyboard resets to the operations view (same as click).
  Tabs refactored into a `RAIL_TABS` table; ids/markup unchanged (`studio-*-tab/-panel`).
- `GlobalSettingsDrawer.tsx` — was a `role="dialog"` in name only. Now: Escape closes; Tab /
  Shift+Tab are trapped inside the panel (wraps first↔last focusable, recovers if focus escapes);
  initial focus moves to the labelled close button (`关闭${title}`); focus is restored to the
  opener on close/unmount; `aria-labelledby` bound to the visible title (was duplicate
  `aria-label`); backdrop click still closes.
- `StudioAssistantDrawer.tsx` — added `autoFocus` to the close button: MUI's FocusTrap keeps
  focus on the drawer paper unless something inside is already focused during commit, so the
  previous focus effect silently lost to the trap. Escape/backdrop (MUI Modal), focus trap and
  opener focus-restore already worked and are now covered by tests.
- `StudioUi.tsx` (`WorkspaceNav`) — replaced invalid `aria-selected` on plain buttons (only valid
  on `option`/`tab`/`gridcell`/`row`) with `aria-current="page"` inside the nav landmark; nav
  icons marked `aria-hidden`.
- `ZoomControls.tsx` — container is a real `role="group"` (aria-label on a plain div is ignored);
  the zoom readout uses visually-hidden text (`当前缩放 100%`) instead of an ignored `aria-label`
  on a span.
- `GlobalSettingsScreen.tsx` — tablist keyboard handler now also supports Home/End (Arrow keys +
  roving tabindex already existed).
- `ThemeToggle.tsx` / `SkinSelector.tsx` — already SOTA on "not color alone" (distinct Sun/Moon
  and panel/history glyphs, aria-label, aria-pressed); left unchanged. ThemeToggle's dynamic
  label is asserted by the non-owned `App.test.tsx`, so it was intentionally not restructured.
- `HistoryControls.tsx`, `DeferredInput.tsx`, `RangeNumberControl.tsx`, `StudioTopbar.tsx` —
  audited, already meet the bar (labelled groups/buttons, Enter-commit/Escape-revert, paired
  slider+number inputs with distinct accessible names); no changes needed.

### styles.css (focus-visible / contrast / skip-link / reduced-motion only)
- Zero-specificity global fallback ring:
  `:where(button, [href], input, select, textarea, summary, [role="tab"], [role="option"], [tabindex]:not([tabindex="-1"])):focus-visible`
  — closes ring gaps in classic skin (rail tabs, workspace nav, topbar buttons, advanced-action
  rows…) without overriding any existing bespoke `:focus-visible` rule.
- Contrast fix: light-theme `--editor-focus` `#d6b56d` → `#a07613` (old gold was ~2:1 on white,
  below the 3:1 WCAG 2.2 focus-appearance minimum; new value ≥3.5:1 on white/page bg and ≥4:1 on
  the dark topbar). Dark/atelier overrides already compliant and untouched. Hard-coded `#d6b56d`
  in the global-settings focus rule now uses the token; unused `--focus-ring` aligned.
- `.skip-link` utility: visually hidden until keyboard focus, then pinned above the topbar.
- Global `@media (prefers-reduced-motion: reduce)` collapsing transitions/animations to 0.01ms
  (previously only the atelier skin had this guard).

## Verification (failure → cause → fix → recheck)
- One genuine failure during development: the new `StudioAssistantDrawer` "moves focus into the
  drawer when it opens" test failed — `document.activeElement` was the MUI paper
  (`data-mui-focusable`), not the close button. **Cause:** MUI FocusTrap focuses the drawer paper
  when activation finds focus outside the trap; the component's `useEffect`-based focus lost the
  race. **Fix:** `autoFocus` on the close button (focus applied during commit, so the trap sees
  focus already inside and leaves it). **Recheck:** same test command re-run → pass; verified via
  a temporary debug test (deleted) that the active element is the close button.
- Required verify command:
  `npx vitest run src/components/StudioUi.test.tsx src/components/StudioUi.controls.test.tsx src/components/StudioAssistantDrawer.test.tsx src/components/StudioAssistantRail.test.tsx src/components/ResizablePanelDivider.test.tsx src/components/SearchCombobox.test.tsx src/components/SkinSelector.test.tsx src/components/RangeNumberControl.test.tsx src/components/StudioTopbar.test.tsx`
  → **9 files, 37 tests, all pass.**
- Additional owned/new suites: `GlobalSettingsDrawer.test.tsx` (5, new file),
  `GlobalSettingsScreen.test.tsx` (2, new file), `ZoomControls.test.tsx` (3, new file),
  `StudioAssistantDrawer.integration.test.tsx`, `StudioMuiProvider.test.tsx`,
  `DeferredInput.test.tsx` → **6 files, 17 tests, all pass.**
- Non-owned consumers (regression check): `App.test.tsx`, `DataWorkspace.test.tsx`,
  `StudioEditorShell.test.tsx`, `GlobalDataScreen.test.tsx`, `AppProjectMode.test.tsx`
  → **5 files, 173 tests, all pass.**
- `npx eslint` on all touched files → clean. `npx tsc -p tsconfig.app.json --noEmit` → clean.

## New/extended tests
- SearchCombobox: popup state / active-descendant contract; expanded state with free-input entry.
- ResizablePanelDivider: `aria-valuetext`; Escape cancels drag + ignores stray Escape.
- StudioAssistantRail: roving tabindex, arrow/Home/End navigation with wrap, keyboard re-entry
  resetting the advanced view.
- GlobalSettingsDrawer (new file): labelled modal, initial focus, Escape/backdrop close, Tab and
  Shift+Tab trap, opener focus restore.
- StudioAssistantDrawer: initial focus into drawer; Escape closes.
- GlobalSettingsScreen (new file): arrows/wrap/Home/End; roving tabindex.
- StudioUi: `aria-current="page"` on active workspace nav item (no `aria-selected` on buttons).
- ZoomControls (new file): group semantics, sr-only readout, bound-aware disabling and callbacks.

## Remaining a11y gaps (out of my ownership or needing cross-file work)
1. **Skip link not wired.** `.skip-link` CSS is ready, but `App.tsx` (forbidden) exposes no
   landmark id on the stage/main content, so no `<a class="skip-link">` target exists yet.
   Follow-up: give the stage container an id in `App.tsx` and render the link before
   `StudioTopbar`.
2. **ThemeToggle combines a changing `aria-label` with `aria-pressed`** — screen readers announce
   "切换到暗色模式, pressed", which is slightly contradictory. The label is asserted by the
   non-owned `App.test.tsx`, so restructuring (constant label + pressed state) needs coordination.
3. **`.studio-advanced__element-list` uses `role="listbox"` with tabbable button options** —
   works, but the canonical pattern is listbox-managed focus (activedescendant) or plain buttons
   without listbox roles. `App.test.tsx` queries `[role="option"]` there, so changing roles needs
   coordination.
4. **MUI Drawer close animation** still uses its inline JS-driven transition timings; the global
   reduced-motion CSS shortens CSS transitions but MUI timeout-based callbacks still wait the
   nominal duration (no visible motion issue, purely a latency nit).
5. **Legacy hard-coded focus colors elsewhere** (e.g. `#d05a45`, `#0d6b9f` in student-table /
   display-frame areas) pass 3:1 but are not tokenized; consolidation onto `--editor-focus` was
   out of scope for a no-visual-redesign pass.

Not committed; working tree contains all changes for review.
