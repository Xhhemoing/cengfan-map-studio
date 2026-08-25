# Round 1 inventory — grok-fast (read-only)

Inventory date: 2026-08-25. Repo: `Xhhemoing/cengfan-map-studio`.  
Commands: `git fetch origin --prune`, `git rev-list --left-right --count`, `git merge-base --is-ancestor`, `git log`, `git patch-id --stable`, `gh pr list` / `gh pr view`.  
No commits, pushes, merges, or source-file edits were made.

## Snapshot

| ref | full SHA | short | note |
|---|---|---|---|
| `origin/main` | `897a2a61d6fd5460ec27f4738aef929aea44616a` | `897a2a6` | default branch; 0/0 vs itself |
| `origin/agent/opt-continuous` | `d04f398d679ed943c6c5927870f7a2da80690052` | `d04f398` | **405 ahead / 0 behind** `origin/main`; merge-base is `897a2a6` |
| local `cursor/merge-all-branches-e17a` | `897a2a61d6fd5460ec27f4738aef929aea44616a` | `897a2a6` | currently **identical to** `origin/main`; tracks `origin/main` |
| `origin/cursor/merge-all-branches-e17a` | — | — | **does not exist** on `origin` |

- Remote refs counted: **144** (`origin` + `origin/HEAD` excluded).
- Tips that **are ancestors** of `origin/agent/opt-continuous`: **116**.
- Tips that are **not** ancestors: **28**.
- Tips with **0 commits ahead of main**: **3** (`origin/main`, `origin/backup/pre-template`, `origin/codex/global-data-workbench`).

`gh pr view 14 --json commits` reports `commitCount: 100`. That is a GitHub payload cap. `git rev-list --count origin/main..origin/agent/opt-continuous` is **405**. Use 405.

---

## 1. Complete remote branch list vs `origin/main`

Ahead/behind = `git rev-list --left-right --count origin/main...<branch>` (right = ahead of main, left = behind main).  
“ancestor of opt-continuous” = `git merge-base --is-ancestor <branch> origin/agent/opt-continuous`.  
“unique vs opt” = commit count on the branch not reachable from `d04f398` (includes merge commits).

