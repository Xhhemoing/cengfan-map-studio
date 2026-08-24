# SOTA Continuous Optimization — Progress Ledger

Integration branch: `agent/opt-continuous`  
PR: https://github.com/Xhhemoing/cengfan-map-studio/pull/14  
Base: `origin/main` @ `897a2a6`  
Start: 2026-08-24  
Quality bar: SOTA. No metric, no merge. No cosmetic refactors.

## Orchestrator Protocol

- Parent writes only this ledger and round briefings.
- Code is produced by subagents (`opus-fast`, `gpt-sol`) after `fable` audit.
- Each round: audit → 10 parallel tasks → tests/metrics → fable review → merge/rollback.
- Saturation: if a module gains <2% for 2 consecutive rounds, next round leaves it.

## Round Status

| Round | Status | Merged | Rolled back | Notes |
| --- | --- | --- | --- | --- |
| 1 | CLOSED | T1–T10 + R2-0 | — | Hotfix-after full suite 1391 pass / 1 skip |
| 2 | CLOSED | R2-0–R2-10 | — | Full suite 1436 pass / 2 skip; fable 10/10 ACCEPT; lint 1 unused-assign fixed |
| 3 | CLOSED | R3-1–R3-10 | — | Vitest 1497 pass / 2 skip; **tsc node broken** (R3-5 restore?: unknown vs RoomStoreSnapshot). PR stays draft. |
| 4 | CLOSED | R4-1–R4-10 | — | Full suite 1534 pass / 2 skip; lint 0 err; fable 5 ACCEPT + 5 NITS; no blocker. 5 MiB cap calibrate in R5-1. |
| 5 | CLOSED | R5-1–R5-9 | — | Full suite 1568/2; lint 0 err; fable 7 ACCEPT + 2 NITS; no blocker. PR ready after this closeout. |
| 6 | CLOSED | R6-1–R6-9 + R6-5b | — | Full suite 181/1656/2; lint 0 err / 7 warn; fable 6 ACCEPT + 4 NITS; no blocker. |
| 7 | CLOSED | R7-1–R7-9 + R7-3b + R7-10 | — | 189/1757/2; lint 0/6; CI `362c318`; fable 8 ACCEPT + 2 NITS; no blocker. |
| 8 | IN_PROGRESS | R8-1–R8-9 + R8-3b | — | Code complete. Awaiting full gates, fable, R8-10. |

## Round 0 Baseline (pre-optimization)

- Test command: `npx vitest run` (full suite via `scripts/run-heavy.mjs` for CI)
- Perf command: `npm run perf:layout`
- Known hotspots: `src/App.tsx` (2466), `src/styles.css` (3732), `PosterCanvas.tsx` (1588), `card-layout.ts` (~1300), `server/index.ts` (1076)
- Prior unmerged campaign: `origin/cursor/sota-campaign-6231` (31+ rounds, mainly import/collab/ai/export fixes). Treat as reference, not a dump.
- Layout bench (5-run median): 36=31.4ms, 60=31.9ms, 100=28.5ms, 200=50.1ms, **400=95.2ms** (gate on 400-card; 36-card noise is 16.6%). Bench currently skips `occupiedPolygons`, so production `optimizedLayout` is unmeasured.
- Representative tests: layout 44/44 in 2.445s wall; canvas perf 1/1 in 1.563s; collab/API 72/72 in 0.921s.
- `npm audit`: high `nanoid@3.3.17` via Vite/PostCSS (`GHSA-2v37-7h3g-55p8`). Targeted bump to `3.3.18` without touching pinned `xlsx`.
- Top Round-1 hypotheses: (1) EventSource re-ticket + ordered backfill, (2) IndexedDB migration/CAS, (3) spatial index in card-layout, (4) layout-worker coalescing, (5) off-thread import + size caps.
- Full numbers: `.agent_workspace/round-1-baseline.md`

## Round 1 closeout

- Full suite on merged tree: **166 files, 1388 passed / 1 skipped** (`npm test`, 57.6s).
- After R2-0 hotfix: **1391 passed / 1 skipped** (59.7s).
- Fable review: `.agent_workspace/round-1-review.md`. PR stays draft until R2-0 DataCloneError hotfix.
- Round 2 briefing: `.agent_workspace/round-1-briefing.md`.

## Round 2 closeout

- Full suite: **167 files, 1436 passed / 2 skipped** (62.7s).
- Fable: 10/10 ACCEPT, no merge blocker. Review `.agent_workspace/round-2-review.md`.
- Lint: 1 unused-assign in `server/collaboration.test.ts` fixed; 5 pre-existing react-refresh warnings remain.
- Round 3 briefing: `.agent_workspace/round-2-briefing.md`.

