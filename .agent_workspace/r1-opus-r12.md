# Round 1 / Agent C (opus-fast) — Round 12 合并计划

**目标分支**: `origin/agent/opt-continuous` @ `d04f398d679ed943c6c5927870f7a2da80690052`
(`docs(agent): close Round 11 and open Round 12`)

**结论先说**: 9 条 r12 分支全部基于 opt-continuous 当前 tip,彼此改动文件互不重叠,**唯一的公共文件是
`scripts/file-size-allowlist.json`**。全量 octopus 会失败;推荐 **8 路 octopus(r12-2..r12-9)+ 单独合并
r12-1**,只需解决 1 处相邻行冲突。该方案已在临时 worktree 中实跑验证:typecheck / 1978 个测试 / eslint 全绿。

---

## 1. 各分支唯一提交与改动文件

所有 9 条分支的 merge-base 都等于 `origin/agent/opt-continuous` 的 tip `d04f398`,
即**没有任何分支落后于目标分支**,不需要先 rebase。

### r12-1 `origin/cursor/r12-1-app-stage-187a` — 2 unique

| SHA | 标题 |
| --- | --- |
| `1c169b2` | refactor(app): 抽出旧版编辑器中栏与右栏到 src/components/editor/ |
| `153241a` | test(editor): 为拆出的中栏/右栏补组件侧与 App 侧接缝 pin |

```
 1  1  scripts/file-size-allowlist.json      <- "src/App.tsx": 988 -> 933
19  0  src/App.shell-layout.test.tsx         (新增)
44 99  src/App.tsx                           (988 -> 933 行)
95  0  src/components/editor/LegacyEditorInspector.tsx   (新增)
107 0  src/components/editor/LegacyEditorStage.tsx       (新增)
220 0  src/components/editor/legacy-editor-panes.test.tsx(新增)
```

**唯一一条改动生产代码的分支**,其余 8 条纯测试拆分。

### r12-2 `origin/cursor/r12-2-maplayer-tests-187a` — 1 unique

`a292a4a` test(canvas): 按域拆分 MapLayer 测试并共用挂载装置

```
0 1  scripts/file-size-allowlist.json        <- 删除 MapLayer.test.tsx 条目
0 647 src/components/canvas/MapLayer.test.tsx (删除)
+ MapLayer.{frame,labels,overlay-alignment,pins,province-texture,uploaded-image}.test.tsx
+ src/components/canvas/map-layer-test-harness.ts
```

### r12-3 `origin/cursor/r12-3-error-boundary-tests-187a` — 2 unique

| SHA | 标题 |
| --- | --- |
| `1c1c9f3` | test(error-boundary): 按域拆分崩溃屏用例并抽出共享装置 |
| `bd05814` | test(error-boundary): 崩溃子树单独成文件以清掉 react-refresh 警告 |

```
0 1   scripts/file-size-allowlist.json       <- 删除 AppErrorBoundary.test.tsx 条目
10 593 src/components/AppErrorBoundary.test.tsx (保留为 10 行壳,未删文件)
+ AppErrorBoundary.{export,project-store,return-navigation}.test.tsx
+ src/components/app-error-boundary-crash-child.tsx
+ src/components/app-error-boundary-test-harness.tsx
```

### r12-4 `origin/cursor/r12-4-asset-panel-tests-187a` — 1 unique

`3c7204c` test(assets): 按域拆分 AssetPanel 测试并抽出共享装置

```
0 1   scripts/file-size-allowlist.json       <- 删除 AssetPanel.test.tsx 条目
0 587 src/components/AssetPanel.test.tsx     (删除)
+ AssetPanel.{instances,layout,library,province-theme,texture-sizing}.test.tsx
+ src/components/asset-panel-test-harness.tsx
```

### r12-5 `origin/cursor/r12-5-agent-assistant-tests-187a` — 1 unique

`7bfd7ee` test(assistant): 按域拆分 AgentAssistant 用例并集中传输替身

```
0 1   scripts/file-size-allowlist.json       <- 删除 AgentAssistant.test.tsx 条目
0 569 src/components/AgentAssistant.test.tsx (删除)
+ AgentAssistant.{persistence,project-change,proposals,shell}.test.tsx
+ src/components/agent-assistant-test-harness.tsx
```

### r12-6 `origin/cursor/r12-6-workbench-tests-187a` — 1 unique