| remote | tip | vs main ahead | vs main behind | ancestor of opt-continuous | unique vs opt (incl merges) | tip subject |
|---|---|---:|---:|---|---:|---|
| `origin/agent/opt-continuous` | `d04f398` | 405 | 0 | yes | 0 | docs(agent): close Round 11 and open Round 12 |
| `origin/backup/pre-template` | `a769be8` | 0 | 31 | yes | 0 | fix: IndexedDB store migration and build hardening |
| `origin/codex/global-data-workbench` | `5b492de` | 0 | 81 | yes | 0 | chore: preserve normalized Git file contents |
| `origin/cursor/ack-lost-convergence-fd2c` | `b2564a0` | 122 | 0 | yes | 0 | test(collab): prove ack-lost submit converges |
| `origin/cursor/add-cloud-agent-environment-7fd5` | `0925b7e` | 1 | 0 | NO | 1 | chore(env): add Cloud Agent development environment config |
| `origin/cursor/agent-continue-no-duplicate-user-message-37bd` | `4a7cf84` | 146 | 0 | yes | 0 | fix(agent): do not duplicate unanswered user message on continue |
| `origin/cursor/agent-landing-atomicity-6893` | `3944d88` | 6 | 0 | NO | 1 | bench collaboration document diff scenarios |
| `origin/cursor/agent-landing-atomicity-t10-6893` | `f7a0f4e` | 38 | 0 | yes | 0 | fix(agent): AI 落地事务全有或全无，重放失败可观测 |
| `origin/cursor/agent-landing-integration-29af` | `996db47` | 51 | 0 | yes | 0 | fix(agent): AI 落地被拒时在助手里说明失败步骤并保持可重试 |
| `origin/cursor/agent-session-clone-hotfix-933b` | `b00a1ce` | 48 | 0 | yes | 0 | fix(agent): 克隆前剥离 history，修复 AI 落地 DataCloneError |
| `origin/cursor/agent-sota-polish-cbcd` | `b63c3bc` | 62 | 0 | NO | 62 | docs: Round 32 verification — tsc clean, eslint --max-warnings 0, 226 files / 2037 tests. |
| `origin/cursor/ai-assistant-optimize-6231` | `5fd5ee1` | 1 | 0 | NO | 1 | 优化 AI 辅助编辑：降低消耗并提高理解与操作准确性 |
| `origin/cursor/assistant-single-resume-affordance-7954` | `001fde4` | 146 | 0 | yes | 0 | fix(assistant): single resume affordance after transport failure |
| `origin/cursor/assistant-transport-retry-59f5` | `3072fe9` | 122 | 0 | yes | 0 | fix(assistant): resume conversation after retriable transport failure |
| `origin/cursor/canvas-render-display-46a1` | `dc0e459` | 28 | 0 | NO | 28 | docs(agent): Cycle 3 Round 3 freeze ACCEPT — pan ~4.0ms @24 |
| `origin/cursor/ci-legacy-editor-shell-9c93` | `28b0654` | 1 | 0 | NO | 1 | 去掉三栏旧编辑器，并加上顺序执行的 CI 门禁。 |
| `origin/cursor/ci-serial-workflow-1c28` | `2de260b` | 173 | 0 | yes | 0 | ci: add serial typecheck, lint, and vitest workflow |
| `origin/cursor/collab-client-sse-resilience-cd90` | `59afae8` | 6 | 0 | yes | 0 | fix(collab): SSE 客户端自持重连、版本连续性门控与基线竞态修复 |
| `origin/cursor/collab-diff-complexity-07b2` | `f213734` | 8 | 0 | yes | 0 | handle shared collaboration document references |
| `origin/cursor/collab-http-partition-fb09` | `11ccf8f` | 52 | 0 | yes | 0 | fix(collab): 房间 hook 区分离线态,补齐与握手请求随房间取消 |
| `origin/cursor/collab-offline-terminal-taxonomy-7057` | `d590e9f` | 88 | 0 | yes | 0 | feat(collab): 协作面板区分离线与房间失效 |
| `origin/cursor/collab-partition-heal-resend-c84e` | `8b15d5e` | 86 | 0 | yes | 0 | fix(collab): 分区愈合后自动补投未送出的增量 |
| `origin/cursor/collab-send-effect-recovery-1f60` | `edd2521` | 51 | 0 | yes | 0 | fix(collab): 送出侧冲突自愈、自回声抑制与在途回执作废 |
| `origin/cursor/collab-taxonomy-app-wiring-d18a` | `d4d137a` | 122 | 0 | yes | 0 | fix(collab): gate expired-room sends and thread taxonomy props |
| `origin/cursor/collab-terminal-rejection-a9a6` | `970ea1d` | 147 | 0 | yes | 0 | fix(collab): land roomExpired from terminal submit rejections |
| `origin/cursor/crash-export-indexeddb-projects-898c` | `51e326f` | 122 | 0 | yes | 0 | feat(crash): export IndexedDB projects when workspace mirror is empty |
| `origin/cursor/crash-no-hard-reload-memory-cc63` | `4d914dd` | 173 | 0 | yes | 0 | fix(crash): do not hard-reload when memory-only projects are listed |
| `origin/cursor/editor-perf-shell-9c93` | `ca5def7` | 3 | 0 | NO | 3 | 修复窄屏 matchMedia 泄漏，并去掉壳层里同步 setState 的 effect。 |
| `origin/cursor/error-boundary-disaster-export-d690` | `c4bae31` | 86 | 0 | yes | 0 | feat(error-boundary): export a workspace backup from the crash screen |
| `origin/cursor/export-pipeline-robustness-7e98` | `dbb101b` | 7 | 0 | yes | 0 | test(export): 去掉多余的 eslint-disable 指令 |
| `origin/cursor/feature-expansion-research-c710` | `cb4bb12` | 15 | 0 | NO | 15 | fix(a11y): keep empty import live regions CSS :empty |
| `origin/cursor/fix-round1-issues-2c89` | `8f2f3c7` | 27 | 0 | NO | 27 | fix(I-14-01/I-14-03): 跨项目重绑时清空输入框草稿；forgetRoomAccess 提升为模块级函数修复 lint error |
| `origin/cursor/honest-degraded-copy-7b8f` | `dc19769` | 146 | 0 | yes | 0 | fix(crash): honest copy for degraded and in-memory-only exports |
| `origin/cursor/import-size-gate-workbench-types-c9f3` | `7b61877` | 87 | 0 | yes | 0 | refactor(workbench): type the project grid against the list metadata view |
| `origin/cursor/indexeddb-lifecycle-hardening-7587` | `afb5bf6` | 6 | 0 | yes | 0 | fix(store): 让 IndexedDB 连接在 versionchange / 中止 / 断连后可恢复 |
| `origin/cursor/layout-cache-key-bd0e` | `f1c623c` | 52 | 0 | yes | 0 | perf: hash layout cache polygon geometry |
| `origin/cursor/layout-solver-broadphase-7504` | `278b940` | 9 | 0 | yes | 0 | docs(bench): note that the first measured count includes JIT warmup |
| `origin/cursor/layout-worker-coalescing-66fb` | `32f780d` | 51 | 0 | yes | 0 | perf(layout): add worker burst benchmark |
| `origin/cursor/layout-worker-coalescing-final-66fb` | `f1aa448` | 52 | 0 | yes | 0 | perf(layout): coalesce worker requests to latest |
| `origin/cursor/market-practical-optimize-9c93` | `9347413` | 1 | 0 | NO | 1 | 为市场化补印刷尺寸与案例模板，并写下产品收口判断。 |
| `origin/cursor/normalize-repo-content-1fd7` | `933b4d0` | 1 | 0 | NO | 1 | chore(repo): 清理本地 agent、隐私与宣发材料 |
| `origin/cursor/optimize-studio-ux-7077` | `373d91b` | 11 | 0 | NO | 11 | feat(ux): 三项 P2 细节——空名单默认「本阶段」、交付全绿摘要、素材库按选中收起 |
| `origin/cursor/package-size-caps-2e45` | `7a9752b` | 51 | 0 | yes | 0 | feat(package): 工程包导入加尺寸上限并去掉资源二次序列化 |
| `origin/cursor/perf-room-snapshot-c188` | `0613660` | 123 | 0 | yes | 0 | fix(collab): cap persisted room records |
| `origin/cursor/project-document-commit-cost-a167` | `59b6413` | 9 | 0 | yes | 0 | Use typed clone for transaction working copy |
| `origin/cursor/project-list-metadata-6e14` | `852b833` | 52 | 0 | yes | 0 | fix(projects): report atomic write aborts |
| `origin/cursor/project-store-degraded-mode-87ee` | `e5da7cb` | 86 | 0 | yes | 0 | fix(import): reject oversized project packages before reading the file |
| `origin/cursor/project-store-failure-taxonomy-87ee` | `f5d9506` | 86 | 0 | yes | 0 | fix(store): 项目存储失败分类与内存降级模式 |
| `origin/cursor/public-static-demo-304c` | `5e5405c` | 1 | 0 | NO | 1 | feat: 支持用 Cloudflare Pages / GitHub Pages 做公开演示站 |
| `origin/cursor/r10-1-ai-state-tmp-187a` | `d730f69` | 344 | 0 | yes | 0 | fix(ai-state): clean up the failed-rename .tmp and cap corrupt sidecars at 5 |
| `origin/cursor/r10-2-boot-tmp-sweep-187a` | `f896e5c` | 344 | 0 | yes | 0 | fix(r10-2): sweep crashed-boot atomic-write temporaries once at boot |
| `origin/cursor/r10-3-static-files-187a` | `e538d63` | 358 | 0 | yes | 0 | refactor(r10-3): extract the static-file cluster into server/static-files.ts |
| `origin/cursor/r10-4-room-routes-187a` | `c06fb88` | 369 | 0 | yes | 0 | test(server): pin the room-routes deps struct and routing seam |
| `origin/cursor/r10-5-app-jsx-187a` | `f4c9f1c` | 344 | 0 | yes | 0 | test(editor): pin the extracted shells from both sides of the seam |
| `origin/cursor/r10-6-hook-test-split-187a` | `3c4c771` | 343 | 0 | yes | 0 | test(collab): split useCollaborationRoom tests by domain behind a shared harness (R10-6) |
| `origin/cursor/r10-7-dataworkspace-test-split-187a` | `931c310` | 343 | 0 | yes | 0 | test(data-workspace): 按域拆分 DataWorkspace 测试并抽出共享装置 |
| `origin/cursor/r10-8-client-test-split-187a` | `2937baf` | 348 | 0 | yes | 0 | chore(ratchet): drop the collaboration-client test allowlist entry (R10-8) |
| `origin/cursor/r10-9-size-ratchet-187a` | `cd4583d` | 343 | 0 | yes | 0 | test(scripts): ratchet tracked source files at 400 lines |
| `origin/cursor/r10-fable-review-187a` | `f276a47` | 373 | 0 | yes | 0 | docs(agent): Round 10 fable review and Round 11 briefing |
| `origin/cursor/r11-1-ai-load-cause-187a` | `b40cf32` | 377 | 0 | yes | 0 | fix(ai-state): 加载失败保留原始 errno 到 cause |
| `origin/cursor/r11-2-statedir-sweep-187a` | `f54f3d0` | 376 | 0 | yes | 0 | fix(server): 状态文件配置到 dataDir 之外时也收掉它自己的原子写孤儿 |
| `origin/cursor/r11-3-ai-routes-187a` | `f17be4a` | 383 | 0 | yes | 0 | test(server): pin the ai-routes seam contract |
| `origin/cursor/r11-4-index-tests-187a` | `27a3daf` | 398 | 0 | yes | 0 | test(server): split index.test.ts by domain behind a shared fixture |
| `origin/cursor/r11-5-app-topbar-187a` | `bd38107` | 383 | 0 | yes | 0 | test(app): pin 旧版顶栏抽出后的品牌、阶段插槽与工具栏分组 |
| `origin/cursor/r11-6-poster-canvas-tests-187a` | `46cd6ff` | 382 | 0 | yes | 0 | test(canvas): split PosterCanvas.test.tsx by domain behind a shared harness |
| `origin/cursor/r11-7-card-layout-tests-187a` | `41c2761` | 382 | 0 | yes | 0 | test(card-layout): split the 958-line solver test into domain slices |
| `origin/cursor/r11-8-agent-session-tests-187a` | `65fd7ef` | 382 | 0 | yes | 0 | test(agent-session): split the 696-line session test by domain |
| `origin/cursor/r11-9-project-store-tests-187a` | `547f47c` | 383 | 0 | yes | 0 | test(project-store): drop the dead IDBFactory import from the fixtures |
| `origin/cursor/r11-fable-review-187a` | `f6f5285` | 403 | 0 | yes | 0 | docs(briefing): Round 12 — App final carve, eight test splits, docs close-out |
| `origin/cursor/r12-1-app-stage-187a` | `153241a` | 407 | 0 | NO | 2 | test(editor): 为拆出的中栏/右栏补组件侧与 App 侧接缝 pin |
| `origin/cursor/r12-2-maplayer-tests-187a` | `a292a4a` | 406 | 0 | NO | 1 | test(canvas): 按域拆分 MapLayer 测试并共用挂载装置 |
| `origin/cursor/r12-3-error-boundary-tests-187a` | `bd05814` | 407 | 0 | NO | 2 | test(error-boundary): 崩溃子树单独成文件以清掉 react-refresh 警告 |
| `origin/cursor/r12-4-asset-panel-tests-187a` | `3c7204c` | 406 | 0 | NO | 1 | test(assets): 按域拆分 AssetPanel 测试并抽出共享装置 |
| `origin/cursor/r12-5-agent-assistant-tests-187a` | `7bfd7ee` | 406 | 0 | NO | 1 | test(assistant): 按域拆分 AgentAssistant 用例并集中传输替身 |
| `origin/cursor/r12-6-workbench-tests-187a` | `db14089` | 406 | 0 | NO | 1 | test(workbench): 按域拆分 ProjectWorkbench 测试并共用装置 |
| `origin/cursor/r12-7-export-poster-tests-187a` | `92f5f60` | 406 | 0 | NO | 1 | test(export-poster): 按域拆分海报导出测试并集中替身 |
| `origin/cursor/r12-8-binary-import-tests-187a` | `10baffe` | 406 | 0 | NO | 1 | test(binary-import): 按领域拆分导入测试并抽出 GB18030 夹具 |
| `origin/cursor/r12-9-conversation-store-tests-187a` | `f36bc4c` | 406 | 0 | NO | 1 | test(agent-conversation-store): split the 464-line suite by domain |
| `origin/cursor/r3-4-room-store-2529` | `062cc14` | 88 | 0 | yes | 0 | fix(collab): surface persistence flush failures asynchronously |
| `origin/cursor/r3-7-ai-client-deadlines-de5e` | `9658b64` | 86 | 0 | yes | 0 | fix(agent): 给 AI 请求加可注入截止时间与可重试网络失败 |
| `origin/cursor/r5-1-persist-calibration-3a50` | `45e8a12` | 147 | 0 | yes | 0 | fix(collaboration): calibrate persistence cap to 8 MiB |
| `origin/cursor/r6-1-history-degrade-866b` | `c8bfb66` | 176 | 0 | yes | 0 | docs(bench): record history-trim persistence numbers |
| `origin/cursor/r6-2-persist-visibility-187a` | `e0c7857` | 186 | 0 | yes | 0 | feat(server): 让房间持久化死亡率可被外部观测 |
| `origin/cursor/r6-3-crash-disaster-187a` | `9e740d9` | 204 | 0 | yes | 0 | test(crash): 降级会话崩溃灾难全链路集成用例 |
| `origin/cursor/r6-5-honest-missing-project-5602` | `1e0eecf` | 178 | 0 | yes | 0 | test(lib): cover custom template capture and list overflow |
| `origin/cursor/r6-5b-persist-prop-187a` | `c06e96c` | 205 | 0 | yes | 0 | fix(app): pass roomPersistenceDegraded into ProjectMenu |
| `origin/cursor/r6-6-room-persist-notice-187a` | `b09ed7b` | 193 | 0 | yes | 0 | feat(collab): 把房间持久化降级告诉房里的人 |
| `origin/cursor/r6-9-durability-journey-187a` | `900cf6a` | 204 | 0 | yes | 0 | test(server): 房间快照跨重启的端到端耐久旅程 |
| `origin/cursor/r6-fable-review-187a` | `d15a49c` | 215 | 0 | yes | 0 | docs(review): Round 6 fable review and Round 7 briefing |
| `origin/cursor/r7-1-persist-failure-187a` | `012bc9c` | 220 | 0 | yes | 0 | fix(collaboration): record persist failures on lastPersistOutcome |
| `origin/cursor/r7-2-persist-tristate-187a` | `512d493` | 228 | 0 | yes | 0 | refactor(server): 三个房间响应共用一次落盘结论读取 |
| `origin/cursor/r7-3-trim-copy-187a` | `637f8d9` | 236 | 0 | yes | 0 | fix(collab): 按落盘处置区分裁剪与跳过的提示文案 |
| `origin/cursor/r7-3b-app-persist-kind-187a` | `8244ce4` | 247 | 0 | yes | 0 | fix(collab): 把落盘处置接到项目菜单的持久化提示上 |
| `origin/cursor/r7-4-workbench-refresh-187a` | `3291932` | 220 | 0 | yes | 0 | refactor(storage-notice): move projectPackageFileName into src/lib |
| `origin/cursor/r7-5-recover-seam-187a` | `91f54bb` | 219 | 0 | yes | 0 | test(store): 给共享项目库留出后台重开探针的测试接缝 |
| `origin/cursor/r7-6-bench-occupancy-187a` | `7736b2f` | 220 | 0 | yes | 0 | docs(bench): record room snapshot occupancy |
| `origin/cursor/r7-7-test-unmount-187a` | `b32ddc7` | 219 | 0 | yes | 0 | fix(test): unmount tracked roots after each case in two leaking test files |
| `origin/cursor/r7-8-trim-journey-187a` | `4678f56` | 235 | 0 | yes | 0 | test(server): 端到端证明持久化裁剪档的房间活过重启 |
| `origin/cursor/r7-9-app-extract-187a` | `ac1b1e1` | 220 | 0 | yes | 0 | test(app): pin extracted editor seams; add App keyboard/template pins |
| `origin/cursor/r7-fable-review-187a` | `30e63d4` | 255 | 0 | yes | 0 | docs(briefing): Round 8 — 10 disjoint tasks from Round-7 evidence |
| `origin/cursor/r8-1-warn-legend-187a` | `e41aeaa` | 260 | 0 | yes | 0 | fix(collaboration): scope the flush warn legend to the outcomes that happened |
| `origin/cursor/r8-2-persist-failure-http-187a` | `0124faf` | 260 | 0 | yes | 0 | fix(server): 房间响应报出正在进行的落盘失败连击 |
| `origin/cursor/r8-3-persist-failure-copy-187a` | `d1625fa` | 279 | 0 | yes | 0 | fix(collab): tell a room's members the server cannot write to disk |
| `origin/cursor/r8-3b-app-persist-failure-187a` | `a68a230` | 294 | 0 | yes | 0 | fix(app): 把落盘失败连击接到项目菜单 |
| `origin/cursor/r8-4-banner-export-error-187a` | `376129f` | 260 | 0 | yes | 0 | fix(workbench): surface banner export failures inside the storage notice |
| `origin/cursor/r8-5-canvas-unmount-187a` | `5de889e` | 263 | 0 | yes | 0 | test: record the R8-5 leaked-root probe measurement |
| `origin/cursor/r8-6-assistant-unmount-187a` | `32103f3` | 259 | 0 | yes | 0 | fix(test): unmount tracked roots after each case in 14 component test files |
| `origin/cursor/r8-7-app-extract-187a` | `8478121` | 264 | 0 | yes | 0 | test(app): 在 App 层钉住抽出的动作接缝 |
| `origin/cursor/r8-8-durability-split-187a` | `edab090` | 260 | 0 | yes | 0 | test(server): 真磁盘写不动时的落盘失败旅程 |
| `origin/cursor/r8-9-react-refresh-187a` | `bbc7093` | 260 | 0 | yes | 0 | refactor(studio): move studioTheme and the global-data view table into src/lib |
| `origin/cursor/r8-fable-review-187a` | `9fbd5bb` | 305 | 0 | yes | 0 | docs(review): Round 8 fable review — 9 ACCEPT + 1 NITS, no merge blocker; Round 9 briefing |
| `origin/cursor/r9-1-tmp-cleanup-187a` | `f7a3171` | 309 | 0 | yes | 0 | fix(server): remove the temp file when an atomic rename fails |
| `origin/cursor/r9-2-ack-persistence-187a` | `75acccf` | 313 | 0 | yes | 0 | fix(server): report persistence on the transaction ack and stop publishing at: 0 |
| `origin/cursor/r9-3-ack-client-187a` | `208fe39` | 323 | 0 | yes | 0 | fix(collab): carry the acknowledged persistence verdict to the panel |
| `origin/cursor/r9-4-rename-journey-187a` | `cc3899e` | 322 | 0 | yes | 0 | test(server): prove the .tmp cleanup and the real errno on a rename failure |
| `origin/cursor/r9-5-app-extract-187a` | `9ff7fa1` | 310 | 0 | yes | 0 | test(app): pin the extracted lifecycle seams and the SSR fallback (R8-7 nit) |
| `origin/cursor/r9-6-leaked-root-guard-187a` | `c696c26` | 312 | 0 | yes | 0 | test(vitest): 全局兜底 —— 每个 jsdom 用例结束后检查泄漏的 React root |
| `origin/cursor/r9-7-snapshot-store-187a` | `083922d` | 322 | 0 | yes | 0 | refactor(server): extract the room snapshot store out of index.ts |
| `origin/cursor/r9-8-collab-test-split-187a` | `22d7b25` | 308 | 0 | yes | 0 | test(server): 按域拆分 collaboration 房间存储测试 |
| `origin/cursor/r9-9-app-test-split-187a` | `a28fc79` | 336 | 0 | yes | 0 | test(app): split App.test.tsx by domain behind a shared harness (R9-9) |
| `origin/cursor/r9-fable-review-187a` | `b165e0f` | 340 | 0 | yes | 0 | docs(review): Round 9 fable review — 8 ACCEPT + 1 NITS, no merge blocker; Round 10 briefing |
| `origin/cursor/rejected-landing-history-c4be` | `2b102a4` | 87 | 0 | NO | 1 | fix(project-document): stop committing refused transactions |
| `origin/cursor/reorder-function-entries-7077` | `fd443e0` | 3 | 0 | NO | 3 | refactor(app): 默认路径的全局设置入口改为跳转对应阶段 |
| `origin/cursor/report-drain-errors-contain-ondraining-f52c` | `c97a6c6` | 146 | 0 | yes | 0 | fix(server): report drain errors and contain onDraining throws |
| `origin/cursor/room-purge-lifecycle-notify-2881` | `ba4a12b` | 51 | 0 | yes | 0 | fix(collab): 房间过期purge前广播closed生命周期事件 |
| `origin/cursor/room-store-authz-cost-ba42` | `ad273bf` | 6 | 0 | yes | 0 | fix(collaboration): harden room authorization |
| `origin/cursor/server-boot-restore-logs-dd23` | `6c089fd` | 146 | 0 | yes | 0 | fix(server): honest boot restore logs and bound .bad sidecars |
| `origin/cursor/server-graceful-shutdown-af12` | `9ad48df` | 89 | 0 | NO | 3 | feat(server): 关停排空 SSE 与房间快照，启动恢复房间 |
| `origin/cursor/server-http-sse-hardening-1c22` | `d0d5945` | 8 | 0 | yes | 0 | fix(server): 处理程序排队期间已断开的 SSE 连接 |
| `origin/cursor/server-roomstore-snapshot-seam-c10f` | `ff1a854` | 119 | 0 | yes | 0 | test(server): cover corrupt-snapshot quarantine and boot restore count |
| `origin/cursor/server-shutdown-flush-errors-24cb` | `b760849` | 122 | 0 | yes | 0 | fix(server): surface shutdown flush errors and pin signal idempotence |
| `origin/cursor/share-project-store-e651` | `04ed1e9` | 146 | 0 | yes | 0 | fix(store): share one IndexedDB project store across workbench and editor |
| `origin/cursor/sota-campaign-6231` | `5c0d13f` | 112 | 0 | NO | 112 | docs: 记录第 31 轮合入并启动第 32 轮 |
| `origin/cursor/split-oversized-layout-modules-c0fa` | `0233a7a` | 7 | 0 | NO | 7 | test(layout): cover the extracted grid index and guard against state leaking between solves |
| `origin/cursor/sse-backpressure-7ca2` | `6d74d42` | 51 | 0 | yes | 0 | fix(server): SSE 背压治理——积压计量、慢订阅者断开与超大快照事件拦截 |
| `origin/cursor/store-recover-after-degrade-1171` | `1287f4f` | 122 | 0 | yes | 0 | feat(store): recover IndexedDB after sticky memory degrade |
| `origin/cursor/unify-degraded-storage-notice-9ae7` | `effc4cd` | 186 | 0 | NO | 1 | Merge remote-tracking branch 'origin/agent/opt-continuous' into cursor/unify-degraded-storage-notice-9ae7 |
| `origin/cursor/workbench-degraded-storage-notice-63ce` | `4a1c019` | 122 | 0 | yes | 0 | feat(workbench): show degraded-storage notice and quota errors |
| `origin/cursor/workbench-store-recovery-b13c` | `8c670ad` | 146 | 0 | yes | 0 | fix(workbench): refresh list on store recovery and per-project backup export |
| `origin/cursor/workbook-bench-gate-67c7` | `e2135b9` | 123 | 0 | yes | 0 | bench: record workbook repeat-import result |
| `origin/cursor/workbook-offthread-01fd` | `39e7a2f` | 51 | 0 | yes | 0 | perf: decode workbook imports off main thread |
| `origin/cursor/workbook-worker-lifecycle-ff71` | `166012d` | 86 | 0 | yes | 0 | perf: reuse workbook import worker |
| `origin/cursor/xlsx-import-fidelity-6297` | `3ae670d` | 7 | 0 | yes | 0 | fix(import): 导入面板回显未导入行并给识别加代次闸 |
| `origin/main` | `897a2a6` | 0 | 0 | yes | 0 | 把 GitHub 首页做成可打开的样例展示，并补齐开源与开学季入口。 |

