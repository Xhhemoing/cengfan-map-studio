# Round 3 Agent D（opus-fast）— 文档 SHA 时效性审计

**Model:** `claude-opus-5-thinking-high-fast`
**验证分支:** `cursor/verify-merged-code-e17a` @ `b5ae155`（全程未动）
**共享工作树在本轮期间换过分支:** 开工时 `/workspace` 在验证分支 `b5ae155`，收工时已被其它 agent 切到
`cursor/report-superseded-png-export-failure-189e` @ `21970aa`（见 §3）
**任务边界:** 只审 SHA 时效性 + 台账与 HEAD 是否矛盾。**未改任何产品代码，未接线任何功能，未改写 README 产品声明，未 push。**

## 结论一句话

**验证台账里的 SHA 没有一处是过期的**（唯一失真是一个字符的笔误）；台账的**状态**行则确实与实际脱节 ——
它不知道本轮在兄弟分支上新增了导出失败修复，也不知道那条线上的闸门红过一次又被拆分修回。已如实补记。

---

## 1. SHA 逐条核验（验证台账，8 份文件）

对 `VERIFY-PROGRESS.md` / `round-verify-r1.md` / `round-verify-r2.md` / `verify-r1-*.md` / `verify-r2-*.md`
抽出全部 7–40 位十六进制串，逐个 `git cat-file -t` + `git merge-base --is-ancestor <sha> HEAD`。

**结果：可解析为 commit 且是 HEAD 祖先的，共 25 个，全部有效。** 包括台账反复引用的
`388eafc`（merge 基线）、`897a2a6`（合并前 main）、`70f95b9`（导出修复）、`19ffd72`（测试装置修复）、
`4b30a69` / `c9a2917` / `1e3af69` / `b5ae155`（各轮简报）、`d6eac6b` / `1d6d064` / `08c88b4` / `3bbfcef` /
`ac7d7b9` / `f9560ab` / `5f7c377` / `0745f2f` / `36c5dd7` / `5013191` / `44312ea` / `b253b76` / `c1b4fc7` /
`76bbe9c` / `5e5405c` / `08818db` / `9e691e2`。

### 四处「异常」，逐条判定

| # | 串 | 出处 | 判定 |
| --- | --- | --- | --- |
| 1 | `888eafc` | `verify-r2-fable-nits.md:39` | **笔误，非过期**。仓库无此对象；上下文（「合并新增的 53 行 CHANGELOG（`888eafc` 侧带入）」）指的显然是 merge 提交 `388eafc`，同段落其余处均写对。**COSMETIC**，改一个字符即可，我没改——留给 parent 决定是否值得为此动别人的报告。 |
| 2 | `6d0b1ab` | `verify-r1-fable-arch.md:60` | **有效且「不是 HEAD 祖先」正是原意**。`fix(import): parse-data 上送前征得一次性告知同意`——它是源分支上**故意没被合并**的 consent 接线提交，报告说的就是「其接线落在 main 上不存在的 `DataImportPanel.tsx` 里，无法直接搬」。**准确。** |
| 3 | `a38f716` | `verify-r2-sol-tests.md:18` | **有效**，`git cat-file -t` 得 `blob` 而非 `commit`——报告原文写的就是「committed blob `a38f716`」。**准确。** |
| 4 | `58edc4f` | `verify-r2-sol-tests.md:18` | **对象不存在，且这正是报告的论点**：它记的是另一 agent 当时未提交的工作树 blob（`uncommitted blob 58edc4f`），未提交的对象本就不会长期存在。**准确。** |

### `897a2a6` 那句「文件自 `897a2a6` 未改」——成立

`round-verify-r2.md:13` 说 `WorkflowStepper` 「文件自 `897a2a6` 未改」。
`git log -1 -- src/components/WorkflowStepper.tsx` 的答案是 `9e691e2`（`add global data workbench`），
而 `9e691e2` 是 `897a2a6` 的祖先，`897a2a6` 本身没碰这个文件 ——
所以「自 `897a2a6` 起未改」为真。`verify-r2-fable-nits.md:65` 已把真正的创建提交
（`08818db` / `9e691e2`）写清楚。**两处不冲突，无需修。**

