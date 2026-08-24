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
| 5 | MERGED_PENDING_FULL_SUITE | R5-1–R5-9 | — | All nine code tasks landed. R5-10 is docs/PR after full suite + fable. |

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
- Fable: `.agent_workspace/round-4-review.md`. Briefing: `.agent_workspace/round-4-briefing.md`. No merge blocker. PR stays draft until R5-1 recalibrates persist cap.

## Round Briefings

### Round 1 briefing (for implementers)

- Audit: `.agent_workspace/round-1-audit.md`
- Baseline: `.agent_workspace/round-1-baseline.md`
- Tasks T1–T10 have exclusive writable files; do not edit shared read-only modules (`scene-document.ts`, `import-data.ts`, `project-package.ts`, `app-constants.ts`, `ids.ts`).
- Wire format frozen: SSE `event: snapshot|members|closed`, one-shot ticket param.
- Gate layout on 400-card median 95.2ms and a new obstacle-aware bench; never gate on 36-card.
- Full `npm test` is orchestrator-only after merge.
