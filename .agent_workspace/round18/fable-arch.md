MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 18 — 抽离 useHistoryAnnouncement，移除 eslint-disable

## 改动

1. **新增 `src/components/use-history-announcement.ts`**（23 行，kebab-case，经 `git ls-files --others` 确认为新文件、无大小写冲突）
   - 原样搬移 `useHistoryAnnouncement` hook 与其 WCAG 4.1.3 文档注释；播报语义逐字节保持：点击前标签、`已${label}`、tick 奇偶切换隐形 NBSP（`\u00A0`）后缀。
   - 仅末行注释从「与 HistoryControls 同文件」改为「独立成文件供 HistoryControls 与 GlobalSettingsScreen 复用」。
2. **`src/components/HistoryControls.tsx`**（70 → 47 行）
   - 删除 hook 定义与 `eslint-disable-next-line react-refresh/only-export-components`，改为从 `./use-history-announcement` 导入。文件现在只导出组件 + props 类型，规则天然满足。
   - 组件渲染逻辑（ToolbarGroup、组外 sr-only polite live region、`data-history-announcement`）零改动。
3. **`src/components/GlobalSettingsScreen.tsx`**（仅 import 行）
   - `import { useHistoryAnnouncement } from "./HistoryControls"` → `from "./use-history-announcement"`。

测试无需改动：`HistoryControls.test.tsx` 与 `GlobalSettingsScreen.test.tsx` 均通过组件行为断言播报语义（点击前标签、NBSP 去除后等于 `已撤销：…`、连续同名步骤 DOM 文本仍变化），继续原样覆盖抽离后的 hook。

## 验证（failure → cause → fix → recheck）

无失败，一次通过：

- `npx vitest run src/components/HistoryControls.test.tsx src/components/GlobalSettingsScreen.test.tsx` → 2 files / 7 tests passed。
- `npx eslint src/components/HistoryControls.tsx src/components/GlobalSettingsScreen.tsx src/components/use-history-announcement.ts src/components/HistoryControls.test.tsx --max-warnings=0` → 0 error 0 warning（`react-refresh/only-export-components` 为 warn 级，`--max-warnings=0` 证明去掉 disable 后规则真正满足而非被忽略）。
- 全仓 grep：`useHistoryAnnouncement` 仅剩新文件定义 + 两处新路径导入，无残留旧路径引用。

## 边界遵守

- 未触碰 `card-layout-pack.ts`；未 commit/stash/branch/push；未用 Playwright。
- 实现文件行数：新 hook 23 行、HistoryControls 47 行，均 ≤400。
