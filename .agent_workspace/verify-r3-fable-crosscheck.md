# Round 3 Agent B（fable）— R1×R2 报告交叉核验

**Model:** claude-fable-5-thinking-xhigh
**核验 HEAD:** `b5ae155`（分支 `cursor/verify-merged-code-e17a`，含 `70f95b9` 修复与 `19ffd72` 测试装置修正）
**方法:** 只读。通读 R1 六份（verify-r1-*）+ R2 六份（verify-r2-*）+ 两份轮次简报，找出互相矛盾的事实声明，逐条用 git / 源码取证裁定。**零代码改动、零提交、未 push。**

---

## 裁定总表

| # | 争议点 | R1 说法 | R2 说法 | 裁定 |
|---|---|---|---|---|
| 1 | WorkflowStepper 是否用户可见 | 「仍显示第六步」/「Both are live UI」 | 隐藏 DOM，用户不可见 | **R2 正确，R1 表述错误**（已实测） |
| 2 | bench 类型错误是否 pre-merge | 「预存在」（歧义） | 「文件合并才进 main」 | **两者各对一半，需拆成两个命题**（见 §2） |
| 3 | 测试计数 2411 / 2414 / 2416 | — | — | **无矛盾**，按提交对号入座；2416 尚待 R3 全量复跑 |
| 4 | App.tsx allowlist 值 923 vs 933 | fable-arch 923；fable-sota 933 | — | **923 正确，fable-sota 的 933 是笔误**（已实测） |
| 5 | DataWorkspace AI 调用点行号 L383/L391/L460/L471 | — | — | **非矛盾**，定义行 vs 调用行两种基准，全部同时为真 |

---

## §1. WorkflowStepper「素材」步：R1 错，R2 对——它对用户完全不可见

**冲突原文：**

- `round-verify-r1.md` NIT-3：「旧编辑器顶栏 `WorkflowStepper` 仍**显示**第六步『素材』」。
- `verify-r1-fable-sota.md` §4：「Both are **live UI** depending on `legacyEditorEnabled`/stage」。
- `verify-r2-fable-nits.md` §B.2：aria-hidden + 视觉裁剪 + pointer-events:none 的隐藏 DOM，从未对任何用户呈现。

**本轮实测（HEAD `b5ae155`）：**

```76:76:src/components/editor/LegacyEditorTopbar.tsx
        <div className="topbar-workflow__legacy" aria-hidden="true">
```

```1272:1272:src/styles.css
.topbar-workflow__legacy { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); pointer-events: none; white-space: nowrap; }
```

且该隐藏**先于合并存在**：`git show 897a2a6:src/styles.css` 第 1267 行有逐字相同的规则，`897a2a6:src/App.tsx:1938` 已有同一个 `aria-hidden="true"` 包裹（当时还内联在 App.tsx 里，合并系列只是把它抽进 `LegacyEditorTopbar`）。`git diff 897a2a6 388eafc -- WorkflowStepper.{tsx,test.tsx}` 为空 diff，与 R2 §B.1 一致。

**裁定：** R2 全部成立。用户面唯一的导航是五阶段 `WorkflowStageStepper`；legacy 六步条是留作结构兼容的隐藏 DOM，视障读不到、明眼看不见、点不到。R1 的「仍显示」与「Both are live UI」是取证不足的过度表述——fable-sota 只验证了「rendered at LegacyEditorTopbar.tsx:77」（DOM 里确实有），没看包裹层的 aria-hidden 与 CSS。

**附带纠偏：** 「第六步『素材』」这个说法本身也不准——`WorkflowStepper.tsx:6-13` 的数组里素材是**第 5 步**（index 4），第六步是「交付」。R2 简报沿用了「第六步」措辞，一并在此更正。结论不受影响（反正整条 stepper 都不可见）。

---

## §2. bench 类型错误：「pre-merge」一词必须拆成两个命题

**冲突原文：**

- `round-verify-r1.md` NIT-4：「`scripts/perf-canvas-bench.ts` 的类型不匹配**预存在**、不在 tsconfig 内」——读者容易理解成「合并前 main 上就有」。
- `verify-r2-fable-nits.md` #3：「文件**确系合并才进入 main**（旧 main 无此文件）」。

**本轮实测：**

| 检查 | 结果 |
|---|---|
| `git cat-file -e 897a2a6:scripts/perf-canvas-bench.ts` | **MISSING**（harness 同样 MISSING） |
| 同文件 @ `388eafc` | EXISTS（harness 亦 EXISTS） |
| `git merge-base --is-ancestor 76bbe9c 897a2a6` | 否——`76bbe9c`（拆出 harness 的提交）**不在旧 main 上** |
| `git merge-base --is-ancestor 76bbe9c 388eafc` | 是——在合并系列内 |

**裁定（两个命题都为真，互不矛盾）：**

1. **「错误在合并前的 main 上就存在」= 假。** 旧 main 根本没有这个文件；文件与错误都是随 `388eafc` 一起进入 main 的。
2. **「错误不是合并解决（conflict resolution）制造的」= 真。** R1 opus-types 用 worktree 在 `76bbe9c^`（仍在合并系列内、拆分之前）复现了同源错误（当时以内联形态报 `text: string | undefined`），证明错误继承自被合并分支自身历史，拆分提交只是搬运了它。

正确措辞应为：**merge-imported（随合并带入 main）但非 merge-manufactured（非合并解法制造）**。R1 简报的「预存在」指的是命题 2，但省略了命题 1，造成歧义；R2 fable-nits 的补充是对的。两轮共识不变的部分也都成立：`scripts/` 不在任何 tsconfig project 内（`npm run typecheck` 不受污染）、`tsx` 不查类型故 `npm run perf:canvas` 运行时正确、分级 COSMETIC。

