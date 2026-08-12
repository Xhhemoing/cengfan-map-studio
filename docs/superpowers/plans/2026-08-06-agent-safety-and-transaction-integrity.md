# AI Agent Safety and Transaction Integrity Implementation Plan

> **For implementer:** Use TDD throughout. Write the failing regression first, observe it fail, then implement the smallest correct behavior.

**Goal:** Close the remaining trust-boundary and commit-integrity gaps in the AI assistant so untrusted model calls cannot mutate protected nested data, and an accepted AI proposal merges only its own changes into the latest project rather than replacing unrelated edits.

**Architecture:** The server stays the first validation boundary and the browser revalidates every proposed call before touching the shadow project. `AgentSession` retains its initial project snapshot, derives narrow operations from the selected proposal state, and applies those operations to the current project within one existing `ProjectTransaction`. The existing project schema, package format, layout algorithm, and export implementation remain unchanged.

**Tech Stack:** TypeScript, React 19, Vitest, existing `ProjectDocument`, `applyTransaction`, `diffCollaborationDocument`, `applyCollaborationOperations`, `updateSceneTarget`, and `AgentSession`.

## Verified Baseline

- The six-stage public workflow is complete per `docs/progress/2026-08-05-six-stage-workflow.md`.
- The AI agent server loop, session, and UI are present on `master` from `8d840dd`.
- Focused validation passed on 2026-08-06: 8 files, 53 tests.
- The only pre-existing dirty file is `server/index.ts`; it adjusts `resolvePort` and is outside this plan.
- Backup verified before implementation: `/home/ubuntu/work/backups/cengfan-agent-transaction-integrity-20260806-095157` mirrors 360 source files, excluding `.git`, `node_modules`, and `dist`.

## Scope Boundaries

- Do not alter `ProjectDocument`, schema version v2, package/resource formats, export behavior, map rendering, or layout algorithm semantics.
- Do not edit the unrelated `server/index.ts` working-tree change.
- Do not install dependencies or change the lockfile.
- Continue to use `createId()` for new IDs; never use `crypto.randomUUID()`.
- Full validation is serialized because this VM has 2 CPUs and approximately 2 GiB RAM.

---

## Task 1: Enforce Nested Agent Mutation Guards

**Description:** Close bypasses left by the top-level property allowlists. `update_province.appearance` must not introduce a data URL or unknown asset reference. `manage_students.update_fact` must only edit the declared factual fields and must not spread arbitrary fields into a student.

**Files:**
- Modify: `server/ai/patch-validator.ts`
- Modify: `server/ai/patch-validator.test.ts`
- Modify: `server/ai/agent-loop.ts`
- Modify: `server/ai/agent-loop.test.ts`
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session.test.ts`

**Acceptance criteria:**
- [x] A model call that uses an unknown tool name is rejected before the browser receives an executable call.
- [x] A province texture patch with a `data:` URL is rejected by both the server and browser guard.
- [x] A province texture patch may only refer to an asset ID returned by the browser's current asset pool; a missing asset is rejected on the browser side.
- [x] `manage_students.update_fact` changes only `name`, `university`, `city`, and `province`; other fields such as `id`, `visibility`, or arbitrary properties are rejected rather than spread.
- [x] Existing valid style, asset lookup, student visibility, and allowed fact-edit flows remain functional.

**TDD steps:**
1. Add one server-loop regression for an unknown tool call and one for a province `data:` URL. Run `npx vitest run server/ai/agent-loop.test.ts`; confirm the new assertions fail against the current code.
2. Add one browser-session regression for a `data:` province appearance and one for arbitrary student fields. Run `npx vitest run src/lib/agent-session.test.ts`; confirm failure.
3. Add focused validators that return structured rejection content without exposing source bytes. Use existing `ALL_TOOL_NAMES`/`validateScenePatch` patterns rather than a second command schema.
4. Implement the client-side asset-pool and student-field checks at the `AgentSession.execute` boundary, before calling `updateSceneTarget` or spreading fields.
5. Run `npx vitest run server/ai/patch-validator.test.ts server/ai/agent-loop.test.ts src/lib/agent-session.test.ts` and `npx tsc -p tsconfig.app.json --noEmit`.

**Dependencies:** None.

**Estimated scope:** Medium, 6 files.

---

## Task 2: Apply AI Proposals as Narrow Operations

**Description:** Replace the full shadow-project replacement in `AgentSession.transaction()` with a project-difference application. This preserves user edits made after a proposal began when they do not overlap an AI-edited field.

**Files:**
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session.test.ts`
- Reuse without modification: `src/lib/collaboration-operations.ts`

**Acceptance criteria:**
- [x] An AI map-width proposal applied after a manual title edit retains both the map width and the latest title content.
- [x] The same accepted proposal remains one `ProjectTransaction`, so one undo restores the pre-apply project state.
- [x] The transaction does not copy shadow `history`, schema version, or unrelated current fields over the latest document.
- [x] The transaction maintains existing normalization through `updateSceneTarget` and `applyTransaction`.