---

## 2. 产品文档（`docs/`）里的 6 个死 SHA —— 预存，OUT-OF-SCOPE

`docs/` 下有 6 个串解析不到任何对象：

| 串 | 出处 |
| --- | --- |
| `d48be31` `1492422` `17bb367` `5949eb8` `53cd286` | `docs/progress/2026-08-06-agent-safety-and-transaction-integrity.md`、`docs/progress/2026-08-06-semantic-array-collaboration.md` |
| `3aa8e8c` | `docs/qa/2026-07-24-core-editor-repair.md` |

（另有 `20260806` 是日期，正则误命中。）

**不归罪合并，也不在本任务范围：**
`git diff 897a2a6 388eafc -- docs/progress/ docs/qa/` 为**空 diff**，PR #44 一个字都没动这些文件；
它们分别定稿于 `b88a4d0` / `a89931a`，引用的是被压缩 / 变基掉的历史提交。
属历史归档文档的陈年引用，与「确认合并有效且正确」无关。**建议不修**（改动历史记录本身会制造新的失真）。

---

## 3. 台账状态与实际脱节（**这一条是要动手的**）

### 先说清分支拓扑 —— 这决定了「红」该记在谁头上

本轮六个 agent 共用 `/workspace`，中途有人**切了分支**，不只是推进提交：

| 分支 | tip | 内容 |
| --- | --- | --- |
| `cursor/verify-merged-code-e17a` | `b5ae155` | 验证分支，**全程没动过**，R3 Agent E 实测全绿 |
| `cursor/report-superseded-png-export-failure-189e` | `21970aa` | 以 `b5ae155` 为父：`ea38982` 导出失败修复 → `423a3b5` 拆用例 → `21970aa` 报告 |
| `origin/main` | `388eafc` | PR #44 合并提交 |

所以下面那次「红」**发生在兄弟分支上，不在验证分支上，更不在 PR #44 上**。

### failure → cause → fix → recheck

1. **failure** — 我在 `/workspace` 直跑 `npm test`，exit 1：**2 个文件失败**
   （`scripts/file-size-ratchet.test.ts` + `src/lib/usePosterExport.test.tsx > PROBE failure swallowed…`），
   2415 pass / 2 fail / 2 skip。这与 R3 Agent E 报的 `b5ae155` 全绿（2416 pass / 0 fail）直接打架。

2. **cause** — **两个原因，必须拆开看，不能一起归给「共享工作树」：**
   - `PROBE …` 那条：**是污染**。跑的过程中工作树已被切到 `ea38982`，且另一 agent 往
     `src/lib/usePosterExport.test.tsx` 塞了未提交的变异探针。这是 `verify-r2-sol-tests.md` 记过的同一个坑。
   - ratchet 那条：**不是污染，是真断**。`ea38982` 给 `usePosterExport.test.tsx` +51 行，
     **提交态**即 431 行 > 400 行闸门，且不在 `scripts/file-size-allowlist.json`。
     增长轨迹：`388eafc` 303 → `70f95b9` 354 → `19ffd72` 380 → `b5ae155` 380 → **`ea38982` 431**。
     `b5ae155` 时还有 20 行余量，是 `ea38982` 把它推过线的。

3. **fix** — 我这一轮的修法是**验证方法**上的，不是改代码：
   把全量跑挪进 detached worktree 的不可变提交
   （`git worktree add --detach /tmp/r3-iso ea38982`，`node_modules` 软链复用），排除他人未提交的改动。