---

## 2. Branches already contained in `origin/agent/opt-continuous`

**116 / 144** tips are ancestors of `d04f398`. Their unique-commit count vs opt is **0**. Taking `opt-continuous` lands every one of these SHAs.

Includes:

- `origin/main` (`897a2a6`) and `origin/agent/opt-continuous` itself (`d04f398`).
- `origin/backup/pre-template` (`a769be8`) and `origin/codex/global-data-workbench` (`5b492de`) — also **0 ahead of main**.
- All `cursor/r3-*` … `cursor/r11-*` task branches listed above (r6 through r11, plus r3-4 / r3-7 / r5-1).
- All earlier opt-campaign feature tips that `git merge-base --is-ancestor` marked `yes` (collab, crash, store, workbook, layout, server, assistant, etc.).

Full contained set (116):

- `origin/agent/opt-continuous` `d04f398` — docs(agent): close Round 11 and open Round 12
- `origin/backup/pre-template` `a769be8` — fix: IndexedDB store migration and build hardening
- `origin/codex/global-data-workbench` `5b492de` — chore: preserve normalized Git file contents
- `origin/cursor/ack-lost-convergence-fd2c` `b2564a0` — test(collab): prove ack-lost submit converges
- `origin/cursor/agent-continue-no-duplicate-user-message-37bd` `4a7cf84` — fix(agent): do not duplicate unanswered user message on continue
- `origin/cursor/agent-landing-atomicity-t10-6893` `f7a0f4e` — fix(agent): AI 落地事务全有或全无，重放失败可观测
- `origin/cursor/agent-landing-integration-29af` `996db47` — fix(agent): AI 落地被拒时在助手里说明失败步骤并保持可重试
- `origin/cursor/agent-session-clone-hotfix-933b` `b00a1ce` — fix(agent): 克隆前剥离 history，修复 AI 落地 DataCloneError
- `origin/cursor/assistant-single-resume-affordance-7954` `001fde4` — fix(assistant): single resume affordance after transport failure
- `origin/cursor/assistant-transport-retry-59f5` `3072fe9` — fix(assistant): resume conversation after retriable transport failure
- `origin/cursor/ci-serial-workflow-1c28` `2de260b` — ci: add serial typecheck, lint, and vitest workflow
- `origin/cursor/collab-client-sse-resilience-cd90` `59afae8` — fix(collab): SSE 客户端自持重连、版本连续性门控与基线竞态修复
- `origin/cursor/collab-diff-complexity-07b2` `f213734` — handle shared collaboration document references
- `origin/cursor/collab-http-partition-fb09` `11ccf8f` — fix(collab): 房间 hook 区分离线态,补齐与握手请求随房间取消
- `origin/cursor/collab-offline-terminal-taxonomy-7057` `d590e9f` — feat(collab): 协作面板区分离线与房间失效
- `origin/cursor/collab-partition-heal-resend-c84e` `8b15d5e` — fix(collab): 分区愈合后自动补投未送出的增量
- `origin/cursor/collab-send-effect-recovery-1f60` `edd2521` — fix(collab): 送出侧冲突自愈、自回声抑制与在途回执作废
- `origin/cursor/collab-taxonomy-app-wiring-d18a` `d4d137a` — fix(collab): gate expired-room sends and thread taxonomy props
- `origin/cursor/collab-terminal-rejection-a9a6` `970ea1d` — fix(collab): land roomExpired from terminal submit rejections
- `origin/cursor/crash-export-indexeddb-projects-898c` `51e326f` — feat(crash): export IndexedDB projects when workspace mirror is empty
- `origin/cursor/crash-no-hard-reload-memory-cc63` `4d914dd` — fix(crash): do not hard-reload when memory-only projects are listed
- `origin/cursor/error-boundary-disaster-export-d690` `c4bae31` — feat(error-boundary): export a workspace backup from the crash screen
- `origin/cursor/export-pipeline-robustness-7e98` `dbb101b` — test(export): 去掉多余的 eslint-disable 指令
- `origin/cursor/honest-degraded-copy-7b8f` `dc19769` — fix(crash): honest copy for degraded and in-memory-only exports
- `origin/cursor/import-size-gate-workbench-types-c9f3` `7b61877` — refactor(workbench): type the project grid against the list metadata view
- `origin/cursor/indexeddb-lifecycle-hardening-7587` `afb5bf6` — fix(store): 让 IndexedDB 连接在 versionchange / 中止 / 断连后可恢复
- `origin/cursor/layout-cache-key-bd0e` `f1c623c` — perf: hash layout cache polygon geometry
- `origin/cursor/layout-solver-broadphase-7504` `278b940` — docs(bench): note that the first measured count includes JIT warmup
- `origin/cursor/layout-worker-coalescing-66fb` `32f780d` — perf(layout): add worker burst benchmark
- `origin/cursor/layout-worker-coalescing-final-66fb` `f1aa448` — perf(layout): coalesce worker requests to latest
- `origin/cursor/package-size-caps-2e45` `7a9752b` — feat(package): 工程包导入加尺寸上限并去掉资源二次序列化
- `origin/cursor/perf-room-snapshot-c188` `0613660` — fix(collab): cap persisted room records
- `origin/cursor/project-document-commit-cost-a167` `59b6413` — Use typed clone for transaction working copy
- `origin/cursor/project-list-metadata-6e14` `852b833` — fix(projects): report atomic write aborts
- `origin/cursor/project-store-degraded-mode-87ee` `e5da7cb` — fix(import): reject oversized project packages before reading the file
- `origin/cursor/project-store-failure-taxonomy-87ee` `f5d9506` — fix(store): 项目存储失败分类与内存降级模式
- `origin/cursor/r10-1-ai-state-tmp-187a` `d730f69` — fix(ai-state): clean up the failed-rename .tmp and cap corrupt sidecars at 5
- `origin/cursor/r10-2-boot-tmp-sweep-187a` `f896e5c` — fix(r10-2): sweep crashed-boot atomic-write temporaries once at boot
- `origin/cursor/r10-3-static-files-187a` `e538d63` — refactor(r10-3): extract the static-file cluster into server/static-files.ts
- `origin/cursor/r10-4-room-routes-187a` `c06fb88` — test(server): pin the room-routes deps struct and routing seam
- `origin/cursor/r10-5-app-jsx-187a` `f4c9f1c` — test(editor): pin the extracted shells from both sides of the seam
- `origin/cursor/r10-6-hook-test-split-187a` `3c4c771` — test(collab): split useCollaborationRoom tests by domain behind a shared harness (R10-6)
- `origin/cursor/r10-7-dataworkspace-test-split-187a` `931c310` — test(data-workspace): 按域拆分 DataWorkspace 测试并抽出共享装置
- `origin/cursor/r10-8-client-test-split-187a` `2937baf` — chore(ratchet): drop the collaboration-client test allowlist entry (R10-8)
- `origin/cursor/r10-9-size-ratchet-187a` `cd4583d` — test(scripts): ratchet tracked source files at 400 lines
- `origin/cursor/r10-fable-review-187a` `f276a47` — docs(agent): Round 10 fable review and Round 11 briefing
- `origin/cursor/r11-1-ai-load-cause-187a` `b40cf32` — fix(ai-state): 加载失败保留原始 errno 到 cause
- `origin/cursor/r11-2-statedir-sweep-187a` `f54f3d0` — fix(server): 状态文件配置到 dataDir 之外时也收掉它自己的原子写孤儿
- `origin/cursor/r11-3-ai-routes-187a` `f17be4a` — test(server): pin the ai-routes seam contract
- `origin/cursor/r11-4-index-tests-187a` `27a3daf` — test(server): split index.test.ts by domain behind a shared fixture
- `origin/cursor/r11-5-app-topbar-187a` `bd38107` — test(app): pin 旧版顶栏抽出后的品牌、阶段插槽与工具栏分组
- `origin/cursor/r11-6-poster-canvas-tests-187a` `46cd6ff` — test(canvas): split PosterCanvas.test.tsx by domain behind a shared harness
- `origin/cursor/r11-7-card-layout-tests-187a` `41c2761` — test(card-layout): split the 958-line solver test into domain slices
- `origin/cursor/r11-8-agent-session-tests-187a` `65fd7ef` — test(agent-session): split the 696-line session test by domain
- `origin/cursor/r11-9-project-store-tests-187a` `547f47c` — test(project-store): drop the dead IDBFactory import from the fixtures
- `origin/cursor/r11-fable-review-187a` `f6f5285` — docs(briefing): Round 12 — App final carve, eight test splits, docs close-out
- `origin/cursor/r3-4-room-store-2529` `062cc14` — fix(collab): surface persistence flush failures asynchronously
- `origin/cursor/r3-7-ai-client-deadlines-de5e` `9658b64` — fix(agent): 给 AI 请求加可注入截止时间与可重试网络失败
- `origin/cursor/r5-1-persist-calibration-3a50` `45e8a12` — fix(collaboration): calibrate persistence cap to 8 MiB
- `origin/cursor/r6-1-history-degrade-866b` `c8bfb66` — docs(bench): record history-trim persistence numbers
- `origin/cursor/r6-2-persist-visibility-187a` `e0c7857` — feat(server): 让房间持久化死亡率可被外部观测
- `origin/cursor/r6-3-crash-disaster-187a` `9e740d9` — test(crash): 降级会话崩溃灾难全链路集成用例
- `origin/cursor/r6-5-honest-missing-project-5602` `1e0eecf` — test(lib): cover custom template capture and list overflow
- `origin/cursor/r6-5b-persist-prop-187a` `c06e96c` — fix(app): pass roomPersistenceDegraded into ProjectMenu
- `origin/cursor/r6-6-room-persist-notice-187a` `b09ed7b` — feat(collab): 把房间持久化降级告诉房里的人
- `origin/cursor/r6-9-durability-journey-187a` `900cf6a` — test(server): 房间快照跨重启的端到端耐久旅程
- `origin/cursor/r6-fable-review-187a` `d15a49c` — docs(review): Round 6 fable review and Round 7 briefing
- `origin/cursor/r7-1-persist-failure-187a` `012bc9c` — fix(collaboration): record persist failures on lastPersistOutcome
- `origin/cursor/r7-2-persist-tristate-187a` `512d493` — refactor(server): 三个房间响应共用一次落盘结论读取
- `origin/cursor/r7-3-trim-copy-187a` `637f8d9` — fix(collab): 按落盘处置区分裁剪与跳过的提示文案
- `origin/cursor/r7-3b-app-persist-kind-187a` `8244ce4` — fix(collab): 把落盘处置接到项目菜单的持久化提示上
- `origin/cursor/r7-4-workbench-refresh-187a` `3291932` — refactor(storage-notice): move projectPackageFileName into src/lib
- `origin/cursor/r7-5-recover-seam-187a` `91f54bb` — test(store): 给共享项目库留出后台重开探针的测试接缝
- `origin/cursor/r7-6-bench-occupancy-187a` `7736b2f` — docs(bench): record room snapshot occupancy
- `origin/cursor/r7-7-test-unmount-187a` `b32ddc7` — fix(test): unmount tracked roots after each case in two leaking test files
- `origin/cursor/r7-8-trim-journey-187a` `4678f56` — test(server): 端到端证明持久化裁剪档的房间活过重启
- `origin/cursor/r7-9-app-extract-187a` `ac1b1e1` — test(app): pin extracted editor seams; add App keyboard/template pins
- `origin/cursor/r7-fable-review-187a` `30e63d4` — docs(briefing): Round 8 — 10 disjoint tasks from Round-7 evidence
- `origin/cursor/r8-1-warn-legend-187a` `e41aeaa` — fix(collaboration): scope the flush warn legend to the outcomes that happened
- `origin/cursor/r8-2-persist-failure-http-187a` `0124faf` — fix(server): 房间响应报出正在进行的落盘失败连击
- `origin/cursor/r8-3-persist-failure-copy-187a` `d1625fa` — fix(collab): tell a room's members the server cannot write to disk
- `origin/cursor/r8-3b-app-persist-failure-187a` `a68a230` — fix(app): 把落盘失败连击接到项目菜单
- `origin/cursor/r8-4-banner-export-error-187a` `376129f` — fix(workbench): surface banner export failures inside the storage notice
- `origin/cursor/r8-5-canvas-unmount-187a` `5de889e` — test: record the R8-5 leaked-root probe measurement
- `origin/cursor/r8-6-assistant-unmount-187a` `32103f3` — fix(test): unmount tracked roots after each case in 14 component test files
- `origin/cursor/r8-7-app-extract-187a` `8478121` — test(app): 在 App 层钉住抽出的动作接缝
- `origin/cursor/r8-8-durability-split-187a` `edab090` — test(server): 真磁盘写不动时的落盘失败旅程
- `origin/cursor/r8-9-react-refresh-187a` `bbc7093` — refactor(studio): move studioTheme and the global-data view table into src/lib
- `origin/cursor/r8-fable-review-187a` `9fbd5bb` — docs(review): Round 8 fable review — 9 ACCEPT + 1 NITS, no merge blocker; Round 9 briefing
- `origin/cursor/r9-1-tmp-cleanup-187a` `f7a3171` — fix(server): remove the temp file when an atomic rename fails
- `origin/cursor/r9-2-ack-persistence-187a` `75acccf` — fix(server): report persistence on the transaction ack and stop publishing at: 0
- `origin/cursor/r9-3-ack-client-187a` `208fe39` — fix(collab): carry the acknowledged persistence verdict to the panel
- `origin/cursor/r9-4-rename-journey-187a` `cc3899e` — test(server): prove the .tmp cleanup and the real errno on a rename failure
- `origin/cursor/r9-5-app-extract-187a` `9ff7fa1` — test(app): pin the extracted lifecycle seams and the SSR fallback (R8-7 nit)
- `origin/cursor/r9-6-leaked-root-guard-187a` `c696c26` — test(vitest): 全局兜底 —— 每个 jsdom 用例结束后检查泄漏的 React root
- `origin/cursor/r9-7-snapshot-store-187a` `083922d` — refactor(server): extract the room snapshot store out of index.ts
- `origin/cursor/r9-8-collab-test-split-187a` `22d7b25` — test(server): 按域拆分 collaboration 房间存储测试
- `origin/cursor/r9-9-app-test-split-187a` `a28fc79` — test(app): split App.test.tsx by domain behind a shared harness (R9-9)
- `origin/cursor/r9-fable-review-187a` `b165e0f` — docs(review): Round 9 fable review — 8 ACCEPT + 1 NITS, no merge blocker; Round 10 briefing
- `origin/cursor/report-drain-errors-contain-ondraining-f52c` `c97a6c6` — fix(server): report drain errors and contain onDraining throws
- `origin/cursor/room-purge-lifecycle-notify-2881` `ba4a12b` — fix(collab): 房间过期purge前广播closed生命周期事件
- `origin/cursor/room-store-authz-cost-ba42` `ad273bf` — fix(collaboration): harden room authorization
- `origin/cursor/server-boot-restore-logs-dd23` `6c089fd` — fix(server): honest boot restore logs and bound .bad sidecars
- `origin/cursor/server-http-sse-hardening-1c22` `d0d5945` — fix(server): 处理程序排队期间已断开的 SSE 连接
- `origin/cursor/server-roomstore-snapshot-seam-c10f` `ff1a854` — test(server): cover corrupt-snapshot quarantine and boot restore count
- `origin/cursor/server-shutdown-flush-errors-24cb` `b760849` — fix(server): surface shutdown flush errors and pin signal idempotence
- `origin/cursor/share-project-store-e651` `04ed1e9` — fix(store): share one IndexedDB project store across workbench and editor
- `origin/cursor/sse-backpressure-7ca2` `6d74d42` — fix(server): SSE 背压治理——积压计量、慢订阅者断开与超大快照事件拦截
- `origin/cursor/store-recover-after-degrade-1171` `1287f4f` — feat(store): recover IndexedDB after sticky memory degrade
- `origin/cursor/workbench-degraded-storage-notice-63ce` `4a1c019` — feat(workbench): show degraded-storage notice and quota errors
- `origin/cursor/workbench-store-recovery-b13c` `8c670ad` — fix(workbench): refresh list on store recovery and per-project backup export
- `origin/cursor/workbook-bench-gate-67c7` `e2135b9` — bench: record workbook repeat-import result
- `origin/cursor/workbook-offthread-01fd` `39e7a2f` — perf: decode workbook imports off main thread
- `origin/cursor/workbook-worker-lifecycle-ff71` `166012d` — perf: reuse workbook import worker
- `origin/cursor/xlsx-import-fidelity-6297` `3ae670d` — fix(import): 导入面板回显未导入行并给识别加代次闸
- `origin/main` `897a2a6` — 把 GitHub 首页做成可打开的样例展示，并补齐开源与开学季入口。

