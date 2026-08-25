MODEL: gpt-5.6-sol-xhigh-fast

# R3-G1 · F-slim 实施记录

## 结果

- 新增 `src/lib/export-filename.ts`：项目名去除控制字符与 `\ / : * ? " < > |`，折叠空白，处理空名、保留名与超长 Unicode 名；空名回退为 `我的毕业去向图`。
- SVG 下载名为 `{项目名}.svg`；PNG 下载名为 `{项目名}-{倍率}x.png`，包括 `1x`。
- `usePosterExport` 新增可选 getter `getProjectName?: () => string | null`，在每次点击导出时读取最新项目名。
- `App.tsx` 仅在 `usePosterExport({ ... })` 对象中传入 `getProjectName: () => projectNameRef.current`。
- 工程包下载命名和 `.json/.cengfan` 导入行为未改；未实现成功结果条或印刷尺寸。

## failure → cause → fix → recheck

1. **Failure**：先运行 `npx vitest run src/lib/export-filename.test.ts`，失败为 `Failed to resolve import "./export-filename"`，0 tests。
   **Cause**：按测试优先流程，文件名模块尚不存在。
   **Fix**：新增纯函数模块及 16 条用例覆盖倍率、SVG、空名、非法路径字符、控制字符、Windows 保留名、Unicode 截断和工程包扩展名。
   **Recheck**：同一命令通过，`1 passed / 16 tests passed`；完成 hook/App 接线后再次运行也通过。

2. **Failure**：`npx eslint src/lib/export-filename.ts src/lib/export-filename.test.ts src/lib/usePosterExport.ts src/App.tsx` 报 `no-control-regex`。
   **Cause**：控制字符清理使用了正则字符范围，触发仓库 ESLint 规则。
   **Fix**：改为按 Unicode 码点过滤 C0/DEL 控制字符，保留相同清理行为。
   **Recheck**：重跑同一 ESLint 命令通过；随后重跑文件名测试仍为 `16 passed`。

3. **Regression recheck**：`npx vitest run src/App.test.tsx` 通过，`114 passed`；`git diff --check` 通过。

## 验收

在编辑器中将项目名设为 `高三3班`，分别导出 PNG 1x、PNG 2x 和 SVG，下载文件应依次为 `高三3班-1x.png`、`高三3班-2x.png`、`高三3班.svg`。空白项目名应回退为 `我的毕业去向图-*`。

按要求未 commit、未 push。
