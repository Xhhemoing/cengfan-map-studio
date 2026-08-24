# Round 1 → Round 2 Briefing
[Model: claude-fable-5-thinking-xhigh]

Inject into every Round-2 agent. Base: `agent/opt-continuous` (post-R1 merge, HEAD `543a569` or later, plus the R2-0 hotfix below). Full review: `.agent_workspace/round-1-review.md`. Quality bar unchanged: no metric, no merge; baseline before optimizing; targeted `npx vitest run <file>` only — never the full suite.

## What landed in Round 1 (all ten merged)

| Task | Module | Outcome |
|---|---|---|
| T1 | `card-layout.ts`, `connector-geometry.ts` | Broad-phase AABB/polygon indexes + allocation-free connector predicates. 400-card −22.2% paired; new obstacle bench −89–95%. Oracle-differential + fuzz tests. |
| T2 | `collaboration-client.ts`, `useCollaborationRoom.ts`, App send-effect | Owned SSE reconnect (re-ticket + backoff + one-live-stream), version-contiguity gating with gap backfill, post-await baseline race fixed. |
| T3 | `server/index.ts` | write-after-end/leave-after-close crash dead; static-stream error handling + TOCTOU close; broadcast stringify-once (memoized per event); heartbeat no longer touches TTL; OPTIONS 204 fixed; nanoid 3.3.18 (lock-only; `xlsx` CDN pin intact). |
| T4 | `server/collaboration.ts` | Viewer leave/refreshMember escalation closed; touch only after successful authorize; O(1) hash-keyed participant/invitation lookup (~47.9×); lifecycle subscriber cap; single-take invitations. |
| T5 | `project-document.ts` | applyTransaction 3× clone+normalize → 1× (−38.4% on 500-student bench); history isolation via readonly Proxy. **Note semantic change: transaction output is no longer re-normalized.** |
| T6 | `collaboration-operations.ts` | Structural compare replaces per-level JSON.stringify; O(n) id-array diff; cycle-safe; 500-seed differential fuzz vs legacy. Diff bench b −94.9%, c −97.6%. |
| T7 | `project-store.ts`, `browser-workspace-store.ts` | versionchange release + blocked grace + pooled reopen; tx.onabort everywhere; single-transaction marker-keyed legacy migration (exactly-once across tabs); corrupted-row tolerance. |
| T8 | `binary-import.ts`, `DataWorkspace.tsx` | Dropped rows reported as `unparsed` with sheet lines + reasons; tiered best-sheet selection; GB18030 CSV fallback; import-generation guard; bounded 10k-row parse. |
| T9 | `export-poster.ts`, `usePosterExport.ts` | Blob/object-URL SVG + `canvas.toBlob` PNG (−42.4% transient bytes); size-scaled timeout (4s+2s/MB+1s/MP, 60s cap); typed `PosterExportError`; export generation guard. Rollback recipe in file header. |
| T10 | `agent-session.ts` | All-or-nothing AI landing (`lastReplayFailure` recorded); `sceneTargetExists` guard; byte-indexed UTF-8 truncation (~19100×). |

## R2-0 — MANDATORY HOTFIX before anything else

The merged tree crashes on every AI landing: `applyTransaction` hands `transaction.apply` a document whose `history` is a Proxy (T5, project-document.ts:214-221); `agent-session.ts:cloneProject` (190-194) runs `structuredClone` on the whole document *before* stripping history → `DataCloneError`. Fix: clone `{ ...project, history: { past: [], future: [] } }` instead. Add an integration test that lands `transactionForSteps` through `applyTransaction` (success + rejected-replay). Owner: whoever takes R2-1, as its first commit — or the orchestrator directly. Nothing else in R2-1's scope starts until this is green.

## Must-not-touch in Round 2 (saturated or frozen)

