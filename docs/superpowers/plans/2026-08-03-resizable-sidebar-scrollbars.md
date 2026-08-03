# Resizable Sidebar Scrollbars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted desktop sidebar resizing and a thin themed scrollbar treatment without changing editor data behavior or mobile drawer behavior.

**Architecture:** Keep layout math in a pure `editor-layout` module, keep pointer/keyboard separator behavior in a focused React component, and let `App` compose the two separators around the existing three-column workspace. CSS custom properties drive the grid while media queries disable separators below the existing desktop breakpoint.

**Tech Stack:** React, TypeScript, Vite, Vitest, CSS custom properties, `localStorage`.

## Global Constraints

- Preserve the existing editor data model, export format, undo/redo history, and mobile Inspector drawer.
- Desktop sidebar bounds are `180-360px` and Inspector bounds are `220-420px`.
- The desktop center canvas must retain at least `480px`.
- Use the existing `--editor-*` tokens and both light/dark theme branches.
- Do not add runtime dependencies.

---

### Task 1: Layout constraints and persistence

**Files:**
- Create: `src/lib/editor-layout.ts`
- Create: `src/lib/editor-layout.test.ts`

**Interfaces:**
- Produces `EditorPanelLayout`, `PanelSide`, `PANEL_LAYOUT_STORAGE_KEY`, `getPanelWidthBounds`, `normalizeEditorPanelLayout`, `readEditorPanelLayout`, and `writeEditorPanelLayout` for the App and divider component.

- [ ] **Step 1: Write failing tests** for default values, clamping each side, preserving the center minimum, and invalid `localStorage` fallback.
- [ ] **Step 2: Run `node_modules/.bin/vitest.cmd run src/lib/editor-layout.test.ts --maxWorkers=1` and confirm the missing module/functions fail.
- [ ] **Step 3: Implement the pure constants and helpers with no React or DOM dependencies.
- [ ] **Step 4: Re-run the focused test and confirm all layout cases pass.

### Task 2: Accessible resize separator

**Files:**
- Create: `src/components/ResizablePanelDivider.tsx`
- Create: `src/components/ResizablePanelDivider.test.tsx`

**Interfaces:**
- Consumes `side`, `value`, `min`, `max`, `ariaLabel`, and `onChange(nextValue)`.
- Produces a focusable vertical `role=separator` that supports primary-pointer drag, Arrow keys, Home, and End.

- [ ] **Step 1: Write failing component tests for ARIA attributes, pointer delta, keyboard step, Home, and End.
- [ ] **Step 2: Run the focused component test and confirm it fails because the component does not exist.
- [ ] **Step 3: Implement the minimal separator with pointer capture when available, clamped deltas, and cleanup on pointer up/cancel.
- [ ] **Step 4: Re-run the focused component test and confirm all interaction cases pass.

### Task 3: Integrate both separators into the editor shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- `App` owns normalized panel layout state and uses the helper/component contracts from Tasks 1-2.

- [ ] **Step 1: Add failing App tests for two desktop separators, persisted CSS width variables, and restoration from local storage.
- [ ] **Step 2: Run `node_modules/.bin/vitest.cmd run src/App.test.tsx --maxWorkers=1` with the new tests and confirm the new assertions fail.
- [ ] **Step 3: Add layout state initialization, persistence, viewport resize normalization, CSS custom property values, and the two separators without touching project history.
- [ ] **Step 4: Re-run the focused App test and confirm the new layout assertions pass.

### Task 4: Style the layout, scrollbars, and responsive states

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `--sidebar-width`, `--inspector-width`, and `data-editor-resizing` from `App`.
- Provides the desktop grid, separator hit areas, active drag state, global thin scrollbar styling, and light/dark overrides.

- [ ] **Step 1: Add CSS for the custom-property-driven desktop grid and separators, preserving the existing `max-width: 1120px` mobile/tablet behavior.
- [ ] **Step 2: Add WebKit and Firefox scrollbar rules plus theme-aware thumb colors and hover states.
- [ ] **Step 3: Add `prefers-reduced-motion` handling for the separator transition and verify no fixed-width text overflows the narrower panel states.

### Task 5: Verification

**Files:**
- Verify: `src/lib/editor-layout.test.ts`, `src/components/ResizablePanelDivider.test.tsx`, `src/App.test.tsx`, `src/styles.css`, `src/App.tsx`

- [ ] **Step 1: Run focused Vitest files directly through `node_modules/.bin/vitest.cmd`.
- [ ] **Step 2: Run `node_modules/.bin/tsc.cmd -b` and `node_modules/.bin/vite.cmd build` independently.
- [ ] **Step 3: Run `node_modules/.bin/eslint.cmd src/App.tsx src/components/ResizablePanelDivider.tsx src/lib/editor-layout.ts`.
- [ ] **Step 4: Start the Vite dev server, inspect desktop and narrow layouts in a browser, and capture a screenshot of the edited shell.
- [ ] **Step 5: Run the Impeccable detector once over the changed UI files and address any actionable findings before reporting.
