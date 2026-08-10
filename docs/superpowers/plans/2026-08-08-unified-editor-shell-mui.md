# Unified Editor Shell and MUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every formal editing stage to one compact A-style shell with a consistent topbar and left rail, an optional resizable right rail, and MUI-backed interaction primitives without altering project data or export behavior.

**Architecture:** `StudioMuiProvider` maps existing project tokens into MUI. `StudioTopbar`, `StudioLeftRail`, `StudioRightRail`, and `StudioEditorShell` own all persistent chrome; workspaces own only their central task area and provide a stage-specific right rail. Existing domain forms, canvas, data model, transactions, and import/export functions remain in their current modules and are composed into the new slots.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, MUI 9, Emotion, Lucide, existing project CSS variables and `ResizablePanelDivider`.

## Global Constraints

- Work in the current checkout; it contains unrelated edits. Never reset, checkout, revert, or stage unrelated files and do not create a commit.
- Install only MIT-licensed MUI packages: `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`.
- Do not install, import, copy code from, or ship assets from `animal-island-ui`; it is a visual reference only and uses CC-BY-NC-4.0.
- Import MUI from direct subpaths, such as `@mui/material/Button`, never `@mui/material` barrel imports.
- Retain all existing ProjectDocument structures, export/import formats, existing input IDs, aria labels, callbacks, and `PosterCanvas` behavior.
- Preserve automatic display-frame position freezing and the explicit refresh workflow.
- Default desktop density is compact: 34px controls, 4px spacing grid, 4px control radius, max 8px panel radius.
- Both resizers must remain keyboard-operable and expose `role="separator"` ARIA values.
- Desktop layout is stable left rail + center + optional resizable right rail. At <=760px, center takes priority and a right rail is an accessible MUI Drawer.
- Tests must be written first and observed failing before production implementation for each new behavior.

---

### Task 1: MUI Theme and Shared UI Primitives

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.tsx`, `src/components/StudioUi.tsx`, `src/styles.css`
- Create: `src/components/StudioMuiProvider.tsx`, `src/components/StudioMuiProvider.test.tsx`

**Interfaces:**
- Produces `StudioMuiProvider({ children }: { children: ReactNode })`.
- Produces MUI-backed `CompactButton`, `IconButton`, `ToolbarButton`, `SegmentedControl`, `ActionGroup`, `ToolbarGroup`, preserving each existing exported prop and aria behavior.
- `StudioMuiProvider` uses existing `--editor-*` and new `--studio-*` semantic variables through `createTheme`, `ThemeProvider`, and `CssBaseline`.

- [ ] **Step 1: Write a failing provider test**

```tsx
it("maps the studio accent token into an MUI button and preserves compact controls", () => {
  const { container } = render(<StudioMuiProvider><CompactButton>保存</CompactButton></StudioMuiProvider>);
  expect(container.querySelector(".MuiButton-root")).not.toBeNull();
  expect(container.querySelector("button")?.getAttribute("data-studio-density")).toBe("compact");
});
```

- [ ] **Step 2: Run the target test and verify it fails**

Run: `npx vitest run src/components/StudioMuiProvider.test.tsx`

Expected: FAIL because `StudioMuiProvider` does not exist.

- [ ] **Step 3: Install MUI dependencies**

Run:

```bash
npm install @mui/material@^9.3.1 @mui/icons-material@^9.3.1 @emotion/react@^11.14.0 @emotion/styled@^11.14.1
```

- [ ] **Step 4: Implement the provider and token layer**

Create the provider with direct MUI imports (`@mui/material/styles`, `@mui/material/CssBaseline`) and a compact `createTheme`. Add semantic `--studio-*` CSS variables in `src/styles.css`, with all skins mapped back to current `--editor-*` values. Wrap the root in `src/main.tsx`. Convert only generic buttons/tabs in `StudioUi.tsx` to thin MUI wrappers; preserve class names, `aria-label`, `title`, disabled behavior, and children.

- [ ] **Step 5: Run unit and type checks**

Run:

```bash
npx vitest run src/components/StudioMuiProvider.test.tsx src/components/StudioUi.test.tsx
npx tsc --noEmit
```

Expected: PASS.

### Task 2: Shared Topbar, Left Rail, and Editor Shell

**Files:**
- Modify: `src/App.tsx`, `src/components/WorkflowStageStepper.tsx`, `src/components/StudioAssistantRail.tsx`, `src/components/ResizablePanelDivider.tsx`, `src/lib/editor-layout.ts`, `src/styles.css`
- Create: `src/components/StudioTopbar.tsx`, `src/components/StudioTopbar.test.tsx`, `src/components/StudioLeftRail.tsx`, `src/components/StudioLeftRail.test.tsx`, `src/components/StudioEditorShell.tsx`, `src/components/StudioEditorShell.test.tsx`

**Interfaces:**

```ts
export type StudioEditorShellProps = {
  stage: WorkflowStageId;
  leftRail: ReactNode;
  rightRail?: ReactNode;
  rightRailLabel?: string;
  children: ReactNode;
};

