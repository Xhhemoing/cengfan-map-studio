MODEL: claude-opus-5-thinking-high-fast

# F2 Round 2 · 导出成功条打磨（未提交，未推送）

## 结论先说

Round 1 落地的四条不变量**本来就已经成立**，Round 2 没有发现需要返工的行为缺陷。这一轮做的是：把四条不变量用测试锁死（其中两条此前没有断言），外加一处极小的可访问性补充（导出按钮组 `aria-busy`）。没有碰印刷尺寸/mm/dpi，没有碰 `usePosterExport` 的导出管线与文件名规则，没有碰支付与其他 agent 的文件。

## 四条要求的核对结果

| 要求 | 现状 | 证据 |
|------|------|------|
| 成功条使用 `lastExportFileName` | 已成立 | `DeliveryWorkspace.tsx:113` 渲染 `已导出 {lastExportFileName}`；`App.tsx:1781` 把 `posterExport.lastExportFileName` 传给 `DeliveryRail`；hook 在 PNG/SVG/工程包三条成功路径上写入的就是真正 download 的那个名字（`usePosterExport.ts:88 / 122 / 172`） |
| 「再次导出」调用 `onRetry` | 已成立 | 成功条内 `aria-label="再次导出"` 的按钮 `onClick={onRetry}`，App 侧接的是 `retryLastExport`，按 `lastExportRef` 重跑同类型导出 |
| exporting 态禁用按钮 | 已成立（本轮补 `aria-busy`） | PNG/SVG/工程包三个按钮都是 `disabled={exportState === "exporting"}`；本轮给 `role="group"` 的按钮组加 `aria-busy={exportState === "exporting"}`，让「正在导出」对读屏可感知，而不只是视觉上的灰 |
| 错误态不出现文件名 | 已成立（双保险） | 组件侧：`error` 只渲染 `.delivery-workspace__error`，其模板里根本没有文件名槽位；hook 侧：每次导出开始时 `setLastExportFileName(undefined)`，失败路径不再写回，所以 prop 本身也是空的 |

## 改动文件（2 个）

| 文件 | 改动 |
|------|------|
| `src/components/workspaces/DeliveryWorkspace.tsx` | 1 行：导出按钮组加 `aria-busy={exportState === "exporting"}` |
| `src/components/workspaces/DeliveryWorkspace.test.tsx` | 新增 2 个用例，强化 1 个既有用例 |

`src/lib/usePosterExport.ts`、`src/lib/export-filename.ts`、`src/App.tsx`、CSS **均未改动**。

## 测试改动

新增：

- `disables the export actions while an export is running`：`exporting` 态下按钮组 `aria-busy="true"` 且 3 个按钮全部 `disabled`；`idle` 态下 `aria-busy="false"` 且 0 个 `disabled`。
- `never shows a file name in the error bar`：**故意**把 `lastExportFileName` 和 `exportState: "error"` 一起传进去（模拟上游没清干净的最坏情况），断言无 `[role="status"]`、`[role="alert"]` 文本不含文件名、整个容器文本都不含文件名。这条把「不出现文件名」从"依赖 hook 清状态"升级成"组件结构上就不可能出现"。

强化：

- `shows the exported file name and a re-export button after a successful export`：改为断言 `[role="status"]` 就是 `.delivery-workspace__result`、文本连读为 `已导出 我的毕业去向图-2x.png`（原来是分两次 `toContain`，"已导出"和文件名分离时也会通过）、「再次导出」按钮位于结果条内部且未被禁用。

## 验证链（failure → cause → fix → recheck）

1. **failure**：新写的 `disables the export actions while an export is running` 在只有测试、没有 `aria-busy` 时红：`expected null to be 'true'`（`DeliveryWorkspace.test.tsx:108`）。
2. **cause**：按钮组只有视觉/交互层面的 `disabled`，容器上没有任何表示"忙"的语义属性，`getAttribute("aria-busy")` 返回 `null`。
3. **fix**：`DeliveryWorkspace.tsx:121` 加 `aria-busy={exportState === "exporting"}`（React 对 `aria-*` 的 `false` 会显式渲染成 `"false"`，所以 idle 分支的断言也有意义）。
4. **recheck**：`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx src/lib/export-filename.test.ts` → **Test Files 2 passed，Tests 23 passed**（改动前基线 21 passed）。

额外做了两次变异校验，确认新断言不是恒真：

- 摘掉 `aria-busy` → 新用例红在 `:108`（`expected null to be 'true'`）。
- 保留 `aria-busy`、只摘掉 PNG 按钮的 `disabled` → 新用例红在 `:111`（`expected 2 to be 3`）。
- 两次变异后都已还原，最终 `git diff` 中组件文件只有 `aria-busy` 那一行。

类型检查：`npx tsc --noEmit -p tsconfig.app.json` exit 0，无输出。

## 明确不做的事（留给后续，不属于本轮）

- **工程包文件名仍是 `cengfan-project-<YYYY-MM-DD>.json`**。`buildExportFileName` 已经支持 `kind: "project"`（会产出 `<项目名>-工程包-<日期>.json`，`export-filename.test.ts:22` 有覆盖），但 `usePosterExport.ts:119` 仍用旧命名。改它属于**面向用户的下载文件名变更**，`round2/opus-2-editor-spec.md` §427 已把它单列为 F-P2 并配了独立回滚说明，不应混在"成功条打磨"里顺手做。当前状态下展示名与落盘名仍然逐字节一致，没有欺骗用户。
- **顶栏「导出 PNG」按钮只看 `exportingPng`**（`App.tsx:2021 / 2286`），SVG 或工程包导出进行中时它不会置灰。这是 `App.tsx` 的问题、不在右栏，且要动的是共享状态口径，本轮按"只做小修"跳过，记在这里备查。

## 验收方式

- 自动：`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx src/lib/export-filename.test.ts`（23 passed）。
- 手动：导出阶段点 PNG → 导出过程中三个按钮同时置灰、按钮组 `aria-busy="true"` → 成功后右栏出现绿色「已导出 <项目名>-2x.png」，点「再次导出」按同类型重跑；断网/取消下载权限造出失败态时，红条只显示失败原因，不含任何文件名。

## 回滚方案

零风险、非破坏性：导出格式、下载文件名、hook 返回值形状、props 形状全部未变。回滚 = 删掉 `DeliveryWorkspace.tsx` 里那一个 `aria-busy` 属性并还原测试文件；`aria-busy` 是纯附加的展示层属性，不影响任何行为分支，也不影响其他组件。

## 状态

按要求**未 `git add` / `git commit` / `git push`**。工作区内还有其他 agent 的改动（如 `ContentLayoutWorkspace.test.tsx`），我只动了上表 2 个文件。
