# Top Workflow and Left Assistant Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the six-stage workflow to the visible top bar and provide a stable left workspace that switches between the docked AI assistant and advanced project tools, while preserving object-level controls in the right inspector.

**Architecture:** Preserve `ProjectDocument` as the only persisted poster state and keep `AgentSession` responsible for AI transport, shadow-project preview, and selected-step application. Add a presentation-only docked mode to `AgentAssistant`; the shared application shell owns the AI/advanced left-rail switch and passes existing project, asset, preview, and transaction callbacks into it. Existing task workspaces remain responsible for stage-specific controls; the shell only changes navigation and global operational access.

**Tech Stack:** React, TypeScript, Vite, Vitest, existing Lucide icons and CSS custom-property tokens.

## Global Constraints

- Preserve the public six stages: `template`, `data`, `map`, `frame`, `content`, `export`.
- Preserve `ProjectDocument` as the canonical state. AI suggestions must remain shadow previews until explicit application.
- Reuse existing `AgentAssistant`, `ProjectMenu`, collaboration callbacks, local-workspace sync, `InspectorPanel`, and `WorkflowStageStepper`; add no dependencies and no API changes.
- The left rail contains exactly one advanced-tools entry point: the `高级功能` tab. Do not reintroduce an AI-panel-bottom advanced entry.
- The topbar workflow must remain visible for the Atelier skin on desktop and narrow layouts must retain a discoverable object-properties control.
- Keep changes scoped to the public editor shell and shared controls; do not remove the legacy compatibility editor or alter poster/export content.
- Follow red-green-refactor. Record each failure cause before fixing it and rerun the exact failed command.

---

## File Structure

- Modify `src/components/AgentAssistant.tsx`: add a docked presentation mode that renders the existing conversations, selected step proposals, risk labels, and explicit apply action inside the left rail without duplicating state.
- Modify `src/components/AgentAssistant.test.tsx`: cover the docked rendering contract and proposal controls.
- Create `src/components/StudioAssistantRail.tsx`: own the `AI 助手 / 高级功能` tab semantics and compose the docked assistant with advanced operational sections.
- Create `src/components/StudioAssistantRail.test.tsx`: verify tab semantics, no duplicate advanced action in AI content, and advanced status visibility.
- Modify `src/App.tsx`: centralize public topbar workflow rendering; wire the new rail into `StudioStageShell`; move the legacy editor's left rail from workflow navigation to the shared rail; pass existing project/asset/sync/collaboration callbacks and AI transaction callbacks.
- Modify `src/App.test.tsx`: verify the public six-stage topbar remains visible for Atelier, the left rail exposes one advanced entry point, and object properties remain reachable at narrow widths.
- Modify `src/styles.css`: add shell/rail styles using existing semantic tokens; retain restrained 3-8px control radius, preserve the central canvas, provide narrow-screen workflow overflow and inspector drawer trigger.

## Task 1: Docked AI Presentation

**Files:**
- Modify: `src/components/AgentAssistant.tsx`
- Modify: `src/components/AgentAssistant.test.tsx`

**Consumes:** existing `AssistantConversationProvider`, `AgentSession`, `ProjectTransaction`, `onPreview`, and `onCommit` APIs.

**Produces:** `AgentAssistant` accepts optional `presentation?: "floating" | "docked"`; floating remains the default and docked renders the current active conversation directly without a launcher or draggable dialog chrome.

- [ ] **Step 1: Write the failing docked-mode test**

```tsx
it("renders the active AI workspace inline when docked", () => {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <AssistantConversationProvider>
      <AgentAssistant presentation="docked" project={project} assets={[]} onCommit={vi.fn()} />
    </AssistantConversationProvider>,
  ));

  expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
  expect(container.querySelector('.agent-assistant-launcher')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull();
  root.unmount();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/components/AgentAssistant.test.tsx -t "renders the active AI workspace inline when docked"`

Expected: FAIL because `presentation` is not a supported prop and the docked semantic marker does not exist.

- [ ] **Step 3: Add the minimal docked presentation implementation**

Add `presentation = "floating"` to the existing component props. Extract the shared conversation body to a local render helper so selected proposal checkboxes, risk descriptions, send/cancel action, `确认应用`, and `onPreview` behavior remain identical. For docked mode, initialize a draft as today and return an inline `section` with `data-agent-presentation="docked"` and `aria-label="AI 助手"`; omit only the floating launcher, drag header, and fixed-position dialog behavior.

- [ ] **Step 4: Run component tests and verify GREEN**

Run: `npx vitest run src/components/AgentAssistant.test.tsx`

Expected: PASS, including the existing persistence, selected-step application, cancellation, and floating-launcher tests.

- [ ] **Step 5: Commit task checkpoint**

```bash
git add src/components/AgentAssistant.tsx src/components/AgentAssistant.test.tsx
git commit -m "feat: add docked AI assistant presentation"
```

## Task 2: Left-Rail Advanced Tools Switch

**Files:**
- Create: `src/components/StudioAssistantRail.tsx`
- Create: `src/components/StudioAssistantRail.test.tsx`