- `server/ai/*` (transport/loop/budgets) — saturated pre-R1.
- `src/lib/collaboration-operations.ts` — T6 done; API + op vocabulary frozen (server depends on it).
- `src/lib/project-document.ts` — T5 done; the hotfix lives in agent-session, NOT here.
- `src/lib/card-layout.ts`, `src/lib/connector-geometry.ts` — T1 done; solver core frozen this round (R2-2/R2-9 work around it).
- `src/lib/binary-import.ts`, `src/lib/export-poster.ts`, `src/lib/usePosterExport.ts`, `src/lib/browser-workspace-store.ts` — R1-hardened; leave alone.
- Shared read-only as before: `scene-document.ts`, `import-data.ts`, `app-constants.ts`, `ids.ts`. (`project-package.ts` is unfrozen — owned by R2-7 only.)
- SSE wire format (`event: snapshot|members|closed`, one-shot ticket) stays frozen; R2-4's purge notification must reuse the existing `closed` event through existing lifecycle listeners.

## Round-2 tasks (10, disjoint writable sets)

**R2-1 agent-landing-integration** — Fix R2-0, then surface `lastReplayFailure` in the assistant: after `onCommit`, if the session recorded a refusal, show which step failed and why, keep the conversation in a retriable state, and don't leave the no-op version bump invisible (message the user; do NOT edit project-document).
Writable: `src/lib/agent-session.ts|.test.ts`, `src/components/AgentAssistant.tsx`, new `src/components/AgentAssistant.landing.test.tsx`.
Metric/defect: DataCloneError repro above (red→green); UI test: apply with a deleted target → visible failure message, document unchanged.

**R2-2 layout-worker-coalescing** — Latest-only solve execution: a request arriving while one is queued replaces it (generation counter in the protocol; worker checks before solving); measure burst latency (10 rapid requests → time-to-latest-result and total solves executed, target: 10→≤2 solves). Reduce structured-clone volume where cheap.
Writable: `src/components/canvas/useCardLayoutWorker.ts|.test.tsx`, `src/workers/card-layout.worker.ts`, `src/lib/card-layout-worker-protocol.ts`, new `scripts/perf-layout-burst-bench.ts`.
Baseline first: record burst numbers before changing code. Keep the existing stale-response rejection tests green.

**R2-3 collab-send-effect-recovery** — App.tsx send-effect (562-620): (a) VERSION_CONFLICT auto-recovery — backfill via the hook's machinery, re-diff, resubmit once with bounded retry instead of "请重新加入房间"; (b) self-echo suppression using `acknowledged`/`room.lastTxId` so the client's own ops event is skipped instead of relying on idempotence; (c) in-flight submit cancelled/ignored after room switch or unmount.
Writable: `src/App.tsx` (send-effect region only), `src/App.test.tsx`.
Defect repros as red tests first; hook API is frozen (R2-8 owns useCollaborationRoom).

