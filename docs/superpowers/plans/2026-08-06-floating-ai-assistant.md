# Floating AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI editing into a viewport-floating assistant with multi-conversation history, unapplied-completion badge, selectable proposed changes, and safe partial application.

**Architecture:** Keep `AgentSession` as the AI protocol and safety boundary. Extend it with deterministic selected-step transaction construction, then make `AgentAssistant` own transient conversation records and floating-window interaction. `App` mounts the assistant outside the legacy sidebar and removes the unused content AI tab and editor toolbar.

**Tech Stack:** React, TypeScript, Vitest, lucide-react, existing CSS and project transaction APIs.

## Global Constraints

- Do not add runtime dependencies, API routes, storage schemas, or package-version changes.
- Do not alter `ProjectDocument`, existing exported project formats, AI transport/routing/budget behavior, collaboration APIs, or layout algorithms.
- Conversation history is in-memory only; refresh clears it.
- Default launcher location is lower-right viewport; panel dragging must use pointer events, pointer capture, and viewport clamping.
- All write changes remain preview-first in conservative mode. A deselected proposal is never included in an applied transaction.
- Preserve existing cancellation, mounted-component guards, 70-second round timeout, fallback messaging, and accessibility behavior.
- Use TDD: every behavior is a RED test, observed failing, then minimal GREEN implementation and focused rerun.
- Do not commit, install, reset, checkout, clean, or modify unrelated user work.

---

### Task 1: Build selected-step transactions in `AgentSession`

**Files:**
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session.test.ts`

**Interfaces:**
- Produces `AgentSession.transactionForSteps(stepIds: ReadonlySet<string>): ProjectTransaction | null`.
- Reuses existing `AgentStep`, `ProjectTransaction`, local tool validation, and starting project snapshot.
- A returned transaction has `source: "ai"`, has a label containing the selected step count, and replays selected successful write calls in their original session order.

- [ ] **Step 1: Write failing selected-step transaction tests**

Add tests that drive a session through two successful write tool calls, then assert:

```ts
const transaction = session.transactionForSteps(new Set(["call-map"]));
expect(transaction).not.toBeNull();
const changed = transaction!.apply(project);
expect(changed.map.scale).toBe(0.9);
expect(changed.cards.fontSize).toBe(project.cards.fontSize);
```

Add a second test selecting no step IDs:

```ts
expect(session.transactionForSteps(new Set())).toBeNull();
```

Add a third test selecting two calls in reverse set insertion order and assert the final project reflects session/tool-call order, not set iteration order.

- [ ] **Step 2: Run the targeted tests and confirm RED**

Run:

```bash
npx vitest run src/lib/agent-session.test.ts -t "selected-step"
```

Expected: FAIL because `transactionForSteps` does not exist.

- [ ] **Step 3: Implement the smallest replay path**

- Capture a private immutable starting project snapshot in the constructor.
- Add a private helper that identifies successful write steps (`!READ_ONLY_TOOLS.has(step.name) && step.result.ok`).
- Add `transactionForSteps`; filter `_steps` in their existing array order by the supplied ID set, replay only their original `AgentToolCall` shape against a fresh cloned starting project using existing validation/scene/student execution logic, and return `null` when none is selected or replayable.
- Do not mutate the live shadow project, `_steps`, conversation, controller, budget, or emit progress while replaying.

- [ ] **Step 4: Run the targeted tests and confirm GREEN**

Run:

```bash
npx vitest run src/lib/agent-session.test.ts -t "selected-step"
```

Expected: PASS.

- [ ] **Step 5: Run the complete session test file**

Run:

```bash
npx vitest run src/lib/agent-session.test.ts
```

Expected: PASS.

### Task 2: Convert the assistant component into a floating, multi-conversation workspace

**Files:**
- Modify: `src/components/AgentAssistant.tsx`
- Modify: `src/components/AgentAssistant.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `AgentAssistant` keeps `project`, `assets`, `onPreview`, and `onCommit` props.
- Add optional `onPendingCountChange?: (count: number) => void`; call it whenever completed conversations with selected unapplied write steps change.
- Component state uses an ordered `AssistantConversation[]`, each with one independent `AgentSession`.