---

## 3. Branches with unique commits vs `opt-continuous`

**28** tips are not ancestors of `d04f398`. Unique SHAs below are `git log origin/agent/opt-continuous..<branch>` (includes merges; `--no-merges` is identical except for `unify-degraded-storage-notice-9ae7`, which is merge-only).

Patch-id equivalents (same `git patch-id --stable`, different SHA) are called out. Those commits are **already in opt under another SHA**.

### 3.1 Unique SHA but already in opt (skip as already-merged)

#### `origin/cursor/agent-landing-atomicity-6893` (`3944d88`) — 1 unique SHA

- `3944d88` bench collaboration document diff scenarios

Equivalent already on opt: `9c20c24` (same patch-id `0e7f2306…`, same blob `dc060f4f…` for `scripts/perf-collab-diff-bench.ts`, which is **present** on opt).  
Sibling `origin/cursor/agent-landing-atomicity-t10-6893` (`f7a0f4e`) **is** an ancestor of opt.

#### `origin/cursor/rejected-landing-history-c4be` (`2b102a4`) — 1 unique SHA

- `2b102a4` fix(project-document): stop committing refused transactions

Equivalent already on opt: `50f858a` (same patch-id `93671e0d…`).

#### `origin/cursor/server-graceful-shutdown-af12` (`9ad48df`) — 3 unique SHAs

