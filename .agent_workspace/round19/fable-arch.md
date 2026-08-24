MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 19 — react-refresh/only-export-components 清零报告 (R19-fable-arch)

## 结果

`npx eslint .` 从 5 条 `react-refresh/only-export-components` 警告降到 **0 errors, 0 warnings**（全仓输出为空）。未使用任何 eslint-disable。

## 改动明细

### 1. `src/components/StudioMuiProvider.tsx`（1 条警告）

- 新建 `src/components/studio-theme.ts`（45 行，kebab-case 兄弟模块），承载 `studioTheme = createTheme({...})` 及其设计令牌注释。
- `StudioMuiProvider.tsx` 缩为 13 行，只导出组件，`studioTheme` 改为从 `./studio-theme` 导入。
- 仓内没有其他 `studioTheme` 导入方（grep 确认），无需改别处。

### 2. `src/components/global-data/GlobalDataNavigation.tsx`（1 条警告）

- 新建 `src/components/global-data/global-data-views.ts`（19 行），承载导航数据（原模块级 `navigation` 数组，导出为 `globalDataNavigation`）与 `globalDataViewLabel()`。图标引用（`icon: typeof Database`）无 JSX，放 `.ts` 无问题。
- `GlobalDataNavigation.tsx` 只导出组件，导航数据改为导入。
- 更新唯一调用方 `src/components/GlobalDataScreen.tsx`：`globalDataViewLabel` 改从 `./global-data/global-data-views` 导入。

### 3. `src/lib/app-initialization.tsx`（3 条警告）

- `git mv src/lib/app-initialization.tsx src/lib/app-initialization.ts`（保留历史）；删除 `WorkbenchBackButton` 与 `ArrowLeft` 导入，现为 60 行纯 `.ts`，只含 `createInitialProject` / `loadInitialProject` / `loadBrowserValue`，无 JSX。
- 新建 `src/components/studio-editor/WorkbenchBackButton.tsx`（10 行，PascalCase 组件文件，放在全部三个使用方所在目录）。
- 导入更新：
  - `WorkbenchBackButton` 三个使用方（`LegacyEditorChrome.tsx`、`StudioTopbarActions.tsx`、`GlobalSettingsRoute.tsx`）改为 `from "./WorkbenchBackButton"`。
  - hooks（`use-studio-navigation` / `use-project-actions` / `use-workspace-session` / `use-workspace-persistence`）与 `app-initialization.test.ts` 的导入路径不带扩展名，`.tsx → .ts` 后无需改动。

所有实现文件均 ≤ 60 行，远低于 400 行上限。

## 验证证据链（failure → cause → fix → recheck）

1. **复现（failure）**：改动前 `npx eslint .` 输出 5 条 warning，逐条定位到上述 3 个文件（10:14、12:17、7:17/41:17/55:17）。
2. **根因（cause）**：三个文件同时导出组件与非组件（theme 常量 / 数据+纯函数 / 初始化纯函数混入 JSX 组件），触发 fast-refresh 边界规则。
3. **修复（fix）**：按"组件文件只导出组件"拆分为兄弟模块，如上。
4. **复检（recheck）**：
   - `npx eslint <全部 10 个触达文件> --max-warnings 0` → exit 0（LINT_OK）。
   - 全量 `npx eslint .` → 空输出，0 problems。
   - `npx vitest run` 覆盖 `app-initialization.test.ts`、`StudioMuiProvider.test.tsx`、`GlobalDataScreen.test.tsx`、`LegacyEditorChrome.test.tsx`、`StudioTopbarActions.test.tsx`、`GlobalSettingsScreen.test.tsx` → 6 files / 18 tests 全过；另跑 `StudioAssistantDrawer.integration.test.tsx`（挂载 StudioMuiProvider）→ 2 tests 过。
   - `npx tsc --noEmit -p tsconfig.app.json` → exit 0（注意：根 `tsconfig.json` 是 solution-style `files: []`，直接 `tsc --noEmit` 是空跑，必须指定 `-p tsconfig.app.json`）。

## 触达文件清单

新建：`src/components/studio-theme.ts`、`src/components/global-data/global-data-views.ts`、`src/components/studio-editor/WorkbenchBackButton.tsx`
修改：`src/components/StudioMuiProvider.tsx`、`src/components/global-data/GlobalDataNavigation.tsx`、`src/components/GlobalDataScreen.tsx`、`src/components/studio-editor/{LegacyEditorChrome,StudioTopbarActions,GlobalSettingsRoute}.tsx`
重命名：`src/lib/app-initialization.tsx` → `src/lib/app-initialization.ts`（经 `git mv`，rename 已在 index 中登记为 RM；未 commit/stash/push）

## 备注

- 工作区里存在与本任务无关的既有改动（`server/security.test.ts`、`server/static-files.ts`、`src/lib/card-layout-pack.*`、`src/lib/import-data.*`、`LegacyEditorChrome.test.tsx`、未跟踪的 `StudioTopbarActions.test.tsx`），应属其他 round 的并行工作，本任务未触碰。
- 行为零变化：纯文件拆分与导入路径调整，无逻辑改动；回滚方式为还原上述文件并把 `.ts` 移回 `.tsx`。
