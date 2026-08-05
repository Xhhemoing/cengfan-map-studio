# Non-AI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve non-AI delivery reliability, performance tooling, test clarity, and initial application loading without changing AI behavior.

**Architecture:** Keep the existing `ProjectDocument` state model and six-stage editor behavior. Defer non-initial workspaces with React lazy loading behind a local suspense boundary; retain the existing `App` routing and callback ownership. Add only focused regression tests around export error behavior and make the existing layout benchmark runnable through the TypeScript runtime.

**Tech Stack:** React, TypeScript, Vite, Vitest, lucide-react, Node.js scripts.

## Global Constraints

- Do not modify `server/ai/**`, `src/components/AgentAssistant.tsx`, `src/lib/agent-session.ts`, or AI request behavior.
- Preserve the public six-stage workflow, legacy-editor compatibility flag, project serialization, undo/redo, browser workspace recovery, and export APIs.
- Follow TDD for each production behavior change: add a failing test, observe the expected failure, implement the minimum change, then rerun the focused test.
- Keep source edits ASCII unless the touched file already uses non-ASCII content.
- Do not add dependencies; browser E2E remains a follow-up because the project does not include Playwright and dependency installation cannot currently reach the configured npm mirror.

---

### Task 1: Make Layout Performance Measurement Runnable

**Files:**
- Modify: `package.json`
- Modify: `scripts/perf-layout-bench.ts`

**Interfaces:**
- Produces: `npm run perf:layout`, which starts the existing TypeScript benchmark with `tsx` and reports the existing 36/60/100/200/400-card cases.

- [ ] **Step 1: Add the expected package script**

Add this script entry beside the other validation scripts:

```json
"perf:layout": "tsx scripts/perf-layout-bench.ts"
```

- [ ] **Step 2: Verify the command fails before implementation**

Run: `npm run perf:layout`
Expected: npm reports that `perf:layout` is missing.

- [ ] **Step 3: Correct the benchmark usage comment**

Replace the direct-Node usage comment with:

```ts
 * Run with: npm run perf:layout
```

- [ ] **Step 4: Verify the runnable benchmark**

Run: `npm run perf:layout`
Expected: exit code 0 and one timing line each for counts 36, 60, 100, 200, and 400.