**Consumes:** `ProjectDocument`, `UserAsset[]`, `AgentAssistant` docked mode, existing collaboration summary values, `LocalOverwriteStatus`, and existing AI callbacks.

**Produces:** `StudioAssistantRail` with an accessible two-tab interface. `AI 助手` is initially selected. `高级功能` is the only rail entry for operational tools and displays project state, collaboration state, data warning count, render interval, and configuration action callbacks.

```ts
export interface StudioAssistantRailProps {
  project: ProjectDocument;
  assets: UserAsset[];
  syncStatus: LocalOverwriteStatus;
  collaboration: { roomId: string | null; status: CollaborationStatus; participantCount: number };
  dataIssueCount: number;
  renderIntervalMs: number;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onPreview: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
}
```

- [ ] **Step 1: Write failing tab and advanced-summary tests**

```tsx
it("shows advanced operational tools only after selecting its single top-level tab", () => {
  const onOpenSettings = vi.fn();
  const { container } = renderRail({ onOpenSettings });

  expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("AI 助手");
  expect(container.textContent).not.toContain("工程状态");
  expect(container.querySelectorAll('button').filter((button) => button.textContent?.includes("高级功能"))).toHaveLength(1);

  click(container.querySelector('[role="tab"]:last-child')!);
  expect(container.textContent).toContain("工程状态");
  expect(container.textContent).toContain("ProjectDocument");
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/components/StudioAssistantRail.test.tsx`

Expected: FAIL because `StudioAssistantRail` does not exist.

- [ ] **Step 3: Implement the rail with native tab semantics**

Create the component with `role="tablist"`, two buttons with `role="tab"`, `aria-selected`, `aria-controls`, and two labelled `role="tabpanel"` sections. The AI panel composes `<AgentAssistant presentation="docked" ... />`. The advanced panel lists only operational summaries and explicit controls: `工程状态`, `协作与邀请`, `数据诊断`, `渲染性能`, and `开发者配置`; it must not add a second advanced entry inside the AI panel.

- [ ] **Step 4: Run the rail tests and verify GREEN**

Run: `npx vitest run src/components/StudioAssistantRail.test.tsx`

Expected: PASS with assertions for tab selection, advanced content, and settings callback.

- [ ] **Step 5: Commit task checkpoint**

```bash
git add src/components/StudioAssistantRail.tsx src/components/StudioAssistantRail.test.tsx
git commit -m "feat: add AI and advanced tools rail"
```

## Task 3: Connect the Shared Shell and Top Workflow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Consumes:** `StudioAssistantRail`, existing `stageProjectControls`, `dataIssues`, `resolvedRenderInterval`, collaboration state, `commitProjectTransaction`, `setAgentPreview`, and `openStudioSettings`.

**Produces:** Public stage workspace shell and legacy editor share a left rail that is AI-first, topbar displays `WorkflowStageStepper` for Atelier rather than hiding it, and all existing project/AI callbacks remain wired.

- [ ] **Step 1: Write failing integration tests**

```tsx
it("keeps public six-stage workflow in the Atelier topbar and exposes one rail advanced tab", () => {
  window.localStorage.setItem("cengfan-map-studio:skin", "atelier");
  const container = renderPublicApp({ clearStorage: false });

  expect(container.querySelector('.topbar .workflow-stage-stepper[aria-label="制作步骤"]')).not.toBeNull();
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(["AI 助手", "高级功能"]);
  expect(container.querySelectorAll('[data-agent-presentation="docked"]')).toHaveLength(1);
});

it("opens advanced project settings from the rail without adding an AI-bottom advanced entry", () => {
  const container = renderLegacyApp();
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]')!);
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

  expect(container.querySelector('[role="dialog"][aria-label="全局设置"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-agent-presentation="docked"] [aria-label="打开全局设置"]')).toHaveLength(0);
});
```

- [ ] **Step 2: Run the integration tests and verify RED**

Run: `npx vitest run src/App.test.tsx -t "keeps public six-stage workflow|opens advanced project settings from the rail"`

Expected: FAIL because Atelier currently hides the topbar workflow and the shared rail does not exist.

- [ ] **Step 3: Wire `StudioAssistantRail` into `StudioStageShell` and legacy workspace**

Extend `StudioStageShell` with a `leftRail` node, rendering it instead of `studio-sidebar__workflow` and `studio-sidebar__tools`. Construct the rail once inside `StudioApp` from the existing project, assets, sync, collaboration, data issue count, render interval, and callbacks. In public stages, pass it to every `StudioStageShell`; in legacy editor, replace the workflow navigation and tool block with the same rail. Preserve the existing `WorkflowStageStepper` in each topbar and remove `topbarWorkflowHidden`/the Atelier aria-hidden behavior.

Keep `ProjectMenu` as project file/export actions. Its collaboration section remains an action surface; it must not become another navigation route for diagnostics/configuration.

- [ ] **Step 4: Run focused App and component tests and verify GREEN**