- `9ad48df` feat(server): 关停排空 SSE 与房间快照，启动恢复房间
- `5d4a984` fix(store): 项目存储失败分类与内存降级模式
- `2b102a4` fix(project-document): stop committing refused transactions

Equivalents already on opt (same patch-ids): `ada36f4`, `f5d9506`, `50f858a`.  
`origin/cursor/project-store-failure-taxonomy-87ee` (`f5d9506`) is an ancestor of opt.  
`rejected-landing-history-c4be` is an ancestor of this branch.

#### `origin/cursor/unify-degraded-storage-notice-9ae7` (`effc4cd`) — 1 unique SHA (merge only)

- `effc4cd` Merge remote-tracking branch 'origin/agent/opt-continuous' into cursor/unify-degraded-storage-notice-9ae7

`--no-merges` unique count = **0**. Parents `af002ab` and `a891031` are both merge-bases with current opt; `af002ab` (“unify degraded-storage notice”) is already on opt. `src/components/StorageNotice.tsx` is **present** on opt (blob `3abc25eb`, later evolved). Unique SHA is an empty-of-work merge commit.

### 3.2 Unique vs opt — r12 (based on `d04f398`, 0 behind opt)

All nine share a three-dot merge-base of `d04f398`. Shared conflict file: `scripts/file-size-allowlist.json`. Other files are disjoint.

#### `origin/cursor/r12-1-app-stage-187a` (`153241a`) — 2 unique; main+407

- `153241a` test(editor): 为拆出的中栏/右栏补组件侧与 App 侧接缝 pin
- `1c169b2` refactor(app): 抽出旧版编辑器中栏与右栏到 src/components/editor/

#### `origin/cursor/r12-2-maplayer-tests-187a` (`a292a4a`) — 1 unique; main+406

- `a292a4a` test(canvas): 按域拆分 MapLayer 测试并共用挂载装置

#### `origin/cursor/r12-3-error-boundary-tests-187a` (`bd05814`) — 2 unique; main+407

- `bd05814` test(error-boundary): 崩溃子树单独成文件以清掉 react-refresh 警告
- `1c1c9f3` test(error-boundary): 按域拆分崩溃屏用例并抽出共享装置

#### `origin/cursor/r12-4-asset-panel-tests-187a` (`3c7204c`) — 1 unique; main+406

- `3c7204c` test(assets): 按域拆分 AssetPanel 测试并抽出共享装置

#### `origin/cursor/r12-5-agent-assistant-tests-187a` (`7bfd7ee`) — 1 unique; main+406

- `7bfd7ee` test(assistant): 按域拆分 AgentAssistant 用例并集中传输替身

#### `origin/cursor/r12-6-workbench-tests-187a` (`db14089`) — 1 unique; main+406

- `db14089` test(workbench): 按域拆分 ProjectWorkbench 测试并共用装置

#### `origin/cursor/r12-7-export-poster-tests-187a` (`92f5f60`) — 1 unique; main+406

- `92f5f60` test(export-poster): 按域拆分海报导出测试并集中替身

#### `origin/cursor/r12-8-binary-import-tests-187a` (`10baffe`) — 1 unique; main+406

- `10baffe` test(binary-import): 按领域拆分导入测试并抽出 GB18030 夹具

#### `origin/cursor/r12-9-conversation-store-tests-187a` (`f36bc4c`) — 1 unique; main+406

- `f36bc4c` test(agent-conversation-store): split the 464-line suite by domain

r12 unique commit total (union, no overlap): **11 commits**.

### 3.3 Unique vs opt — independent lines off `897a2a6`

These are **not** ancestors of opt. Merge-base with opt is `897a2a6` unless noted. Shared commit count between `sota-campaign-6231` and `agent-sota-polish-cbcd` vs main: **0**.

#### `origin/cursor/add-cloud-agent-environment-7fd5` (`0925b7e`) — 1

- `0925b7e` chore(env): add Cloud Agent development environment config

`.cursor/environment.json` is **absent** on opt.

#### `origin/cursor/ai-assistant-optimize-6231` (`5fd5ee1`) — 1

- `5fd5ee1` 优化 AI 辅助编辑：降低消耗并提高理解与操作准确性

This SHA **is** an ancestor of `origin/cursor/sota-campaign-6231`.

#### `origin/cursor/market-practical-optimize-9c93` (`9347413`) — 1

- `9347413` 为市场化补印刷尺寸与案例模板，并写下产品收口判断。

`src/lib/print-size.ts` is **absent** on opt.

#### `origin/cursor/public-static-demo-304c` (`5e5405c`) — 1

- `5e5405c` feat: 支持用 Cloudflare Pages / GitHub Pages 做公开演示站

`wrangler.toml` is **absent** on opt.

#### `origin/cursor/normalize-repo-content-1fd7` (`933b4d0`) — 1

- `933b4d0` chore(repo): 清理本地 agent、隐私与宣发材料

Three-dot vs opt: **121 files, +104 / −92513**. Destructive cleanup.

#### `origin/cursor/ci-legacy-editor-shell-9c93` (`28b0654`) — 1

- `28b0654` 去掉三栏旧编辑器，并加上顺序执行的 CI 门禁。

Ancestor of `editor-perf-shell-9c93`. Opt already contains `origin/cursor/ci-serial-workflow-1c28` (`2de260b`) for serial CI, but **does not** contain `28b0654`.

#### `origin/cursor/editor-perf-shell-9c93` (`ca5def7`) — 3 (superset of ci-legacy)

- `ca5def7` 修复窄屏 matchMedia 泄漏，并去掉壳层里同步 setState 的 effect。
- `0a9fad3` 降低编辑器首屏体积，并收口窄屏侧栏与保存状态。
- `28b0654` 去掉三栏旧编辑器，并加上顺序执行的 CI 门禁。

#### `origin/cursor/reorder-function-entries-7077` (`fd443e0`) — 3

- `fd443e0` refactor(app): 默认路径的全局设置入口改为跳转对应阶段
- `f98573c` refactor(data-stage): 名单侧栏移除素材库入口，素材主入口归内容阶段
- `ac78291` feat(workflow): 一级步骤条文案改为用户目标（名单/地图/版式/内容/交付）

Ancestor of `optimize-studio-ux-7077`.

#### `origin/cursor/optimize-studio-ux-7077` (`373d91b`) — 11 (superset of reorder)

- `373d91b` feat(ux): 三项 P2 细节——空名单默认「本阶段」、交付全绿摘要、素材库按选中收起
- `dcb92c9` feat(project-menu): 导出海报组补「导出 PNG」快捷入口
- `2348ea5` feat(stage-overview): 本阶段总览在健康时给出「下一步」跳转卡
- `2113c2e` feat(frame-stage): 版式中栏改为实时画布，整体模板回到版式右栏
- `5c8c4cd` feat(data-stage): 名单阶段恢复导入模板下载，隐藏重复的旧标题
- `27f3e02` docs: 步骤说明与编辑器一致（名单→地图→版式→内容→交付）
- `06f4b26` refactor(rail): public 高级入口名实相符，渲染间隔改为只读展示
- `8f0a9cc` refactor(workspaces): 主区域标题与步骤条统一为短名（地图/版式/内容/交付）
- `fd443e0` refactor(app): 默认路径的全局设置入口改为跳转对应阶段
- `f98573c` refactor(data-stage): 名单侧栏移除素材库入口，素材主入口归内容阶段
- `ac78291` feat(workflow): 一级步骤条文案改为用户目标（名单/地图/版式/内容/交付）

#### `origin/cursor/canvas-render-display-46a1` (`dc0e459`) — 28

- `dc0e459` docs(agent): Cycle 3 Round 3 freeze ACCEPT — pan ~4.0ms @24
- `3e3928e` test(canvas): lock polygon-origin and MapLayer pan isolation
- `d43631c` docs(agent): dispatch Cycle 3 Round 3 freeze after MapLayer memo
- `91cc75b` docs(agent): Cycle 3 Round 2 conclusion — pan ~4.2ms @24
- `96a7652` perf(canvas): skip MapLayer content subtree on pan
- `e4c0d4c` test(layout): lock affine card-layout cache key invariants
- `7cc4fb6` refactor(canvas): extract destinationCardFlowContentStart
- `5ef65d5` docs(agent): dispatch Cycle 3 Round 2 after affine layout keys
- `451fff3` perf(canvas): affine layout keys and scoped connector filters
- `b2c4bdc` docs(agent): dispatch Cycle 3 Round 1 after province pan cache
- `5fa70cb` perf(canvas): cache projected provinces across map pan
- `a25991d` docs(agent): dispatch Cycle 2 Round 3 after frozen-layout skip
- `67e7269` perf(canvas): skip frozen layout on pan and unify card row height
- `07cf4f3` docs(agent): dispatch Cycle 2 Round 2 after wrap/layer split
- `1d8932c` perf(canvas): isolate card wrap from map pan and extract cards layer
- `0d0cd86` docs(agent): dispatch Cycle 2 Round 1 after canvas SOTA close
- `7c9bd35` perf(canvas): memo PosterCanvas, extract GuestsLayer, cache map paths
- `1bd0f8a` docs(agent): dispatch Cycle 1 Round 3 subagents
- `3a7203d` docs(agent): record Cycle 1 Round 2 conclusion and Round 3 plan
- `0a13e8b` docs(agent): add Cycle 1 Round 2 canvas SOTA re-audit
- `ce8f11b` fix(canvas): stabilize callbacks, keep layout, reset card templates
- `3dc2684` docs(agent): dispatch Cycle 1 Round 2 subagents
- `4421d74` docs(agent): record Cycle 1 Round 1 conclusion and Round 2 ownership
- `47dee26` 文档：记录 cycle1 round1 画布渲染优化报告
- `72dce16` 测试：覆盖 DestinationCard 渲染契约与画布重渲染范围
- `44312ea` 重构：抽出 DestinationCard 记忆化组件并收窄画布重渲染范围
- `731dbb6` docs(agent): record Cycle 1 Round 1 subagent dispatch
- `2b7f64f` docs(agent): initialize canvas render/display-frame performance workspace