export type StudioTopbarProps = {
  activeStage: WorkflowStageId;
  project: ProjectDocument;
  progress: WorkflowProgress;
  stageActions?: ReactNode;
  projectActions: ReactNode;
  onChangeStage: (stage: WorkflowStageId) => void;
};
```

- [ ] **Step 1: Write failing shell tests**

```tsx
it("renders a single labelled topbar, persistent left rail, center region and optional right rail", () => {
  const { container } = render(<StudioEditorShell stage="map" leftRail={<div>左栏</div>} rightRail={<div>右栏</div>} rightRailLabel="地图属性"><div>中心</div></StudioEditorShell>);
  expect(container.querySelector('[aria-label="编辑器顶栏"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="编辑器左侧栏"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="地图属性"]')).not.toBeNull();
});

it("expands the center region when no right rail is supplied", () => {
  const { container } = render(<StudioEditorShell stage="template" leftRail={<div>左栏</div>}><div>中心</div></StudioEditorShell>);
  expect(container.querySelector('[data-has-right-rail="false"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the target tests and verify they fail**

Run: `npx vitest run src/components/StudioEditorShell.test.tsx src/components/StudioTopbar.test.tsx src/components/StudioLeftRail.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement shared shell components**

Move the repeated topbar markup in `App.tsx` into `StudioTopbar`; it must render the six-step `WorkflowStageStepper`, stage action slot, project menu slot, and theme controls once. Move shared six-stage navigation into `StudioLeftRail`, keeping the existing AI assistant and Advanced action available but separating them below the workflow navigation. `StudioEditorShell` must own desktop grid placement, both `ResizablePanelDivider`s, panel width persistence via `editor-layout.ts`, MUI `Drawer` for mobile right rail, and close/open focus behavior.

- [ ] **Step 4: Integrate the shell into App stage branches**

Replace each duplicated formal-stage header + `StudioStageShell` block in `App.tsx` with `StudioTopbar` + `StudioEditorShell`; retain legacy editor behavior through an adapter path. Use the existing `panelLayout` storage state for the common rail widths. Never duplicate stage navigation inside workspaces.

- [ ] **Step 5: Run behavior tests**

Run:

```bash
npx vitest run src/components/StudioEditorShell.test.tsx src/components/StudioTopbar.test.tsx src/components/StudioLeftRail.test.tsx src/components/ResizablePanelDivider.test.tsx src/App.test.tsx -t "topbar|stage|display-frame"
```

Expected: PASS.

### Task 3: Right Rail Abstraction and Map / Frame / Content Migration

**Files:**
- Modify: `src/components/workspaces/MapStyleWorkspace.tsx`, `src/components/workspaces/DisplayFrameWorkspace.tsx`, `src/components/workspaces/ContentLayoutWorkspace.tsx`, `src/components/workspaces/*.test.tsx`, `src/App.tsx`, `src/styles.css`
- Create: `src/components/StudioRightRail.tsx`, `src/components/StudioRightRail.test.tsx`

**Interfaces:**

```ts
export type StudioRightRailProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  tabs?: Array<{ id: string; label: string; panel: ReactNode }>;
};
```

- [ ] **Step 1: Write failing right-rail and workspace tests**

```tsx
it("keeps map expression and current map properties in the common right rail", () => {
  const { container } = renderMapWorkspace();
  expect(container.querySelector('[aria-label="地图属性"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="地图样式预览"]')).not.toBeNull();
});

it("places display-frame refresh in the topbar action slot rather than the workspace body", () => {
  const { container } = renderFrameWorkspace();
  expect(container.querySelector('.display-frame-workspace__header')).toBeNull();
  expect(container.querySelector('[data-stage-action="refresh-display-frame-positions"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run and confirm red**

Run: `npx vitest run src/components/StudioRightRail.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx`

Expected: FAIL due to missing common rail/header slot behavior.

- [ ] **Step 3: Implement common right rail**

Use MUI direct subpath `Tabs`, `Tab`, `Box`, `IconButton`, `Tooltip`, and `Drawer` composition as necessary. Keep semantic landmarks and the current input IDs. The rail title must accurately reflect map/province selection, display-frame mode, or selected content object.

- [ ] **Step 4: Migrate the three editing stages**

- Map: center is `PosterCanvas`; expression selector and `InspectorPanel` become right-rail content; undo/redo move to `StudioTopbar` stage actions.
- Frame: center is `FixedFrameEditor`/`FlowFrameEditor`; common style controls and layer/property inspectors become right-rail content; refresh, undo and redo appear only in topbar actions.
- Content: center is `PosterCanvas`; `InspectorPanel` and asset context are tabs in the common right rail; refresh, map return, undo and redo are topbar actions.

Pass stage action nodes back through App rather than importing topbar state into workspaces. Preserve `onCardPositionsResolved` through the Content workspace into PosterCanvas.

- [ ] **Step 5: Run target test suite**

Run:

```bash
npx vitest run src/components/StudioRightRail.test.tsx src/components/workspaces/MapStyleWorkspace.test.tsx src/components/workspaces/DisplayFrameWorkspace.test.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/components/canvas/PosterCanvas.test.tsx src/App.test.tsx -t "frame|map|content|position"
```

Expected: PASS.

### Task 4: Template, Data, Export, and Global Settings Migration

**Files:**
- Modify: `src/components/workspaces/TemplateWorkspace.tsx`, `src/components/workspaces/DataUploadWorkspace.tsx`, `src/components/workspaces/DeliveryWorkspace.tsx`, `src/components/GlobalSettingsScreen.tsx`, related tests, `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Formal workspaces expose center content while App injects their `StudioRightRail` content.
- A workspace that has internal tab state may retain it but render it in the shared rail, not a bespoke side rail.

- [ ] **Step 1: Write failing placement tests**

```tsx
it("renders the template catalog in a labelled common right rail while retaining preview center content", () => {
  const { container } = renderTemplateWorkspace();
  expect(container.querySelector('[aria-label="模板属性"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="模板详情"]')).not.toBeNull();
});

it("renders delivery checks and settings in the common right rail while preserving final preview", () => {
  const { container } = renderDeliveryWorkspace();
  expect(container.querySelector('[aria-label="导出与检查"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="最终预览"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run and confirm red**

Run: `npx vitest run src/components/workspaces/TemplateWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/components/workspaces/DeliveryWorkspace.test.tsx src/components/GlobalSettingsScreen.test.tsx`

Expected: FAIL because these regions are currently bespoke layouts.

- [ ] **Step 3: Migrate template and data stages**

- Template: center retains `TemplatePreview`; catalog and impact summary become right rail; apply/reset are topbar actions.
- Data: center retains `DataWorkspace`; quality, mapping and assets become right-rail tabs; no data validation or mapping controls are removed.

- [ ] **Step 4: Migrate export and global settings**

- Export: center remains final poster preview; checks and export settings move into right rail; exports appear in topbar action group and use existing callbacks.
- Global settings: replace its standalone header styling with shared `StudioTopbar` while retaining its section navigation and controls. It does not render a second right rail.

- [ ] **Step 5: Run target suite**

Run:

```bash
npx vitest run src/components/workspaces/TemplateWorkspace.test.tsx src/components/workspaces/DataUploadWorkspace.test.tsx src/components/workspaces/DeliveryWorkspace.test.tsx src/components/GlobalSettingsScreen.test.tsx src/App.test.tsx -t "template|data|export|global settings"
```

Expected: PASS.

### Task 5: Advanced Functions, Legacy Adapter, Responsive CSS, and Integration Tests

**Files:**
- Modify: `src/components/StudioAssistantRail.tsx`, `src/components/inspector/InspectorPanel.tsx`, `src/App.tsx`, `src/styles.css`, `src/App.test.tsx`, related component tests
- Create: `src/components/StudioAssistantRail.integration.test.tsx`

**Interfaces:**
- `StudioLeftRail` owns visible stage navigation and invokes the advanced function shortcuts.
- `StudioAssistantRail` remains an AI/advanced content panel and no longer pretends to be a second navigation system.
- Legacy editor passes `InspectorPanel` through `StudioRightRail` compatible sizing/visibility where it uses the old canvas arrangement.

- [ ] **Step 1: Write failing integration tests**

```tsx
it("opens each advanced shortcut through its actual destination without duplicating forms in the left rail", () => {
  const { container } = renderApp();
  openAdvanced(container);
  click(button(container, "打开数据诊断"));
  expect(container.querySelector('main[aria-label="全局设置"]')).not.toBeNull();
  expect(container.querySelector('[role="tab"][aria-controls="global-settings-cards"]')).not.toBeNull();
});

it("uses a mobile right-rail drawer and keeps the poster canvas free of page horizontal overflow", () => {
  setViewport(390);
  const { container } = renderContentStage();
  click(button(container, "打开内容对象属性"));
  expect(container.querySelector('.MuiDrawer-root')).not.toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
});
```

- [ ] **Step 2: Run and confirm red**

Run: `npx vitest run src/components/StudioAssistantRail.integration.test.tsx src/App.test.tsx -t "advanced|drawer|overflow"`

Expected: FAIL because the unified shortcuts/drawer behavior is not fully implemented.

- [ ] **Step 3: Simplify and wire advanced functions**

Keep these working shortcuts: element viewing/selection, layout issue location, collaboration/invitation, data diagnostics, render settings, global settings, project menu. Move state summaries and low-frequency long forms out of the left rail; they belong in the actual target screen, menu or global settings section. Do not remove any user capability.

- [ ] **Step 4: Finish responsive and skin-neutral styles**

Replace duplicated workspace grid CSS with shell-owned CSS. Make both classic and Atelier skins consume semantic `--studio-*` variables. Add compact desktop behavior at >=1120px; progressive collapse from 1120px to 760px; MUI Drawer at <=760px; a 320px minimum check. Ensure transitions honor `prefers-reduced-motion`.

- [ ] **Step 5: Run integration tests**

Run:

```bash
npx vitest run src/components/StudioAssistantRail.integration.test.tsx src/components/StudioAssistantRail.test.tsx src/components/inspector/InspectorPanel.test.tsx src/App.test.tsx
```

Expected: PASS.

### Task 6: Full Verification and Review

**Files:**
- Modify only if failures demand minimal repairs.
- Review: all files changed by Tasks 1-5.

- [ ] **Step 1: Verify focused suites before full run**

Run:

```bash
npx vitest run src/components/StudioMuiProvider.test.tsx src/components/StudioTopbar.test.tsx src/components/StudioLeftRail.test.tsx src/components/StudioEditorShell.test.tsx src/components/StudioRightRail.test.tsx
npx tsc --noEmit
```

- [ ] **Step 2: Verify all tests and static checks**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

- [ ] **Step 3: Browser acceptance**

Run the Vite web server and verify desktop 1680px, tablet 760px, and mobile 390px:

- Exactly one topbar and common left workflow rail on formal stages.
- Correct stage action appears once in topbar.
- Right rail width adjusts with pointer and keyboard at desktop.
- Mobile drawer opens and closes by keyboard.
- No document horizontal overflow.
- Map edit preserves display-frame positions until explicit refresh.

- [ ] **Step 4: Final independent code review**

Review for MUI direct imports, accessibility, accidental Animal Island source inclusion, data-contract changes, bundle regression, regressions in the position freeze, and unsupported topbar/right rail duplication. Fix every critical or important finding and re-run the command that demonstrates the repair.
