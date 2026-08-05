# Six-Stage Workflow Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the approved six-stage workspace the only normal public workflow, preserve an explicitly gated legacy compatibility shell, finish responsive coverage, and produce fresh repository-wide verification evidence.

**Architecture:** `WorkspaceSession.stage` remains the only persisted public navigation state and stays outside `ProjectDocument`. `App` renders one of six full-screen workspaces for normal users; legacy `WorkflowStepper`, `WorkflowGuide`, `GlobalDataScreen`, `GlobalSettingsScreen`, and inspectors remain importable and reachable only through an internal compatibility gate. Existing transaction, scene, export, package-v2, layout, and map algorithms remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, CSS custom properties, existing Lucide icons and editor components.

## Global Constraints

- Preserve every unrelated uncommitted workspace change; never reset, checkout, clean, or broadly rewrite files.
- Do not install dependencies, modify lockfiles, commit, or create a PR.
- Keep `ProjectDocument` and project package schema/version at v2.
- Keep active stage and UI selections outside `ProjectDocument`.
- Do not alter map algorithms, card-layout algorithms, or export serialization/rasterization core logic.
- Behavioral changes use TDD: add a failing regression, observe failure, implement minimally, and rerun.
- Failed-agent partial writes are untrusted; inspect every touched diff and verify independently.
- The full test/build commands can be resource-heavy; run them sequentially rather than concurrently.

---

### Task 1: Public Workflow and Legacy Compatibility Gate

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/lib/workspace-session.ts`
- Modify: `src/lib/workspace-session.test.ts`

**Interfaces:**
- Consumes: `WorkspaceSession.stage`, `WorkflowStageId`, existing six workspace components.
- Produces: exported `LEGACY_EDITOR_STORAGE_KEY`; normal startup at `template`; normal `content` always renders `ContentLayoutWorkspace`; internal compatibility flag can still render the old three-column shell for regression/support use.

- [ ] Add tests proving: no compatibility flag opens template by default; saved `content` opens `ContentLayoutWorkspace`; saved `data` returns to the previous six-stage workspace rather than `.workspace`; invalid or unavailable storage safely falls back to template.
- [ ] Run `npm test -- --run src/App.test.tsx src/lib/workspace-session.test.ts` and verify at least one new assertion fails before implementation.
- [ ] Export a named compatibility storage key from `workspace-session.ts`; replace string literals in `App` and tests.
- [ ] Keep the legacy shell branch only when that explicit key is `"1"`; do not expose a visible control, workflow button, or settings route that enables it.
- [ ] Ensure every normal stage branch returns before the old shell and that stage changes save through the existing workspace-session persistence effect.
- [ ] Run the focused tests and `npx tsc -p tsconfig.app.json --noEmit`.

### Task 2: Responsive Workspace Contract

**Files:**
- Modify: `src/components/workflow-workspaces.css`
- Modify: `server/styles.test.ts`
- Modify if required by accessible semantics only: `src/components/workspaces/TemplateWorkspace.tsx`
- Modify if required by accessible semantics only: `src/components/workspaces/DeliveryWorkspace.tsx`

**Interfaces:**
- Consumes: existing workspace class names and semantic editor tokens.
- Produces: usable template/export layouts at desktop, <=900px, and <=760px; horizontal poster overflow is contained; primary actions have at least 44px mobile height; no changes to project/export behavior.

- [ ] Add stylesheet contract tests that require template workspace desktop structure, narrow-screen single-column catalog/detail layout, mobile action sizing, delivery single-column actions, and tokenized surfaces.
- [ ] Run `npm test -- --run server/styles.test.ts` and observe the new assertions fail before CSS implementation if any contract is absent.
- [ ] Implement only the missing semantic-token and media-query rules; avoid duplicating component logic or hard-coding poster colors.
- [ ] Add `min-width: 0`, contained scrolling, and touch-sized controls where needed; preserve the SVG poster's own aspect ratio and export dimensions.
- [ ] Run `server/styles.test.ts`, template workspace tests, delivery workspace tests, lint, and TypeScript.

### Task 3: App-Level Navigation and Delivery Regression Coverage

**Files:**
- Modify: `src/App.test.tsx`
- Modify only if a test exposes a defect: `src/App.tsx`

**Interfaces:**
- Consumes: delivery issue categories and `onLocateIssue` stage mappings already implemented.
- Produces: regression evidence that data issues navigate to data, map resources to map, frame fonts to frame, content/layout issues to content, and failed export preserves project/session/configuration.

- [ ] Add App-level tests using real rendered issue buttons and saved workspace sessions; assert the active six-stage heading/step after each navigation.
- [ ] Add an export-failure regression asserting stage remains `export`, selected PNG scale/transparent options remain unchanged, project data remains present, and retry remains available.
- [ ] Run only the new tests and observe failure for any uncovered integration defect.
- [ ] Fix only demonstrated integration defects through existing stage/selection/export callbacks; do not duplicate resource checks or export logic.
- [ ] Run `src/App.test.tsx`, delivery workspace tests, resource-health tests, layout-health tests, and data-health tests.

### Task 4: Full Verification, Review, and Progress Record

**Files:**
- Create: `docs/progress/2026-08-05-six-stage-workflow.md`
- Modify only for verified defects: files directly responsible for those defects.

**Interfaces:**
- Consumes: Tasks 1-3 and the approved six-stage refactor requirements.
- Produces: a factual progress record with completed stages, compatibility guarantees, verification commands/results, known warnings, and remaining work.

- [ ] Run sequentially: `npm test -- --run`; `npx tsc -p tsconfig.app.json --noEmit`; `npm run lint`; `npm run build`; `git diff --check`.
- [ ] If a command fails, record the exact failure, isolate it with a focused test, use TDD for any fix, then rerun the full command.
- [ ] Inspect `git diff -- src/App.tsx src/App.test.tsx src/components/workflow-workspaces.css src/lib/workspace-session.ts server/styles.test.ts` and confirm no unrelated changes, schema changes, algorithm changes, lockfile changes, or hidden destructive recovery.
- [ ] Request a specification-compliance review and then a code-quality review; resolve Critical/Important findings and re-review.
- [ ] Write `docs/progress/2026-08-05-six-stage-workflow.md` with exact test counts and build warning text from fresh output. Do not claim Playwright coverage because `@playwright/test` is not installed.
- [ ] Re-run the relevant verification after any review-driven edit and update the progress record with the final evidence.

## Self-Review

- Specification coverage: public six-stage exclusivity, compatibility preservation, responsive cleanup, delivery navigation, failure preservation, full verification, review, and progress recording each map to a task.
- Scope: no new product feature, schema migration, dependency, algorithm rewrite, or export-core rewrite is included.
- Type consistency: all navigation uses the existing `WorkflowStageId`; compatibility storage is a named string constant; business state stays in `ProjectDocument` and UI state stays in `WorkspaceSession`/component state.
- No placeholders remain; fixes are permitted only when a failing test or verification command demonstrates the defect.