#### `origin/cursor/feature-expansion-research-c710` (`cb4bb12`) — 15

- `cb4bb12` fix(a11y): keep empty import live regions CSS :empty
- `18a45f9` fix(cycle3): align package names, drop leftover CSS, guard PNG busy
- `4aa8f89` feat(cycle3): import alerts, package filenames, help changelog, dead CSS
- `ad43e94` docs: record P3 export validation
- `4abc3b2` fix: disable PNG export during any export
- `ac4cfd4` docs(agent): 锁定 Cycle 3 收口项（工程包文件名、帮助 Changelog、导入 alert）
- `ac6b6fa` fix: 模板交换状态行保持读屏树，并校正工程包文件名说明
- `c474454` docs: record final test battery results
- `cf5a815` docs: 补齐 Cycle 2 变更说明并加固导出成功条测试
- `793d80b` feat: 补齐空名单健康、导出结果条、导入 live region 与主路径模板交换
- `23231b5` docs(agent): 锁定 Cycle 2 剩余建议（aria-live、结果条、空名单、模板可达性）
- `1f2ea3b` feat: 落地应用内反馈、社区模板交换与非付费角色钩子
- `9e7f977` docs(agent): 归档 Round 2 规格并锁定 Round 3 实现包
- `0507d71` docs(agent): 归档 Round 1 六路调研并提炼结论简报
- `3811e17` chore(agent): 初始化功能拓展调研工作区与进度文档

#### `origin/cursor/fix-round1-issues-2c89` (`8f2f3c7`) — 27

- `8f2f3c7` fix(I-14-01/I-14-03): 跨项目重绑时清空输入框草稿；forgetRoomAccess 提升为模块级函数修复 lint error
- `da14564` fix: 修复第 14 轮步骤二提出的 5 条问题 (I-14-01~I-14-05)
- `fc6aad0` fix(I-13-03): 卸载重挂载路径同样丢弃跨项目「已应用」幽灵
- `5f97a4c` fix: 修复第 13 轮步骤二提出的 4 条问题 (I-13-01~I-13-04)
- `7692786` fix: 修复第 12 轮步骤二提出的 4 条问题 (I-12-01~I-12-04)
- `95e9736` fix: 修复第 11 轮步骤二提出的 2 条问题 (I-11-01~I-11-02)
- `49c2f63` fix(build): ParseDataResult 候选类型对齐服务端 ImportCandidate（补齐 locationScope/warnings，修复 I-10-01 引入的 tsc 失败）
- `51837df` fix(I-10-01): 一键导入路径也回显去向类型枚举外的可读提示
- `db84962` fix: 修复第 10 轮步骤二提出的 4 条问题 (I-10-01~I-10-04)
- `ea258d7` fix(I-9-01): 编辑器空嘉宾框整组标记 data-editor-placeholder，共享导出 ref 序列化时同样剔除
- `ed7aa46` fix: 修复第 9 轮步骤二提出的 2 条问题 (I-9-01~I-9-02)
- `98d24e3` chore: 移除误提交的本地验收临时脚本并忽略 scripts/.e2e-tmp
- `4ae9702` fix: 修复第 8 轮步骤二提出的 2 条问题 (I-8-01~I-8-02)
- `b9e5b7b` fix(project-save): pagehide 仅在 pending/saving/failed 时写草稿镜像
- `7f3b847` fix: 修复第 7 轮步骤二提出的 5 条问题 (I-7-01~I-7-05)
- `c8b4888` test: 更新 styles.test 过期断言以匹配第 4 轮响应式导出按钮列
- `82ce519` fix: 修复第 6 轮步骤二提出的 5 条问题 (I-6-01~I-6-05)
- `09a15ad` fix(export): 导出序列化剔除 data-editor-placeholder，空嘉宾占位不再进入 PNG/SVG
- `58597e7` fix: 修复第 5 轮步骤二提出的 6 条问题 (I-5-01~I-5-06)
- `2051f05` fix: 修复第 4 轮步骤二提出的 7 条问题 (I-4-01~I-4-07)
- `8200b8f` test(app): 修正抽屉打开时 docked 实例数的过期断言（内容移动而非复制，基线即失败）
- `ca2993e` fix: 修复第 3 轮步骤二提出的 9 条问题 (I-3-01~I-3-09)
- `861e804` fix(status-toast): 渲染期间重置可见性，消除 effect 内同步 setState 的 lint error
- `a526ed5` fix(project-menu): 菜单动作先关闭再执行，避免外点关闭逻辑吞掉后续对话框点击
- `a762253` fix: 修复第 2 轮步骤二提出的 9 条问题 (I-2-01~I-2-09)
- `672dba4` fix(status-toast): 自动隐藏状态条并支持相同消息重复提示
- `562c743` fix: 修复步骤一提出的 12 条可用性问题 (I-01~I-12)

#### `origin/cursor/split-oversized-layout-modules-c0fa` (`0233a7a`) — 7

- `0233a7a` test(layout): cover the extracted grid index and guard against state leaking between solves
- `15dd39e` refactor(layout): split oversized layout modules under the 400-line rule
- `43fb738` feat: Round 3 — collaboration hooks, layout search short-circuit, and API hardening.
- `3e17d6a` feat: Round 2 — split remaining App chrome, revive connector search, tighten data and API.
- `38ae841` refactor: Round 1 SOTA polish — split App/layout/data/server and harden a11y.
- `252b607` docs: record layout performance baseline
- `792d017` test: add layout performance regression guards

Shared exact SHAs with `agent-sota-polish-cbcd`: `252b607`, `38ae841`, `3e17d6a`, `43fb738`, `792d017`.  
Rewritten equivalents on polish (same patch-id, different SHA): `15dd39e` ≡ `1c80a96` (`58fa4843…`); `0233a7a` ≡ `1671695` (`37d9a64d…`).  
Not an ancestor of polish (rewritten tips). If polish is merged, this branch adds **no additional patch**.

#### `origin/cursor/agent-sota-polish-cbcd` (`b63c3bc`) — 62

Parallel campaign off `897a2a6`. Three-dot vs opt: **517 files, +53959 / −13454**. Unique SHA list (newest first):

- `b63c3bc` docs: Round 32 verification — tsc clean, eslint --max-warnings 0, 226 files / 2037 tests.
- `179aab2` feat: Round 32 — workbench skip-link, emblem a11y, leftover side remap, mapped IP helper.
- `5e102eb` docs: Round 31 verification — tsc clean, eslint --max-warnings 0, 226 files / 2024 tests.
- `daf2c31` feat: Round 31 — workbench icons, search leftover lock, vertical colon, mapped hex IP.
- `95e67d3` docs: Round 30 verification — tsc clean, eslint --max-warnings 0, 224 files / 2006 tests.
- `db8403c` feat: Round 30 — review/nav icons, leftover order, HTML emsp13, mapped loopback Host.
- `8f6bdcb` docs: Round 29 verification — tsc clean, eslint --max-warnings 0, 223 files / 1991 tests.
- `d1b667f` feat: Round 29 — map/stage icons, pinned sideOf, Word numsp, case-insensitive ::ffff:.
- `652ef42` docs: Round 28 verification — tsc clean, eslint --max-warnings 0, 221 files / 1979 tests.
- `70edba9` feat: Round 28 — canvas/cards icons, fallback orderResult, ﹕ delimiter, quoted XFF.
- `3777491` docs: Round 27 verification — tsc clean, eslint --max-warnings 0, 221 files / 1966 tests.
- `b0a4ebe` feat: Round 27 — inspector icons, slotPlacements marginSeat, ﹔ delimiter, XFF IPv6 brackets.
- `58c82ef` docs: Round 26 verification — tsc clean, eslint --max-warnings 0, 221 files / 1957 tests.
- `6c6363a` feat: Round 26 — library/guest icons, packSides orderResult, HTML emsp, skip unknown XFF.
- `0765315` docs: Round 25 verification — tsc clean, eslint --max-warnings 0, 220 files / 1947 tests.
- `f103568` feat: Round 25 — library/table icons, repackAll orderResult, ﹑ delimiter, IPv4 :port.
- `0ed697f` docs: Round 24 verification — tsc clean, eslint --max-warnings 0, 218 files / 1933 tests.
- `e7783e1` fix: allow duplicate Forwarded headers in clientIp unit tests.
- `41e6c1a` feat: Round 24 — PNG button type, drawer icon, layoutGrid orderResult, ／ delimiter, Forwarded.
- `5483ae3` docs: Round 23 verification — tsc clean, eslint --max-warnings 0, 218 files / 1913 tests.
- `4840d63` feat: Round 23 — extract StudioBrand, packSides marginSeat, fullwidth colon, clientIp module.
- `c653d86` docs: Round 22 verification — tsc clean, eslint --max-warnings 0, 217 files / 1898 tests.
- `10393d0` feat: Round 22 — brand icon a11y, layoutGrid leftover stack, fullwidth pipe, X-Real-IP.
- `38a3cc2` docs: Round 21 verification — tsc clean, eslint --max-warnings 0, 216 files / 1886 tests.
- `d225616` feat: Round 21 — fullwidth list markers, leftover marginSeat, XFF rightmost hop.
- `ff6ed37` docs: Round 20 verification — tsc clean, eslint --max-warnings 0, 212 files / 1866 tests.
- `6784f2f` feat: Round 20 — layoutGrid sideOf, fullwidth 序号, hide menu icons.
- `2345240` docs: Round 19 verification — tsc clean, eslint --max-warnings 0, 211 files / 1853 tests.
- `a664d44` feat: Round 19 — required orderResult space, react-refresh splits, leading 序号.
- `1cafc31` docs: Round 18 verification — tsc clean, eslint clean, 210 files / 1846 tests.
- `f55b8bf` feat: Round 18 — orderResult margin seat, settings skip-link, headerless 学号.
- `065350d` docs: Round 17 verification — tsc clean, 210 files / 1831 tests.
- `f3ea1c6` feat: Round 17 — stackAtMargin gap, settings undo live region, honest unlabeled import.
- `06b2e77` docs: Round 16 verification — tsc clean, 208 files / 1808 tests.
- `a5bd6cd` feat: Round 16 — stackAtMargin rescan, legacy undo live region, honest rawLine.
- `8b7808c` docs: Round 15 verification — tsc clean, 206 files / 1796 tests.
- `e55eef3` feat: Round 15 — locate targets, topbar live region, leftover side, CI.
- `40e7dd3` docs: Round 14 verification — tsc clean, 203 files / 1781 tests.
- `ce376d8` feat: Round 14 — issue targets, overseas scope, isotonic tail clamp.
- `9ba3cc0` docs: Round 13 verification — tsc clean, 203 files / 1762 tests.
- `e88f840` feat: Round 13 — empty matrix cells, listitem chips, locate, dup fold.
- `436c0d0` docs: Round 12 verification — tsc clean, 202 files / 1740 tests.
- `3eb2e45` feat: Round 12 — split HTML parser, leaders through cards, Host check.
- `953d130` docs: Round 11 verification — tsc clean, 201 files / 1719 tests.
- `22ee176` feat: Round 11 — agent health parity, province anchors, nested tables.
- `4a8c78a` docs: Round 10 verification — tsc clean, 200 files / 1699 tests.
- `8d7dfdd` feat: Round 10 — honest layout health, bleed preview, import fallbacks.
- `a9f67f4` docs: Round 9 verification — tsc clean, 199 files / 1658 tests.
- `0a44a9b` feat: Round 9 — App test split, ghost cards, import honesty, JSON 415.
- `928fe34` docs: Round 8 verification — tsc clean, 187 files / 1635 tests.
- `8bdef75` feat: Round 8 — print preflight, delivery bleed sizes, helper split.
- `9fb9c6c` feat: Round 7 — print bleed export, agent-session split, collab file locks.
- `c4f4953` refactor: Round 6 — bring remaining editor modules under 400 lines.
- `e64b01f` feat: Round 5 — split PosterCanvas and scene/migration, persist collab snapshots.
- `dc93fe0` feat: Round 4 — App under 400 lines, layout module split, HTML paste import, a11y toggles.
- `1671695` test(layout): cover the extracted grid index and guard against state leaking between solves
- `1c80a96` refactor(layout): split oversized layout modules under the 400-line rule
- `43fb738` feat: Round 3 — collaboration hooks, layout search short-circuit, and API hardening.
- `3e17d6a` feat: Round 2 — split remaining App chrome, revive connector search, tighten data and API.
- `38ae841` refactor: Round 1 SOTA polish — split App/layout/data/server and harden a11y.
- `252b607` docs: record layout performance baseline
- `792d017` test: add layout performance regression guards