## Round 3 closeout

- Vitest on merged tree: **169 files, 1497 passed / 2 skipped**. Lint not re-run this closeout (orchestrator serializes via `run-heavy.mjs`).
- **Compile blocker:** `tsc -p tsconfig.node.json --noEmit` fails (TS2430/TS2345) because R3-5 redeclared `restore?: unknown` against R3-4's `RoomStoreSnapshot`. Vitest/eslint cannot see it. Do not revert R3-5; R4-1 is the type-seam hotfix and merges first.
- Fable: `.agent_workspace/round-3-review.md`. Briefing: `.agent_workspace/round-3-briefing.md`.
- PR #14 stays **draft** until R4-1 + `tsc -b` green, then full suite + lint + description updates (rooms survive restart; refused landing no version bump; `collaboration-rooms.json`; R3-9 bench unverified).

## Round 4 notes

- Merge gate this round includes `npx tsc -p tsconfig.node.json --noEmit` and `npx tsc -p tsconfig.app.json --noEmit` at every merge (R4-9 will make `npm run typecheck` permanent).
- Permanent merge gate: full suite + lint + `npm run typecheck` (`tsc -b --noEmit`).
- R4-1 (`bb92a69`): inherit `RoomStoreSnapshot`; corrupt `collaboration-rooms.json` → `.bad` sidecar; boot logs restored-room count. Do not revert R3-5 runtime.
- R4-6 (`b50d55a`): ack-lost submit converges (2/2). Test imports server store from `src/`; excluded from `tsconfig.app.json` so app `noUnusedParameters` does not fail on pre-existing unused `setAccess` `clientId` (R4-4 owns that file).
- R4-2: send gated on `roomExpired`; submit transport failure sets offline; ProjectMenu gets both props; heal uses `connectionHealCount`.
- R4-3: workbench memory notice + quota text; editor-route notice still deferred.
- R4-4: 3×40MB snapshot occupancy 508ms → 5 MiB per-room persist cap (skipped rooms absent after restart).
- R4-5: `onFlushError`; re-entrant shutdown no longer recurses.
- R4-7: crash export falls back to IndexedDB list when mirror empty.
- R4-8: retriable transport keeps conversation; 网络恢复后重试.
- R4-9: `npm run typecheck`; workbook Node reuse 69.9% faster; browser 62.3% claim unverified.
- R4-10: degrade recovery, newest-wins write-back; quota stays memory.

## Round 4 closeout

- Full suite: **171 files, 1534 passed / 2 skipped** (70.0s).
- Lint: 0 errors, 7 warnings (5 pre-existing react-refresh; DataWorkspace exhaustive-deps; new `main.tsx` react-refresh from WorkbenchRoute). Two `no-control-regex` errors from R4-4/R4-7 silenced with documented disables.
- Typecheck: `npm run typecheck` (`tsc -b --noEmit`) exit 0.
- Fable: `.agent_workspace/round-4-review.md`. Briefing: `.agent_workspace/round-4-briefing.md`. No merge blocker. Persist cap calibrated in R5-1 (8 MiB).

## Round 5 closeout

- Full suite: **172 files, 1568 passed / 2 skipped** (79.5s).
- Lint: 0 errors, 6 warnings (`main.tsx` react-refresh gone after R5-3). Typecheck: `npm run typecheck` exit 0.
- Persist band: 8 MiB per-room and aggregate (8 MiB occupancy ~57ms on R5-1 machine). Rollback = revert R5-1 commits.
- Shared store: one `createIndexedDbProjectStore()` in `editor-project-store.ts`. Rollback = revert R5-3.
- Fable: `.agent_workspace/round-5-review.md`. Briefing: `.agent_workspace/round-5-briefing.md`. 7 ACCEPT + 2 NITS, no blocker. PR #14 ready-for-review.

## Round 6 notes