Run: `npx vitest run src/App.test.tsx src/components/StudioAssistantRail.test.tsx src/components/AgentAssistant.test.tsx`

Expected: PASS. Existing stage navigation, public/legacy compatibility, AI transaction, and persistence tests remain green.

- [ ] **Step 5: Commit task checkpoint**

```bash
git add src/App.tsx src/App.test.tsx src/components/StudioAssistantRail.tsx src/components/StudioAssistantRail.test.tsx
git commit -m "feat: move workflow to top and dock assistant rail"
```

## Task 4: Responsive and Visual Integration

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`

**Consumes:** `.studio-assistant-rail`, `.agent-assistant[data-agent-presentation="docked"]`, existing editor semantic tokens, topbar workflow classes, and inspector toggle state.

**Produces:** At 1120px and above, a visible top workflow and fixed left rail/right object inspector. At 760px and below, the workflow scrolls horizontally, the rail remains a compact panel, and the existing inspector toggle remains discoverable and keyboard accessible.

- [ ] **Step 1: Write a failing CSS-contract test for the new responsive selectors**

```tsx
it("keeps Atelier workflow visible and defines a narrow inspector access path", async () => {
  const css = await import("./styles.css?raw");
  expect(css.default).toContain('.app-shell[data-editor-skin="atelier"] .topbar-workflow');
  expect(css.default).not.toContain('.topbar-workflow[aria-hidden="true"] { visibility: hidden; }');
  expect(css.default).toContain('.studio-assistant-rail');
  expect(css.default).toContain('.inspector-toggle-group');
});
```

If the current test setup cannot import CSS raw files, add the assertion to the existing selector-contract style test rather than introducing a new runtime dependency.

- [ ] **Step 2: Run the selector test and verify RED**

Run: `npx vitest run src/App.test.tsx -t "keeps Atelier workflow visible and defines a narrow inspector access path"`

Expected: FAIL because the visible-topbar and assistant-rail selectors do not yet exist.

- [ ] **Step 3: Add scoped CSS**

Add Atelier and shared-shell styles for `.studio-assistant-rail`, its tabs/panels/status list, and docked assistant. Use existing `--editor-*` tokens, border-led grouping, 3-8px corner radii, compact 32px controls, and no nested card stacks. Remove the rule that hides Atelier topbar workflow. On narrow layouts, set topbar workflow overflow to horizontal and retain the existing `inspector-toggle-group`/drawer behavior; do not use `display: none` for all object-editing access.

- [ ] **Step 4: Run CSS contract and focused UI tests and verify GREEN**

Run: `npx vitest run src/App.test.tsx src/components/StudioAssistantRail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit task checkpoint**

```bash
git add src/styles.css src/App.test.tsx
git commit -m "style: integrate top workflow and assistant rail"
```

## Task 5: Verification and Review

**Files:**
- Modify: `docs/progress/2026-08-06-top-workflow-left-assistant-shell.md`

- [ ] **Step 1: Run targeted verification**

Run:

```bash
npx vitest run src/components/AgentAssistant.test.tsx src/components/StudioAssistantRail.test.tsx src/App.test.tsx
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. If a command fails, capture failure, state the root-cause hypothesis, apply the minimal correction, and rerun that exact command before continuing.

- [ ] **Step 2: Run the mechanical design detector**

Run:

```bash
node C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs --json src/App.tsx src/components/AgentAssistant.tsx src/components/StudioAssistantRail.tsx src/styles.css
```

Expected: record and resolve mechanical UI findings that conflict with the confirmed operational-shell direction.

- [ ] **Step 3: Request an independent code review**

Give the reviewer the implementation diff, this plan, and the verification output. Resolve every Critical or Important finding, then rerun the affected tests and the full verification command that covers the repair.

- [ ] **Step 4: Record verification evidence**

Write `docs/progress/2026-08-06-top-workflow-left-assistant-shell.md` with the exact test counts, TypeScript/lint/build results, detector findings, review result, manual desktop/narrow acceptance steps, and rollback procedure: reverting the shell/rail commits restores the existing floating assistant and previous stage shell without altering `ProjectDocument`, export data, or API contracts.

- [ ] **Step 5: Commit verification record**

```bash
git add docs/progress/2026-08-06-top-workflow-left-assistant-shell.md
git commit -m "docs: record top workflow shell verification"
```

## Plan Self-Review

- **Spec coverage:** Task 1 preserves AI shadow-preview and selected-step application while making it dockable. Task 2 creates the single advanced entry point and operational status view. Task 3 makes the workflow visible in the topbar and connects every existing callback. Task 4 covers desktop/narrow layout and inspector discoverability. Task 5 requires test/type/lint/build/detector/review evidence plus a rollback path.
- **Placeholder scan:** No implementation placeholder remains; every task names the files, APIs, test behavior, commands, expected outcomes, and commit boundary.
- **Type consistency:** `StudioAssistantRailProps` uses existing state types; `AgentAssistant.presentation` defaults to `floating`, preserving all existing callers while providing the rail's `docked` mode.
