# Global Data Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-level global data workbench that centralizes roster management, data quality, map mapping, presentation modes, and global visual configuration without introducing a second project state.

**Architecture:** Keep `ProjectDocument` as the only persisted source of truth. Add pure data-health selectors, a full-screen `GlobalDataScreen` with overview/roster/quality/mapping/presentation views, and route the existing workflow/settings entry points to that screen. Reuse existing `DataWorkspace`, transaction callbacks, templates, render state, and persistence.

**Tech Stack:** React, TypeScript, Vite, Vitest, lucide-react, existing CSS tokens and `StudioUi` controls.

## Global Constraints

- Do not add a second roster or visual-configuration state; all committed changes go through the existing `ProjectDocument` transaction path.
- Do not change project package schema, map projection, card layout algorithms, export formats, or collaboration payloads.
- Preserve all existing uncommitted user changes in the working tree.
- Keep the interface usable at 320, 390, 768, 1024, and 1440px without page-level horizontal overflow.
- Every new behavior gets a failing Vitest test before production code.

---

### Task 1: Add data-health selectors

**Files:**
- Create: `src/lib/data-health.ts`
- Create: `src/lib/data-health.test.ts`
- Read: `src/lib/project-data.ts`, `src/lib/project-document.ts`, `src/lib/student-data.ts`, `src/lib/workflow-progress.ts`

**Interfaces:**
- Consumes: `ProjectDocument`, `Student`, `resolveStudentLocation()`.
- Produces: `DataHealthSummary`, `DataIssue`, `buildDataHealthSummary(project)`, and `listDataIssues(project)` for all new data views.

- [ ] **Step 1: Write the failing tests**

```ts
it("summarizes visible, hidden, international, unresolved, and missing records", () => {
  const project = createProjectDocument({
    students: [
      { id: "visible", name: "可见", university: "大学", city: "北京市", visibility: true },
      { id: "hidden", name: "隐藏", university: "大学", city: "杭州市", visibility: false },
      { id: "international", name: "海外", university: "大学", city: "美国·波士顿", locationScope: "international", visibility: true },
      { id: "unresolved", name: "未匹配", university: "大学", city: "不存在的城市", visibility: true },
      { id: "missing", name: "", university: "", city: "", visibility: true },
    ],
    templateId: "original",
    dataView: "province",
  });

  expect(buildDataHealthSummary(project)).toEqual({
    total: 5,
    visible: 4,
    hidden: 1,
    international: 1,
    unresolved: 2,
    missingRequired: 1,
  });
});

it("lists actionable issues with stable student ids", () => {
  const project = createProjectDocument({
    students: [
      { id: "student-1", name: "未匹配", university: "大学", city: "不存在", visibility: true },
      { id: "student-2", name: "隐藏", university: "大学", city: "北京市", visibility: false },
    ],
    templateId: "original",
    dataView: "province",
  });

  expect(listDataIssues(project)).toEqual([
    expect.objectContaining({ studentId: "student-1", kind: "unresolved-location" }),
    expect.objectContaining({ studentId: "student-2", kind: "hidden" }),
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node_modules/.bin/vitest run src/lib/data-health.test.ts`

Expected: FAIL because `src/lib/data-health.ts` does not exist.

- [ ] **Step 3: Implement the minimal selectors**

