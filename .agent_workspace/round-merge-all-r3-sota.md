# Round 3 Agent A — SOTA acceptance of merge-all vs remaining unique branches

**READ-ONLY.** HEAD `74d7d65` on `cursor/merge-all-branches-e17a` (**494** commits ahead of `origin/main` @ `897a2a6`). Isolation PR: [#44](https://github.com/Xhhemoing/cengfan-map-studio/pull/44) (draft). Method: `git rev-list HEAD..<tip>`, `git merge-tree`, path presence, and import/wiring greps. No merge, push, or product edit.

## 1. Open PRs #3–#14 — user-facing features on HEAD vs still missing

Unique=0 means the PR tip is an ancestor of HEAD (commits are in the tree). “On HEAD” here means the **user-visible behavior** is reachable in the current `editor/` shell, not merely that a file exists.

| PR | Branch | Unique vs HEAD | User-facing on HEAD now | Still missing (user-visible) |
| ---: | --- | ---: | --- | --- |
| **#3** | `market-practical-optimize-9c93` | **0** | A3 / A2 / 90×60cm presets (`CANVAS_SIZE_PRESETS`); inspector + delivery “约合印刷 … cm @ …dpi”; 普高文科-55 / 职高-80 案例模板; 工作台空态覆盖开学/校庆; `docs/产品/市场化与实用化优化.md` | None of the PR’s claimed product surface. |
| **#4** | `add-cloud-agent-environment-7fd5` | **0** | `.cursor/environment.json` (`npm ci` + `npm run dev`) | None (agent-env only). |
| **#5** | `ci-legacy-editor-shell-9c93` | **1** | Serial CI already on HEAD (`.github/workflows/ci.yml`: tsc → lint → vitest). Five-stage public path is the default. | **Remove three-column legacy editor.** HEAD still reads `cengfan-legacy-editor` and renders `LegacyEditor*` via `src/components/editor/`. Policy: keep the legacy shell. |
| **#6** | `editor-perf-shell-9c93` | **3** | Nothing unique from this PR. HEAD has neither `React.lazy` / `preloadStudioWorkspaces` nor `useNarrowViewport` / `compactChrome` / topbar save-chip. | First-screen route/workspace lazy split; narrow-viewport single drawer; emblem dynamic lookup; matchMedia stub restore (those seams do not exist on HEAD). |
| **#7** | `public-static-demo-304c` | **0** | `VITE_PUBLIC_DEMO` + `public-base-path`; workbench AGPL source link; Pages workflow; `docs/deployment/public-demo.md`; Dockerfile / `_redirects` | Ops only: enable GitHub Pages / Cloudflare after merge to `main`. |
| **#8** | `normalize-repo-content-1fd7` | **1** | Nothing. HEAD still has `docs/宣发/*`, `function.md`, promo skill/scripts. | Wholesale delete of promo/agent/privacy docs. **Must not land** — conflicts with HEAD 宣发 corpus. |
| **#9** | `reorder-function-entries-7077` | **0** | Contained by #10. Stepper is 名单→地图→版式→内容→交付 (`workflow-stages.ts`). | None. |
| **#10** | `optimize-studio-ux-7077` | **0** | Same five-stage IA; settings entries jump to stages (not a full-page leave); 素材库 on 内容; empty-roster “还没有名单”. | None of the PR surface. Residual product nits: 版式 rail **and** 内容 rail both expose「整体模板」. |
| **#11** | `agent-sota-polish-cbcd` | **62** | Extract-only (`1d6d064`): `src/lib/print-bleed.ts` (+ tests). Overlap already from #14: persist honesty, crash export, a11y live regions, layout cache. | **Bleed/preflight UI unwired** (no `printBleedMm` in `CanvasInspector`, no `print-preflight.ts`, delivery does not expand crop marks). Workbench skip-link「跳到项目列表」`#workbench-projects`. `html-table-parse` / `import-headers`. Worker threshold 24→49. `studio-editor/` chrome (skip-to-stage, decomposed hooks). |
| **#12** | `feature-expansion-research-c710` | **0** | Help/反馈 + CHANGELOG `v0.1.0`; `.cengfan-template` exchange; XLSX template download visible; import `DataMessageRegions` (`role=status` / `role=alert`); `{项目名}-工程包-{日期}.json`; empty-workbench reload sample; export filename + busy PNG disable. | None of the PR surface. |
| **#13** | `canvas-render-display-46a1` | **0** | `useStableCallbacks`; PosterCanvas **948** (from 1588); `polygonOrigin` affine cache; `destinationCardFlowContentStart`; MapLayer pan-memo / filter-id scope. | None of the PR surface (pan ~3.7–4ms@24 claimed on merge). |
| **#14** | `agent/opt-continuous` | **0** | Entire R1–R12 campaign: collab persist skip/trim/failure, room restore, crash no-reload, shared IndexedDB store, `src/components/editor/` split, server `ai-routes` / `room-routes` / `static-files` / snapshot store, file-size ratchet. App.tsx **923**. | Campaign leftovers (idle SSE member, 12 MiB persist ceiling) — not unique-branch gaps. |

### Extracted but **unwired** (do not treat as shipped)

| Module | On disk | Imported by product UI? |
| --- | --- | --- |
| `DataImportConsent` + `use-studio-preferences` | yes (`1d6d064`) | **No.** Only self-tests. Campaign wires consent inside `DataImportPanel`, which HEAD does not have. |
| `print-bleed` | yes | **No.** Only `print-bleed.test.ts`. Inspector has print-**size**, not bleed mm. |
| `print-preflight` | **absent** | — |

Campaign still has unique *files* (`DataImportPanel`/`Review`, `StatusBar`, `SaveTemplateDialog`, `render-facts`/`render-health`, `import-aliases`, `import-file-limits`) that are not on HEAD and are not drop-in against `DataWorkspace.tsx` / `editor/`.

## 2. Verdict: wholesale merge of `sota-campaign-6231` or `agent-sota-polish-cbcd`?

### **NO — not acceptable.**

Three mutually exclusive App architectures. Taking either SOTA tip wholesale **deletes** HEAD’s `src/components/editor/` split and rolls back #14 R10–R12.

| Tree | `src/App.tsx` | Shell ownership | `git diff --stat HEAD <tip>` on App+shells |
| --- | ---: | --- | --- |
| **HEAD** | **923** lines; composes `editor/ExportProjectDialog`, `GlobalSettingsShell`, `LegacyEditor*`, `StageLayoutScreen`, `MissingProjectShell`, `ProjectLoadingShell` | `src/components/editor/` (12 files) | — |
| **`sota-campaign-6231`** | **2579**-line monolith; inlines `StudioLayoutTemplate`, `StatusBar`, `SaveTemplateDialog`, workspace rails; **no** `editor/` | pre-split App | App **+2179 / −** editor **2158** (all 10 `editor/*` product files **deleted**) |
| **`agent-sota-polish-cbcd`** | **333**-line hook compositor (`useWorkspacePersistence`, `useStudioChrome`, …) | `src/components/studio-editor/` (GlobalSettingsRoute, LegacyEditorChrome, StudioStageScreen, …) | App rewrite **+1058/−** plus **delete** HEAD `editor/` and **add** `studio-editor/` |

`git merge-tree HEAD origin/cursor/sota-campaign-6231` → **58 CONFLICT**s including **`src/App.tsx`**.  
`git merge-tree HEAD origin/cursor/agent-sota-polish-cbcd` → **55 CONFLICT**s including **`src/App.tsx`**.

Campaign App still imports `WorkbenchBackButton` from `./lib/app-initialization` and keeps dialogs in `src/components/*`. Polish App imports `./components/studio-editor/*` and `./hooks/use-*`. Neither tree has HEAD’s `from "./components/editor/StageLayoutScreen"` graph. A merge cannot keep both shells; Git will not “union” them.

**Allowed path remains EXTRACT** (already started at `1d6d064`): port isolated libs (`print-preflight`, `html-table-parse`, `import-headers`, consent **wiring** into existing `DataWorkspace`) without checking out `src/App.tsx`, `AgentAssistant.tsx`, or `server/index.ts`.

## 3. Remaining unique remotes — MERGE / SKIP / EXTRACT

Only **10** `origin/*` tips still have commits not reachable from HEAD. **None are MERGE.**

| Unique | Branch | Decision | One-line reason |
| ---: | --- | --- | --- |
| 112 | `cursor/sota-campaign-6231` | **EXTRACT** | Unique import-honesty / render-health libs; wholesale merge restores 2579-line App and deletes `editor/`. |
| 62 | `cursor/agent-sota-polish-cbcd` | **EXTRACT** | Unique bleed/preflight + skip-link + html-table; wholesale merge swaps in `studio-editor/` vs `editor/`. |
| 27 | `cursor/fix-round1-issues-2c89` | **EXTRACT** | Real UX fixes (menu close-then-act, placeholder strip on export, toast repeat) sit on **pre-split** `App.tsx` / test paths — port by issue id, do not merge. |
| 7 | `cursor/split-oversized-layout-modules-c0fa` | **SKIP** | Parallel polish-era `card-layout-*` split; HEAD already owns `card-layout.ts` + cache/worker protocol — merge would fight #13/#14 layout files. |
| 3 | `cursor/editor-perf-shell-9c93` | **SKIP** | PR #6; deletes legacy editor and needs `compactChrome` seams HEAD does not have. |
| 3 | `cursor/server-graceful-shutdown-af12` | **SKIP** | SHA unique; SIGTERM / `attachServerLifecycle` / refused-landing already in #14 `server/index.ts`. |
| 1 | `cursor/ci-legacy-editor-shell-9c93` | **SKIP** | PR #5 ⊂ #6; serial CI already present; unique commit removes legacy shell. |
| 1 | `cursor/normalize-repo-content-1fd7` | **SKIP** | PR #8; 755-file delete of `docs/宣发/*` + `function.md` vs HEAD promo corpus. |
| 1 | `cursor/rejected-landing-history-c4be` | **SKIP** | Single commit `2b102a4` already in opt-continuous ancestry semantically; merge hits split `agent-session` tests. |
| 1 | `cursor/ai-assistant-optimize-6231` | **SKIP** | Ancestor of `sota-campaign-6231`; no independent tip. |

All other remotes (including `agent/opt-continuous`, #3/#4/#7/#9/#10/#12/#13, r3–r12 campaign tips) have **unique=0**.

## 4. Ready-for-main? Blockers only

**Not ready.** Blockers:

1. **No orchestrator gate on this tip.** Last product commits are `08c88b4` (UX merge) and `1d6d064` (unwired extracts). HEAD is docs (`b43211f`, `74d7d65`). R2 closeout deferred `tsc -b` + lint + full vitest to R3; that chain has not been recorded against `74d7d65`. Delivery rule: subagent “green” ≠ merge evidence.
2. **PR #44 is still draft** and its own checklist still has the UI walk (workbench → 名单/地图/版式/内容/交付 → PNG → `VITE_PUBLIC_DEMO`) unchecked.

Non-blockers (do **not** hold `main` for these): remaining unique SHAs above; unwired consent/bleed modules (dead inventory, tests are self-contained); #5/#6 lazy/narrow-shell; #11 print-preflight UI; dual「整体模板」entry; Pages enablement after merge.

**Do not** unblock by merging `sota-campaign-6231` or `agent-sota-polish-cbcd`.