- [ ] **Step 1: Write failing launcher/history/proposal tests**

Add tests asserting all of these observable interactions:

```ts
expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).toBeNull();
clickLauncher();
expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).not.toBeNull();
```

Mock the existing two-response tool-call/finish session and assert its completed conversation exposes the model summary and a proposal checkbox. Deselect the checkbox, click `确认应用`, and assert `onCommit` is not called. Select it, apply, and assert `onCommit` is called once.

Add a test that creates two conversations, completes the first with a write, creates the second, then asserts the launcher badge says `1` and selecting the first history item restores its proposal.

Add a drag test that dispatches pointerdown/move/up on the panel header and asserts the panel inline transform or left/top position changes but remains finite.

- [ ] **Step 2: Run component tests and confirm RED**

Run:

```bash
npx vitest run src/components/AgentAssistant.test.tsx
```

Expected: FAIL because the launcher/history/step selection surface is absent.

- [ ] **Step 3: Implement transient conversation state and launcher**

- Replace single-session state with conversation records, initialized with one draft record only when the launcher opens or the user presses `新建对话`.
- Render a fixed circular launcher with Sparkles icon and a numeric badge for completed, unapplied records that still have selected successful write steps.
- Render the panel only when open, with `role="dialog"`, a title/header, history list, new-conversation icon button, minimize button, mode radio group, textarea, send/cancel button, summary/error/status route, proposal rows, and selected-only apply button.
- Starting a request creates a new record if no draft is active; store the request, session, status, summary, steps, and selected successful write IDs on completion.
- Selecting a completed record calls `onPreview` with that record's selected transaction applied to its session start snapshot, or `null` when no selected steps remain. Selecting a running record is disabled.
- `确认应用` calls `session.transactionForSteps(new Set(selectedStepIds))`; on a non-null transaction call `onCommit`, mark only that conversation `applied`, and clear preview. Do not use the old full-session `transaction()` for partial application.
- Keep smart-mode automatic application only when every successful write step is selected and low-risk; mark the record applied on the same state update.
- Cancel/unmount cancels only the active running session. Retain mounted guards before state updates.

- [ ] **Step 4: Implement draggable panel behavior**

- Keep position in component state as `{ x: number; y: number } | null`; `null` represents the CSS lower-right default.
- On the header's `onPointerDown`, ignore a target inside a `button`, `input`, `label`, or `textarea`; otherwise store pointer offset, call `currentTarget.setPointerCapture(event.pointerId)`, and update a drag ref on `pointermove`.
- Clamp x/y to `0..window.innerWidth - panelWidth` and `0..window.innerHeight - headerReachableHeight`, with fallback dimensions `390` and `52` before measurement.
- On pointerup/cancel release capture and stop drag. Do not attach global duplicate listeners.

- [ ] **Step 5: Add focused CSS to the end of `src/styles.css`**

Add a scoped `.agent-assistant-launcher` and `.agent-assistant-window` block:

- fixed launcher lower-right, `z-index` above editor/inspector but below application modal dialogs;
- badge with tabular numbers;
- fixed window with constrained width/height, grid rows for header/history/body/composer, no nested cards;
- header drag cursor, touch-action none only for the drag affordance;
- history button active/unapplied states, compact proposal checkboxes, result list scrolling, and responsive mobile width/height;
- dark-theme overrides using existing editor variables.

Do not use gradients, decorative blobs, hero styling, or new palette tokens.

- [ ] **Step 6: Run component tests and confirm GREEN**

Run:

```bash
npx vitest run src/components/AgentAssistant.test.tsx
```

Expected: PASS.

### Task 3: Mount the assistant at application level and remove the obsolete horizontal/UI entries

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `App` renders one `AgentAssistant` in both the standard content workspace and legacy editor return branch.
- The legacy sidebar content panel contains only canvas-layer tools; no `contentView` state, AI segmented-control item, or embedded assistant remains.
- The legacy editor has no `.editor-toolbar` element.

