# Round 3 → Round 4 Briefing
[Model: claude-fable-5-thinking-xhigh]

Inject into every Round-4 agent. Base: `agent/opt-continuous` at HEAD `7d958e9` **plus the R4-1 hotfix, which merges before anything else** (see below). Full review: `.agent_workspace/round-3-review.md`. Quality bar unchanged: no metric, no merge; defect tasks land a red repro first; baseline before optimizing; targeted `npx vitest run <file>` only — never the full suite.

## What landed in Round 3 (all ten merged; ONE compile blocker found in review)

| Task | Module | Outcome |
|---|---|---|
| R3-1 | ProjectWorkbench, usePosterExport, ProjectGrid/Card | `assertProjectPackageSize(file.size)` before both reads (spy-verified never-read tests); `StoredProject` double cast replaced by `ProjectGridItem`/metadata `Pick` types. |
| R3-2 | App.tsx | Heal-signal effect (offline→online + roomVersion advance, per-room watermark) arms a one-shot resend that bypasses self-echo suppression once; `advanceRoomVersion` pre-raises the watermark so ack/conflict version bumps never read as heals (R2-3 budget cannot stack). Transport-failure copy: "本地修改已保留，恢复后会自动续传". |
| R3-3 | collaboration-client, useCollaborationRoom, ProjectMenu | `onTerminal` (fires before `onError`); terminal `roomExpired` state from ticket/backfill/join paths, credential dropped; `window online` nudge remounts the stream + immediate backfill (backoff untouched); `connectionHealCount` + `setCollaborationOffline` exported; ProjectMenu terminal/offline panels behind optional props. |
| R3-4 | server/collaboration.ts | Versioned snapshot/restore (hashed tokens only, per-record validation, TTL honored across restart, maxRooms cap), precise dirty tracking, serialized `flush()` with failure surfacing, unref'd dirty-gated interval. |
| R3-5 | server/index.ts, production.ts | Lifecycle drain hook (SSE ended WITHOUT `closed`, rooms survive restart), close+flush dual completion, deadline force-cut; boot restore from `collaboration-rooms.json`; atomic 0600 temp+rename persist. **Broke `tsc`** — see blocker. |
| R3-6 | project-document, AgentAssistant | Rejection contract: `apply` returning its input by identity commits nothing (no version bump, no history entry, redo branch preserved); spread-copy boundary pinned; caveat text updated in the same commit. Observable-semantics change — record in PR. |
| R3-7 | agent-session.ts | Per-request self-settling 90s deadline (injectable) covering body reads and abort-ignoring transports; typed retriable `timeout`/`network` failures distinct from cancel; budget/taskId intact; `canContinue` true after transport failure. |
| R3-8 | project-store.ts | Open-retry → sticky in-memory degrade with `health`/`onHealthChange`; quota aborts → typed "本机存储空间不足…"; open-time metadata reconcile closes R2-6's stale-tab hole. |
| R3-9 | DataWorkspace.tsx | One reused worker + 30s idle teardown + 30s parse deadline ("解析超时，文件可能已损坏"), fresh worker after any failure; guards/caps/sentinel unchanged. Claimed 62.3% repeat-import win has NO in-repo bench (debt → R4-9). |
| R3-10 | AppErrorBoundary.tsx | "导出工程备份" from the crash screen via existing mirror loader + package downloader; empty/corrupt/unreadable/blocked taxonomy; structured console diagnostics; round-trip test through `parseProjectPackage`. |

## THE BLOCKER (read before doing anything)

`7d958e9` does not compile: `tsc -p tsconfig.node.json` fails with 3 errors from one root cause — `server/index.ts:45` redeclares `restore?: unknown` against R3-4's `restore?: RoomStoreSnapshot` (TS2430), plus assignability failures at index.ts:469 and index.test.ts:262. `npm run build` runs `tsc -b` → **production builds are broken**, and the vitest+eslint gate is blind to it (esbuild strips types; `eslint.config.mjs` has `projectService: false`). R4-1 is the hotfix and merges FIRST; the orchestrator runs `tsc -b` at every merge point this round (and R4-9 makes that permanent). Do not revert R3-5 — runtime behavior is correct and tested.

## Round-4 direction

