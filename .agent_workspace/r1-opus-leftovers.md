# Round 1 — Agent D (opus-fast) — 剩余唯一分支合并计划

**Model:** `claude-opus-5-thinking-high-fast`
**Base of comparison:** `origin/agent/opt-continuous` @ `d04f398`（`main` @ `897a2a6` 的后代，ahead 405 / behind 0）
**Scope:** 19 条 leftover 唯一分支（r12-* 归另一 agent，不在本文件内）
**模式:** 只读。未 push、未 merge、未改动工作树。全部结论由 `git rev-list` / `git cherry`（patch-id）/ `git merge-tree --write-tree` 得出，冲突 hunk 数为实际数出 `<<<<<<<` 标记，非估算。

---

## 0. 结论速览

| # | 分支 | unique | merge-tree | 冲突文件/hunk | 语义是否已在 base | 建议 |
| --- | --- | ---: | --- | ---: | --- | --- |
| 1 | `sota-campaign-6231` | 112 | CONFLICT | 40 / 172 | 否 | **KEEP**（最后合，最贵） |
| 2 | `agent-sota-polish-cbcd` | 62 | CONFLICT | 37 / 121 | 否（但与 base 的 App 拆分方案互斥） | **KEEP（有条件）** |
| 3 | `canvas-render-display-46a1` | 28 | CONFLICT | 6 / 9 | 否 | **KEEP**（性价比最高） |
| 4 | `fix-round1-issues-2c89` | 27 | CONFLICT | 19 / 74 | 否 | **KEEP** |
| 5 | `feature-expansion-research-c710` | 15 | CONFLICT | 12 / 24 | 否 | **KEEP** |
| 6 | `optimize-studio-ux-7077` | 11 | CONFLICT | 4 / 11 | 否 | **KEEP** |
| 7 | `split-oversized-layout-modules-c0fa` | 7 | CONFLICT | 21 / 94 | — | **SKIP**（被 #2 完全覆盖） |
| 8 | `editor-perf-shell-9c93` | 3 | CONFLICT | 5 / 24 | 否（与 base 决策冲突） | **CHERRY-PICK** |
| 9 | `reorder-function-entries-7077` | 3 | CONFLICT | 2 / 6 | — | **SKIP**（被 #6 完全覆盖） |
| 10 | `server-graceful-shutdown-af12` | 3 | CONFLICT | 6 / 17 | **是（3/3 patch-id 命中）** | **SKIP** |
| 11 | `add-cloud-agent-environment-7fd5` | 1 | **CLEAN** | 0 | 否 | **KEEP** |
| 12 | `agent-landing-atomicity-6893` | 1 | **CLEAN** | 0 | **是（文件逐字节相同）** | **SKIP** |
| 13 | `ai-assistant-optimize-6231` | 1 | CONFLICT | 3 / 3 | — | **SKIP**（被 #1 完全覆盖） |
| 14 | `ci-legacy-editor-shell-9c93` | 1 | CONFLICT | 3 / 17 | — | **SKIP**（被 #8 完全覆盖） |
| 15 | `market-practical-optimize-9c93` | 1 | **CLEAN** | 0 | 否 | **KEEP** |
| 16 | `normalize-repo-content-1fd7` | 1 | **CLEAN** | 0 | 否 | **KEEP**（顺序敏感，放最后） |
| 17 | `public-static-demo-304c` | 1 | CONFLICT | 4 / 5 | 否 | **KEEP** |
| 18 | `rejected-landing-history-c4be` | 1 | CONFLICT | 0 hunk（仅 modify/delete） | **是（patch-id 命中）** | **SKIP** |
| 19 | `unify-degraded-storage-notice-9ae7` | 1 | **CLEAN** | 0 | **是（合并净效果为 0 字节）** | **SKIP** |

**KEEP 10 条 / CHERRY-PICK 1 条 / SKIP 8 条。** 需要人工解决的冲突总量约 **316 个 hunk，跨 100 个左右文件**，其中 `sota-campaign` + `agent-sota-polish` 两条就占 293 个。

---

## 1. 阻塞项：先处理，否则第一条 merge 就会失败

当前 `HEAD` = `cursor/merge-all-branches-e17a` @ `897a2a6`（就是 `main`），工作树里 `.agent_workspace/` 是**未跟踪**目录，里面有 `PROGRESS.md`。

而 `origin/agent/opt-continuous` **已经跟踪** 25 个 `.agent_workspace/*.md`，其中包含 `.agent_workspace/PROGRESS.md`。

后果：`git merge origin/agent/opt-continuous` 会直接 abort：

```
error: The following untracked working tree files would be overwritten by merge:
	.agent_workspace/PROGRESS.md
```

处理（三选一，推荐 A）：

```bash
# A. 把本轮 agent 的 scratch 移出仓库路径（推荐，零副作用）
mkdir -p /tmp/merge-scratch && cp -r .agent_workspace/. /tmp/merge-scratch/ && rm -rf .agent_workspace

# B. 把 .agent_workspace 加进 .gitignore 并在 base 上先删除跟踪（会改变 base 内容，需另开 commit）
# C. 手工改名后再合，合完人工三方合并 PROGRESS.md
```

另外 `agent-sota-polish-cbcd`(201)、`canvas-render-display-46a1`(65)、`feature-expansion-research-c710`(68) 各自还会带进自己的 `.agent_workspace/**`，且三者都与 base 的 `PROGRESS.md` 形成 **add/add 冲突**。这三个 add/add 建议统一用 `git checkout --ours -- .agent_workspace/PROGRESS.md`，其余 scratch 文件直接接受（纯文档，无构建影响）。