- Visibility chain: R6-1 → R6-2 → R6-6. Independent: R6-4, R6-5 (copy+extract), R6-7, R6-8. Proofs R6-3/R6-9 after code merges.
- R6-1 (`5bc3b29`): history-first trim before skip; aggregate snapshot budget 12 MiB; envelope `trimmedRoomIds`; `lastPersistOutcome(): { skippedIds, trimmedIds, at }`; interval persist errors deduped. Rollback = revert the merge. Snapshot-only records above 8 MiB remain skipped by design.
- R6-4 (`4d7e3a2` / `af002ab`): shared `StorageNotice`; editor banner drops `workbench-resume`. Rollback = revert the merge. Owned tests 41/41; tsc app+node 0.
- R6-2 (`be82abb` / `e0c7857`): boot warn lists skipped ids; `/api/health.rooms`; create/join/snapshot `persistedAtLastFlush`. Rollback = revert the merge. `server/index.test.ts` 75/75; tsc 0.
- R6-6 (`9f93022` / `b09ed7b`): client parse + `roomPersistenceDegraded` + ProjectMenu note (optional prop; App not wired until R6-5). Rollback = revert the merge. Owned tests 71/71; tsc 0.
- R6-5 (`937337d` / `1e0eecf`): honest missing-project copy; App.tsx 2651→2321. Rollback = revert the merge. Owned tests 182/182; tsc 0.
- R6-5b (`50d5755` / `c06e96c`): App threads `roomPersistenceDegraded` into ProjectMenu. Rollback = revert the merge. `src/App.test.tsx` 129/129.
- R6-3 (`aaddff2` / `9e740d9`): crash-disaster journey green (1/1). Product unchanged. R7: `ProjectWorkbench.createProject` does not `refresh()`, so the degraded export list can omit a just-created memory project; `editorProjectStore` has no test-only `scheduleRecover` seam.
- R6-9 (`9d19bc9` / `900cf6a`): server durability journey green (1/1) against real `dataDir`. No product defects. Rollback = revert the merge.
- CI hotfix (`b7ed418`): unmount `StudioAssistantRail` test roots. Rollback = revert `b7ed418`.
- Full suite on merged tree: **181 files, 1656 passed / 2 skipped** (79.9s). Lint: 0 errors, 7 warnings (StorageNotice react-refresh added). Typecheck already 0 at merge.
- Fable: `.agent_workspace/round-6-review.md`. Briefing: `.agent_workspace/round-6-briefing.md`. 6 ACCEPT + 4 ACCEPT-WITH-NITS, no blocker. CI green on `f0977d5`.

## Round 6 closeout

- Persist contract: history-first trim; aggregate 12 MiB; history-less records > 8 MiB still skip (R6-9 proved). Rollback persist band = revert `5bc3b29`.
- HTTP: `/api/health.rooms`, `persistedAtLastFlush`. Rollback = revert `be82abb` + `9f93022` + `50d5755`.
- Crash return no-reload. Rollback = revert `41d475a`.
- Known misses until R7: trimmed copy overstates restart-death; `lastFlush` stale-good under persist failure; durable capacity ceiling 12 MiB.

## Round 7 notes

- Chain: R7-1 → R7-2 → R7-3. Independent: R7-4, R7-5, R7-6, R7-7, R7-9. Proof R7-8 after R7-2. R7-10 last.
- R7-6 (`f7a1ae5` / `7736b2f`): skip-path 12 MiB cell labeled (retained=0); aggregate-at-budget ~48 ms / 12.4 MiB, retained=2. Rollback = revert the merge.
- R7-1 (`1664494` / `012bc9c`): `lastFailure?: { at, message }` on `lastPersistOutcome`; `at: 0` means never succeeded. Rollback = revert the merge. collaboration.test.ts 54/1 skip.
- R7-2 (`b959478` / `55e4e7f`+`512d493`): additive `persistence: { outcome, at }` on create/join/snapshot; boolean kept; health `lastFlush` already includes `lastFailure`. Rollback = revert the merge. `server/index.test.ts` 79/79; tsc node 0.
- R7-4 (`533f4a1` / `31ac470`+`3291932`): `createProject` awaits `refresh()` before navigate; `projectPackageFileName` lives in `src/lib/project-package-file-name.ts`. Rollback = revert the merge. Owned tests 43/43; tsc app 0.
- R7-5 (`89dcb33` / `91f54bb`): `projectStoreRecoveryProbe` test seam; crash-disaster drops `setInterval` hijack. Rollback = revert the merge.
- R7-7 (`38a632a` / `b32ddc7`): unmount tracked roots in UniversityEmblem + local-workspace-entry. Rollback = revert the merge. R8 leftover: 36 files unmount only inline in `it`.
- R7-9 (`70c8cb6` / `ff5ad03`+`ac1b1e1`): App.tsx 2322→1988 (−334) into six `src/lib` seams. Rollback = revert the merge. Owned tests 230/230 across the merged trio; tsc app 0.
- R7-3 (`8d5f046` / `e30b30a`+`637f8d9`): client/hook/menu split skip vs trim copy. Rollback = revert the merge. Owned tests 84/84; tsc app 0.
- R7-3b (`a306069` / `8244ce4`): App wires `roomPersistenceKind` so trimmed rooms get the honest copy in the editor. Rollback = revert the merge. `src/App.test.tsx` 134/134; tsc app 0.
- R7-8 (`24bcd02` / `4678f56`): trim band over real HTTP + files (survive restart, VERSION_CONFLICT, `persistence.outcome=trimmed`). No product defect. File at 399 lines — next addition needs a split. Rollback = revert the merge. 2/2; tsc node 0.