Round 3 landed the durability layer but stranded most of its user-visible surface: every producer capability shipped this round has zero consumers (`health`, `roomExpired`, `connectionHealCount`, `setCollaborationOffline`, `canContinue`/`retriable`, ProjectMenu's panels). Round 4 = (a) the compile hotfix + gate hardening, (b) consumer-side wiring of the R3 taxonomy into App / workbench / assistant, (c) the last protocol unknown (ack-lost submit convergence — untested), (d) disaster-recovery breadth (workbench-crash export, degraded-store recovery), (e) paying the measurement debts (room-snapshot serialize cost, workbook bench). **Lock-free/zero-copy stays out of scope: no measurement in R3 shows contention anywhere.** The single new unmeasured hot path is room-snapshot `JSON.stringify` on the event loop — R4-4 must produce that measurement BEFORE changing code, and any optimization beyond bounding is out unless the number says otherwise.

## Must-not-touch in Round 4 (saturated or frozen)

- `server/ai/*` — saturated pre-R1.
- `src/lib/collaboration-operations.ts` — frozen since T6. Consuming exports is fine.
- Layout stack (`card-layout*.ts`, `connector-geometry.ts`, `useCardLayoutWorker.ts`) — done since R2; no measured hotspot.
- `src/lib/project-package.ts`, `binary-import.ts`, `export-poster.ts`, `browser-workspace-store.ts` — hardened, frozen. Call-only.
- `src/lib/project-document.ts` — R3-6 landed the rejection contract; re-frozen. The identity contract is now API: never "fix" a transaction to return a copy on refusal.
- `src/lib/useCollaborationRoom.ts`, `collaboration-client.ts` — R3-3 complete; Round 4 consumes `roomExpired`/`connectionHealCount`/`setCollaborationOffline`, does not edit. (Exception: if R4-6 proves divergence, the orchestrator reopens the owning file in a follow-up slot — do not preemptively unfreeze.)
- `src/lib/agent-session.ts` — R3-7 complete; R4-8 consumes `canContinue`/`retriable`/`reason` only.
- `src/components/ProjectMenu.tsx` — props already exist and are optional; R4-2 threads them from App with NO ProjectMenu edit.
- `src/components/DataWorkspace.tsx`, `src/workers/workbook-import.worker.ts` — R3-9 done; R4-9 benches without editing product code.
- SSE wire format (`event: snapshot|members|closed`, one-shot ticket) stays frozen. Restart-drain deliberately does NOT emit `closed` — preserve that.
- Shared read-only: `scene-document.ts`, `import-data.ts`, `app-constants.ts`, `ids.ts`, `incremental-workspace-sync.ts`.

## Round-4 tasks (10, disjoint writable sets)

**R4-1 server type-seam hotfix + boot observability (MERGES FIRST)** — Fix the blocker: `RoomStoreFactoryOptions` stops redeclaring `restore`/`persist` (inherit R3-4's `RoomStoreSnapshot` types from `RoomStoreOptions`); keep `unknown` only at the outermost file-read boundary (`loadRoomSnapshot`) with ONE commented cast at the seam — safe because `createRoomStore` fully validates the payload at runtime. Fix the index.test.ts:262 shape. While in the file: a corrupt `collaboration-rooms.json` should be renamed to a `.bad` sidecar (not just warned past — the evidence currently gets overwritten by the next flush), and boot should log restored-room count.
Writable: `server/index.ts|.test.ts`.
Gate: `npx tsc -p tsconfig.node.json --noEmit` exits 0 (this IS the red repro — it fails today); existing index tests stay green.

**R4-2 App threads the partition taxonomy** — Close all three wiring gaps from review cross-task 1: (a) gate the send effect on `collaboration.roomExpired` (App.tsx:624 currently checks only `roomClosed`) so an expired room gets zero doomed POSTs and the hook's terminal message survives; (b) resolve the `TODO(R3-3)` at App.tsx:733 — submit-path transport failures call `collaboration.setCollaborationOffline(true)` so submit-only partitions join the offline story AND become heal-detectable; (c) pass `roomExpired={collaboration.roomExpired}` and `collaborationOffline={collaboration.collaborationOffline}` at the ProjectMenu site (App.tsx:1575) — no ProjectMenu edit needed. Watch the interaction: once (b) lands, the offline flag can now be set by App's own submit failure and cleared by the hook's `markOnline` — verify the heal watermark still fires exactly one resend (consider consuming `connectionHealCount` as the offline-heal signal instead of the raw flag transition; keep `roomVersion` advance as the second signal).
Writable: `src/App.tsx|.test.tsx`.
Red repros first: (1) room expires during partition → NO resend POST + panel shows the terminal copy (`data-collaboration-terminal="expired"`); (2) submit timeout with healthy stream → offline banner visible; heal → exactly one resend.

**R4-3 workbench degraded-storage notice + quota surfacing** — Wire R3-8 into the UI: `main.tsx` constructs `workbenchStore` with `onHealthChange`; `ProjectWorkbench` renders a persistent, dismiss-proof notice when `health === "memory"` ("本次编辑不会保存到本机，请及时导出工程备份" + an export affordance) and surfaces `ProjectStoreError.message` (quota text included) from put/duplicate/import failure paths instead of generic copy. Check `store.health` at mount too (degrade may precede render). The editor-route notice is explicitly OUT of scope (App.tsx belongs to R4-2) — note the deferral in the merge message.
Writable: `src/components/ProjectWorkbench.tsx|.test.tsx`, `src/main.tsx`.
Red repro first: store stub with failing factory → workbench still lists/creates projects AND shows the memory-mode notice; quota-rejecting `put` → the exact "本机存储空间不足" message reaches the user.

**R4-4 room-snapshot payload cost: measure, then bound** — `CollaborationRoom.snapshot` embeds the full project package, so `snapshot()` + `JSON.stringify` runs multi-MB serialization on the event loop per dirty interval. Baseline FIRST (bench script, R2 pattern: land it before product code): rooms×pack-size grid (e.g. 3 rooms × 5/20/40MB packs), median `snapshot()` time, stringify time, output bytes. If the 40MB point exceeds ~50ms event-loop occupancy, implement a recorded policy — candidates: cap persisted `operationHistory` harder, per-room persisted-bytes cap with skip+count (a skipped room dies at restart exactly like pre-R3-4; that is the documented fallback, not corruption), or serialize during flush off the hot path. If the measurement says it's cheap, record the numbers and STOP — no speculative work.
Writable: `server/collaboration.ts|.test.ts`, new `scripts/perf-room-snapshot-bench.ts`.
No metric, no merge: the bench numbers go in the merge message either way.

**R4-5 lifecycle flush-failure surfacing + signal idempotence** — `createServerLifecycle`'s drain→flush chain swallows flush failures (`.catch(() => undefined)` in production.ts): a disk-full shutdown silently loses every room and AI state with exit code 0. Add an `onFlushError` hook (default: `console.error`) so operators see it, and make repeated shutdown signals safe (second SIGTERM/SIGINT during drain must not double-run drain/flush or throw — today `shutdownPromise` memoizes, verify + pin with a test). Keep the deadline force-cut semantics identical.
Writable: `server/production.ts|.test.ts`.
Red repro first: flush that rejects → shutdown still completes within deadline AND the error reaches the hook; double-signal → drain/flush run once.

**R4-6 ack-lost submit convergence proof (test-only)** — The one untested protocol corner: a submit POST that LANDS server-side but whose response is lost. Client sees a transport error (baseline not advanced), R3-2's heal then re-diffs and resubmits the same logical change with a NEW txId at a stale baseVersion. Expected path: VERSION_CONFLICT → R2-3 backfill returns the client's own ops as remote → rebase → re-diff empty → converged. Prove it: drive `diffCollaborationDocument`/`rebaseRemoteCollaborationOperations` and a real `createRoomStore` through the full sequence (server store and client libs are both importable in vitest) and assert final server snapshot ≡ client baseline, no duplicated operation effects, version monotone. Also pin the server's txId dedupe behavior (same txId re-POST). If you find divergence: do NOT fix across files — land the red test `.fails`-marked with a precise diagnosis in the merge message and flag the orchestrator to schedule the owning-file fix.
Writable: new `src/lib/collaboration-convergence.test.ts` only.

**R4-7 crash export for workbench data** — R3-10 exports only the editor's localStorage mirror; a crash on the workbench route (IndexedDB projects, no mirror) still traps everything. Extend the boundary: when the mirror is empty/corrupt, fall back to enumerating IndexedDB projects (consume `createIndexedDbProjectStore().list()` / `get()` read-only — R4-10 owns the store file, coordinate on semantics not files) and offer per-project package download; keep the existing mirror path primary and the existing taxonomy intact. Handle the degraded store (`health === "memory"`) honestly: nothing to export from disk → say so.
Writable: `src/components/AppErrorBoundary.tsx|.test.tsx`.
Red repro first: empty mirror + two stored projects → both exportable, each round-tripping through `parseProjectPackage`.

**R4-8 assistant resume after transport failure** — R3-7's retriable state is unreachable: `AgentAssistant.tsx:447` treats `status === "failed"` as fresh, so a user retry after a partition RESTARTS the conversation (wiping context) instead of resuming. Consume the new outcome fields: when `outcome.kind === "failed"` with `retriable`, keep the conversation, show the network-specific message plus a "网络恢复后重试" action that calls `session.run(message, { continue: true })` (pinned by R3-7's test to preserve budget/taskId/conversation); non-retriable failures keep today's restart behavior. Preserve every existing conversation-lifecycle behavior (R2-1 landing guard untouched).
Writable: `src/components/AgentAssistant.tsx`, new `src/components/AgentAssistant.transport.test.tsx`. Do NOT touch `agent-session.ts` or its test files.
Red repro first: deadline-failed run → retry action visible → resumed run reuses the same conversation (assert the request body's `messages` is non-empty on the retry).

**R4-9 typecheck gate + workbook bench debt** — Process hardening so the R3-5 class of break cannot land silently: add `"typecheck": "tsc -b --noEmit"` (or per-project equivalents) to package.json and document in PROGRESS that the orchestrator's merge gate is now full-suite + lint + typecheck. Do NOT enable eslint `projectService` (that is a repo-wide lint migration, out of scope). Second half: land the missing R3-9 bench — a reproducible repeat-import benchmark for the workbook path; if a faithful browser-Worker cold-vs-warm measurement is impractical under Node, approximate (e.g. child-process spawn per import vs reuse around `parseWorkbookImport`) and document the methodology + limits in the script header. Record numbers in the merge message; if the reuse win cannot be reproduced within ±half of the claimed 62.3%, say so plainly — the review flagged the claim as unverified.
Writable: `package.json`, new `scripts/perf-workbook-bench.ts`, `.agent_workspace/PROGRESS.md` (gate-description line only).

**R4-10 degraded-store recovery** — R3-8's degrade is sticky and lossy at the edges: one transient open failure (2 attempts, 120ms) forfeits persistence for the session AND hides previously-persisted projects from `list()`. Add recovery without breaking the sticky simplicity callers rely on: (a) while degraded, a low-frequency background re-open probe (injectable interval/clock); (b) on success, write memory-store contents back (same-transaction semantics, newest-wins on id collision against what's on disk — document the choice), merge disk projects into `list()`, flip `health` back to `"persistent"`, fire `onHealthChange`; (c) if write-back hits quota, stay degraded and surface the typed quota error. Keep every R3-8 test green — sticky behavior within a probe interval must be unchanged.
Writable: `src/lib/project-store.ts|.test.ts`.
Red repro first: factory fails twice then recovers → project created while degraded appears in a fresh persistent store's `list()`; health transitions memory→persistent exactly once.

## Ownership cross-check (no file twice)

R4-1 `server/index.ts|.test.ts` · R4-2 `src/App.tsx|.test.tsx` · R4-3 `ProjectWorkbench.tsx|.test.tsx`, `src/main.tsx` · R4-4 `server/collaboration.ts|.test.ts`, new `scripts/perf-room-snapshot-bench.ts` · R4-5 `server/production.ts|.test.ts` · R4-6 new `src/lib/collaboration-convergence.test.ts` · R4-7 `AppErrorBoundary.tsx|.test.tsx` · R4-8 `AgentAssistant.tsx`, new `AgentAssistant.transport.test.tsx` · R4-9 `package.json`, new `scripts/perf-workbook-bench.ts`, `PROGRESS.md` (one line) · R4-10 `src/lib/project-store.ts|.test.ts`.

Consumption-only (no edits): R4-2 reads `useCollaborationRoom` exports; R4-3/R4-7 read `project-store` exports (R4-10 owns the file — if R4-10 changes `health` semantics, it must keep the exported type stable); R4-8 reads `agent-session` exports; R4-6 imports server + client libs.

## Dispatch notes

- **Merge order matters this round**: R4-1 first, `tsc -b` green, THEN the rest in any order. The orchestrator runs `tsc -b` at every subsequent merge until R4-9's gate line lands.
- Semantic couplings to review together at merge time: **R4-2 + R4-6** (both exercise the resend path — R4-6's convergence claims must hold against R4-2's roomExpired gate), **R4-3 + R4-10** (health flag semantics: R4-10 adds the memory→persistent transition, R4-3's notice must clear on it — R4-3 should subscribe to `onHealthChange`, not snapshot once), **R4-7 + R4-10** (crash export while degraded).
- R4-2 changes when POSTs fire (expired-room gate) — record in the PR; rollback = revert commit, no format changes.
- R4-10 changes durability semantics (write-back on recovery) — record the collision policy and rollback (revert restores sticky-degrade; no schema change).
- Known-benign, do not "fix" without a metric: R3-2's extra re-diff per remote event; R3-9's terminate-on-supersede (cold worker after cancel is correctness-first); the dead-but-defensive optional-`flush` branch in `server/index.ts:flushRooms`; T6's explicit-`undefined` ops.
- PR #14: **draft** until (1) R4-1 merged + `tsc -b` green, (2) full `npm test` + `npm run lint` green on the merged tree, (3) description updated with R3 outcomes (rooms survive restart; refused landings no longer bump version — semantics change; import gates wired; degraded storage; crash export) + the R3-9 bench status + rollback notes. All three met → ready-for-review.