- [ ] **Step 1: Write failing integration tests**

Add an App test for legacy mode:

```ts
const container = renderLegacyApp();
expect(container.querySelector('.editor-toolbar')).toBeNull();
expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
expect(container.textContent).not.toContain('画布图层AI 助手');
```

Add an App test for the standard content workspace that opens the assistant launcher and expects `[role="dialog"][aria-label="AI 助手"]`.

- [ ] **Step 2: Run the targeted integration tests and confirm RED**

Run:

```bash
npx vitest run src/App.test.tsx -t "AI 助手|editor toolbar"
```

Expected: FAIL because the assistant is embedded in the sidebar and the toolbar remains rendered.

- [ ] **Step 3: Make the minimal App composition change**

- Remove `contentView` state, the content segmented control, and only the embedded `AgentAssistant` branch; retain the layer UI as the sole content panel output.
- Remove the legacy editor toolbar JSX, not its canvas-stage, zoom shell, poster, inspector, panel dividers, or unrelated topbar/workflow navigation.
- Mount `AgentAssistant` directly under the standard content workspace and directly before the end of the legacy editor `main`, with existing `project`, `userAssets`, `setAgentPreview`, and `commitProjectTransaction` callbacks.
- Ensure the floating component renders over the workspace without changing project transaction wiring.

- [ ] **Step 4: Run targeted App tests and confirm GREEN**

Run:

```bash
npx vitest run src/App.test.tsx -t "AI 助手|editor toolbar"
```

Expected: PASS.

- [ ] **Step 5: Run the relevant regression set**

Run:

```bash
npx vitest run src/App.test.tsx src/components/AgentAssistant.test.tsx src/lib/agent-session.test.ts
```

Expected: PASS.

### Task 4: Verify the UI surface and update delivery progress

**Files:**
- Modify: `docs/progress/2026-08-06-ai-calling-platform.md`
- Test: `src/App.test.tsx`
- Test: `src/components/AgentAssistant.test.tsx`
- Test: `src/lib/agent-session.test.ts`

- [ ] **Step 1: Run static and targeted checks**

Run serially:

```bash
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run lint
npm run build
node "C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs" --json src/App.tsx src/components/AgentAssistant.tsx src/styles.css
```

Expected: every command exits zero. Treat Vite's existing chunk-size warning as a recorded warning, not success evidence for another failed command.

- [ ] **Step 2: Perform one bounded browser validation pass**

Start the normal dev server on a free port. At desktop and mobile viewport widths verify:

- no legacy editor toolbar is visible;
- launcher begins at lower right;
- panel opens, minimizes, and drag remains on-screen;
- history switches a completed conversation;
- badge count changes after accepting/rejecting a proposal;
- deselecting a proposed step excludes it before apply.

Capture screenshots only if the browser tool is available; otherwise record the exact manual browser route and state tested.

- [ ] **Step 3: Run the full test suite and diff check**

Run serially:

```bash
npm test
git diff --check
```

Expected: all tests pass and diff check has no errors. CRLF conversion notices may be reported separately and are not diff errors.

- [ ] **Step 4: Update progress evidence**

Append a distinct floating-assistant section to `docs/progress/2026-08-06-ai-calling-platform.md` containing:

- behavior delivered and files changed;
- RED/GREEN test evidence;
- exact fresh test/type/lint/build/diff outputs;
- browser validation result;
- accepted limitations: memory-only conversation history and standard project-level undo for an already-applied AI transaction.

- [ ] **Step 5: Request final review**

Ask a fresh reviewer to inspect only the floating assistant diff for requirement coverage, partial-apply correctness, UI accessibility, drag lifecycle cleanup, cancellation/unmount behavior, and regressions. Resolve every Critical and Important finding, rerun the affected test, then rerun `npm test` and `git diff --check`.