`db14089` test(workbench): 按域拆分 ProjectWorkbench 测试并共用装置

```
0 1   scripts/file-size-allowlist.json       <- 删除 ProjectWorkbench.test.tsx 条目
0 564 src/components/ProjectWorkbench.test.tsx (删除)
+ ProjectWorkbench.{backup-export,card-actions,import,indexeddb-fallback,listing,storage-notice,store-errors}.test.tsx
+ src/components/project-workbench-test-harness.tsx
```

### r12-7 `origin/cursor/r12-7-export-poster-tests-187a` — 1 unique

`92f5f60` test(export-poster): 按域拆分海报导出测试并集中替身

```
0 1   scripts/file-size-allowlist.json       <- 删除 export-poster.test.ts 条目
0 509 src/lib/export-poster.test.ts          (删除)
+ export-poster.{deadline,download,fallback,rasterize,serialize}.test.ts
+ src/lib/export-poster-test-fixtures.ts
```

### r12-8 `origin/cursor/r12-8-binary-import-tests-187a` — 1 unique

`10baffe` test(binary-import): 按领域拆分导入测试并抽出 GB18030 夹具

```
0 1   scripts/file-size-allowlist.json       <- 删除 binary-import.test.ts 条目
0 471 src/lib/binary-import.test.ts          (删除)
+ binary-import.{adapters,csv-decoding,sheet-selection,workbook-rows}.test.ts
+ src/lib/binary-import-test-fixtures.ts
```

### r12-9 `origin/cursor/r12-9-conversation-store-tests-187a` — 1 unique

`f36bc4c` test(agent-conversation-store): split the 464-line suite by domain

```
0 1   scripts/file-size-allowlist.json       <- 删除 agent-conversation-store.test.ts 条目
0 464 src/lib/agent-conversation-store.test.ts (删除)
+ agent-conversation-store.{limits,rebinding,redaction,round-trip}.test.ts
+ src/lib/agent-conversation-store-test-fixtures.ts
```

---

## 2. 重叠与冲突分析

### 2.1 文件级重叠

除 `scripts/file-size-allowlist.json` 外,**9 条分支的改动文件集合两两不相交**(用
`git diff --name-only` 求并集后 `sort | uniq -d`,除 allowlist 外无重复项)。没有 add/add、
没有 rename/rename、没有 modify/delete。

### 2.2 allowlist 才是唯一战场

每条分支都只改 allowlist 的**一行**,但改的是不同行。基线文件中被触及的行号:

| 行号 | 条目 | 改动方 | 操作 |
| --- | --- | --- | --- |
| 7 | `"src/App.tsx": 988` | r12-1 | 改值 → 933 |
| 8 | `"src/components/AgentAssistant.test.tsx": 569` | r12-5 | 删行 |
| 10 | `"src/components/AppErrorBoundary.test.tsx": 613` | r12-3 | 删行 |
| 12 | `"src/components/AssetPanel.test.tsx": 587` | r12-4 | 删行 |
| 15 | `"src/components/ProjectWorkbench.test.tsx": 564` | r12-6 | 删行 |
| 17 | `"src/components/canvas/MapLayer.test.tsx": 647` | r12-2 | 删行 |
| 23 | `"src/lib/agent-conversation-store.test.ts": 464` | r12-9 | 删行 |
| 25 | `"src/lib/binary-import.test.ts": 471` | r12-8 | 删行 |
| 28 | `"src/lib/export-poster.test.ts": 509` | r12-7 | 删行 |

**r12-1(第 7 行)与 r12-5(第 8 行)紧邻**,xdiff 把两处改动归进同一个 hunk,因此必然冲突。
其余任意两条分支的改动行至少相隔 2 行,可自动合并。

用 `git merge-tree` 跑完 36 对两两组合,**只有 `r12-1 × r12-5` 一对冲突**;换任何合并顺序,
冲突次数都恰好是 1(顺序 1..9 时冲突落在第 5 步,顺序 2..9 再 1 时落在最后一步)。

### 2.3 为什么这个冲突必须人工判断

`scripts/file-size-ratchet.test.ts` 是**双向棘轮**,不是豁免清单:

- 超过 400 行且不在 allowlist → 失败;
- allowlist 里的文件变大 → 失败;
- allowlist 里的文件**变小或被删除而条目还在** → 同样失败(`stale`)。