---

## 2. 逐分支明细

### 2.1 KEEP

---

#### `origin/cursor/sota-campaign-6231` @ `5c0d13f` — KEEP（放最后）

- **unique SHAs vs base:** 112（ahead 112 / behind 405，merge-base = `897a2a6`）。`git cherry` 结果 **112 个 `+`，0 个 `-`** — 没有任何一条 patch 已进 base。
- 首尾：`5fd5ee1 优化 AI 辅助编辑…` → `5c0d13f docs: 记录第 31 轮合入并启动第 32 轮`。这是一条独立跑了 31 轮的 SOTA 战役。
- **净引入内容:** 191 个文件、+24038 / −6077。全新模块（base 中 **不存在**，已逐一 `git cat-file -e` 验证）：
  `src/lib/csv-decode.ts`、`image-downscale.ts`、`render-facts.ts`、`render-geometry.ts`、`render-health.ts`、`import-aliases.ts`、`import-file-limits.ts`、`export-size-estimate.ts`、`layout-health-cache.ts`、`roster-export.ts`、`svg-image-inline.ts`、`use-studio-preferences.ts`、`scene-writable-props.ts`、`server/ai/local-preroute.ts`、`src/components/StatusBar.tsx`、`DataImportPanel.tsx`、`DataImportConsent.tsx`、`ExportProjectDialog.tsx`、`SaveTemplateDialog.tsx`、`GlobalSettingsScreen.test.tsx`。
- **语义是否已在 base:** **否**。180 个被改文件里 **0 个** 与 base 逐字节相同、**0 个** 在 base 中缺失（都存在但内容不同）、180 个内容不同。这些能力（CAS 乐观锁 `expectedUpdatedAt`/`expectedExportedAt`、24MB 导入体积闸、GB18030 回退解码、PNG 64MP 面积上限、SSE ping 看门狗、XFF 末跳限流、a11y roving tabindex、自绘对话框替换 `confirm()`）在 base 里都找不到对应实现。
- **merge-tree 预测:** CONFLICT。**40 个文件 / 172 个 hunk**。重灾区：`src/App.tsx`(16)、`src/components/AgentAssistant.test.tsx`(14)、`server/index.ts`(12)、`src/lib/binary-import.ts`(12)、`AgentAssistant.tsx`(12)、`ProjectWorkbench.tsx`(11)。
- **根因（为什么这么疼）:** 该分支的 `src/App.tsx` 仍是 main 的 2579 行单体；base 已经把 App.tsx 拆到 988 行 + `src/components/editor/*`。两边对同一个巨型文件做了正交改动，git 无法自动对齐。
- **理由:** 唯一 patch 112 条、内容 100% 未落地、覆盖 AI/导入/导出/协作/存储/a11y 六条主线，是本批里价值最高的一条。但**必须放在最后合**，因为它对 `App.tsx`/`AgentAssistant`/`binary-import` 的改动会和 #4 `fix-round1-issues` 正面撞车（29 个共享代码文件），先合小的能把冲突压缩到已知形状。

---

#### `origin/cursor/agent-sota-polish-cbcd` @ `b63c3bc` — KEEP（有条件，需先做架构裁决）

- **unique SHAs vs base:** 62（`792d017` → `b63c3bc`，Round 1 至 Round 32）。`git cherry`：**62 `+` / 0 `-`**。
- **净引入内容:** 517 个文件、+53959 / −13454。全新模块：`html-table-parse.ts`、`import-headers.ts`、`print-bleed.ts`、`print-preflight.ts`、`layout-perf.ts`、`poster-card-rows.ts`、`poster-guest-layout.ts`、`poster-map-geometry.ts`、`image-color-{clusters,palette,space,types}.ts`、`project-migration-{elements,fields,helpers,map,students}.ts`、`scene-document-{factories,normalize,types,update}.ts`、`studio-editor-helpers*.ts`、`src/test-utils/app-harness.tsx`。
- **语义是否已在 base:** **否**（517 个改动文件全部内容不同，0 个相同、0 个缺失）。
- **merge-tree 预测:** CONFLICT。**37 个文件 / 121 个 hunk**。重灾区：`server/ai-routes.ts`(12, add/add)、`server/index.ts`(11)、`src/lib/binary-import.ts`(9)、`server/collaboration.ts`(8)、`src/App.tsx`(8)、`server/static-files.ts`(6, add/add)、`src/lib/agent-session.ts`(6)、`DataWorkspace.tsx`(6)、`useCollaborationRoom.ts`(5)。另有 `.github/workflows/ci.yml` 和 `.agent_workspace/PROGRESS.md` 的 add/add。
- **⚠ 架构裁决点（比文本冲突更重要）:** 这条分支和 base **各自独立拆分了 `src/App.tsx`，拆法互不兼容**：

  | | `src/App.tsx` 行数 | 拆出目录 | 遗留三栏编辑器 |
  | --- | ---: | --- | --- |
  | `origin/main` | 2466 | — | 在 App.tsx 内 |
  | `origin/agent/opt-continuous` | **988** | `src/components/editor/*`（8 个模块） | 保留，`legacyEditorEnabled` |
  | `agent-sota-polish-cbcd` | **333** | `src/components/studio-editor/*`（18 个模块） | 保留，`legacyEditorEnabled` |

  我把 merge-tree 的结果树 `6113271` 展开验证过：**合并后 `src/components/editor/`(8 个文件) 和 `src/components/studio-editor/`(18 个文件) 会同时存在**。即使把 121 个 hunk 全部解决，也会留下两套并行的 App 分解层、同一批 UI 逻辑各存一份。这不是 git 能解决的问题。