Use one pass over `project.students` for the summary. Count missing required fields independently from unresolved locations. For issues, emit missing-field issues first, unresolved-location issues second, then hidden issues; preserve source array order within each category and include `studentId`, `studentName`, `kind`, `detail`, and `severity`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node_modules/.bin/vitest run src/lib/data-health.test.ts`

Expected: PASS with both tests passing.

- [ ] **Step 5: Commit the isolated selector change**

```powershell
git add src/lib/data-health.ts src/lib/data-health.test.ts
git commit -m "feat: add project data health selectors"
```

### Task 2: Add overview, quality, and presentation panels

**Files:**
- Create: `src/components/DataOverview.tsx`
- Create: `src/components/DataOverview.test.tsx`
- Create: `src/components/DataQualityPanel.tsx`
- Create: `src/components/DataQualityPanel.test.tsx`
- Create: `src/components/DataPresentationPanel.tsx`
- Create: `src/components/DataPresentationPanel.test.tsx`

**Interfaces:**
- Consumes: `ProjectDocument`, `DataHealthSummary`, `DataIssue[]`, existing `DataViewId`, template callbacks, and scene patch callbacks.
- Produces: presentational panels with callback-driven navigation and configuration; no project mutation inside these components.

- [ ] **Step 1: Write failing component tests**

Test that the overview renders all six health metrics and calls `onOpenIssues("unresolved-location")` when the unresolved metric is activated. Test that the quality panel renders an issue row with a “定位到名单” action and calls `onSelectStudent(studentId)`. Test that the presentation panel renders all five data views and calls `onChangeDataView` with the selected view.

- [ ] **Step 2: Run focused component tests and verify they fail**

Run: `node_modules/.bin/vitest run src/components/DataOverview.test.tsx src/components/DataQualityPanel.test.tsx src/components/DataPresentationPanel.test.tsx`

Expected: FAIL because the new components do not exist.

- [ ] **Step 3: Implement the panels**

Use existing `PanelHeader`, `SegmentedControl`, `CompactButton`, `ActionGroup`, and lucide icons. Keep the overview as a dense operational surface, not a decorative dashboard. Use text plus counts for status; do not rely on color alone. The presentation panel should expose data view selection, template callbacks, and a compact link to existing global settings for detailed canvas/map/card controls.

- [ ] **Step 4: Run focused component tests and verify they pass**

Run: `node_modules/.bin/vitest run src/components/DataOverview.test.tsx src/components/DataQualityPanel.test.tsx src/components/DataPresentationPanel.test.tsx`

Expected: PASS with no console errors.

- [ ] **Step 5: Commit the panel change**

```powershell
git add src/components/DataOverview.tsx src/components/DataOverview.test.tsx src/components/DataQualityPanel.tsx src/components/DataQualityPanel.test.tsx src/components/DataPresentationPanel.tsx src/components/DataPresentationPanel.test.tsx
git commit -m "feat: add global data workbench panels"
```

### Task 3: Add the full-screen global data workbench shell

**Files:**
- Create: `src/components/GlobalDataScreen.tsx`
- Create: `src/components/GlobalDataScreen.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `DataWorkspace` props, data-health selectors, panels from Task 2, `ProjectDocument`, workflow/template callbacks, and `onClose`.
- Produces: `GlobalDataScreen` with local UI state only: active view, query, issue filter, import session state delegated to `DataWorkspace`, and selected student id.

- [ ] **Step 1: Write failing shell tests**

Test that the screen renders five tabs, starts on `overview`, changes to `roster` when the roster tab is clicked, renders `DataWorkspace` there, and routes a quality issue click to the roster view while invoking `onSelectStudent`.

- [ ] **Step 2: Run the shell tests and verify failure**

Run: `node_modules/.bin/vitest run src/components/GlobalDataScreen.test.tsx`

Expected: FAIL because `GlobalDataScreen` does not exist.

- [ ] **Step 3: Implement the shell and scoped CSS**

Add a full-screen semantic main region with a top status bar, horizontal/vertical navigation that adapts at 620px, and a scrollable content region. Keep `DataWorkspace` mounted only for the roster view. The mapping view should reuse the quality issue list and selected-student callback; the presentation view should reuse existing data-view/template/scene callbacks. Keep the top bar controls stable in width so status text cannot resize the layout.

- [ ] **Step 4: Run the shell tests and verify they pass**

Run: `node_modules/.bin/vitest run src/components/GlobalDataScreen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shell change**

```powershell
git add src/components/GlobalDataScreen.tsx src/components/GlobalDataScreen.test.tsx src/styles.css
git commit -m "feat: add global data workbench screen"
```

### Task 4: Wire the workbench into App and unify entry points

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/GlobalSettingsScreen.tsx`
- Modify: `src/components/GlobalSettingsScreen.test.tsx` if present, otherwise extend `src/App.test.tsx`

**Interfaces:**
- Consumes: `GlobalDataScreen` callbacks and current `commitProjectTransaction`, template handlers, persistence state, and workflow state.
- Produces: one project-level data entry from the “名单” workflow step, plus a “打开全局数据” bridge from the global settings data section.

- [ ] **Step 1: Write failing integration tests**

Add tests that:

```ts
it("opens the global data workbench from the roster workflow step", () => {
  const container = renderApp();
  click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="名单"]')!);
  expect(container.querySelector('main[aria-label="全局数据工作台"]')).not.toBeNull();
});

it("commits a data view change from the global workbench", () => {
  const container = renderApp();
  click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="名单"]')!);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="数据呈现"]')!);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!);
  expect(container.querySelector('[data-editor-grid]')?.getAttribute("data-data-view")).toBe("pins");
});
```

Also assert the global settings data section exposes one bridge action and does not render a second student table by default.

- [ ] **Step 2: Run the integration tests and verify failure**

Run: `node_modules/.bin/vitest run src/App.test.tsx`

Expected: FAIL because the workflow step still selects the editor roster panel and no global-data screen is rendered.