4. **recheck** — `/tmp/r3-iso` @ `ea38982`，干净树，`npm test`：
   **exit 1；350 files pass / 1 failed / 2 skip；2418 pass / 1 fail / 2 skip；123.70s。**
   `PROBE` 那条消失（证实是污染）；**ratchet 那条依旧失败（证实是真断）**：

   ```
   FAIL scripts/file-size-ratchet.test.ts > keeps every tracked source file at or below the line limit
   AssertionError: 1 file(s) exceed 400 lines and are not covered by scripts/file-size-allowlist.json:
     - src/lib/usePosterExport.test.tsx: 431 lines (limit 400)
   ```

`scripts/file-size-ratchet.test.ts` 就在 `npm test` 里，而 `npm test` 是 `.github/workflows/ci.yml` 的测试步骤，
所以那一刻兄弟分支推上去 CI 必红。

### 已闭环：`423a3b5` 用拆分而非 allowlist 修回

Agent C 随后提交 `423a3b5`，把超长文件拆成三份，**没有**往 allowlist 里加条目
（符合 ratchet 自述的「加 allowlist 条目需显式 reviewer 决定」）：

| 文件 | 行数 |
| --- | --- |
| `src/lib/usePosterExport.test.tsx` | 144 |
| `src/lib/usePosterExport.generation.test.tsx` | 143 |
| `src/lib/poster-export-test-harness.tsx` | 203 |

**我在 `/tmp/r3-iso2` @ `423a3b5`（干净 detached worktree）复跑了全套 CI 闸门：**

| 闸门 | 结果 |
| --- | --- |
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** — 0 errors / 5 warnings（与 R1 起的基线一致） |
| `npm test` | **exit 0** — 354 files（352 pass / 2 skip）/ **2419 pass / 2 skip**，113.56s |

**这一格闭环，不再是 MUST-FIX。** 值得留档的教训是：本轮闸门确实红过一次，
红的是 Round 3 自己的新提交，**与 PR #44 的合并正确性无关 —— 那一头仍是无 MUST-FIX。**

---

## 4. 我改了什么

按「优先把文件留给 parent」的约束，只动了两处，且都是台账与 HEAD 矛盾所必需：

1. **新建 `.agent_workspace/round-verify-r3.md`**（parent 尚未建桩）——只填已取证的格子，判定行留空。
2. **改 `.agent_workspace/VERIFY-PROGRESS.md` 的 Loop status** —— 原文只有一句
   「Round 3: in progress」，既不知道兄弟分支上新增的三个提交，也没有本轮的闸门证据。
   补成：合并正确性无 MUST-FIX（不变）＋ 兄弟分支拓扑 ＋ 红过一次又修回的完整记录 ＋
   `423a3b5` 的三闸门实测数字。判定行与合入决定仍留空给 parent —— 兄弟分支要不要并进来是 parent 的决定，
   我不替它写「CLOSED」。

> 一个过程中的自我更正，记在这里以免误导后续读者：我一度把 `ea38982` 当成验证分支的 tip，
> 并据此把台账写成「gate is RED at tip `ea38982`／阻断合入 main」。核对 `git branch -v` 后发现它在兄弟分支上，
> 验证分支始终停在 `b5ae155`；随后 `423a3b5` 又把那次越线修掉了。两份文档均已按拓扑改正。

**没做的：** 不改产品代码、不接线 consent / bleed、不改 README 产品声明、不动别人的报告
（含 §1 的 `888eafc` 笔误）、不修 `docs/` 陈年 SHA、不 push。

## 5. 收尾

`/tmp/r3-iso`（@`ea38982`）与 `/tmp/r3-iso2`（@`423a3b5`）为临时校验 worktree，均已 `git worktree remove --force` 清理。
`/tmp/verify-b5ae155` 是另一 agent 的 worktree，未动。

**方法学建议留给后续轮次：** 六 agent 共享 `/workspace` 时，任何全量闸门都必须在
detached worktree 的不可变提交上跑（`node_modules` 软链复用即可，无需重装）。
本轮我在 `/workspace` 直跑吃到的假失败，和 R2 `verify-r2-sol-tests.md` 记的是同一个坑 —— 已经踩第二次了。
