# Round 2 → Round 3 Briefing
[Model: claude-fable-5-thinking-xhigh]

Inject into every Round-3 agent. Base: `agent/opt-continuous` (post-R2 merge, HEAD `69d54ba` or later, after the orchestrator's full-suite gate). Full review: `.agent_workspace/round-2-review.md`. Quality bar unchanged: no metric, no merge; defect tasks land a red repro first; baseline before optimizing; targeted `npx vitest run <file>` only — never the full suite.

## What landed in Round 2 (all ten merged, no blocker found in review)

| Task | Module | Outcome |
|---|---|---|
| R2-0 | `agent-session.ts` | DataCloneError hotfix (history stripped before structuredClone) + 3 applyTransaction integration tests. |
| R2-1 | `AgentAssistant.tsx` | Landing refusals surfaced via wrapped-apply `commitWithLandingGuard`; retriable completed state; role="alert" message names step + reason + the no-op undo entry. |
| R2-2 | layout worker stack | Latest-only coalescing (hook: 1 in-flight + 1 queued slot; worker: setTimeout coalesce + generation drop). Burst 10→1 worker solve (−85.6% time-to-latest); ≤2 solves through the hook. |
| R2-3 | `App.tsx` send effect | VERSION_CONFLICT self-heal (backfill→rebase→re-diff→resubmit ONCE, budget=1), self-echo suppression via version bump + `lastTxId`, in-flight receipts invalidated on room switch/unmount. |
| R2-4 | `server/collaboration.ts` | `purgeExpired` broadcasts `closed` before deleting (exactly-once, re-entrancy-guarded, throw-safe finally); subscriptions no longer refresh TTL. |
| R2-5 | `server/index.ts` | Per-subscriber byte metering via write callbacks; soft cap pauses droppable events, hard cap destroys laggards; oversized snapshots disconnect (deliberately NOT lite — lite would advance client version without content = permanent fork; verified against `receiveRoomUpdate`). `roomStreamStats()` evidence API. |
| R2-6 | `project-store.ts`, `ProjectWorkbench.tsx` | `project-metadata` sidecar store, same-transaction writes, lazy DB v3; list 50 projects 1043.9ms → 0.302ms (~3456×). Pack fetched lazily via `get(id)`. |
| R2-7 | `project-package.ts` | Typed `ProjectPackageError` + caps (128MB text / 2000 resources / 32MB data-URL / 500 templates) before heavy work; `assertProjectPackageSize` exported for File.size gating; double-stringify removed (42MB restore −39.9%); export byte-identical. |
| R2-8 | `collaboration-client.ts`, `useCollaborationRoom.ts` | AbortController deadlines (GET 6s / upload 20s), idempotent-GET-only jittered retries [250,750], POSTs never replay; room-scoped abort on switch/leave/unmount; `collaborationOffline` flag (transport-only, status enum unchanged). |
| R2-9 | `card-layout-cache.ts` | 64-bit dual-lane geometry hash replaces JSON vertex serialization; key build 3.910ms → 0.656ms; collision test (same counts, different coords). |
| R2-10 | `DataWorkspace.tsx` + new worker | XLSX/CSV decode off-thread reusing T8's `parseExcelWorkbook`; 25MB File.size cap BEFORE reading; transfer-owned buffer; main-thread blocking −98.4% (wall slightly up from per-import worker startup). |

## Round-3 direction

Algorithmic wins are harvested. Round 3 closes: (a) **network-partition remaining holes** — pending diffs don't auto-resend after heal, expired rooms masquerade as "reconnecting", AI client has no deadlines; (b) **protocol/state durability** — a server restart strands every room (in-memory only), shutdown doesn't drain streams; (c) **exception/disaster recovery** — storage open-failure has no degraded mode, quota errors are cryptic, the error boundary can't export the user's data, import size gates aren't wired. **Lock-free/zero-copy stays out of scope: no measured contention survives R2** (layout coalesced, cache key 0.656ms, SSE byte-bounded with stats evidence). Do not add such a task without first producing a measurement that says otherwise.

## Must-not-touch in Round 3 (saturated or frozen)

- `server/ai/*` — saturated pre-R1.
- `src/lib/collaboration-operations.ts` — frozen since T6 (server depends on op vocabulary). Consuming its existing exports is fine.
- `src/lib/card-layout.ts`, `connector-geometry.ts`, `card-layout-cache.ts`, `card-layout-worker-protocol.ts`, `card-layout.worker.ts`, `useCardLayoutWorker.ts` — layout stack done (T1/R2-2/R2-9); no measured hotspot remains.
- `src/lib/project-package.ts` — R2-7 done; re-frozen. R3-1 only *calls* `assertProjectPackageSize`/`parseProjectPackage`.
- `src/lib/binary-import.ts`, `export-poster.ts`, `browser-workspace-store.ts` — R1-hardened; leave alone.
- Shared read-only: `scene-document.ts`, `import-data.ts`, `app-constants.ts`, `ids.ts`, `incremental-workspace-sync.ts`.
- SSE wire format (`event: snapshot|members|closed`, one-shot ticket) stays frozen. R3-4/R3-5 persist and drain rooms; they do not add event types.
- `project-document.ts` is UNFROZEN for R3-6 only. `usePosterExport.ts` is UNFROZEN for R3-1 only (import-gate lines only, do not touch the export pipeline).

## Round-3 tasks (10, disjoint writable sets)

**R3-1 import-size-gate + workbench types** — Wire `assertProjectPackageSize(file.size)` BEFORE `file.text()` in `ProjectWorkbench.importProject` (currently ProjectWorkbench.tsx:178-181 reads a 500MB file fully before rejection) and before the FileReader read in `usePosterExport`'s import path (usePosterExport.ts:125-127). Kill the `sorted as unknown as StoredProject[]` cast (ProjectWorkbench.tsx:210) by typing `ProjectGrid`'s props against a metadata-shaped view (`Pick`/`ProjectListItem`) instead of `StoredProject`. If R3-8 lands a store `health` field, render its degraded-mode notice here (coordinate semantics, not files).
Writable: `src/components/ProjectWorkbench.tsx|.test.tsx`, `src/lib/usePosterExport.ts|.test.tsx`, `src/components/workbench/ProjectGrid.tsx`.
Defect repro first: a `File` with `size` over the cap must be rejected with the R2-7 typed message WITHOUT `text()`/`readAsText` ever being invoked (spy on the read method).

**R3-2 partition-heal auto-resend (App)** — Today a diff whose submit timed out is only re-attempted when the user edits again (send-effect deps at App.tsx:720 exclude any reconnect signal). Re-arm the effect when the connection heals: trigger on the hook's offline→online transition and/or `roomVersion` advance (R3-3 exposes the signal), re-diff against the current baseline, submit if non-empty. Also route submit-path transport failures into the offline signal (R3-3 exposes a setter) so the panel story is coherent, and thread the new ProjectMenu props (App owns the render site at App.tsx:1532).
Writable: `src/App.tsx`, `src/App.test.tsx`.
Defect repro first: edit during partition → submit rejects at deadline → stream event arrives (heal) → with NO further edit, the pending operations upload and the baseline converges. Retry budgets: reuse R2-3's conflict budget; the resend is one shot per heal, never a loop.

**R3-3 offline/terminal taxonomy (hook + panel)** — Close the "正在自动重连" lie: when a reconnect ticket or backfill fails with ROOM_NOT_FOUND after the room expired/purged (see R2-5 residual), the hook must enter a terminal "房间已过期/已失效" state (message + status), not promise a reconnect that `subscribeRoom` already abandoned (terminal ticket codes stop the loop silently today). Add a `window` `online` listener that nudges an immediate backfill/reconnect instead of waiting out the backoff. Expose the offline→online transition (callback or state) and an offline setter for R3-2. Wire `collaborationOffline` + the terminal state into `ProjectMenu` (currently renders only status/message; `collaborationOffline` has zero UI consumers).
Writable: `src/lib/useCollaborationRoom.ts|.test.tsx`, `src/lib/collaboration-client.ts|.test.ts`, `src/components/ProjectMenu.tsx`, new `src/components/ProjectMenu.collab.test.tsx`.
Do not change reconnect delays or wire format; `subscribeRoom` gains at most a terminal-reason callback.

**R3-4 room store persistence** — Rooms are process-memory only: every deploy/crash strands all rooms (clients then hit ROOM_NOT_FOUND). Add snapshot/restore to `createRoomStore`: serialize rooms + hashed access records + invitations + operation history + lastActivity to a pluggable sink (injected `persist` callback + `restore` input option; server wiring is R3-5's). Interval + explicit `flush()`; TTL honored across restart via persisted lastActivity (an expired room must not resurrect). Injected-clock tests.
Writable: `server/collaboration.ts|.test.ts`.
Metric/defect: build store → transact → snapshot → construct new store from snapshot → same tokens authorize, version/history/invitations intact, expired rooms stay dead. Secrets stay hashed in the snapshot (never persist raw tokens).

**R3-5 graceful shutdown + boot restore (server)** — Wire R3-4's flush into `createServerLifecycle` alongside `flushAiState` (server/index.ts:1314); on drain, end all SSE streams cleanly (reuse teardown; clients auto-reconnect after restart — do NOT emit `closed`, the rooms survive now) and bound in-flight request completion by the existing shutdownTimeoutMs; restore the room store from the persisted snapshot on boot.
Writable: `server/index.ts|.test.ts`, `server/production.ts|.test.ts` (only if the lifecycle needs an extra hook).
Defect repro first: SIGTERM with live SSE streams → streams end, room flush ran, port closed within deadline; boot with a snapshot → previously-created room answers `fetchRoom`.

**R3-6 rejected landing stops polluting history** — T5 residual: a refused AI landing still burns a version bump + no-op history entry (pinned by R2-0's test and apologized for in R2-1's message). Fix at the root: `applyTransaction` (project-document.ts:242-272) detects the rejection contract — `transaction.apply` returning its input document by identity (`applied === cloned`) — and returns `project` unchanged (no version bump, no history entry). Document the contract at `cloneProjectForTransaction`. Update the R2-0 integration expectations in `agent-session.test.ts` (currently assert version+1/history+1) and strip the "撤销栈里会多出一条空操作" caveat from `AgentAssistant.tsx:landingFailureMessage` + landing tests.
Writable: `src/lib/project-document.ts|.test.ts`, `src/lib/agent-session.test.ts`, `src/components/AgentAssistant.tsx`, `src/components/AgentAssistant.landing.test.tsx`.
Red test first: land a rejected replay through applyTransaction → version and history must be UNCHANGED (currently fails). Keep every other applyTransaction test green; do not re-normalize output (T5 semantics stay).

**R3-7 AI client deadlines** — `agent-session.ts`'s loop fetches (`/api/ai/agent`) are bare: a partition mid-run hangs the assistant at "running" until manual cancel. Add AbortController deadlines per request (generous — model calls are slow; ~90s default, injectable), a typed timeout failure distinct from user cancel, and land the conversation in a retriable failed state with a network-specific message. Keep `activeController` cancel semantics and budget accounting intact.
Writable: `src/lib/agent-session.ts`, new `src/lib/agent-session.deadline.test.ts`. **Do NOT edit `agent-session.test.ts` (R3-6 owns it this round).**
Defect repro first: never-settling fetch → run() rejects at deadline, `canContinue` true, budget not corrupted.

**R3-8 project-store failure taxonomy + degraded mode** — Persistent IndexedDB open failure (Firefox private mode, corrupted DB) currently bubbles a raw error into the workbench with no path forward. Add: (a) degraded in-memory fallback after open retries exhaust, observable via a `health` field (`"persistent" | "memory"`) so R3-1 can render a "本次编辑不会保存到本机" notice; (b) map QuotaExceededError aborts to a typed, user-readable error ("本机存储空间不足…"); (c) a reconcile pass on open that projects metadata for any `projects` row missing its sidecar row (closes the R2-6 stale-tab write hole).
Writable: `src/lib/project-store.ts|.test.ts`, `src/lib/project-store-upgrade.test.ts`.
Red tests first: always-failing factory → list/get/put work in memory + health flag; quota-abort → typed message; projects row without metadata row → appears in list() after reopen. Do not regress T7 lifecycle tests.

**R3-9 workbook worker lifecycle** — R2-10 honestly recorded wall time "slightly up": a fresh Worker per import re-parses the xlsx module every time, and a wedged/pathological file parses forever (off-thread, but the import UX hangs). Reuse one worker across imports with an idle-teardown timer; add a parse deadline (terminate + "解析超时，文件可能已损坏" message; next import spawns fresh). Keep the generation guard, transfer semantics, cancellation symbol, and 25MB cap identical.
Writable: `src/components/DataWorkspace.tsx|.test.tsx`, `src/workers/workbook-import.worker.ts`.
Baseline first: measure second-import wall time (worker cold vs reused) before changing code; target ≥5% on the repeat-import path. Red deadline test: worker that never responds → user message at deadline, next import works.

**R3-10 disaster-recovery export in the error boundary** — `AppErrorBoundary` (exists, basic) offers only re-render/navigate; a user whose editor crash-loops has no way to extract their work even though the workspace mirror sits in localStorage. Add a "导出工程备份" action: read the mirror via the existing loader, build a package with the existing serializer, download via the existing helpers; show a clear failure note if the mirror is empty/corrupt. Structured console detail for bug reports.
Writable: `src/components/AppErrorBoundary.tsx`, new/extend `src/components/AppErrorBoundary.test.tsx`, `src/main.tsx` (only if wiring requires a prop).
Defect repro first: boundary triggered → export click yields a blob whose text round-trips through `parseProjectPackage`. No form refactor: the boundary's existing actions/markup stay.

## Ownership cross-check (no file twice)

R3-1 `ProjectWorkbench.tsx|.test`, `usePosterExport.ts|.test`, `workbench/ProjectGrid.tsx` · R3-2 `App.tsx|.test` · R3-3 `useCollaborationRoom.ts|.test`, `collaboration-client.ts|.test`, `ProjectMenu.tsx`, new collab panel test · R3-4 `server/collaboration.ts|.test` · R3-5 `server/index.ts|.test`, `server/production.ts|.test` · R3-6 `project-document.ts|.test`, `agent-session.test.ts`, `AgentAssistant.tsx`, `AgentAssistant.landing.test.tsx` · R3-7 `agent-session.ts`, new deadline test · R3-8 `project-store.ts|.test`, `project-store-upgrade.test.ts` · R3-9 `DataWorkspace.tsx|.test`, `workbook-import.worker.ts` · R3-10 `AppErrorBoundary.tsx|.test`, `main.tsx`.

Note the deliberate module split: R3-6 owns `agent-session.test.ts` (expectation updates for the history fix) while R3-7 owns `agent-session.ts` (deadlines) with a NEW test file — R3-7 must not change behavior the existing tests assert, and R3-6 must not touch `agent-session.ts`.

## Dispatch notes

- All ten are defect/durability-driven: red repro test first, everywhere. Baseline-before-optimize applies only to R3-9's worker-reuse half.
- Semantic couplings to review together at merge time: **R3-2 + R3-3** (offline signal producer/consumer; resend triggers exactly once per heal — budgets must not stack with R2-3's conflict retry or R2-8's GET retries), **R3-4 + R3-5** (persistence sink ↔ lifecycle flush/restore; TTL across restart), **R3-1 + R3-8** (health flag render — optional, R3-1 must not block on it).
- R3-6 changes observable semantics (no more version bump on refused landing) — record it in the PR description; R2-1's user-facing message text must land in the same merge as the project-document change, never split.
- Known-benign behaviors, do not "fix" without a metric: R2-2's uncached superseded solves; R2-10's per-import worker (R3-9 measures it first); laggards missing the `closed` frame at purge (R3-3 fixes the *messaging*, not the frame delivery); T6's explicit-`undefined` extra ops.
- PR #14: draft until the orchestrator's full-suite + lint gate on the merged tree passes and the description carries R2 metrics + rollback notes; after that, ready-for-review — Round-2 review found no code blocker.