- [ ] **Step 3: Wire the screen through existing transactions**

Add a `globalDataOpen` UI state in `App` and an `openGlobalData(initialView)` helper. The helper must reset only UI selection state and preserve `project`, history, assets, fonts, templates, and render settings. Pass existing transaction wrappers for student mutations, `applyDataViewChange`, template handlers, and scene patching. Update `handleWorkflowStepChange` so the roster step opens the workbench, while map/layout/content/assets/deliver keep their current editor behavior.

Change the global settings cards section to render a bridge action before the existing presentation controls. The bridge closes settings and opens the workbench; it must not clone or transform student data.

- [ ] **Step 4: Run the integration tests and verify they pass**

Run: `node_modules/.bin/vitest run src/App.test.tsx`

Expected: PASS, including all existing editor/global-settings regressions.

- [ ] **Step 5: Commit the integration change**

```powershell
git add src/App.tsx src/App.test.tsx src/components/GlobalSettingsScreen.tsx
git commit -m "feat: wire global data workbench into editor"
```

### Task 5: Complete responsive styling and visual verification

**Files:**
- Modify: `src/styles.css`
- Modify: `server/styles.test.ts` if new static CSS invariants are needed
- Read: `src/components/StudioUi.tsx`, current editor theme tokens, existing responsive rules

**Interfaces:**
- Consumes: the DOM classes from Tasks 2-4 and existing light/dark theme tokens.
- Produces: compact, keyboard-visible, responsive styles for the new workbench without changing poster colors.

- [ ] **Step 1: Write failing CSS invariant tests if a regression is not already covered**

Assert that global data content uses an internal scroll region, the narrow layout hides the desktop navigation label without hiding controls, and the workbench does not use a page-level fixed width.

- [ ] **Step 2: Run the CSS tests and verify failure**

Run: `node_modules/.bin/vitest run server/styles.test.ts`

Expected: FAIL for each newly asserted class until the CSS is added.

- [ ] **Step 3: Implement responsive styles**

Use existing semantic tokens and control classes. Desktop layout: fixed navigation rail plus flexible content. Narrow layout: horizontal tab strip, single-column content, preserved import/actions, and no hidden primary workflow controls. Add focus-visible states, empty/loading/error styles, and stable metric/control dimensions.

- [ ] **Step 4: Run CSS tests and the focused UI suite**

Run: `node_modules/.bin/vitest run server/styles.test.ts src/components/GlobalDataScreen.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the styling change**

```powershell
git add src/styles.css server/styles.test.ts
git commit -m "style: make global data workbench responsive"
```

### Task 6: Run full verification and review the branch

**Files:**
- Read: all changed files and the design spec
- Modify: only files required to fix verified failures

- [ ] **Step 1: Run the full test suite**

Run: `node_modules/.bin/vitest run`

Expected: exit code 0 with zero failed tests.

- [ ] **Step 2: Run typecheck and build using Windows-compatible commands**

Run: `node_modules/.bin/tsc -b` and `node_modules/.bin/vite build`

Expected: both commands exit 0. Do not use the repository's Bash wrapper from PowerShell.

- [ ] **Step 3: Run lint**

Run: `node_modules/.bin/eslint .`

Expected: exit code 0 with no lint errors.

- [ ] **Step 4: Run the Impeccable detector on changed UI files**

Run: `node C:\Users\86080\.agents\skills\impeccable\scripts\detect.mjs --json src/components/GlobalDataScreen.tsx src/components/DataOverview.tsx src/components/DataQualityPanel.tsx src/components/DataPresentationPanel.tsx src/styles.css`

Expected: no unresolved high-severity findings. Fix findings in the changed files and rerun once.

- [ ] **Step 5: Review the diff and worktree boundary**

Run: `git diff HEAD~1 --stat` and `git status --short --branch`.

Expected: feature changes are confined to the workbench files plus the explicitly required App/settings/tests/styles changes; unrelated pre-existing user modifications remain present and are not reverted.

- [ ] **Step 6: Commit verification fixes if needed**

```powershell
git add src/lib/data-health.ts src/lib/data-health.test.ts src/components/DataOverview.tsx src/components/DataOverview.test.tsx src/components/DataQualityPanel.tsx src/components/DataQualityPanel.test.tsx src/components/DataPresentationPanel.tsx src/components/DataPresentationPanel.test.tsx src/components/GlobalDataScreen.tsx src/components/GlobalDataScreen.test.tsx src/App.tsx src/App.test.tsx src/components/GlobalSettingsScreen.tsx src/styles.css server/styles.test.ts
git commit -m "test: verify global data workbench"
```