**TDD steps:**
1. Add a failing regression that creates a session from an initial project, performs an AI map patch, manually changes an unrelated text field in a current project, then applies the agent transaction and asserts both edits remain.
2. Run `npx vitest run src/lib/agent-session.test.ts`; confirm it fails because the current implementation returns the whole shadow snapshot.
3. Store the immutable base snapshot in `AgentSession`, derive operations with `diffCollaborationDocument(base, selectedShadow)`, and apply them with `applyCollaborationOperations(current, operations)` inside the transaction.
4. Preserve `history` and version handling for `applyTransaction`; do not manually increment version.
5. Run the focused session and collaboration operation suites.

**Dependencies:** Task 1.

**Estimated scope:** Small, 2 files.

---

## Task 3: Let Conservative Review Select Write Steps

**Description:** Match the approved design promise of per-change review. The proposal list needs explicit checkboxes, and confirmation must apply only selected successful write steps to the latest project.

**Files:**
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session.test.ts`
- Modify: `src/components/AgentAssistant.tsx`
- Modify: `src/components/AgentAssistant.test.tsx`
- Modify: `src/styles.css` only if checkbox layout needs a focused accessibility adjustment

**Acceptance criteria:**
- [x] Conservative mode shows every successful write step with a checked-by-default checkbox.
- [x] Users can deselect a low/medium-risk step; confirmation applies only selected steps in one transaction.
- [x] High-risk steps remain selected only after their existing explicit confirmation action; no high-risk operation is auto-applied in smart mode.
- [x] Read-only and rejected steps cannot be selected or committed.
- [x] The preview and confirmation labels accurately report the selected count.

**TDD steps:**
1. Add a session regression for two write calls where only one selected step is included in the final transaction.
2. Add a component regression that deselects one proposal row, confirms, and asserts the commit transaction applies only the retained step.
3. Run the two new tests and verify they fail before implementation.
4. Add a selected-step ID input to `AgentSession.transaction(selectedIds)` and rebuild a selected shadow by replaying only successful selected calls from the immutable base snapshot.
5. Add native checkbox controls with labels linked to the visible step text; do not replace semantic controls with decorative elements.
6. Run targeted agent/session/component suites and TypeScript.

**Dependencies:** Task 2.

**Estimated scope:** Medium, 4-5 files.

---

## Task 4: End-to-End Regression, Review, and Progress Record

**Files:**
- Modify: `docs/progress/2026-08-06-agent-safety-and-transaction-integrity.md`
- Modify only files exposed by verification failures.

**Acceptance criteria:**
- [x] Focused Agent suites pass after every task.
- [x] `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass sequentially after the final code change.
- [x] A separate reviewer checks correctness, architecture, security, and test quality against this plan.
- [x] The progress record contains only observed outcomes, exact commands/counts, the pre-existing `server/index.ts` change exclusion, and residual risks.

**Verification order:**
1. `npx vitest run server/ai/patch-validator.test.ts server/ai/agent-loop.test.ts src/lib/agent-session.test.ts src/components/AgentAssistant.test.tsx`
2. `npm test`
3. `npx tsc -p tsconfig.app.json --noEmit`
4. `npm run lint`
5. `npm run build`
6. `git diff --check`

## Dependency Order and Agent Assignment

1. Task 1 is the first implementation slice because it closes direct data-integrity bypasses at the trust boundary.
2. Task 2 depends on the validated mutation set and makes transaction application conflict-aware.
3. Task 3 depends on the transaction API from Task 2.
4. Task 4 is the final quality gate and factual progress record.

The requested `deepseek-v4-flash` subagent will implement only Task 1 in an isolated worktree. It must use TDD, commit its own scoped change, and return the commit SHA plus targeted test evidence. The parent will inspect and cherry-pick the actual commit, then conduct an independent review before advancing.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Nested structures bypass top-level allowlists | High | Validate structured appearance and student payloads on both server and browser boundaries. |
| Full shadow snapshot overwrites recent edits | High | Apply base-to-selected operations to the current project in one transaction. |
| Array replacement makes concurrent edits conflict | Medium | Preserve unrelated object fields now; treat array-level overlap as a deliberate later conflict-policy task and expose it in review. |
| Model-generated tool shapes vary | Medium | Strict server parsing plus browser revalidation and focused malformed-call regressions. |
| Resource exhaustion during CI | Medium | Run only targeted tests during tasks and serialize the full chain once. |

## Explicitly Deferred

- True streamed agent progress over SSE.
- A full semantic conflict resolver for concurrent edits to the same array element.
- New model providers, dependency installation, or browser E2E tooling.
- Template-wide AI application and asset upload automation.
