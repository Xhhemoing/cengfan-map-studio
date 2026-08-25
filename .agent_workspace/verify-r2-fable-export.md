# Round 2 Agent A（fable）— 复审 70f95b9 导出打断修复

- **审计对象**：`70f95b9 fix(export): 别让插队的 SVG/工程包吞掉在途的 PNG`，分支 `cursor/verify-merged-code-e17a`（HEAD `4b30a69`，工作区干净）。
- **范围**：`src/lib/usePosterExport.ts`、`src/components/ProjectMenu.tsx` 及两者的测试；并追查全部导出入口，确认没有残留的打断漏洞。

## 结论：ACCEPT

Round 1 报的 BLOCKER（插队的 SVG/工程包吞掉在途 PNG 的产物，且 `exportingPng` 永久卡在 true）在 70f95b9 已被完整、正确地修掉。逐条核对如下。

## 修复逻辑逐条验证（usePosterExport.ts）

三个量各答一个问题，语义拆分正确：

1. **`exportGenerationRef` / `isCurrent()`**（行为不变）：仍然只允许最后一次导出写状态与提示。`exportPng` 成功路径里 `if (!isCurrent()) return` 移到了 `downloadBlob` **之后**（第 206–207 行），这是修复的核心——产物落盘与状态所有权解耦。
2. **`latestPngGenerationRef` / `isLatestPng()`**：只有更晚的另一次 PNG 才使在途 PNG 的产物多余。SVG/工程包顶掉代次但不顶掉 `isLatestPng()`，PNG 照常落盘；两次 PNG 连点时旧的一次仍不重复落盘（既有约定保留，原用例 "ignores a stale png export that settles after a newer one" 仍通过）。
3. **`pngExportsInFlightRef`**：计数器在 `finally` 中无条件递减、归零才 `setExportingPng(false)`，被顶掉的一轮同样交还占用——旧版编辑器 PNG 按钮不再永久"导出中..."。计数器递增（187 行）与 `try` 之间只有不会抛的 React setter，无泄漏窗口。

交错场景逐一推演均正确：PNG→SVG 插队（PNG 落盘、状态归 SVG）、PNG→PNG 连点（只落盘后者、`exportingPng` 在两次都归位后才复位 2→1→0）、PNG 被顶掉后失败（不覆写后者状态、计数照还）、PNG→工程包（同 SVG）。

## ProjectMenu.tsx

「导出 SVG」补上了 `disabled={exportState === "exporting"}`（185 行），与「导出 PNG」（184 行）及 DeliveryWorkspace 三个导出入口（139–141 行，早已置灰）口径一致。prop 注释同步改为「置灰两个海报导出入口」。

## 全入口追查（确认无残留漏洞）

| 入口 | 置灰 | 评估 |
| --- | --- | --- |
| ProjectMenu 导出 PNG / SVG | 有 | 本次修复对象 |
| DeliveryWorkspace PNG / SVG / 工程包 | 有 | 既有 |
| LegacyEditorTopbar 导出 PNG | 有 | 既有；该栏无 SVG 按钮 |
| **LegacyEditorSidebar 导出 SVG**（273 行 CompactButton） | **无** | 仍可与在途 PNG 交错，但 hook 修复后交错**不再丢产物、不再卡按钮**，只剩状态归后者（守卫的既定语义）。降级为 NIT |
| ProjectMenu 导出工程 / ExportProjectDialog 确认导出 | 无 | 工程包导出是同步的，交错时 PNG 仍落盘，仅状态被接管。无害 |
| WorkflowGuide 三个导出按钮 | 无 | 组件只被自身测试引用，App 未渲染，非活动入口 |

关键点：防线从「靠 UI 置灰堵入口」变成「hook 自身保证产物与忙标志正确」，所以残留的未置灰入口不再构成 BLOCKER。

## 验证证据（failure → cause → fix → recheck 链，本轮无 failure）

- `npx vitest run src/lib/usePosterExport.test.tsx src/components/ProjectMenu.test.tsx src/lib/usePosterExport.naming.test.tsx src/components/workspaces/DeliveryWorkspace.test.tsx` → **4 文件 29 用例全过**。
- 新增用例 +3 核实：usePosterExport 11→13（"still writes the png when another kind of export starts mid-flight"、"releases the png busy flag even when a later export supersedes it"），ProjectMenu 3→4（"greys out both poster exports while one is in flight"）。测试装置 `startGatedPngExport` 的门控有效性经断言反证（若门控失效，下载顺序与 `exportingPng === true` 断言都会失败）。
- `npx eslint`（四个改动文件）→ 通过。
- `npx tsc -b --noEmit` → exit 0（注：Round 1 简报提到的 perf-canvas-bench 类型问题不在 tsc 构建图内，全量 typecheck 干净）。

## NITS（不阻塞，本轮不修）

1. **LegacyEditorSidebar 导出 SVG 未置灰**（`src/components/editor/LegacyEditorSidebar.tsx` 273 行）：交错已无害，但与其余入口口径不一致；顺手补一个 `disabled` 即可对齐。
2. **被顶掉的 PNG 若失败则静默**：`catch` 里 `!isCurrent()` 提前返回，用户点过 PNG 后若被 SVG 接管且 PNG 解码失败，得到的只有「SVG 已导出」，没有 PNG 也没有解释。这是代次守卫「状态归最后一次」的既定语义，且入口置灰后触发面很小；可接受。
3. **旧版按钮文案瞬时错位**：`exportingPng || exportState === "exporting"` 决定「导出中...」文案而 `disabled` 只看 `exportState`——SVG 接管成功后、在途 PNG 未归位的窗口里，会出现一个可点击但写着「导出中...」的按钮。纯外观、窗口极短。

## 与 Round 1 遗留项的关系

- 未接线的 DataImportConsent / print-bleed / use-studio-preferences：按指令**未动**，仍为 NIT。
- Legacy WorkflowStepper 仍显示「素材」：未动，仍为 NIT。
- Pages 404 属运维（未开 Pages），与本次无关。

**Verdict：ACCEPT。** 无剩余 BLOCKER。