- **建议:** KEEP，但**必须在合之前由人裁决保留哪一套分解**，并把落选那套的目录删除、把 `App.tsx` 的 import 收敛到胜出方。若不裁决就合，会得到一个能编译但语义重复的仓库。
  - 若选 base 的 `src/components/editor/*`：合并时 `App.tsx` / `studio-editor/*` 取 base，仅捡该分支的 `src/lib/*` 新模块（print-bleed、print-preflight、import-headers、html-table-parse 等），退化为大规模 cherry-pick。
  - 若选分支的 `src/components/studio-editor/*`：`git merge -X theirs` 处理 App 层，再回补 base 在 r3–r12 做的持久化/降级改动。

---

#### `origin/cursor/canvas-render-display-46a1` @ `dc0e459` — KEEP（第一个合，性价比最高）

- **unique SHAs vs base:** 28（`2b7f64f` → `dc0e459`，Cycle1 R1 → Cycle3 R3 freeze）。`git cherry`：**28 `+` / 0 `-`**。
- **净引入内容:** 129 个文件、+14640 / −1362。核心是把 1486 行的 `PosterCanvas.tsx` 拆成 `DestinationCard.tsx`、`DestinationCardsLayer.tsx`、`GuestsLayer.tsx`、`ReferenceCardVisual.tsx`，加上 `canvas-render-metrics.ts`、`destination-card-metrics.ts`、`display-frame-style.ts`、`guest-panel-layout.ts`、`prepared-card-content.ts`、`edge-styles.ts`。带 perf 基线（pan ~4.0ms @24 cards）。
- **语义是否已在 base:** **否**，上述文件在 base 中全部不存在。
- **merge-tree 预测:** CONFLICT，但**极轻**：**6 个文件 / 9 个 hunk**。
  `src/App.tsx`(4)、`.agent_workspace/PROGRESS.md`(1, add/add)、`PosterCanvas.reference-styles.test.tsx`(1)、`useCardLayoutWorker.test.tsx`(1)、`card-layout-cache.test.ts`(1)、`card-layout-cache.ts`(1)。`package.json`、`src/styles.css`、`useCardLayoutWorker.ts`、`PosterCanvas.performance.test.tsx` 都自动合并成功。
- **理由:** 28 条 patch 全新、9 个 hunk 就能拿下、且与其它 KEEP 分支的代码文件重叠极小（与 sota-campaign 5 个、fix-round1 5 个、editor-perf 4 个）。**放在第一位合**，先把画布层的新模块钉进 base，后面几条对 `PosterCanvas.tsx` 的改动就有了共同祖先形状。

---

#### `origin/cursor/fix-round1-issues-2c89` @ `8f2f3c7` — KEEP

- **unique SHAs vs base:** 27（`562c743` → `8f2f3c7`，I-01 至 I-14-05 共 14 轮可用性修复）。`git cherry`：**27 `+` / 0 `-`**。
- **净引入内容:** 89 个代码文件。新模块 `src/lib/agent-step-labels.ts`、`card-metrics.ts`、`guest-metrics.ts`、`number-input.ts`、`project-draft-mirror.ts`、`src/components/StatusToast.tsx`。
- **语义是否已在 base:** **否**（89 个改动文件全部内容不同）。这批是"用户点出来的 bug"，和 base 的 r3–r12 内部质量战役是不同来源，没有交集。
- **merge-tree 预测:** CONFLICT。**19 个文件 / 74 个 hunk**。重灾区 `src/App.tsx`(20)、`DataWorkspace.tsx`(11)、`useCollaborationRoom.ts`(10)、`AgentAssistant.tsx`(8)、`binary-import.ts`(5)。
  另有 1 个 **modify/delete**：`src/components/canvas/PosterCanvas.test.tsx` 在 base 已被删除（r12 拆成多个测试文件），本分支改了它 → 解决方式是**接受 base 的删除**，把本分支在该文件里的新断言按主题手工搬进 base 拆出来的对应测试文件。
- **理由:** 27 条真实缺陷修复，全部未落地，值得要。冲突量中等，主要集中在 App.tsx。**建议排在 sota-campaign 之前**：两者共享 29 个代码文件，先合这条（74 hunk）比先合 sota-campaign（172 hunk）后再解这条更省。

---

#### `origin/cursor/feature-expansion-research-c710` @ `cb4bb12` — KEEP