所以冲突不能随手选一边:保留 `"src/App.tsx": 988` 会因 App.tsx 实际 933 行而报 stale;
保留 `"src/components/AgentAssistant.test.tsx": 569` 会因该文件已被 r12-5 删除而报
`no longer tracked`。**正解是取两侧的并集语义**。

---

## 3. 推荐合并命令序列

前置条件:工作区干净、无进行中的合并、已 `git fetch origin --prune`。
**注意**:当前检出的 `cursor/merge-all-branches-e17a` 落后 opt-continuous 405 个提交且没有自己的提交
(`git rev-list --left-right --count origin/agent/opt-continuous...HEAD` → `405  0`),
**不要在它上面合并**,要从 opt-continuous 新开集成分支。

### 方案 A(推荐):8 路 octopus + r12-1 单独合并 —— 已实跑验证

```bash
cd /workspace
git fetch origin --prune
git switch -c cursor/r12-integration-<suffix> origin/agent/opt-continuous

# 第 1 步:8 条纯测试拆分分支一次性 octopus,零冲突
git merge --no-edit -m "merge(r12): 汇入 Round 12 测试拆分分支 r12-2..r12-9" \
  origin/cursor/r12-2-maplayer-tests-187a \
  origin/cursor/r12-3-error-boundary-tests-187a \
  origin/cursor/r12-4-asset-panel-tests-187a \
  origin/cursor/r12-5-agent-assistant-tests-187a \
  origin/cursor/r12-6-workbench-tests-187a \
  origin/cursor/r12-7-export-poster-tests-187a \
  origin/cursor/r12-8-binary-import-tests-187a \
  origin/cursor/r12-9-conversation-store-tests-187a

# 第 2 步:合入唯一改生产代码的 r12-1,会在 allowlist 上产生 1 处冲突
git merge --no-edit origin/cursor/r12-1-app-stage-187a
# -> CONFLICT (content): Merge conflict in scripts/file-size-allowlist.json

# 第 3 步:按下面 §4 的解法改 scripts/file-size-allowlist.json,然后
node -e "JSON.parse(require('fs').readFileSync('scripts/file-size-allowlist.json','utf8'))"
git add scripts/file-size-allowlist.json
git commit --no-edit
```

octopus 第 1 步会先 fast-forward 到 r12-2,最终产生一个 8 parent 的合并提交,
`git log --graph` 上是干净的一次汇流。

### 方案 B(保守):纯顺序合并

把 r12-1 放最后,冲突就集中在最后一步,前 8 步全绿:

```bash
git switch -c cursor/r12-integration-<suffix> origin/agent/opt-continuous
for b in r12-2-maplayer-tests r12-3-error-boundary-tests r12-4-asset-panel-tests \
         r12-5-agent-assistant-tests r12-6-workbench-tests r12-7-export-poster-tests \
         r12-8-binary-import-tests r12-9-conversation-store-tests; do
  git merge --no-edit "origin/cursor/$b-187a" || { echo "unexpected conflict in $b"; break; }
done
git merge --no-edit origin/cursor/r12-1-app-stage-187a   # 唯一冲突点
```

### 为什么不用全量 octopus

实跑 `git merge <9 个 head>` 的结果:

```
Fast-forwarding to: origin/cursor/r12-1-app-stage-187a
...
Trying simple merge with origin/cursor/r12-5-agent-assistant-tests-187a
ERROR: content conflict in scripts/file-size-allowlist.json
fatal: merge program failed
Automated merge did not work.
Should not be doing an octopus.
Merge with strategy octopus failed.
```

octopus 策略**不支持人工解冲突**,遇到内容冲突就整体放弃。好消息是它会干净回滚
(HEAD 仍在 `d04f398`、工作区无残留),所以误试一次没有副作用,不需要 `git merge --abort`。

---

## 4. 预期冲突文件与确切解法

**唯一冲突文件:`scripts/file-size-allowlist.json`**(方案 A/B 都只有这一处)。

冲突原文:

```
  "src/App.collaboration-terminal.test.tsx": 402,
<<<<<<< HEAD
  "src/App.tsx": 988,
=======
  "src/App.tsx": 933,
  "src/components/AgentAssistant.test.tsx": 569,
>>>>>>> origin/cursor/r12-1-app-stage-187a
  "src/components/AgentAssistant.tsx": 705,
```

