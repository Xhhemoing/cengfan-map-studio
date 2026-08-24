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
| 1 | CLOSED | T1–T10 + R2-0 | — | Full suite 1388; DataCloneError hotfix merged (51 tests) |
| 2 | DISPATCHING | — | — | 10 disjoint tasks from round-1-briefing.md |

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
- Fable review: `.agent_workspace/round-1-review.md`. PR stays draft until R2-0 DataCloneError hotfix.
- Round 2 briefing: `.agent_workspace/round-1-briefing.md`.

## Round Briefings

### Round 1 briefing (for implementers)

- Audit: `.agent_workspace/round-1-audit.md`
- Baseline: `.agent_workspace/round-1-baseline.md`
- Tasks T1–T10 have exclusive writable files; do not edit shared read-only modules (`scene-document.ts`, `import-data.ts`, `project-package.ts`, `app-constants.ts`, `ids.ts`).
- Wire format frozen: SSE `event: snapshot|members|closed`, one-shot ticket param.
- Gate layout on 400-card median 95.2ms and a new obstacle-aware bench; never gate on 36-card.
- Full `npm test` is orchestrator-only after merge.