- **unique SHAs vs base:** 15（`3811e17` → `cb4bb12`）。`git cherry`：**15 `+` / 0 `-`**。
- **净引入内容:** 130 个文件、+10597 / −162。功能面：应用内反馈（`feedback-links.ts`、`HelpFeedbackMenu.tsx`）、社区模板交换（`template-package.ts` 340 行、`template-exchange-actions.ts`、`TemplateExchange.tsx`）、协作身份（`collaboration-identity.ts`、`DisplayNameInput.tsx`、`RoomRoster.tsx`）、导出文件名（`export-filename.ts`）、导入 live region（`import-message.ts`）、`CHANGELOG.md`。
- **语义是否已在 base:** **否**，上述全部为 base 中不存在的新文件。
- **merge-tree 预测:** CONFLICT。**12 个文件 / 24 个 hunk**。`ProjectWorkbench.tsx`(4)、`src/App.tsx`(3)、`ProjectMenu.tsx`(3)、`useCollaborationRoom.ts`(3)、`ProjectGrid.tsx`(2)、`usePosterExport.{ts,test.tsx}`(2+2)，其余各 1。`usePosterExport.test.tsx` 与 `.agent_workspace/PROGRESS.md` 是 add/add。
- **⚠ 顺序依赖:** 本分支 **修改** `function.md`，而 `normalize-repo-content-1fd7` **删除** `function.md`。两条必须有先后，且 `normalize` 要在后（见 §3）。
- **理由:** 唯一一条纯"新功能"分支，和 base 的质量战役零重叠，24 个 hunk 很便宜。KEEP。

---

#### `origin/cursor/optimize-studio-ux-7077` @ `373d91b` — KEEP

- **unique SHAs vs base:** 11（`ac78291` → `373d91b`）。`git cherry`：**11 `+` / 0 `-`**。含 `reorder-function-entries-7077` 的全部 3 条（见 §2.2）。
- **净引入内容:** 29 个文件、+909 / −418。一级步骤条文案改为用户目标（名单/地图/版式/内容/交付）、素材库入口归位、版式中栏改实时画布、阶段总览"下一步"跳转卡、ProjectMenu 补导出 PNG。
- **语义是否已在 base:** **否**。base 的 `src/lib/workflow-stages.ts` / `stage-metadata.ts` / `stage-overview.ts` 仍是旧文案与旧结构。
- **merge-tree 预测:** CONFLICT，很轻：**4 个文件 / 11 个 hunk**。`src/App.tsx`(5)、`ReferenceCardStyleWorkspace.test.tsx`(3)、`src/App.test.tsx`(2)、`ProjectMenu.tsx`(1)。`DataWorkspace.tsx`、`StudioAssistantRail.test.tsx`、`src/styles.css` 自动合并成功。
- **理由:** 11 个 hunk 换 11 条 UX patch，成本极低。排在 canvas-render 之后合。

---

#### `origin/cursor/editor-perf-shell-9c93` @ `ca5def7` — **CHERRY-PICK**（不要整支 merge）

- **unique SHAs vs base:** 3 — `28b0654 去掉三栏旧编辑器，并加上顺序执行的 CI 门禁`、`0a9fad3 降低编辑器首屏体积，并收口窄屏侧栏与保存状态`、`ca5def7 修复窄屏 matchMedia 泄漏，并去掉壳层里同步 setState 的 effect`。`git cherry`：**3 `+` / 0 `-`**。
- **净引入内容:** 31 个文件、+695 / −957。新模块 `src/lib/use-narrow-viewport.ts`、`university-emblem-lookup.ts`、`search-university-catalog.ts`、`src/components/workspaces/stage-components.tsx`（4 个在 base 中均不存在）。
- **merge-tree 预测:** CONFLICT。**5 个文件 / 24 个 hunk**：`src/App.tsx`(16)、`src/main.tsx`(4)、`src/App.test.tsx`(2)、`.github/workflows/ci.yml`(1, add/add)、`StudioAssistantRail.test.tsx`(1)。
- **为什么拆开处理 —— 三条 commit 的价值完全不同:**

  1. **`28b0654`（= `ci-legacy-editor-shell-9c93` 的全部内容）→ 丢弃两半。**
     - 它删掉了三栏旧编辑器（`App.tsx` −813 行）。但 base **没有删，而是保留并重构**：`src/components/editor/LegacyEditorSidebar.tsx` + `LegacyEditorTopbar.tsx`，`App.tsx:195` 仍有 `legacyEditorEnabled`。这是**方向相反的两个决策**，`src/App.tsx` 那 16 个 hunk 基本都源于此。整支 merge 会把 base 在 r3–r12 对旧编辑器做的重构成果一起抹掉。
     - 它带的 `.github/workflows/ci.yml` 是**旧版本**。我对比过两版：base 的 ci.yml 有 `concurrency` + `cancel-in-progress`、`permissions: contents: read`、并且跑 `npm run typecheck`（走 `scripts/run-heavy.mjs` 的串行闸）；分支版本用的是裸 `npx tsc -b --pretty false`，且 push 只触发 `main`（丢掉 base 自己那条 `agent/opt-continuous`）。**base 的 ci.yml 严格更好，冲突一律 `--ours`。**
  2. **`0a9fad3` 和 `ca5def7` → 值得要。** 窄屏 `matchMedia` 泄漏修复、去掉壳层内同步 `setState` 的 effect（这是 React 的真 bug）、`use-narrow-viewport.ts`、`university-emblem-lookup.ts`、`stage-components.tsx` 懒加载分片，都与 base 的方向不冲突。

- **执行:**

```bash
# 不要 git merge origin/cursor/editor-perf-shell-9c93
git cherry-pick 0a9fad3 ca5def7
# 冲突集中在 src/main.tsx / StudioAssistantRail.tsx / StudioEditorShell.tsx
# ci.yml 若被带出：git checkout --ours -- .github/workflows/ci.yml
```

  若这两条 cherry-pick 因为依赖 `28b0654` 删除的代码而无法落地，则退到"只捡文件"：直接 `git checkout origin/cursor/editor-perf-shell-9c93 -- src/lib/use-narrow-viewport.ts src/lib/use-narrow-viewport.test.ts src/lib/university-emblem-lookup.ts src/lib/university-emblem-lookup.test.ts`，再手工把 `StudioEditorShell.tsx` 的 effect 修复搬过去。

