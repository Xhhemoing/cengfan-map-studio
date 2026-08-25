# Round 1 merge policy (fable-slot / SOTA)

**Author:** cursor-grok-4.6-high-fast (Round 1 Agent B)  
**Date:** 2026-08-25  
**Isolation branch:** `cursor/merge-all-branches-e17a` (currently = `origin/main` @ `897a2a6`)  
**Newest campaign line:** `origin/agent/opt-continuous` @ `d04f398` (405 ahead / 0 behind `main`, PR #14 MERGEABLE)  
**Method:** `git rev-list` uniqueness vs opt-continuous, `git merge-base --is-ancestor` subset checks, `git merge-tree --write-tree --name-only --messages` conflict counts. Working tree left clean (no merge commit / no leftover index).

Do **not** merge leftover branches into `main` directly. Land opt-continuous onto `cursor/merge-all-branches-e17a` first, then fold leftovers in the order below.

---

## 0. Already contained / skip

Already in `opt-continuous` (0 unique commits): all r3–r11 campaign branches, `origin/codex/global-data-workbench`, `origin/backup/pre-template`.

Do not re-merge those.

---

## 1. Conflict-risk ranking (leftover vs `origin/agent/opt-continuous`)

Risk = merge-tree conflict file count × overlap with files that opt-continuous kept evolving (`src/App.tsx`, collab/server, workbench, poster export). `ahead` is unique commits vs opt-continuous.

| Rank | Risk | Branch | Ahead / behind | merge-tree | Conflict files (approx) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **CRITICAL** | `cursor/sota-campaign-6231` | 112 / 405 | dirty | 42 (`App.tsx`, collab, import, export, assistant, workbench, `agent-session`) | Do **not** merge whole branch. Cherry-pick unique UI modules only. |
| 2 | **CRITICAL** | `cursor/agent-sota-polish-cbcd` (PR #11) | 62 / 405 | dirty | 39 + add/add on `.agent_workspace/PROGRESS.md`, `ci.yml`, `server/ai-routes.ts`, `server/static-files.ts` | Do **not** merge whole branch. Cherry-pick print-bleed / honest-import only. |
| 3 | **HIGH** | `cursor/split-oversized-layout-modules-c0fa` | 7 / 405 | dirty | 22, including **modify/delete** `PosterCanvas.test.tsx` (deleted on opt) | Keep opt split. Drop leftover refactor. |
| 4 | **HIGH** | `cursor/fix-round1-issues-2c89` | 27 / 405 | dirty | 20 (`App.tsx`, assistant, DataWorkspace, collab ops, ProjectMenu) | Cherry-pick only leftover-only modules (`StatusToast`, draft-mirror) if still missing after opt. |
| 5 | **HIGH** | `cursor/feature-expansion-research-c710` (PR #12) | 15 / 405 | dirty | 12 (`App.tsx`, ProjectMenu, workbench, `usePosterExport`) | **Resolve**: unique user-facing (template exchange, help/feedback, import live region). |
| 6 | **MEDIUM** | `cursor/server-graceful-shutdown-af12` | 3 / 319 | dirty | 7 + modify/delete `agent-session.test.ts` | **Drop**. Same-message SHAs already on opt. |
| 7 | **MEDIUM** | `cursor/canvas-render-display-46a1` (PR #13) | 28 / 405 | dirty | 6 (`App.tsx`, card-layout-cache, worker tests, `.agent_workspace/PROGRESS.md`) | **Resolve**: unique canvas layers / pan isolation. Discard leftover agent docs. |
| 8 | **MEDIUM** | `cursor/editor-perf-shell-9c93` (PR #6) | 3 / 405 | dirty | 5 (`ci.yml` add/add, `App.tsx`, `main.tsx`) | Keep opt editor + CI. Cherry-pick only missing lookup helpers if still absent. |
| 9 | **MEDIUM** | `cursor/optimize-studio-ux-7077` (PR #10) | 11 / 405 | dirty | 4 (`App.tsx`/`App.test.tsx`, ProjectMenu, ReferenceCardStyle test) | **Resolve**: unique workflow copy + P2 UX. |
| 10 | **MEDIUM** | `cursor/public-static-demo-304c` (PR #7) | 1 / 405 | dirty | 4 (workbench, `collaboration-client.ts`, `main.tsx`) | **Resolve**: unique Pages/base-path feature. |
| 11 | **LOW** | `cursor/ai-assistant-optimize-6231` | 1 / 405 | dirty | 4 + modify/delete `agent-session.test.ts` | Subset of sota-campaign. Drop vs opt. |
| 12 | **LOW** | `cursor/ci-legacy-editor-shell-9c93` (PR #5) | 1 / 405 | dirty | 3 (`ci.yml`, `App.tsx`) | Subset of editor-perf. Opt already has serial CI and extracted (not deleted) legacy chrome. Drop. |
| 13 | **LOW** | `cursor/reorder-function-entries-7077` (PR #9 draft) | 3 / 405 | dirty | 2 (`App.tsx`, `App.test.tsx`) | Strict subset of optimize-studio-ux. Skip. |
| 14 | **LOW** | `cursor/rejected-landing-history-c4be` | 1 / 319 | dirty | 1 modify/delete `agent-session.test.ts` | Superseded by opt `50f858a`. Drop. |
| 15 | **CLEAN** | `cursor/r12-1-app-stage-187a` | 2 / 0 | clean vs opt | 0 vs opt; **1 vs r12-5** (`scripts/file-size-allowlist.json`) | Merge. Manual allowlist union with r12-5. |
| 16 | **CLEAN** | `cursor/r12-3-error-boundary-tests-187a` | 2 / 0 | clean | 0 | Merge. |
| 17 | **CLEAN** | `cursor/r12-2/4/5/6/7/8/9-*-187a` | 1 / 0 each | clean vs opt | 0 vs opt; r12-5 allowlist-only vs r12-1 | Merge (test splits). |
| 18 | **CLEAN / empty unique** | `cursor/unify-degraded-storage-notice-9ae7` | 1 / 220 | clean | 0 | Merge commit only; both parents already in opt (`af002ab`, `a891031`). Drop `effc4cd`. |
| 19 | **CLEAN / duplicate blob** | `cursor/agent-landing-atomicity-6893` | 1 / 400 | clean | 0 | `scripts/perf-collab-diff-bench.ts` **identical** to opt `9c20c24`. Drop `3944d88`. |
| 20 | **CLEAN** | `cursor/add-cloud-agent-environment-7fd5` (PR #4 draft) | 1 / 405 | clean | 0 | Merge (env). `.cursor/environment.json` missing on opt. |
| 21 | **CLEAN** | `cursor/market-practical-optimize-9c93` (PR #3 draft) | 1 / 405 | clean | 0 | Merge (print-size + case templates). Missing on opt. |
| 22 | **CLEAN** | `cursor/normalize-repo-content-1fd7` (PR #8) | 1 / 405 | clean | 0 | Merge last (deletes `graphify-out/`, `frontUI2.md` still present on opt/main). |

### r12 inter-branch note

All nine r12 tips share merge-base `d04f398` (opt tip). Pairwise merge-tree is clean **except** `r12-1` vs `r12-5` on `scripts/file-size-allowlist.json` (r12-1 rewrites `src/App.tsx` size 988→933; r12-5 deletes the `AgentAssistant.test.tsx` allowlist row). Resolve by applying **both** edits (union).

---

## 2. Supersets / duplicates

Git ancestry (`merge-base --is-ancestor`):

| Subset (skip) | Superset (use this) | Evidence |
| --- | --- | --- |
| `cursor/reorder-function-entries-7077` (`fd443e0` + 2 parents) | `cursor/optimize-studio-ux-7077` | Tip `fd443e0` is an ancestor of UX 7077. Extra UX commits: `8f0a9cc`…`373d91b` (short stage titles, live frame canvas, PNG shortcut, P2 details). |
| `cursor/ci-legacy-editor-shell-9c93` (`28b0654`) | `cursor/editor-perf-shell-9c93` | Ancestry yes. Extra: `0a9fad3`, `ca5def7`. |
| `cursor/ai-assistant-optimize-6231` (`5fd5ee1`) | `cursor/sota-campaign-6231` | Ancestry yes (campaign root commit). |
| `cursor/rejected-landing-history-c4be` (`2b102a4`) | `cursor/server-graceful-shutdown-af12` | Ancestry yes. |

Not supersets of each other (independent forks from `main` `897a2a6`): sota-campaign, agent-sota-polish, canvas-render, fix-round1, feature-expansion, optimize-studio-ux, split-oversized. Do not treat any of those as “already included” by another leftover.

**Content-duplicate vs opt-continuous (same subject, landed minutes later on the campaign line):**

| Leftover SHA | Keep opt SHA | Subject |
| --- | --- | --- |
| `2b102a4` | `50f858a` | fix(project-document): stop committing refused transactions |
| `5d4a984` | `f5d9506` | fix(store): 项目存储失败分类与内存降级模式 |
| `9ad48df` | `ada36f4` | feat(server): 关停排空 SSE 与房间快照，启动恢复房间 |
| `3944d88` | `9c20c24` | bench collaboration document diff scenarios (blob-identical) |
| `effc4cd` (merge) | parents `af002ab` + `a891031` already in opt | unify degraded-storage notice |

`server-graceful-shutdown-af12` is therefore **fully superseded** even though `git rev-list` still reports 3 unique SHAs (different commit objects, same change already cherry-picked onto opt).

`unify-degraded-storage-notice-9ae7` is a merge-only tip: both parents are ancestors of current opt. Do not re-merge.

---

## 3. Safe merge order

Prefer **newest campaign line**, then **feature PRs with unique user-facing behavior**, then **env/docs**. Never start from `main` and replay 405+ leftovers.

### Phase A — newest campaign line (required base)

1. Fast-forward / merge `origin/agent/opt-continuous` (`d04f398`) onto `cursor/merge-all-branches-e17a`.  
   This is the only 405-commit line; `main` is a strict ancestor.

### Phase B — newest campaign continuation (r12, 2026-08-25, clean vs opt)

Merge in this order so allowlist conflicts stay local:

2. `r12-2-maplayer-tests-187a` (`a292a4a`)
3. `r12-4-asset-panel-tests-187a` (`3c7204c`)
4. `r12-3-error-boundary-tests-187a` (`1c1c9f3` + `bd05814`)
5. `r12-6-workbench-tests-187a` (`db14089`)
6. `r12-7-export-poster-tests-187a` (`92f5f60`)
7. `r12-8-binary-import-tests-187a` (`10baffe`)
8. `r12-9-conversation-store-tests-187a` (`f36bc4c`)
9. `r12-1-app-stage-187a` (`1c169b2` + `153241a`) — extracts legacy mid/right panes; unique `LegacyEditorStage.tsx` / `LegacyEditorInspector.tsx`
10. `r12-5-agent-assistant-tests-187a` (`7bfd7ee`) — resolve allowlist with r12-1 by union (keep App.tsx 933 **and** drop AgentAssistant.test.tsx row)

### Phase C — feature PRs (unique user-facing; resolve conflicts)

11. `cursor/feature-expansion-research-c710` (PR #12, tip `cb4bb12`)  
    Keep: `TemplateExchange`, `HelpFeedbackMenu`, `feedback-links`, import alerts / live regions, export-busy PNG guard, community template docs.  
    Discard: leftover `.agent_workspace/**` vs opt’s campaign docs.
12. `cursor/optimize-studio-ux-7077` (PR #10, tip `373d91b`)  
    Skip `reorder-function-entries-7077` (PR #9).  
    Keep leftover workflow labels (opt still says「数据与素材」) + P2 UX. On `App.tsx` conflict, take leftover stage IA and opt’s r3–r12 persistence/collab wiring.
13. `cursor/canvas-render-display-46a1` (PR #13, tip `dc0e459`)  
    Keep: `DestinationCard`, `GuestsLayer`, `DestinationCardsLayer`, pan/memo isolation, `display-frame-style`.  
    Discard leftover `.agent_workspace` cycle notes; keep opt PROGRESS.
14. `cursor/public-static-demo-304c` (PR #7, `5e5405c`)  
    Keep new files (`public-base-path`, `wrangler.toml`, `public/_headers|_redirects`, `pages.yml`).  
    On workbench / `main.tsx` / collab-client conflicts, apply base-path hooks onto **opt** versions.
15. `cursor/market-practical-optimize-9c93` (PR #3, `9347413`) — clean; print-size + case templates. Missing on opt.

### Phase D — selective cherry-picks from CRITICAL/HIGH (no whole-branch merge)

16. From `sota-campaign-6231` **only if still absent after C** (opt already has GB18030 in `binary-import.ts` and 24MB-class limits in server/import paths):  
    candidate unique modules: `DataImportConsent`, `ExportProjectDialog`, `SaveTemplateDialog`, `StatusBar`, `WorkbenchDialog` / rename-delete confirm, `image-downscale`, `svg-image-inline`, `export-size-estimate`, `layout-health-cache`.  
    Do not take leftover `App.tsx` / collab / `agent-session` rewrites.
17. From `agent-sota-polish-cbcd` **only if still absent**: `src/lib/print-bleed.ts`, `src/lib/print-preflight.ts`, honest-import helpers.  
    Do not take leftover server split (`ai-routes.ts` add/add) or `.agent_workspace` trees (opt already split server differently).
18. From `fix-round1-issues-2c89` **only if still absent**: `StatusToast`, `project-draft-mirror` (opt already has `editor-save-lifecycle` / pagehide). Prefer opt if behavior overlaps.
19. From `editor-perf-shell-9c93` **only if still absent**: `university-emblem-lookup`, `search-university-catalog`.  
    Drop `28b0654` “remove three-column editor” — opt kept extracted `LegacyEditorSidebar` / `LegacyEditorTopbar` and already has serial CI + `editor-chrome-effects` matchMedia handling.

### Phase E — env / docs last

20. `cursor/add-cloud-agent-environment-7fd5` (PR #4, `0925b7e`) — clean add of `.cursor/environment.json`.
21. `cursor/normalize-repo-content-1fd7` (PR #8, `933b4d0`) — last, so feature merges are not fighting a 90k-line delete set. Deletes `graphify-out/`, `frontUI2.md`, local agent/privacy dumps still on opt.

### Explicit skip (do not merge; record dropped SHA)

- `cursor/reorder-function-entries-7077` — subset of UX 7077  
- `cursor/ci-legacy-editor-shell-9c93` — subset of editor-perf; contradicts opt’s extracted legacy chrome  
- `cursor/ai-assistant-optimize-6231` — subset of sota-campaign  
- `cursor/server-graceful-shutdown-af12` + `cursor/rejected-landing-history-c4be` — superseded by opt  
- `cursor/unify-degraded-storage-notice-9ae7` — merge-only  
- `cursor/agent-landing-atomicity-6893` — duplicate bench blob  
- Whole-branch `sota-campaign-6231`, `agent-sota-polish-cbcd`, `split-oversized-layout-modules-c0fa`, `fix-round1-issues-2c89` — too much parallel rewrite; cherry-pick only leftover-only user-facing files

---

## 4. Conflict policy

When `merge-tree` / `git merge` conflicts:

1. **Unique user-facing feature still missing on opt** → resolve by hand.  
   Take leftover hunks that introduce the feature; keep opt’s surrounding collab/persist/r12 structure.  
   Examples: template exchange, help/feedback, workflow short names, public demo base path, print-size, DestinationCard/GuestsLayer, r12 test splits, DataImportConsent (if still missing).
2. **Otherwise keep the `opt-continuous` version** and **document the dropped leftover SHA** in the isolation-branch merge message and in this file’s drop log.  
   Applies to: parallel App.tsx rewrites, leftover `agent-session.test.ts` (deleted/split on opt), leftover server file splits that add/add against opt’s `server/ai-routes.ts` / `static-files.ts`, leftover `.agent_workspace/**` campaign notes, leftover CI.yml from Aug 18 vs opt’s current serial workflow.
3. **Agent-workspace / progress docs:** always keep opt-continuous. Leftover PROGRESS files are add/add noise.
4. **`scripts/file-size-allowlist.json`:** union of deletions + the newest `src/App.tsx` size (r12-1’s 933 after pane extract).
5. **Modify/delete (`PosterCanvas.test.tsx`, `agent-session.test.ts`):** keep opt’s deletion/split. Do not resurrect leftover monolith test files.
6. If a cherry-pick of a “unique” module still conflicts inside a file opt already evolved, **stop and keep opt** unless the leftover change is a user-visible behavior opt lacks (confirm with `git grep` / file existence first).

### Drop log (pre-seeded; append more SHAs as merges proceed)

| Dropped leftover SHA | Branch | Why dropped | Recover from |
| --- | --- | --- | --- |
| `2b102a4` | rejected-landing-history-c4be / server-graceful | same change as opt `50f858a` | `origin/cursor/rejected-landing-history-c4be` |
| `5d4a984` | server-graceful-shutdown-af12 | same change as opt `f5d9506` | `origin/cursor/server-graceful-shutdown-af12` |
| `9ad48df` | server-graceful-shutdown-af12 | same change as opt `ada36f4` | same |
| `3944d88` | agent-landing-atomicity-6893 | identical bench as opt `9c20c24` | `origin/cursor/agent-landing-atomicity-6893` |
| `effc4cd` | unify-degraded-storage-notice-9ae7 | merge-only; feature is opt `af002ab` | `origin/cursor/unify-degraded-storage-notice-9ae7` |
| `5fd5ee1` | ai-assistant-optimize-6231 | subset of sota-campaign; conflicts on session/assistant already rewritten on opt | `origin/cursor/ai-assistant-optimize-6231` |
| `28b0654` | ci-legacy-editor-shell-9c93 | “delete three-column editor” vs opt extracted chrome + existing CI | `origin/cursor/ci-legacy-editor-shell-9c93` |
| `ac78291` `f98573c` `fd443e0` | reorder-function-entries-7077 | subset of optimize-studio-ux-7077 | skip; use UX 7077 |
| *(whole-branch, not SHA-listed)* | sota-campaign-6231 / agent-sota-polish-cbcd / split-oversized / fix-round1 | keep opt tree; cherry-pick leftover-only files if still missing | original remote tips `5c0d13f` / `b63c3bc` / `0233a7a` / `8f2f3c7` |

---

## 5. Rollback plan for the eventual `main` PR

**Shape of the PR:** one PR from `cursor/merge-all-branches-e17a` → `origin/main`. Prefer a **single merge commit** on GitHub (not rebase-and-force) so rollback is `git revert -m 1`.

**Restore points (do not delete these remotes until the PR is stable):**

| Ref | SHA | Role |
| --- | --- | --- |
| `origin/main` | `897a2a61d6fd5460ec27f4738aef929aea44616a` | pre-merge default branch |
| `origin/agent/opt-continuous` | `d04f398d679ed943c6c5927870f7a2da80690052` | newest campaign line; first fallback if leftover folds go bad |
| Leftover remote branches | tips in §1 | recover any dropped SHA |

**If the isolation branch goes bad during leftover folds (before the main PR):**

1. `git checkout cursor/merge-all-branches-e17a`
2. `git reset --hard origin/agent/opt-continuous`  → drop leftover folds, keep the 405-commit campaign  
   or `git reset --hard origin/main` → full abort back to `897a2a6`
3. Re-apply Phase B–E with the drop log.

**If the main PR has already merged:**

1. Preferred: `git revert -m 1 <merge-commit-on-main>` and push. Restores `main` tree to `897a2a6` plus any later main-only commits.
2. If GitHub used squash: revert that single squash commit the same way.
3. Do **not** force-push `main`.

**Destructive leftover to call out:** `normalize-repo-content-1fd7` deletes `graphify-out/` and `frontUI2.md`. Rollback of the main PR restores those blobs from `897a2a6`. If normalize is landed and later regretted **without** reverting the whole PR, restore those paths from `origin/main` @ `897a2a6` (or from opt, which still has them).

**API / export-format risk:** opt-continuous is the compatibility baseline. Cherry-picks from sota-campaign (24MB warnings, SVG inlining, font remap) and public-demo (`public-base-path`) are the only leftover items that can change export/runtime shape. If those cherry-picks land and must be undone, revert those isolation-branch commits individually; the rest of the PR can stay.

**Acceptance after the main PR (not “agent said done”):** GitHub CI on the PR (`typecheck` + `lint` + `test` via existing serial workflow), then a green run on `main` after merge. Manual: open workbench → editor → export PNG/SVG once if Phase C/D export-adjacent cherry-picks landed.

---

## 6. Suggested executor checklist

```text
# on cursor/merge-all-branches-e17a
git merge --no-ff origin/agent/opt-continuous          # Phase A
# Phase B: r12-2,4,3,6,7,8,9,1, then r12-5 (union allowlist)
# Phase C: feature-expansion, optimize-ux, canvas, public-demo, market
# Phase D: file-level cherry-picks only; else keep opt + drop log
# Phase E: env json, then normalize
# skip list + drop log in merge messages
```

Use `git merge-tree --write-tree` before each leftover merge. If conflict files are all in the “keep opt” class (§4.2), abort and record the SHA instead of resolving.
)