解成(取 r12-1 的新行数 + r12-5 的删除):

```
  "src/App.collaboration-terminal.test.tsx": 402,
  "src/App.tsx": 933,
  "src/components/AgentAssistant.tsx": 705,
```

即 **`src/App.tsx` 取 933,同时丢掉 `AgentAssistant.test.tsx` 那一行**。
933 已核对为 r12-1 上 `src/App.tsx` 的实际行数(`git show ...:src/App.tsx | wc -l` = 933),
与棘轮要求的"精确行数"一致。

合并后 allowlist 应恰好比基线少 8 个条目(7 个被删测试 + AppErrorBoundary.test.tsx 缩到 10 行)、
`src/App.tsx` 由 988 降到 933,共 30 个条目。

**没有其他预期冲突**:36 组两两 merge-tree 与两种整链顺序模拟均只报出这一处。

---

## 5. 验证证据(临时 worktree 实跑,已清理)

在 `/tmp/r12-merge`(`git worktree add --detach`)上按方案 A 完整执行,结果:

| 检查 | 结果 |
| --- | --- |
| 8 路 octopus(r12-2..9) | 零冲突,merge commit 8 parents |
| 合并 r12-1 | 1 处冲突,仅 `scripts/file-size-allowlist.json` |
| 解冲突后 JSON 合法性 | 通过 |
| `npm run typecheck`(`tsc -b --noEmit`) | 退出码 0 |
| `npx vitest run` | **296 passed / 2 skipped,1978 tests passed**,退出码 0(含 file-size ratchet 全部 5 条断言) |
| `npx eslint .` | 0 errors,1 warning(`DataWorkspace.tsx:257` react-hooks/exhaustive-deps,基线既有,9 条分支均未碰该文件) |

合并结果规模:vs opt-continuous **61 files changed, +5488 −4512**。
删除的原大测试文件 7 个;新增文件最大 256 行,均在 400 行限下,无需新增 allowlist 条目。

验证用 worktree 已 `git worktree remove --force` 删除;验证提交 `db2f964` 未建任何 ref、
未 push,属一次性产物,执行者按 §3 重跑即可复现。

### 过程中的一次失败与修复(failure → cause → fix → recheck)

- **failure**: 用 `git merge-tree --write-tree` 串联模拟顺序合并时,第 2 步起全部报
  `not something we can merge` / usage 提示。
- **cause**: git 2.43 的 `merge-tree` 即使显式给了 `--merge-base`,两个待合并参数仍要求 commit-ish;
  我把上一步产出的 **tree OID** 直接喂了进去。
- **fix**: 每步用 `git commit-tree <tree> -p <prev>` 把中间 tree 包成临时提交再传入。
- **recheck**: 重跑同一模拟,两种顺序均正常输出,各自恰好 1 处冲突,并与后续真实
  `git merge` 的结果一致。

---

## 6. 交付与回滚

- **验收方式**:集成分支推送后由 CI 跑 `npm run lint` + `npm test`;本地已预跑通过(见 §5)。
- **破坏性变更**:无。9 条分支不改导出格式、数据结构或 API 形状;r12-1 只是把 `App.tsx`
  的中栏/右栏 JSX 抽成 `src/components/editor/` 下的组件,对外行为不变(其自带
  `App.shell-layout.test.tsx` 与 `legacy-editor-panes.test.tsx` 做接缝 pin)。
- **回滚方案**:集成分支上的合并提交可整体 `git revert -m 1 <merge-sha>`;
  由于每条来源分支独立且文件集不相交,也可单独 revert 某一路的合并父,
  但**同时要把 `scripts/file-size-allowlist.json` 对应条目加回去**,否则棘轮会因
  "超过 400 行且不在 allowlist" 而失败。

## 7. 给执行者的注意事项

1. 不要在当前 `cursor/merge-all-branches-e17a` 上合并(落后 405 个提交,且其树上根本没有
   `scripts/file-size-allowlist.json`)。必须从 `origin/agent/opt-continuous` 起新分支。
2. `npm install` 会顺手改写 `package-lock.json`(npm 10.9.7 会补 `license` 字段、删 `libc` 字段)。
   若只是为了跑测试,跑完记得 `git checkout -- package-lock.json`,别把这段无关 diff 带进合并提交。
3. 全量 octopus 失败是预期行为,不是环境问题;它会自行回滚,不用 `git merge --abort`。