---

#### `origin/cursor/public-static-demo-304c` @ `5e5405c` — KEEP

- **unique SHAs vs base:** 1 — `5e5405c feat: 支持用 Cloudflare Pages / GitHub Pages 做公开演示站`。`git cherry`：**1 `+`**。
- **净引入内容:** 28 个文件、+408 / −9。`public/_headers`、`public/_redirects`、`wrangler.toml`、`Dockerfile`、`src/lib/public-base-path.ts`、`docs/deployment/public-demo.md`、`vite.config.ts` 的 base path 支持。
- **语义是否已在 base:** **否** — `public/_headers`、`wrangler.toml`、`src/lib/public-base-path.ts` 在 base 中均不存在（已 `git cat-file -e` 验证）。
- **merge-tree 预测:** CONFLICT，很轻：**4 个文件 / 5 个 hunk**。`ProjectWorkbench.tsx`(2)、`ProjectWorkbench.test.tsx`(1)、`collaboration-client.ts`(1)、`src/main.tsx`(1)。`vite.config.ts`、`src/styles.css`、`collaboration-client.test.ts` 自动合并成功。
- **注意:** 与 `market-practical-optimize-9c93` 在 4 个文档文件上重叠（`README.md`、`USER_GUIDE.md`、`docs/宣发/README.md`、`docs/宣发/国内互联网宣发总流程.md`），且各自新增一份部署文档（`docs/deployment/public-demo.md` vs `docs/deployment/static-demo.md`）。合完后需人工确认这两篇不互相矛盾。
- **理由:** 5 个 hunk 换一套完整的公开演示站部署路径，且 `src/main.tsx` 的 1 个 hunk 与 `editor-perf-shell` 的 4 个 hunk 在同一文件 — 建议 **public-static-demo 先合**（1 hunk 比 4 hunk 好定形）。

---

#### `origin/cursor/market-practical-optimize-9c93` @ `9347413` — KEEP

- **unique SHAs vs base:** 1。`git cherry`：**1 `+`**。
- **merge-tree 预测:** **CLEAN，零冲突。** 已用 `git diff base <merged-tree>` 验证净效果：18 个文件、+412 / −27。
- **净引入内容:** `src/lib/print-size.ts`(64 行) + 测试、`src/lib/grid.ts` +15 行、`CanvasInspector.tsx` +4、`DeliveryWorkspace.tsx` +2、`docs/deployment/static-demo.md`、两份案例模板文档（`文科-55人`、`职高-80人`）、宣发文档更新。
- **语义是否已在 base:** **否**，`src/lib/print-size.ts` 在 base 中不存在。
- **理由:** 零冲突、有实质代码增量（印刷尺寸计算）、且符合 `AGENTS.md` 里宣发文档的归档规范。**放在低风险批次第一个合。**

---

#### `origin/cursor/add-cloud-agent-environment-7fd5` @ `0925b7e` — KEEP

- **unique SHAs vs base:** 1。`git cherry`：**1 `+`**。
- **merge-tree 预测:** **CLEAN，零冲突。** 净效果经验证只有一个文件：新增 `.cursor/environment.json`（10 行）。
- **语义是否已在 base:** **否**，base 无 `.cursor/environment.json`。
- **理由:** 10 行、零冲突、零代码风险，纯 Cloud Agent 环境配置。无脑合。

---

#### `origin/cursor/normalize-repo-content-1fd7` @ `933b4d0` — KEEP（**必须排在全部 merge 的最后**）

