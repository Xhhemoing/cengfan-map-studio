# R17-fable-sota — 全局设置页 + HistoryControls 撤销/重做礼貌播报

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动内容

镜像 R15/R16 的顶栏模式（`data-topbar-history-announcement` / `announceHistory`），补齐剩余两处撤销/重做无读屏反馈的缺口：

1. **`src/components/HistoryControls.tsx`**（70 行）
   - 新增导出 `useHistoryAnnouncement()`：点击时用**点击前**的标签生成「已撤销：xx / 已重做：xx」；tick 在两次播报间切换一个隐形 NBSP 后缀，连续撤销两个同名步骤时 DOM 文本仍有变化（aria-live 不复读相同文本）。
   - `HistoryControls` 组件自身接入该 hook：按钮 onClick 先 `announce(label)` 再回调；组外渲染持久存在的 `sr-only` `role="status"` `aria-live="polite"` span，data 属性用 **`data-history-announcement`**（与顶栏/设置页均不同，三者同挂也不冲突）。
   - hook 与组件同文件触发 `react-refresh/only-export-components` 警告；路径隔离禁止新建 lib 文件，按仓库惯例加了单行 scoped eslint-disable 并注明理由。
2. **`src/components/GlobalSettingsScreen.tsx`**（376 行）
   - 复用 `useHistoryAnnouncement`，头部两个 IconButton onClick 改为先播报（点击前标签）再 `onUndo`/`onRedo`。
   - 播报 span 放在 `<header>` 内、`ActionGroup`（全局设置历史）**之外**：620px 以下的 CSS 只作用于组内 button（缩宽/藏 span），组外播报区不受影响。data 属性用 **`data-settings-history-announcement`**。
   - 未采用「整体替换为 HistoryControls 组件」方案：设置页头部是 `IconButton` + ThemeToggle + 完成按钮共处一个 `ActionGroup`，且 `.global-settings-history button` 有专属样式；换成 ToolbarGroup/ToolbarButton 会改 DOM 结构与视觉，超出本任务范围。改为共享 hook，两处行为一致、标记零回归。
3. **测试**
   - `src/components/GlobalSettingsScreen.test.tsx`：renderScreen 重构为可传 props 覆盖 + rerender（既有两个 tablist 用例不改语义、继续通过）。新增 2 个用例：① 区域先于点击存在/sr-only/status/polite/初始为空/在任何 `role="group"` 之外，点击撤销→播报、二次同名撤销 textContent 仍变化（NBSP 切换）、重做→播报、节点全程同一个；② 播报用点击前标签，父级 rerender 换标签后播报不变，再点击播报新标签。
   - `src/components/HistoryControls.test.tsx`（新增）：同上两用例 + 默认「撤销/重做」标签与禁用态。均为 createRoot + flushSync 惯例，无 testing-library。
4. **`USER_GUIDE.md`**：撤销/重做播报 bullet 追加一句「全局设置页头部的撤销/重做也会同样即时播报。」

## 验证（failure → cause → fix → recheck）

- `npx vitest run src/components/GlobalSettingsScreen.test.tsx src/components/HistoryControls.test.tsx` → **2 files / 7 tests 全绿**（首次即通过，无测试失败需记录）。
- **假绿 #1**：`npx tsc --noEmit` 389ms 退出 0 → cause：根 `tsconfig.json` 是 solution-style（`files: []` + references），什么都没查 → fix：改跑 `npx tsc -p tsconfig.app.json --noEmit` → recheck：10.6s 真实检查，0 错误。
- **lint 警告 #2**：eslint 报 `react-refresh/only-export-components`（hook 与组件同文件）→ cause：路径隔离下 hook 只能留在 HistoryControls.tsx → fix：加 scoped disable；首次写成两行注释导致 `next-line` 指向注释续行（报 unused directive）→ 再修为单行 directive → recheck：4 个触达文件 eslint 0 error 0 warning。
- 行数纪律：HistoryControls.tsx 70 行、GlobalSettingsScreen.tsx 376 行，均 ≤400。
- `git status`：本任务只触达允许路径（其余改动为同轮其他代理，路径不重叠）。未 commit（按指令）。

## 验收与回滚

- 验收：跑上述两个测试文件 + 读屏（NVDA/VoiceOver）在全局设置页点撤销/重做应听到「已撤销/已重做：具体步骤」，窄屏（≤620px）同样可听到。
- 回滚：纯前端 a11y 附加改动，无数据/导出格式/API 形状变化；`git checkout -- src/components/GlobalSettingsScreen.tsx src/components/GlobalSettingsScreen.test.tsx src/components/HistoryControls.tsx USER_GUIDE.md && rm src/components/HistoryControls.test.tsx` 即完全还原。