#### `origin/cursor/sota-campaign-6231` (`5c0d13f`) — 112

Parallel campaign off `897a2a6` (includes `5fd5ee1`). Three-dot vs opt: **191 files, +24038 / −6077**. No shared unique-from-main SHAs with polish. Unique SHA list (newest first):

- `5c0d13f` docs: 记录第 31 轮合入并启动第 32 轮
- `7507a2c` fix(export): 工程包与资源包导出前按 24MB 做体积预警
- `8bb40d3` fix(store): 解析失败的项目降级可见，不再当空库重播示例
- `99e0ba2` fix(import): 工程包模板 scene 与 document 内嵌图走同一套体积剥离
- `db804cb` docs: 记录第 30 轮合入并启动第 31 轮
- `3b10942` fix(import): 工程包剥离警告展示给用户且不写入项目库
- `96d3302` fix(canvas): 文本拖拽期间用 transform 做实时预览
- `ec940de` fix(export): 序列化 SVG 时剔除缩放手柄与省份编辑层
- `441b10c` fix(collab): SSE 增量要求版本连续，跳变走快照或区间补齐
- `602541b` fix(ai): 只读熔断扫描跳过末尾用户回声
- `beb8919` docs: 记录第 29 轮合入并启动第 30 轮
- `fcc3893` fix(import): 资源包去重后把工程里的字体引用 remap 回保留 id
- `25c499a` fix(collab): 无效凭证探查房间不再 touch 续命
- `f1ecc47` docs: 记录第 28 轮合入并启动第 29 轮
- `c23ebb2` fix(a11y): 嘉宾面板支持键盘选中与方向键移动
- `cf746b6` fix(import): CSV 先按 UTF-8 再回退 GB18030 解码
- `9ff7776` fix(export): PNG/SVG 导出前把校徽路径内联为 data URL
- `f640bd2` fix(collab): 未就绪房间拒绝增量事务
- `6c70a9e` fix(ai): 多步任务中途上游失败不再伪装成本地成功
- `92e3ad1` docs: 记录第 27 轮合入并启动第 28 轮
- `3fc2157` fix(ui): 嘉宾头像上传失败给出提示并立即清空文件框
- `9d75f3a` fix(ai): 对话持久化超 256KB 时淘汰最旧会话而非整表弃写
- `ad62bf0` fix(collab): 加入房间与远端更新时同步 roomVersion 状态
- `4f6c919` docs: 记录第 26 轮合入并启动第 27 轮
- `81fdc5f` fix(ai): 429 限流文案带上 Retry-After 秒数
- `5d6eaa0` fix(import): 资源包导入增加 24MB 体积上限
- `24c03a3` fix(ui): 删除字体前弹出确认并列出引用位置
- `950b5a9` fix(export): 工程包与资源包下载改为延迟回收 object URL
- `cc0cd81` docs: 启动第 26 轮落地
- `80ae8c1` docs: 记录第 25 轮合入与下一轮候选
- `8805f0e` fix(canvas): 点击背景层也能选中画布
- `efc8545` chore: 删除不安全的 createLocalStorageMirror
- `699ec74` fix(a11y): 进出全局设置时管理焦点落点
- `3590723` fix(ai): 任务段边界改为最后一条真实用户消息
- `c9fa845` docs: 记录第 24 轮合入并启动第 25 轮
- `b3887ca` fix(health): 同层对象重叠也报告 occlusion
- `5c8f615` fix(import): 字体按字节去重时保留 id 映射并回写引用
- `fa21eec` fix(export): 默认编辑器路径挂上导出工程确认框
- `775c89d` fix(import): 工作台导入工程包同样执行 24MB 体积检查
- `7258c73` fix(export): SVG 文本下载改为延迟回收 object URL
- `b8634b3` docs: 记录第 23 轮合入并启动第 24 轮
- `a94199b` fix(canvas): 嘉宾面板零位移单击不再提交移动
- `706ad47` fix(collab): SSE 心跳不再 touch 房间，邀请设每房上限
- `7540aaf` fix(collab): 被踢端订阅 onKicked 并清本地房间状态
- `3537ee9` fix(ai): 禁止并发会话并在续聊时保留用户取消的勾选
- `97ab961` fix(ai): 续聊瞬时失败时连同影子工程与步骤一起回滚
- `79c2d2c` docs: 记录第 22 轮复查并启动第 23 轮
- `4de89ea` docs: 记录第 21 轮合入并启动第 22 轮复查
- `8173313` chore: 删除无引用的 /api/workspace 客户端封装
- `fada190` fix(store): 编辑器自动保存工作区时传入 expectedExportedAt
- `30b03ab` fix(import): Excel 按表头质量选择工作表而不只读第一张
- `bd3f626` fix(a11y): 自绘对话框增加焦点圈闭、Esc 与焦点归还
- `3c671dc` fix(ai): 续聊瞬时失败后复用原会话并回滚悬空提问
- `5fcff94` docs: 记录第 20 轮合入并启动第 21 轮
- `c587e8d` fix(ui): 滑条在拖动与键盘调节时立即提交
- `c88e21e` fix(a11y): SearchCombobox 的 aria-expanded 与 listbox 一致
- `9939879` fix(import): 工程包水化时丢弃超限字体与素材
- `011f7f6` fix(store): 工作区快照支持 expectedExportedAt CAS
- `0c1ef79` docs: 记录第 19 轮合入并启动第 20 轮
- `17cfff7` chore: 删除无引用的工作流 UI 与 localStorage 死写路径
- `3cb2ca0` fix(import): 表格与工程包设体积上限并改用自绘确认框
- `9934ffe` fix(a11y): 编辑器右栏按视口只挂载一份
- `c952a7d` fix(a11y): 数据与设置 tablist 支持方向键与 Home/End
- `aa1c7b4` fix(collab): SSE 心跳改为 ping 事件并加看门狗重连
- `eb26743` docs: 记录第 18 轮合入并启动第 19 轮
- `9c01f9d` chore: 删除无引用的 editor-commands 死代码层
- `6cffc15` fix(fonts): 上传字体设 5MB 上限并按字节去重
- `aa89d6e` fix(store): 项目保存支持 expectedUpdatedAt CAS，避免多标签页互覆盖
- `f97fe13` docs: 记录第 17 轮合入并启动第 18 轮
- `1bd755d` fix(assets): 上传图片按用途降采样后再写入工程
- `1ef9e71` fix(export): PNG 倍率按 64MP 面积上限禁用并提前报错
- `703b6c2` fix(collab): 房间 TTL 过期时广播 closed 并结束订阅
- `6dda451` fix(workbench): 重命名与删除改为自绘对话框
- `8524dc2` docs: 记录第 16 轮合入并启动第 17 轮
- `6d0b1ab` fix(import): parse-data 上送前征得一次性告知同意
- `ad81921` fix(server): 限流键取 XFF 末跳，ticket 按 IP 与房间分池
- `7a557ba` fix(collab): 非终局断流后换新 ticket 重建 SSE
- `10d9966` fix(a11y): rail 元素 listbox 改为 roving tabindex
- `adc6ebc` docs: 记录第 15 轮合入并启动第 16 轮
- `bb9ab5b` fix(layout): 健康检查对齐求解器的同锚点豁免与压图开关
- `1d4ddae` fix(settings): 全局设置挂 StatusBar，模板保存改为可取消对话框
- `a1ff3b2` fix(assistant): 草稿与 rail tab 提到 Provider，关抽屉不再丢输入
- `449873d` fix(collab): 踢人广播 kicked 并掐断被踢者 SSE
- `08c33a1` fix(ai): parse-data 补可选去向类型与省份
- `c8c5ed1` docs: 记录第 14 轮合入并启动第 15 轮落地
- `6f9a497` fix(import): 任意行表头不得落成学生，OCR 先按原文解析
- `0a85a1c` fix(ai): 续聊按任务段计拒绝、写入 finish 总结、放行统计预路由
- `eaee611` fix(collab): 按角色判定房主，拒绝伪造 clientId 越权
- `9cf29ef` fix(workbench): 面板宽度改为单一 store，resize 不再覆写拖拽值
- `c879bd9` fix(canvas): 拖拽只改连线 path，求解 pending 保留上一帧
- `0fd3bea` docs: 记录第 13 轮复查结论并启动第 14 轮落地
- `f538f93` docs: 启动第 13 轮全仓剩余缺口复查
- `2206186` docs: 记录第 5 轮复查跟进
- `9d92f1a` 跟进第 5 轮复查：抽屉外改项目不再回写旧预览
- `4deb297` 落地第 12 轮：踢人撤令牌、预路由词表、PNG blob 与偏好拆分
- `f0f33bc` 落地第 11 轮：去重保留投影骨架、分组多卡覆盖与导入 a11y
- `061dce9` docs: 修正 binary-import 中过时的省份列回滚注释
- `0cc9a14` 落地第 10 轮：digest 跨层去重、协作冲突补齐与卡片交互
- `e86e594` 落地第 9 轮：删除死端点、core digest、省份映射与嘉宾口径
- `5cdd6ba` 落地第 8 轮：省份写回、可写白名单、回执过期与工作台打磨
- `071eeb3` 落地第 7 轮：省份列、分层 digest、续聊去重与健康检查缓存
- `febac66` docs: 补记第 6 轮合入与第 7 轮启动
- `b2746bb` 落地第 6 轮：续聊快照 v3、导入区入口与死代码清理
- `d81b167` 落地第 5 轮：健康检查降频、抽屉不打断 Agent、协作 leave 收紧
- `53e70bb` docs: 修正 DEVELOPER.md 中过时的 server 路径与 AI 白名单文件
- `99282a0` docs: 把 API 路径与导入模板来源改成与代码一致
- `dff8d9f` 落地第 4 轮：客户端预算镜像、空列防串列与兜底收紧
- `f245b6a` 落地第 3 轮：同源健康检查、digest.layout、导入报告与预路由
- `5eac6b3` 落地第 2 轮：真值几何、预算计量、导入零静默与工作台反馈
- `8af830b` docs: 记录第 1 轮五区审计结论并启动第 2 轮落地
- `2f03cc8` docs: 建立 SOTA 持久优化战役进度与选型记录
- `5fd5ee1` 优化 AI 辅助编辑：降低消耗并提高理解与操作准确性