## Round 7 closeout

- Full suite on merged tree: **189 files, 1757 passed / 2 skipped** (83.0s).
- Lint: 0 errors, **6 warnings** (StorageNotice react-refresh gone after R7-4; back to R5 level). Typecheck: `tsc -b --noEmit` 0.
- CI: push + pull_request green on `362c318`.
- Fable: `.agent_workspace/round-7-review.md`. 8 ACCEPT + 2 ACCEPT-WITH-NITS, no blocker. Briefing: `.agent_workspace/round-7-briefing.md`.
- Behavior: skip vs trim honesty on HTTP + menu + App wiring; persist failures recorded; trimmed rooms proven to survive restart; App.tsx 1988 lines.

## Round 8 notes

- Chain: R8-2 → R8-3. Independent: R8-1, R8-4, R8-5, R8-6, R8-7, R8-8, R8-9. R8-10 last.
- Headline leftovers: `roomPersistence()` ignores `lastFailure` (stale-good on create/join/snapshot during disk failure); warn legend always mentions both skip and trim.
- R8-1 (`a72bf30` / `a88fc5e`+`e41aeaa`): flush warn legend clauses gated on non-empty groups. Rollback = revert the merge. collaboration.test.ts 57/1 skip; tsc node 0.
- R8-4 (`8fefafc` / `7496c57`+`376129f`): banner export failures render `StorageNoticeActionError` in the notice. Rollback = revert the merge. ProjectWorkbench 31/31; tsc app 0.
- R8-9 (`4d2a887` / `1c3099b`+`bbc7093`): `studioTheme` and `globalDataViewLabel` moved to `src/lib`. Rollback = revert the merge. Owned tests 8/8; scoped eslint 0; tsc app 0.
- R8-2 (`d9d77ef` / `06edd8d`+`0124faf`): `persistence.lastFailureAt` on create/join/snapshot during a streak (key omitted when none). Rollback = revert the merge. index.test.ts 81; tsc node 0.
- R8-8 (`30aef52` / `adf948c`+`edab090`): durability split + real-disk flush-failure journey. R9: snapshot `.<pid>.tmp` not reclaimed if rename fails. Rollback = revert the merge. 3 journeys; tsc node 0.
- R8-6 (`a27c5db` / `32103f3`): afterEach unmount in 14 component tests (AgentAssistant/AssetPanel/etc). Rollback = revert the merge. 72/72; tsc app 0.
- R8-3 (`4f1b13c` / `4bd7dcb`+`d1625fa`): client/hook/menu surface `lastFailureAt`. App wiring is R8-3b after R8-7. Rollback = revert the merge. 97/97; tsc app 0.
- R8-7 (`56c2d7b`): App.tsx 1989→1728; WorkbenchBackButton + four action seams. Rollback = revert the merge. Owned tests 197/197; tsc app 0.
- R8-5 (`2320e1e`): afterEach unmount in 21 canvas/inspector suites (165→0 leaked roots). Rollback = revert the merge. 164/164; tsc app 0.
- R8-3b (`4f70e66` / `0685e66`+`a68a230`): App wires `roomPersistFailureAt`. Rollback = revert the merge. `src/App.test.tsx` 138/138; tsc app 0.

## Round Briefings

### Round 1 briefing (for implementers)

- Audit: `.agent_workspace/round-1-audit.md`
- Baseline: `.agent_workspace/round-1-baseline.md`
- Tasks T1–T10 have exclusive writable files; do not edit shared read-only modules (`scene-document.ts`, `import-data.ts`, `project-package.ts`, `app-constants.ts`, `ids.ts`).
- Wire format frozen: SSE `event: snapshot|members|closed`, one-shot ticket param.
- Gate layout on 400-card median 95.2ms and a new obstacle-aware bench; never gate on 36-card.
- Full `npm test` is orchestrator-only after merge.