### Task 2: Cover PNG and Project-Package Delivery Failures

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx` only if the failing tests reveal a real behavior gap

**Interfaces:**
- Consumes: existing `DeliveryWorkspace` callbacks and `downloadDataUrl` / `downloadText` export functions.
- Produces: App-level regression coverage that failure keeps the user in final export, displays an error, preserves selected PNG settings, and exposes retry.

- [ ] **Step 1: Write a failing PNG export error test**

Add an App test that opens final export, selects 3x PNG, replaces `HTMLCanvasElement.prototype.toDataURL` with a throwing implementation, clicks the PNG button, then asserts final-export main remains mounted, the alert includes the thrown message, the select remains `"3"`, and retry exists.

- [ ] **Step 2: Run the new PNG test to verify red**

Run: `npx vitest run src/App.test.tsx -t "keeps the export stage and current configuration when PNG export fails"`
Expected: fail until the test and implementation agree on the actual export failure seam.

- [ ] **Step 3: Apply the minimum behavior correction if required**

Keep the existing delivery export error state path. If the test exposes an uncaught asynchronous rejection, catch it in the existing PNG handler and call the existing export failure setter; do not change export formats or successful download behavior.

- [ ] **Step 4: Verify the PNG test is green**

Run the same targeted command.
Expected: 1 passing test.

- [ ] **Step 5: Write a failing project-package export error test**

Add an App test that opens final export and makes `URL.createObjectURL` throw while clicking the project-package button. Assert the final export screen remains open, its alert contains the message, the current settings remain visible, and retry is available.

- [ ] **Step 6: Run the project-package test to verify red**

Run: `npx vitest run src/App.test.tsx -t "keeps the export stage and current configuration when project package export fails"`
Expected: fail until implementation handles the synchronous download error through the common delivery error path.

- [ ] **Step 7: Apply the minimum behavior correction if required**

Use the existing `runDeliveryExport` error boundary or equivalent existing handler. Do not duplicate error-state logic in `DeliveryWorkspace`.

- [ ] **Step 8: Verify the focused delivery tests**

Run: `npx vitest run src/App.test.tsx -t "keeps the export stage and current configuration when"`
Expected: SVG, PNG, and project-package failure tests all pass.

### Task 3: Defer Non-Initial Workflow Workspaces

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: current named exports from six workspace component modules.
- Produces: `React.lazy` component declarations for template, data-upload, map-style, display-frame, content-layout, and delivery workspaces; a local `Suspense` fallback wraps only a selected workspace render.

- [ ] **Step 1: Add a regression assertion for the workspace loading boundary**

In a public-app workflow test, assert that navigating between template, data, map, frame, content, and final export still mounts the intended labelled workspace after React has resolved the lazy import. Use `await vi.waitFor` around each asynchronous assertion.

- [ ] **Step 2: Run the new workflow transition test to verify red**

Run: `npx vitest run src/App.test.tsx -t "loads each public workflow workspace on demand"`
Expected: fail because the named test does not exist yet.

- [ ] **Step 3: Replace eager workspace component imports with lazy declarations**

Use `lazy(async () => ({ default: module.NamedWorkspace }))` for each named workspace module. Keep types as `import type`. Add a single compact loading surface with `role="status"` and `aria-label="正在加载工作区"`.

- [ ] **Step 4: Wrap only active workspace returns with Suspense**

Wrap every public full-screen workspace return branch in the same `Suspense` component. Do not defer the legacy editor, poster canvas, data models, or export library helpers.

- [ ] **Step 5: Verify the focused workflow suite**

Run: `npx vitest run src/App.test.tsx -t "workflow workspace|loads each public workflow workspace on demand|opens the full-screen final export workspace"`
Expected: all selected tests pass.

- [ ] **Step 6: Verify production code splitting**

Run: `npm run build`
Expected: exit code 0, separate JavaScript chunks for deferred workspace modules, and no regression in the existing worker/XLSX chunks.

### Task 4: Clarify Legacy Test Entrypoints and CSS Selector Parsing

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `server/styles.test.ts`
- Modify: `server/styles.test.ts` helpers only if required by a new nested-rule regression test

**Interfaces:**
- Produces: explicit `renderLegacyApp` use for legacy-only assertions and a brace-depth selector extractor that does not match CSS declarations from later blocks.

- [ ] **Step 1: Rename legacy test calls without behavior changes**

Replace `renderApp()` calls in tests that assert `.workspace`, `WorkflowGuide`, `WorkflowStepper`, legacy inspector, canvas toolbar, or global-settings compatibility behavior with `renderLegacyApp()`. Preserve `renderPublicApp()` for six-stage public workflow tests.

- [ ] **Step 2: Add a failing CSS extractor test**

Add a test fixture where the requested selector has nested declarations and a later selector contains similar property text. Assert the extractor returns only the requested selector block.

- [ ] **Step 3: Run the CSS test to verify red**

Run: `npx vitest run server/styles.test.ts -t "extracts only the requested nested selector block"`
Expected: fail with the current regex-based helper.

- [ ] **Step 4: Implement brace-depth selector extraction**

Locate the selector opening brace, scan character-by-character while tracking nested `{` and `}`, and return when the depth returns to zero. Throw a descriptive error when the selector or closing brace is absent.

- [ ] **Step 5: Verify focused test maintenance checks**

Run: `npx vitest run src/App.test.tsx server/styles.test.ts`
Expected: all selected tests pass.

### Task 5: Record the Browser-E2E Constraint and Perform Final Verification

**Files:**
- Modify: `docs/progress/2026-08-05-six-stage-workflow.md`
- Modify: `.learnings/ERRORS.md` only for command failures observed in this implementation

**Interfaces:**
- Produces: an accurate deferred-E2E note: no Playwright dependency is added without approval and npm mirror connectivity is currently unavailable for clean install.

- [ ] **Step 1: Update the progress note**

Record that unit/integration coverage now includes SVG, PNG, and project-package delivery failures; runtime browser E2E remains deferred because Playwright is not installed and package installation currently fails on the configured mirror.

- [ ] **Step 2: Run non-AI focused checks**

Run:

```bash
npm run perf:layout
npx vitest run src/App.test.tsx server/styles.test.ts
```

Expected: both commands exit 0.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0. Build may retain the known aggregate chunk warning but must show deferred workspace chunks.

- [ ] **Step 4: Commit the isolated branch**

```bash
git add package.json scripts/perf-layout-bench.ts src/App.tsx src/App.test.tsx server/styles.test.ts docs/progress/2026-08-05-six-stage-workflow.md
git commit -m "perf: improve non-AI editor delivery and loading"
```
