MODEL: claude-opus-5-thinking-high-fast

# F2 · 导出成功结果条（未提交，未推送）

## 做了什么

`DeliveryRail` 在 `exportState === "success"` 时新增一条 `role="status"` 的结果条：显示「已导出 {文件名}」和「再次导出」按钮（`aria-label="再次导出"`，点击调用既有的 `onRetry`，即 `retryLastExport`）。文件名由 `usePosterExport` 新暴露的 `lastExportFileName` 提供。没有触碰印刷尺寸/mm/dpi、CanvasInspector、支付、ContentLayoutWorkspace。

## 改动文件

| 文件 | 改动 |
|------|------|
| `src/lib/usePosterExport.ts` | 新增 `lastExportFileName: string \| undefined` 状态并加入返回值；PNG/SVG 成功时写入 `buildExportFileName(...)` 得到的同一个文件名（就是真正 download 的名字）；工程包先 `createProjectPackage` 再按 `downloadProjectPackage` 的默认命名规则算出 `cengfan-project-<YYYY-MM-DD>.json` 并显式传入，落盘名与展示名保证一致；每次导出开始时连同 `exportError` 一起清空。 |
| `src/components/workspaces/DeliveryWorkspace.tsx` | `DeliveryWorkspaceProps` 增加可选 `lastExportFileName`（`DeliveryRailProps` 由 `Omit` 派生，自动获得）；成功态渲染 `.delivery-workspace__result` 结果条。 |
| `src/components/workspaces/DeliveryWorkspace.test.tsx` | 新增 2 个用例（先写测试）。 |
| `src/App.tsx` | 仅在 `DeliveryRail` 上多传一行 `lastExportFileName={posterExport.lastExportFileName}`。 |
| `src/components/workflow-workspaces.css` | `.delivery-workspace__result` 复用 `.delivery-workspace__check` 的卡片内边距，加绿色成功底色与按钮样式，长文件名 `overflow-wrap: anywhere`。 |

## 行为细节

- 文件名未知时（理论上只有外部直接把 `exportState` 置成 success 才会发生）退化为「已导出，请到浏览器下载目录查看」，结果条和按钮仍然存在，不会出现「已导出 undefined」。
- 成功条与失败条互斥：`success` 只出 `role="status"`，`error` 只出 `role="alert"`，`idle`/`exporting` 两者都不出。
- 导出设置区与三个导出按钮位置不变，结果条插在检查区和导出设置之间，与既有失败条同一位置。

## 验证链（failure → cause → fix → recheck）

1. **failure（先写测试拿红）**：把实现文件 stash 掉只留测试，`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx` → `2 failed | 3 passed`，报错 `expect(bar?.textContent).toContain("已导出")` 收到 `undefined`。
2. **cause**：`DeliveryRail` 在 `exportState === "success"` 时不渲染任何节点，`querySelector('[role="status"]')` 为 null；`usePosterExport` 也没有对外暴露导出文件名。
3. **fix**：上表四处最小改动（hook 记录文件名 → props 透传 → 成功态结果条 → App 传参）。
4. **recheck**：`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx` → **Test Files 1 passed，Tests 5 passed**。附带 `npx tsc -b` 通过（exit 0），`npx eslint` 四个改动文件通过（exit 0）。

新增用例：
- `shows the exported file name and a re-export button after a successful export`：断言 `[role="status"]` 含「已导出」与 `我的毕业去向图-2x.png`、无 `[role="alert"]`、点击「再次导出」触发一次 `onRetry`。
- `keeps the success bar readable when the file name is unknown and hides it otherwise`：无文件名时仍有结果条与按钮；`idle`/`exporting`/`error` 三态下无 `[role="status"]`。

## 验收方式

手动验收：进入六阶段的「导出」阶段 → 点 PNG（或 SVG／工程包）→ 右栏检查区下方出现绿色结果条「已导出 <项目名>-1x.png」，点「再次导出」按同类型重跑一次导出。自动验收：`npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx`。

## 回滚方案

非破坏性改动：导出格式、下载文件名、API 形状均未变化（工程包文件名显式传入的值等于原来的默认参数值，落盘名逐字节相同）。回滚只需还原上表 5 个文件；`lastExportFileName` 是可选 prop，即使只回滚 `App.tsx` 也不会报错，结果条会退化为「已导出，请到浏览器下载目录查看」。

## 状态

按要求**未 `git add` / `git commit` / `git push`**，改动留在工作区（同一工作区内还有其他 agent 的 D2/H2/B2/P2 改动，我只动了上表 5 个文件）。