---

## 4. SKIP list (backup / already-merged / empty)

Do **not** merge these after taking `opt-continuous`. Reasons are from ancestor checks, patch-id, or 0-ahead.

| branch | tip | reason |
|---|---|---|
| `origin/main` | `897a2a6` | already-merged; current merge-branch tip; 0/0 vs itself |
| `origin/agent/opt-continuous` | `d04f398` | **starting point**, not a later merge target |
| `origin/backup/pre-template` | `a769be8` | **backup**; ancestor of opt; **0 ahead / 31 behind** main |
| `origin/codex/global-data-workbench` | `5b492de` | already-merged (PR #1 merged 2026-08-03); ancestor of opt; **0 ahead / 81 behind** main |
| remaining **112 contained** feature tips in §2 | (see table) | already-merged: `git merge-base --is-ancestor` = yes (116 total = main + opt + backup + codex + these 112) |
| `origin/cursor/unify-degraded-storage-notice-9ae7` | `effc4cd` | **empty** of unique non-merge commits; both parents already in opt; feature `af002ab` on opt |
| `origin/cursor/agent-landing-atomicity-6893` | `3944d88` | already-merged by patch-id (`9c20c24` on opt); file blob identical |
| `origin/cursor/rejected-landing-history-c4be` | `2b102a4` | already-merged by patch-id (`50f858a` on opt) |
| `origin/cursor/server-graceful-shutdown-af12` | `9ad48df` | already-merged by patch-id (`ada36f4` + `f5d9506` + `50f858a` on opt) |

### Redundant subsets (skip if the listed parent is merged)

These still have unique SHAs vs opt, but they are stacks:

| skip | because parent contains the same SHAs (or same patch-ids) |
|---|---|
| `cursor/ci-legacy-editor-shell-9c93` | ancestor of `cursor/editor-perf-shell-9c93` |
| `cursor/reorder-function-entries-7077` | ancestor of `cursor/optimize-studio-ux-7077` |
| `cursor/ai-assistant-optimize-6231` | ancestor of `cursor/sota-campaign-6231` |
| `cursor/split-oversized-layout-modules-c0fa` | 5 shared SHAs + 2 same-patch-id rewrites vs `cursor/agent-sota-polish-cbcd` |

---

## 5. Recommended merge ORDER into `cursor/merge-all-branches-e17a`

Local branch is currently `897a2a6` (= `origin/main`). Remote of this name does not exist yet.

1. **`origin/agent/opt-continuous` (`d04f398`)** — 405 commits. Lands the 116 contained tips. This is the required starting point.
2. **r12 on top of `d04f398`** (11 unique commits, file-disjoint except `scripts/file-size-allowlist.json` — expect allowlist conflicts; union the entries):
   1. `origin/cursor/r12-1-app-stage-187a` (`153241a`) — App extract; 2 commits
   2. `origin/cursor/r12-2-maplayer-tests-187a` (`a292a4a`)
   3. `origin/cursor/r12-3-error-boundary-tests-187a` (`bd05814`)
   4. `origin/cursor/r12-4-asset-panel-tests-187a` (`3c7204c`)
   5. `origin/cursor/r12-5-agent-assistant-tests-187a` (`7bfd7ee`)
   6. `origin/cursor/r12-6-workbench-tests-187a` (`db14089`)
   7. `origin/cursor/r12-7-export-poster-tests-187a` (`92f5f60`)
   8. `origin/cursor/r12-8-binary-import-tests-187a` (`10baffe`)
   9. `origin/cursor/r12-9-conversation-store-tests-187a` (`f36bc4c`)
3. **Small unique add-file branches off main** (1 commit each; files absent on opt):
   1. `origin/cursor/add-cloud-agent-environment-7fd5` (`0925b7e`) — `.cursor/environment.json`
   2. `origin/cursor/market-practical-optimize-9c93` (`9347413`) — `src/lib/print-size.ts`
   3. `origin/cursor/public-static-demo-304c` (`5e5405c`) — `wrangler.toml`
4. **UX stack (take the tip only):** `origin/cursor/optimize-studio-ux-7077` (`373d91b`, 11 commits). Skip `reorder-function-entries-7077`.
5. **Editor-shell stack (take the tip only):** `origin/cursor/editor-perf-shell-9c93` (`ca5def7`, 3 commits). Skip `ci-legacy-editor-shell-9c93`. Note: r12-1 already extracted the legacy editor on the opt line; this stack **removes** the old editor from a main-era tree — high conflict with steps 1–2.
6. **Product branches off main (still unique; high conflict with the 405-commit opt line):**
   1. `origin/cursor/feature-expansion-research-c710` (`cb4bb12`, 15)
   2. `origin/cursor/canvas-render-display-46a1` (`dc0e459`, 28)
   3. `origin/cursor/fix-round1-issues-2c89` (`8f2f3c7`, 27) — no open PR
7. **`origin/cursor/normalize-repo-content-1fd7` (`933b4d0`)** last among the small uniques — **−92513** lines; apply after product merges so deletions land on the combined tree.
8. **Parallel campaigns off main (highest conflict; 0 shared unique SHAs with each other or with opt):**
   1. `origin/cursor/agent-sota-polish-cbcd` (`b63c3bc`, 62) — skip `split-oversized-layout-modules-c0fa` if this lands
   2. `origin/cursor/sota-campaign-6231` (`5c0d13f`, 112) — skip `ai-assistant-optimize-6231` if this lands; **no PR in #3–#14**

Do not replay the 116 contained branches or the four patch-id/empty tips in §3.1.

---

## 6. Open PRs #3–#14 after taking `opt-continuous`

`gh pr list --state all` shows #3–#14 all **OPEN**. There is **no PR #2**. PRs #15–#43 are MERGED into `agent/opt-continuous` (r9–r11). No open PRs exist for r12-1…r12-9, `sota-campaign-6231`, or `fix-round1-issues-2c89`.

| PR | head | base | draft | mergeable / state | head tip | unique vs opt | still need to merge head after taking opt? |
|---|---|---|---|---|---|---|---|
| [#3](https://github.com/Xhhemoing/cengfan-map-studio/pull/3) | `cursor/market-practical-optimize-9c93` | main | yes | MERGEABLE / CLEAN | `9347413` | 1 (`9347413`) | **YES** — `print-size.ts` absent on opt |
| [#4](https://github.com/Xhhemoing/cengfan-map-studio/pull/4) | `cursor/add-cloud-agent-environment-7fd5` | main | yes | MERGEABLE / CLEAN | `0925b7e` | 1 (`0925b7e`) | **YES** — `.cursor/environment.json` absent on opt |
| [#5](https://github.com/Xhhemoing/cengfan-map-studio/pull/5) | `cursor/ci-legacy-editor-shell-9c93` | main | no | MERGEABLE / CLEAN | `28b0654` | 1 (`28b0654`) | **YES unless #6 is merged** — #6 is a descendant. Serial CI already exists on opt via `2de260b`, but `28b0654` itself is not on opt |
| [#6](https://github.com/Xhhemoing/cengfan-map-studio/pull/6) | `cursor/editor-perf-shell-9c93` | `cursor/ci-legacy-editor-shell-9c93` | no | MERGEABLE / CLEAN | `ca5def7` | 3 | **YES** — 2 commits beyond #5 (`0a9fad3`, `ca5def7`). GitHub `commitCount` 2 is vs its base (#5), not vs main |
| [#7](https://github.com/Xhhemoing/cengfan-map-studio/pull/7) | `cursor/public-static-demo-304c` | main | no | MERGEABLE / CLEAN | `5e5405c` | 1 (`5e5405c`) | **YES** — `wrangler.toml` absent on opt |
| [#8](https://github.com/Xhhemoing/cengfan-map-studio/pull/8) | `cursor/normalize-repo-content-1fd7` | main | no | MERGEABLE / CLEAN | `933b4d0` | 1 (`933b4d0`) | **YES** — unique destructive cleanup (+104/−92513) |
| [#9](https://github.com/Xhhemoing/cengfan-map-studio/pull/9) | `cursor/reorder-function-entries-7077` | main | yes | MERGEABLE / CLEAN | `fd443e0` | 3 | **YES unless #10 is merged** — #10 is a descendant and already contains these 3 SHAs |
| [#10](https://github.com/Xhhemoing/cengfan-map-studio/pull/10) | `cursor/optimize-studio-ux-7077` | main | no | MERGEABLE / CLEAN | `373d91b` | 11 | **YES** |
| [#11](https://github.com/Xhhemoing/cengfan-map-studio/pull/11) | `cursor/agent-sota-polish-cbcd` | main | no | MERGEABLE / CLEAN | `b63c3bc` | 62 | **YES** — parallel 62-commit campaign; 0 shared unique SHAs with opt or with `sota-campaign-6231` |
| [#12](https://github.com/Xhhemoing/cengfan-map-studio/pull/12) | `cursor/feature-expansion-research-c710` | main | no | MERGEABLE / CLEAN | `cb4bb12` | 15 | **YES** |
| [#13](https://github.com/Xhhemoing/cengfan-map-studio/pull/13) | `cursor/canvas-render-display-46a1` | main | no | MERGEABLE / CLEAN | `dc0e459` | 28 | **YES** |
| [#14](https://github.com/Xhhemoing/cengfan-map-studio/pull/14) | `agent/opt-continuous` | main | no | MERGEABLE / **UNSTABLE** | `d04f398` | 0 (this **is** opt) | **NO** — taking opt-continuous **is** taking this head. GitHub `commitCount` 100 is truncated; git count is **405**. `mergeStateStatus=UNSTABLE` (CI not green) |

After taking opt, **#3–#13 heads are still not contained** in the working tree. **#14 is done.**  
#5 is covered by #6; #9 is covered by #10. Merging those two tips is enough for those four PRs.

---

## Counts for the next merge agent

| bucket | branches | unique commits vs opt (union, after dropping §3.1 equivalents) |
|---|---:|---|
| take opt-continuous | 1 | 405 vs main (already includes 116 tips) |
| r12-1…r12-9 | 9 | 11 |
| add-file uniques (#3, #4, #7) | 3 | 3 |
| optimize-studio-ux (#10, covers #9) | 1 | 11 |
| editor-perf-shell (#6, covers #5) | 1 | 3 |
| feature-expansion (#12) | 1 | 15 |
| canvas-render (#13) | 1 | 28 |
| fix-round1 (no PR) | 1 | 27 |
| normalize (#8) | 1 | 1 |
| agent-sota-polish (#11, covers split-c0fa patches) | 1 | 62 |
| sota-campaign-6231 (no PR in #3–#14, covers # ai-assistant-6231) | 1 | 112 |
| skip (contained + backup + empty + patch-id equivalents) | 116 + 4 | 0 |

Measured overlap: r12 branches only share `scripts/file-size-allowlist.json`.  
`sota-campaign-6231` ∩ `agent-sota-polish-cbcd` unique-from-main SHAs = **0**.  
Both of those campaigns + canvas/feature/fix-round1 + editor-perf also fork from `897a2a6`, so merging them **onto** the 405-commit opt line will not be fast-forward.
