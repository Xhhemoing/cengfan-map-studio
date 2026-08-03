# Frontend Editor Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, fast map-poster editor shell with one-row navigation, narrow persistent sidebars, project management, and light/dark interface themes while preserving the existing document and export contracts.

**Architecture:** Keep `ProjectDocument` and current command/transaction APIs as the source of truth. Add a semantic theme preference layer and a `StudioShell` presentation boundary around the existing workflows. Split canvas interaction state from SVG scene rendering so drag previews stay local and commit once on pointer release.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing Lucide icons, SVG, CSS custom properties, `requestAnimationFrame`.

## Global Constraints

- Do not change the persisted `ProjectDocument` schema or project package format.
- Do not change poster/export colors when switching the editor theme.
- Keep existing workflow features and current tests compatible.
- Use semantic CSS tokens; do not duplicate light and dark component rules.
- Pointermove previews must not create history transactions; pointerup creates one transaction.
- Desktop keeps both sidebars; right inspector becomes a drawer below 1120px and a bottom sheet below 760px.

### Task 1: Theme Preference Contract

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Modify: `src/styles.css:1-20`

**Interfaces:**
- `ThemeMode = "light" | "dark" | "system"`
- `resolveTheme(mode: ThemeMode, prefersDark: boolean): "light" | "dark"`
- `loadThemeMode(storage?: Storage): ThemeMode`
- `saveThemeMode(mode: ThemeMode, storage?: Storage): void`

- [ ] Write tests for explicit mode resolution, system mode resolution, invalid persisted values, and safe storage failures.
- [ ] Run `npm test -- src/lib/theme.test.ts` and verify the new tests fail because `src/lib/theme.ts` is absent.
- [ ] Implement the minimal pure helpers and guarded localStorage adapter.
- [ ] Add semantic editor tokens for both modes under `[data-editor-theme="light"]` and `[data-editor-theme="dark"]`; leave poster colors untouched.
- [ ] Run the focused test again and then `npm run lint -- --no-warn-ignored` for the touched files.

### Task 2: Theme Hook and Single-Row Shell

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Create: `src/components/StudioShell.tsx`
- Create: `src/components/StudioShell.test.tsx`
- Modify: `src/App.tsx:1144-1907`
- Modify: `src/styles.css:1-170`

**Interfaces:**
- `ThemeToggle({ mode, resolvedTheme, onChange })`
- `StudioShell({ activeStep, onStepChange, projectMenu, taskPanel, canvas, inspector, toolbar })`

- [ ] Write a failing shell test asserting one top row contains project menu, six step buttons, theme toggle, and export action while both sidebars render.
- [ ] Run the focused test and verify it fails against the current shell.
- [ ] Implement theme state initialization, system media listener, `data-editor-theme` on the app root, and persistence.
- [ ] Extract the current return tree into `StudioShell` without moving domain callbacks out of `App`.
- [ ] Replace duplicated topbar groups with compact single-row layout and move project actions into the project menu.
- [ ] Run shell tests and existing `src/App.test.tsx` tests.

### Task 3: Canvas Interaction Overlay

**Files:**
- Create: `src/components/canvas/CanvasInteractionOverlay.tsx`
- Create: `src/components/canvas/CanvasInteractionOverlay.test.tsx`
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `CanvasInteractionOverlay({ scene, selection, zoom, onPreview, onCommit, onCancel })`
- `CanvasPreview = { id: string; x: number; y: number } | null`

- [ ] Write tests for pointer movement updating only preview state, pointerup committing once, Escape cancelling, and no-selection rendering.
- [ ] Run focused tests and verify they fail before implementation.
- [ ] Extract selection bounds and pointer conversion into pure helpers.
- [ ] Implement rAF-coalesced overlay drag state and commit through the existing scene transaction callback.
- [ ] Keep `PosterCanvas` responsible for SVG layers and pass the overlay through the shell.
- [ ] Run all canvas tests and `src/App.test.tsx`.

### Task 4: Workflow and Project Management Migration

**Files:**
- Create: `src/components/workspaces/TaskPanel.tsx`
- Create: `src/components/workspaces/ProjectMenu.tsx`
- Create: `src/components/workspaces/WorkflowStepper.tsx`
- Modify: `src/components/WorkflowGuide.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `TaskPanel({ activePanel, project, ...callbacks })`
- `ProjectMenu({ onNew, onImport, onExport, onSaveLocal, onOpenCollaboration })`
- `WorkflowStepper({ progress, activeStep, onChange })`

- [ ] Write component tests for step status navigation, project-menu actions, and active task content.
- [ ] Run focused tests and verify they fail before implementation.
- [ ] Move workspace navigation and quick settings into `TaskPanel`; keep existing `DataWorkspace`, `AssetPanel`, and inspectors as children.
- [ ] Add direct project-management actions for new/open/recent/save/import/export/template/collaboration without duplicating poster export.
- [ ] Remove the visible main-nav entry for standalone global settings while retaining the underlying route for compatibility.
- [ ] Run workflow, project, and app tests.

### Task 5: Responsive and Performance Verification

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/canvas/PosterCanvas.tsx`
- Create: `src/components/StudioShell.responsive.test.tsx`

- [ ] Add tests for sidebar collapse states at 1120px and 760px using the existing jsdom viewport helpers.
- [ ] Run responsive tests and verify they fail before the CSS changes.
- [ ] Implement fixed narrow sidebar tracks, inspector drawer/bottom-sheet behavior, overflow containment, and reduced-motion focus styles.
- [ ] Verify pointer drag does not dispatch more than one transaction per gesture and that poster export still resolves the same SVG.
- [ ] Run `npm run test`, `npm run lint`, and `npm run build`.
- [ ] Review changed files against the design spec and record any remaining gaps before claiming completion.

## Implementation Notes

- Theme preference, one-row workflow shell, narrow sidebars, project menu, and responsive drawer rules are implemented in the existing `App` boundary to preserve the current callback and persistence contracts.
- Canvas drag and resize previews are now local and `requestAnimationFrame`-coalesced; pointer release still creates the single history transaction. A separate `CanvasInteractionOverlay` component is intentionally deferred because the current SVG layers own independent pointer-capture paths (text, cards, guests, assets, and resize handles). Extracting them without a shared scene-hit-test contract would duplicate hit testing and risk changing export behavior. The next safe boundary is a shared `RenderScene` bounds index, followed by moving one interaction family at a time.
- Verification completed with `npx vitest run` (95 files / 645 tests), `npx eslint .`, `npx tsc -b`, `npx vite build`, and the Impeccable detector (no findings). Vite reports only the existing large-client-chunk warning.