**R2-4 room-purge-lifecycle-notify** — `purgeExpired` (server/collaboration.ts:138-152) must emit `closed` to lifecycle listeners before deleting them, so T3's SSE route ends streams instead of heartbeating a dead room. Decide and test whether an active SSE subscription should extend TTL in a *bounded* way (recommend: no touch, but notify on expiry). Injected-clock tests: idle room with subscribers → subscribers receive `closed` exactly once, streams end, maps empty.
Writable: `server/collaboration.ts|.test.ts`. RoomStore API shape frozen (server/index.ts is R2-5's).

**R2-5 sse-backpressure** — server/index.ts: respect `response.write` returning false (track buffered bytes per subscriber; pause snapshots or disconnect laggards past a cap); guard against multi-MB snapshot events (size limit + metadata-only fallback already exists as `lite` — use it); metric: bounded RSS/buffered bytes with 50 slow subscribers × large events (in-process test with never-drained sockets).
Writable: `server/index.ts|.test.ts`. Wire format frozen; coordinate semantics (not files) with R2-4.

**R2-6 project-list-metadata** — `project-store.list()` (project-store.ts:317-329) getAll's *full packs* (base64 assets included) and parses each just to render the workbench list. Add a metadata projection (name/id/timestamps/counts persisted alongside the pack in the same transaction) with a lazy `get` for the pack; migrate consumers.
Writable: `src/lib/project-store.ts|.test.ts`, `src/lib/editor-project-store.ts`, `src/components/ProjectWorkbench.tsx|.test.tsx`.
Baseline first: new bench listing 10/50 projects with ~5MB packs (fake-indexeddb), record medians pre-change; target ≥5% (expect ≥10×). Build on T7's pool — do not regress its lifecycle tests.

**R2-7 package-size-caps** — `parseProjectPackage`/`restoreProjectPackage` (project-package.ts): byte cap before parse, resource-count and per-data-URL caps, fail-fast typed errors (existing callers just see a thrown error with a user-readable message); kill the double stringify round-trip in `restoreProjectPackage` if measurable.
Writable: `src/lib/project-package.ts|.test.ts`.
Defect: today a 500MB file freezes the tab after `file.text()`; caps must reject before heavy work. Keep serialize format byte-identical (export compatibility).

**R2-8 collab-http-partition** — Every room HTTP call (`collaboration-client.ts`) is a bare `fetch` with no timeout: on a dead network, `submitRoomOperations`/`fetchRoomOperations` hang forever and the send effect sticks at "正在同步". Add AbortController-based deadlines + bounded retry with jitter for idempotent GETs; hook surfaces a distinct "offline" state and the backfill/reconnect paths honor aborts.
Writable: `src/lib/collaboration-client.ts|.test.ts`, `src/lib/useCollaborationRoom.ts|.test.tsx`.
Repro baseline: mock fetch that never settles → prove today's hang; fixed code rejects at deadline and recovers on the next tick. Do not change `subscribeRoom`'s reconnect semantics (T2) beyond abort-awareness.

**R2-9 layout-cache-key** — `createCardLayoutCacheKey` (card-layout-cache.ts:28-48) JSON-serializes every polygon vertex on the UI thread per layout request. Replace with a stable incremental hash (e.g. FNV over coordinates) or caller-supplied geometry version; prove no false cache hits with a collision-focused test (same counts, different coords).
Writable: `src/lib/card-layout-cache.ts|.test.ts`, new `scripts/perf-cache-key-bench.ts`.
Baseline first: key-build time for 34-province geometry × 400 cards, 5-run medians; target ≥5% (expect ≥10×).

**R2-10 workbook-offthread** — Move `XLSX.read` + `sheet_to_json` off the main thread (worker) for xlsx/csv in DataWorkspace; keep T8's generation guard and sheet-selection semantics identical (reuse `parseExcelWorkbook` inside the worker); enforce a file-size cap before reading.
Writable: `src/components/DataWorkspace.tsx|.test.tsx`, new `src/workers/workbook-import.worker.ts`.
Metric: main-thread blocking time for a 10k-row workbook (instrumented in test via task chunks) — baseline first; target ≥5% (expect near-elimination). T8's tests must stay green unmodified except import-path plumbing.

## Ownership cross-check (no file twice)

R2-1 `agent-session.ts|.test`, `AgentAssistant.tsx`, new landing test · R2-2 `useCardLayoutWorker.ts|.test`, `card-layout.worker.ts`, `card-layout-worker-protocol.ts`, new burst bench · R2-3 `App.tsx`, `App.test.tsx` · R2-4 `server/collaboration.ts|.test` · R2-5 `server/index.ts|.test` · R2-6 `project-store.ts|.test`, `editor-project-store.ts`, `ProjectWorkbench.tsx|.test` · R2-7 `project-package.ts|.test` · R2-8 `collaboration-client.ts|.test`, `useCollaborationRoom.ts|.test` · R2-9 `card-layout-cache.ts|.test`, new bench · R2-10 `DataWorkspace.tsx|.test`, new worker.

## Dispatch notes

- R2-0/R2-1 first — the tree is not shippable until the DataCloneError hotfix is green.
- Baseline-before-optimize applies to R2-2, R2-6, R2-9, R2-10 (record 5-run medians in the PR description before touching product code). R2-3/R2-4/R2-5/R2-7/R2-8 are defect-driven: red repro test first.
- Semantic couplings to review together at merge time: R2-4+R2-5 (room expiry ↔ stream teardown), R2-3+R2-8 (send-effect retries ↔ client deadlines; retry budgets must not multiply).
- Known-benign R1 behaviors, do not "fix" without a metric: T6's extra ops on explicit-`undefined` properties (converges); T5's raw transaction output (normalize happens on input clone + restore boundaries); T2 applying own echoed ops (idempotent — R2-3 addresses it properly via lastTxId).
- 36-card layout numbers remain noise (16.6%); gate layout claims on 400-card and the obstacle bench only.
