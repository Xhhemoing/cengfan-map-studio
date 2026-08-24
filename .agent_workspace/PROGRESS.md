# SOTA Continuous Optimization — Progress Ledger

Integration branch: `agent/opt-continuous`  
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
| 1 | AUDIT_IN_PROGRESS | — | — | Fable full-repo audit + 10-task topology |

## Round 0 Baseline (pre-optimization)

- Test command: `npx vitest run` (full suite via `scripts/run-heavy.mjs` for CI)
- Perf command: `npm run perf:layout`
- Known hotspots: `src/App.tsx` (2466), `src/styles.css` (3732), `PosterCanvas.tsx` (1588), `card-layout.ts` (~1300), `server/index.ts` (1076)
- Prior unmerged campaign: `origin/cursor/sota-campaign-6231` (31+ rounds, mainly import/collab/ai/export fixes). Treat as reference, not a dump.

## Round Briefings

(Injected into the next round's agents.)