- **unique SHAs vs base:** 1。`git cherry`：**1 `+`**。
- **merge-tree 预测（当前，对着裸 base）:** **CLEAN，零冲突。** 净效果 121 个文件、+104 / **−92513**。
- **它删什么:** `graphify-out/`（含 `graph.json` 72414 行、`manifest.json` 1267 行、`.graphify_analysis.json` 1797 行、cache/*.json）、`frontUI2.md`(1039 行)、`function.md`(466 行)、20 份过期宣发/调研文档、3 个 `scripts/*.mjs`。改 `eslint.config.mjs`、`package.json`。
- **语义是否已在 base:** **否**，`graphify-out/graph.json`、`frontUI2.md`、`function.md` 在 base 中都还在。
- **⚠ 顺序敏感（这是本条唯一的风险）:**
  - `feature-expansion-research-c710` **修改** `function.md`
  - `sota-campaign-6231` 也 **删除** `frontUI2.md` + `function.md`（同向，无害）
  - `canvas-render-display-46a1` 和 `editor-perf-shell-9c93` 改 `package.json`

  **如果 normalize 先合**：后面每一条碰这些文件的分支都会撞 modify/delete，要重复解释同一个删除决策 N 次。
  **如果 normalize 最后合**：只需在最后一次 merge 里对 `function.md` 做一次 `git rm` 决策，`graphify-out/` 那 92k 行删除对已整合的树是幂等的。
- **理由:** KEEP，**放在整个序列的最后一步**。合完 CI 会明显变快（少 92k 行）。

---

### 2.2 SKIP

---

#### `origin/cursor/split-oversized-layout-modules-c0fa` @ `0233a7a` — SKIP（被 `agent-sota-polish-cbcd` 完全覆盖）

- **unique SHAs vs base:** 7。
- **证据:** 前 5 条（`792d017`、`252b607`、`38ae841`、`3e17d6a`、`43fb738`）与 `agent-sota-polish-cbcd` 是**同一批 SHA**。后 2 条 `15dd39e`、`0233a7a` 经 `git cherry origin/cursor/agent-sota-polish-cbcd origin/cursor/split-oversized-layout-modules-c0fa` 验证，**两条都标 `-`（patch-id 已在 polish 中）** — 对应 polish 的 `1c80a96` / `1671695`（同标题、rebase 后的重复提交）。
- 树对比：`git diff split polish` = 428 个文件 / +37181 / −9606，方向全部是 polish 更靠前，即 split 是 polish 的严格前缀。
- **merge-tree（若单独合）:** 21 个文件 / 94 个 hunk — 白付 94 个 hunk 换零增量。
- **结论:** **SKIP。** 合 `agent-sota-polish-cbcd` 即全覆盖。

---

#### `origin/cursor/reorder-function-entries-7077` @ `fd443e0` — SKIP（被 `optimize-studio-ux-7077` 完全覆盖）

- **unique SHAs vs base:** 3 — `ac78291`、`f98573c`、`fd443e0`。
- **证据:** `git merge-base --is-ancestor origin/cursor/reorder-function-entries-7077 origin/cursor/optimize-studio-ux-7077` → **YES**。这 3 条正是 `optimize-studio-ux-7077` 那 11 条里的前 3 条，SHA 完全相同。
- **merge-tree（若单独合）:** 2 个文件 / 6 个 hunk。
- **结论:** **SKIP。** 对应的 draft PR #9 可直接关掉，理由是内容已包含在 PR #10 中。

---

#### `origin/cursor/ai-assistant-optimize-6231` @ `5fd5ee1` — SKIP（被 `sota-campaign-6231` 完全覆盖）

- **unique SHAs vs base:** 1 — `5fd5ee1 优化 AI 辅助编辑：降低消耗并提高理解与操作准确性`。
- **证据:** `git merge-base --is-ancestor origin/cursor/ai-assistant-optimize-6231 origin/cursor/sota-campaign-6231` → **YES**。`5fd5ee1` 就是 `sota-campaign-6231` 那 112 条里的**第 1 条**，SHA 相同。
- **merge-tree（若单独合）:** 3 个文件 / 3 个 hunk + 1 个 modify/delete（`src/lib/agent-session.test.ts`，base 已拆解删除）。
- **结论:** **SKIP。** 合 `sota-campaign-6231` 即覆盖。若最终决定放弃 sota-campaign，则把这条升级为 KEEP（3 个 hunk 很便宜，`agent-session.ts` +167 行的意图理解改进有独立价值）。

---

#### `origin/cursor/ci-legacy-editor-shell-9c93` @ `28b0654` — SKIP（被 `editor-perf-shell-9c93` 完全覆盖，且内容本身应拒绝）

- **unique SHAs vs base:** 1 — `28b0654`。
- **证据:** `git merge-base --is-ancestor origin/cursor/ci-legacy-editor-shell-9c93 origin/cursor/editor-perf-shell-9c93` → **YES**（`28b0654` 是 editor-perf 三条里的第一条）。
- **双重理由（不只是重复，内容也该拒）:** 见 §2.1 `editor-perf-shell-9c93` 条目 —— 它删除旧编辑器的方向与 base 相反（base 保留并重构到 `src/components/editor/*`），它的 `.github/workflows/ci.yml` 也弱于 base 现有版本（无 concurrency/permissions、绕开 `npm run typecheck` 串行闸）。
- **merge-tree（若单独合）:** 3 个文件 / 17 个 hunk，其中 `src/App.tsx` 就占 14 个。
- **结论:** **SKIP。** PR #5 建议以"CI 门禁已由 base 的 ci.yml 覆盖且更严；旧编辑器改为保留重构"为由关闭。

---

#### `origin/cursor/server-graceful-shutdown-af12` @ `9ad48df` — SKIP（3/3 patch 已在 base）

- **unique SHAs vs base:** 3 — `9ad48df feat(server): 关停排空 SSE 与房间快照，启动恢复房间`、`5d4a984 fix(store): 项目存储失败分类与内存降级模式`、`2b102a4 fix(project-document): stop committing refused transactions`。
- **语义已在 base — 三重证据:**
  1. `git cherry origin/agent/opt-continuous origin/cursor/server-graceful-shutdown-af12` → **3 个 `-`，0 个 `+`**。三条的 patch-id 全部命中 base，即完全相同的 diff 已经应用过。
  2. 直接读 base 源码确认：
     - `server/index.ts:22` 已 import `createRoomSnapshotWriter, isRestorableRoomSnapshot, loadRoomSnapshot, sweepStaleTemporaryFiles, writeFileAtomically`；`:53` 有 `drainRoomStreams?: () => void`；`:185` `countRestorableRooms`；`:193` `readSkippedRoomCount` —— 关停排空 + 房间快照恢复齐了。
     - `src/lib/project-store.ts:40` `export type ProjectStoreHealth = "persistent" | "memory"`；`:642` 注释"持久层彻底打不开（隐私模式、数据库损坏）时降级到内存"；`:680` `onHealthChange?.("memory")` —— 失败分类 + 内存降级齐了。
     - `src/lib/project-document.ts:219` 注释"committed — no version bump, no history entry" —— 拒绝事务不落 commit 齐了。
  3. 同时 `rejected-landing-history-c4be`(`2b102a4`) 是本分支的祖先，也是同一批。
- **merge-tree 预测:** CONFLICT，6 个文件 / 17 个 hunk + 1 个 modify/delete。这 17 个 hunk 全部是"base 在这三条之后又继续改了同一片区域"造成的 —— **合进去只会把 base 后续的改进往回滚**。
- **结论:** **SKIP。** 这是本批里最危险的一条 —— 看起来有 3 条唯一 commit，实际是纯回归风险。

---

#### `origin/cursor/rejected-landing-history-c4be` @ `2b102a4` — SKIP（patch 已在 base）

- **unique SHAs vs base:** 1 — `2b102a4 fix(project-document): stop committing refused transactions`。
- **语义已在 base:** `git cherry` 标 **`-`**（patch-id 命中）。且 `git merge-base --is-ancestor rejected-landing-history-c4be server-graceful-shutdown-af12` → **YES**，它是上一条的真子集。
- **merge-tree 预测:** CONFLICT，但 **0 个内容 hunk** —— 唯一冲突是 `src/lib/agent-session.test.ts` 的 **modify/delete**（base 在 r12 把它拆成了多个测试文件并删除原文件，本分支还在改它）。也就是说这次 merge 的全部"价值"就是把一个已删除的测试文件搬回来。
- **结论:** **SKIP。**

---

#### `origin/cursor/agent-landing-atomicity-6893` @ `3944d88` — SKIP（文件逐字节相同）

- **unique SHAs vs base:** 1 — `3944d88 bench collaboration document diff scenarios`。
- **语义已在 base — 双证据:**
  1. `git cherry` 标 **`-`**。
  2. 该 commit 只碰一个文件 `scripts/perf-collab-diff-bench.ts`（+108 行）。我逐一比对 blob：**base 中该文件存在，且与分支版本 blob 哈希相同**（semantic 扫描结果 `same=1 absent=0 differ=0`）。
- **merge-tree 预测:** **CLEAN，零冲突，净效果 0 字节。**
- **结论:** **SKIP。** 合了也是空 merge commit。

---

#### `origin/cursor/unify-degraded-storage-notice-9ae7` @ `effc4cd` — SKIP（净效果为 0）

- **unique SHAs vs base:** 1，但这 1 条是 **merge commit**：`effc4cd Merge remote-tracking branch 'origin/agent/opt-continuous' into cursor/unify-degraded-storage-notice-9ae7`。它自己的内容提交已经全部进了 base（`git cherry` 输出 **0 `+` / 0 `-`**，因为唯一的 commit 是 merge，被 cherry 跳过）。
- **语义已在 base — 决定性证据:** 我构造了合并结果树并 diff：

```
$ T=$(git merge-tree --write-tree origin/agent/opt-continuous origin/cursor/unify-degraded-storage-notice-9ae7)
$ git diff --stat origin/agent/opt-continuous $T
(空输出)
```

  **合并净效果为零字节。** merge-tree 报 CLEAN 只是因为它把 base 又合了一遍。
- **结论:** **SKIP。** 这条分支已经完成使命（它是 base 的下游合流点，不是上游）。

---

## 3. 建议执行序列

排序原则：**先零冲突建立信心 → 再按 hunk 从少到多爬坡 → 共享文件多的两条不相邻 → 纯删除的 normalize 垫底。**

前置：先做 §1 的 `.agent_workspace` 处理，然后

```bash
git checkout -b cursor/merge-leftovers-round1-469f origin/agent/opt-continuous
```

| 步 | 分支 | 预测冲突 | 关键说明 |
| ---: | --- | ---: | --- |
| 0 | `origin/agent/opt-continuous` | — | 起点（405 commits）。先解 §1 的未跟踪文件阻塞 |
| 1 | `add-cloud-agent-environment-7fd5` | **0** | 只加 `.cursor/environment.json` |
| 2 | `market-practical-optimize-9c93` | **0** | `print-size.ts` + 文档 |
| 3 | `canvas-render-display-46a1` | 6f / **9h** | `PROGRESS.md` add/add 取 `--ours`；`card-layout-cache.ts` 手解 |
| 4 | `optimize-studio-ux-7077` | 4f / **11h** | 已含 `reorder-function-entries-7077`。`App.tsx` 5 hunk |
| 5 | `public-static-demo-304c` | 4f / **5h** | 先于 step 6 定形 `src/main.tsx` |
| 6 | `editor-perf-shell-9c93` | — | **cherry-pick `0a9fad3 ca5def7` only**，不整支 merge。`ci.yml` 冲突取 `--ours` |
| 7 | `feature-expansion-research-c710` | 12f / **24h** | `PROGRESS.md`/`usePosterExport.test.tsx` add/add |
| 8 | `fix-round1-issues-2c89` | 19f / **74h** | `App.tsx` 20 hunk；`PosterCanvas.test.tsx` modify/delete → **接受 base 的删除**，断言手工搬进 r12 拆出的测试文件 |
| 9 | `agent-sota-polish-cbcd` | 37f / **121h** | **先做 §2.1 的架构裁决**（`editor/` vs `studio-editor/` 二选一），否则不要开始 |
| 10 | `sota-campaign-6231` | 40f / **172h** | 最贵。与 step 8 共享 29 个代码文件、与 step 9 共享 40 个，先合前两者能让冲突形状可预期 |
| 11 | `normalize-repo-content-1fd7` | 0f（对裸 base）；合到此处会有 `function.md` 的 modify/delete | 最后一步。`git rm function.md frontUI2.md`，删 `graphify-out/`（−92k 行） |

每步之后跑（遵循 `AGENTS.md` 的串行纪律，勿并行）：

```bash
npx tsc -b --pretty false && npm run lint && npm test
```

**回滚方案（`AGENTS.md` 交付纪律要求）:** 整个序列在 `cursor/merge-leftovers-round1-469f` 上进行，`origin/agent/opt-continuous` 与 `origin/main` 全程不动。任一步失败：`git merge --abort`（或 `git cherry-pick --abort`）回到上一步；整体放弃：`git reset --hard origin/agent/opt-continuous`；已 push 后放弃：删除该分支即可，无任何上游引用。所有 19 条源分支均保留在 origin，不做删除。

---

## 4. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| **`App.tsx` 三套互斥分解**（base 988 行 `editor/*` vs polish 333 行 `studio-editor/*` vs editor-perf 全删旧编辑器） | 合并后 8+18 个模块并存、逻辑重复；这是**语义冲突，不是文本冲突**，解完 hunk 也不会消失 | step 9 前必须人工裁决；editor-perf 降级为 cherry-pick |
| 未跟踪的 `.agent_workspace/PROGRESS.md` | 第一条 merge 直接 abort | §1 步骤 A |
| `.agent_workspace/PROGRESS.md` 四路 add/add | step 3/7/9 各撞一次 | 统一 `git checkout --ours` |
| `PosterCanvas.test.tsx` / `agent-session.test.ts` modify/delete | 误恢复 base 在 r12 已拆解删除的测试文件，掩盖测试拆分成果 | 一律接受 base 的删除，断言手工搬进拆分后的文件 |
| `server-graceful-shutdown-af12` 表面有 3 条唯一 commit | 若误合，会把 base 在这三条之后的后续改进回滚 | 已确认 3/3 patch-id 命中 base + 源码逐点核对，SKIP |
| `.github/workflows/ci.yml` add/add（step 6/9） | 可能被换成弱版 CI（丢 concurrency/permissions、绕过 `run-heavy.mjs` 串行闸） | 一律 `--ours` 保留 base 版本 |
| `normalize` 与 `feature-expansion` 争 `function.md` | 顺序错会重复解同一决策 N 次 | normalize 排最后 |
| `market` 与 `public-static-demo` 各出一份部署文档 | `docs/deployment/static-demo.md` 与 `public-demo.md` 可能口径矛盾 | step 5 后人工通读两篇 |

---

## 5. 方法与四步证据链

**方法（全部只读；未执行 merge/push/checkout，工作树保持 `897a2a6` 干净）:**

| 问题 | 命令 | 说明 |
| --- | --- | --- |
| unique SHAs | `git rev-list --count $BASE..$BR` + `git log --oneline $BASE..$BR` | ahead/behind |
| 语义是否已落地（强证据） | `git cherry $BASE $BR` | patch-id 精确比对，`-` = 相同 diff 已应用 |
| 语义是否已落地（补充） | 逐文件 `git rev-parse $BR:$path` vs `$BASE:$path` blob 哈希 | 区分"逐字节相同 / base 中缺失 / 内容不同" |
| 净效果 | `T=$(git merge-tree --write-tree $BASE $BR); git diff --stat $BASE $T` | 仅对 CLEAN 分支有效，能直接证伪"有增量" |
| 冲突预测 | `git merge-tree --write-tree --name-only $BASE $BR` | 退出码 1 = 冲突 |
| 冲突规模 | 遍历结果树 blob，`grep -c '^<<<<<<< '` | 实数，非估算 |
| 覆盖关系 | `git merge-base --is-ancestor $A $B` + `git cherry $B $A` | 判定 SKIP |
| 合并顺序 | KEEP 集两两 `comm -12` 非测试代码文件集合 | 找出争抢同一批文件的分支对 |

**验证纪律（failure → cause → fix → recheck）—— 本轮触发一次:**

1. **failure:** 初版 semantic 扫描把 `unify-degraded-storage-notice-9ae7` 判成"5 个文件内容不同"，与 `git cherry` 输出 `0 +/0 -`、merge-tree 报 CLEAN 相矛盾。
2. **cause:** 该分支唯一的 unique commit 是一个把 `opt-continuous` 合进自己的 **merge commit**。`git cherry` 按设计跳过 merge commit 所以输出为空；而我的 semantic 扫描用 `merge-base..branch` 两点 diff，把 base 自身 220 条 commit 的改动误算成了"分支的改动"。两个信号都不是错的，是我的读法错了。
3. **fix:** 改用直接判据 —— 构造合并结果树再 diff：`T=$(git merge-tree --write-tree $BASE $BR); git diff --stat $BASE $T`。
4. **recheck:** 输出为**空**，合并净效果 0 字节，与 `git cherry` 和 merge-tree CLEAN 三方一致 → 判定 SKIP。同一判据回灌到 `add-cloud-agent-environment-7fd5`（净 1 文件 10 行）、`market-practical-optimize-9c93`（净 18 文件）、`normalize-repo-content-1fd7`（净 121 文件 −92513 行），四条 CLEAN 分支的净效果全部核实。

**本文件交付方式:** 只读分析产物，不含代码改动，无需 CI 验收。所有引用的 SHA、行号、文件路径均可用 §5 表中命令在 `origin/agent/opt-continuous` @ `d04f398` 上原样复现。