---

## §3. 测试计数：无矛盾，三个数字对应三个树；2416 仍欠一次独立复跑

**各报告声明按提交对号：**

| 树 | 数字 | 声明方 | 独立验证方 |
|---|---|---|---|
| `388eafc`（merge 基线） | 351 files / **2411** pass / 2 skip | R1 fable-arch | R1 sol-tests（一致）；R1 sol-pages 引 CI run 32807192512（一致） |
| `4b30a69`（含 `70f95b9`，+3 用例） | **2414** pass / 2 skip | R1 opus-seams（当时为「声称」） | **R2 sol-tests 在隔离 worktree 复跑证实** |
| 含 `19ffd72`（+2 用例） | **2416** pass / 2 skip | R2 opus-export | **尚无第二人复跑**（R2 简报已正确标注留给 R3） |

**算术与文件级复核（本轮实测）：** `70f95b9` 的 +3 = usePosterExport 2 条 + ProjectMenu 1 条；`19ffd72` 的 +2 = `writes only the newest png when an earlier one is still encoding` + `keeps the png busy flag raised until every in-flight png settles`。当前 `src/lib/usePosterExport.test.tsx` 恰有 **15 个 `it(`**（= R2 opus 报的 15/15），四条新用例名全部在文件中实存（L277/L292/L310/L321）。2411+3+2=2416，链条自洽。

**R2 sol 记录的「2415 pass / 1 fail」不是任何提交的计数**：那是 `19ffd72` 作者在共享工作区改测试文件时撞上 sol 的全量跑，属并发干扰，sol 已正确诊断并改用隔离 worktree。不构成矛盾。

**子项：2 个 skip 的身份（R1 两份报告表述打架，实为粒度差异）。**
fable-arch 说 2 skip 是「collaboration.test.ts 的 .skip 块与 project-store.bench.test.ts」；opus-seams 说「全仓仅 1 处 it.skip」。实测两者都对：

- `server/collaboration.test.ts:7`：`const authorizeBench = process.env.COLLAB_AUTH_BENCH === "1" ? it : it.skip;`，仅 1 处使用（1 条 skip 用例）——这是仓库里**唯一的 `it.skip` 字面量**，opus-seams 的说法字面为真。
- `src/lib/project-store.bench.test.ts:7`：`describe.skipIf(process.env.PROJECT_LIST_BENCH !== "1")`，块内 1 条用例——第二条 skip 来自 `describe.skipIf`，不是 `it.skip`。

1 + 1 = 2 skip，两份报告拼起来才是全貌，无实质矛盾。

---

## §4. App.tsx 行数闸门：923 正确，fable-sota 的「933」是错的

`verify-r1-fable-sota.md` §6 写「App.tsx is now 923 lines（≤ the **933** allowlisted）」；fable-arch 与 opus-seams 均记 allowlist = 实际 = 923。

实测：`scripts/file-size-allowlist.json` 第 7 行 `"src/App.tsx": 923`，`wc -l src/App.tsx` = 923，全文件**不存在** 933 这个数。fable-sota 的 933 为笔误（或读了过期水位），其结论「App 瘦身守住」不受影响——但引用该报告时勿转抄 933。

---

## §5. DataWorkspace AI 调用点行号：四种写法全部同时为真

R1 fable-arch 写 `prepareAiImport` L383；R2 opus-deadcode 写「L391 与 L471」；R2 fable-nits 写 `importDirectly` L460-495。实测（DataWorkspace.tsx 自 388eafc 起未变）：

- `prepareAiImport` **定义**于 L383，其 `requestAiParse` **调用**在 L391；
- `importDirectly` **定义**于 L460，其调用在 L471。

即「函数定义行」与「出境调用行」两种基准，无矛盾。共识不变：两条路径今天都无 consent 闸门，属 pre-merge 既有缺口，OUT-OF-SCOPE，留给独立任务接线。

---

## 复核过、确认无矛盾的其余交叉点（留档）

- **Pages 404：** R1 sol-pages（deploy-pages 404 = 仓库未启用 Pages，artifact 构建成功）与 R2 简报一致，无人翻案。运维项。
- **死代码三件套：** R1 是 grep/typecheck 级证据，R2 opus-deadcode 升级为 bundle sourcemap + 产物 grep 级证据，方向一致且更强；「无 barrel 故无 barrel 风险」与 R1 无冲突。
- **`mmToPx` 重名：** 仅 R2 提出（opus-deadcode §4），R1 无相反声明；arity 差异由 tsc 兜底的论证成立。
- **LegacyEditorSidebar：** R1 opus-seams 说 PNG 按钮（L272）会卡「导出中」；R2 fable-export 说 SVG 按钮（L273）未置灰但 hook 修复后无害。讲的是相邻两个不同按钮的不同问题，不矛盾。
- **70f95b9 修复语义：** R2 两份复审（fable-export ACCEPT、opus-export「修复正确但装置空转」）不冲突——后者批的是**测试装置**，不是修复本身；且 opus 用「退回 70f95b9^ 用例照样红」证明了原用例并非无效。

## 给 Round 3 合并前的遗留清单（由本核验确认）

1. 在含 `19ffd72` 的 HEAD 上独立复跑 `npm test`，确认 **2416 pass / 2 skip**（唯一未闭环的数字）。
2. 引用历史报告时使用本文件的更正：WorkflowStepper 不可见（且素材是第 5 步）、bench 错误 = merge-imported 非 merge-manufactured、App.tsx allowlist = 923。

## 交付纪律记录

- 本轮只读核验，无检查失败，无 failure→cause→fix→recheck 链条。交付物即本报告，全部结论可由文中命令在 HEAD `b5ae155` 复现。
- 代码改动 0、提交 0、push 0（遵守任务约束）。
