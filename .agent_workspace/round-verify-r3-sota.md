# Round 3 — verify merged code 最终裁定（fable SOTA closeout）

**审计对象:** `origin/cursor/verify-merged-code-e17a` @ `b5ae155`（= merge-all `388eafc` on main + `70f95b9` 导出修复 + `19ffd72` 测试装置修复 + 文档提交）。
**Model:** claude-fable-5-thinking-xhigh（Round 3 Agent A）。

---

## 裁定：**ACCEPT**

main 上的 merge-all（`388eafc`，PR #44）**有效且正确**；唯一必要的产品代码修复就是导出接缝修复 `70f95b9`（`19ffd72` 为纯测试修复，不改产品代码）。除此之外没有任何 MUST-FIX。

---

## 证据链

### 1. 拓扑：分支上除文档外只有该修复

`git diff origin/main..b5ae155 -- ':!.agent_workspace'` 恰好 4 个文件，全部属于 `70f95b9` + `19ffd72`：

- `src/lib/usePosterExport.ts`（+19/−3，产品代码，唯一）
- `src/components/ProjectMenu.tsx`（+2/−2，产品代码：SVG 入口补 `disabled`）
- `src/lib/usePosterExport.test.tsx`、`src/components/ProjectMenu.test.tsx`（测试）

无冲突标记（`<<<<<<<`/`>>>>>>>`/`=======` 全仓 0 命中，排除 md）、无 `.orig`/`.rej`。

### 2. 修复语义复核（对 b5ae155 源码逐行）

三个量各答一问，与 `c1b4fc7` 代次守卫的本意（先落地的不再改状态，但不丢产物）一致：

- `exportGenerationRef` → 谁能写导出面板（行为与 pre-fix 相同）；
- `latestPngGenerationRef` → 这份 PNG 要不要落盘：只有**更晚的另一次 PNG** 才让它多余；SVG/工程包顶掉的是状态不是产物（`usePosterExport.ts:206`）；
- `pngExportsInFlightRef` → 计数而非代次，被顶掉的一轮在 `finally` 同样交还占用，`exportingPng` 只在归零时清（`usePosterExport.ts:218-219`）。

`ProjectMenu` 的「导出 SVG」与「导出 PNG」按同一 `exportState === "exporting"` 置灰，口径与 `DeliveryWorkspace` 三个导出入口一致。与 `export-poster.ts` 的降级链核对过：blob 通道 decode 失败会退回 data URL 通道重试一次，`19ffd72` 的 stale 用例正确地把两条通道都置为失败。

### 3. 测试装置真实性（19ffd72 复核）

`startGatedPngExport` 现在 `await act(async …)` 并轮询等到本次导出的 `Image` 真正接上装置才换回真实实现；接不上直接抛错（`usePosterExport.test.tsx:144-153`）——窗口是假的时用例会响，不会蒙混。

**变异探针（隔离 worktree 内实跑，跑完即还原，工作树复归 clean）：**

| 变异 | 结果 |
| --- | --- |
| `if (isLatestPng()) downloadBlob` 改回 `if (isCurrent())`（pre-fix 语义） | 恰好 `still writes the png when another kind of export starts mid-flight` 失败（14/15 其余通过） |
| `finally` 里无条件 `setExportingPng(false)` | 恰好 `keeps the png busy flag raised until every in-flight png settles` 失败 |

两格都咬人 ⇒ 修复不是被空转装置「验证」的。

### 4. 全量校验链 @ b5ae155（隔离 worktree，见下文第 6 条原因）

- `npm run typecheck`（tsc -b --noEmit）：**0 错误**；
- `npm run lint`：**0 error / 5 warning**（与 Round 1 同一组 pre-existing 警告，无新增）；
- `npm test` 全量 Vitest：**351 files passed / 2 skipped，2416 tests passed / 2 skipped，0 failed**——与 `19ffd72` 提交声称的 2416/2 完全一致（R2 缺口补上）。file-size-ratchet 在 b5ae155 通过（`usePosterExport.test.tsx` 380 行 ≤ 400）。

### 5. Round 2 遗留项交叉核验（均维持原结论）

- **死代码摘取未误交付：** `DataImportConsent`/`use-studio-preferences` 仅互相引用、`print-bleed` 零生产引用，无 barrel，不进 bundle；
- **WorkflowStepper 第六步「素材」：** 文件最后一次改动是 pre-merge 的 `9e691e2`（是 `388eafc^` 祖先）；渲染处包在 `aria-hidden="true"` + `clip: rect(0 0 0 0)` + `pointer-events: none` 里（`LegacyEditorTopbar.tsx:76`、`styles.css:1272`），用户不可见不可点；
- **CI on main：** run 32807192512（typecheck/lint/test）success；Pages run 32807192510 失败仍是仓库未启用 Pages（运维，非代码）；
- **同名 `mmToPx` 不同 arity：** typecheck 0 错误佐证误导入会被编译期拦下，安全。

### 6. 过程披露：共享工作区污染与隔离重测

本轮执行期间，另一并行 R3 agent 把共享 checkout 切到了 `cursor/report-superseded-png-export-failure-189e` 并提交 `ea38982`。我在切换后跑的第一遍全量出现 1 个失败（ratchet 报 `usePosterExport.test.tsx` 431 行）——**那是 ea38982 的树，不是 b5ae155 的**。据此我把 b5ae155 固定进独立 git worktree（`/tmp/verify-b5ae155`）重跑了 typecheck/lint/全量测试与变异探针，得到上文第 4 条的干净结果（failure → cause：树被并行切换 → fix：隔离 worktree → recheck：全绿）。本报告结论只针对 b5ae155。

---

## 附录：NITS（无一阻塞）

1. **`LegacyEditorSidebar.tsx:273` 「导出 SVG」仍未按 `exportState` 置灰**（PNG 按钮同行已置灰）。后果限于：经此入口插队且在途 PNG **失败**时，失败提示被静默（成功路径产物已受 `70f95b9` 保护）。并行分支 `ea38982` 正是在补这半扇门（catch 里 `!isCurrent()` 时按 `isLatestPng()` 走 `reportStatus`）——属锦上添花的产品任务，不是合并正确性的必要条件。
2. **给并行分支的提醒（非本分支义务）：** `ea38982` 把 `usePosterExport.test.tsx` 推到 431 行 > 400，在其分支上 file-size-ratchet 会红；合入前需拆分或瘦身。
3. 维持既往 NITS：consent/bleed/preferences 死代码待接线、`scripts/perf-canvas-bench.ts` 类型不匹配（不在 tsconfig 内）、若干 pre-merge 孤儿组件、启用 GitHub Pages（运维）。

## 验收方式与回滚

- 验收：本报告第 4 条为在 b5ae155 隔离环境的完整复跑证据；main 侧 CI 32807192512 已绿。
- 回滚：`70f95b9` 可单独 `git revert`（无数据/导出格式/API 形状变更）；`19ffd72` 纯测试。merge-all 本体如需回退按 `388eafc` revert merge 处理（无需要，仅记录）。
