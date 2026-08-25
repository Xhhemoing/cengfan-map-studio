MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 1 — R1-fable-arch：App.tsx God 组件拆分

## 目标与结果

把 2466 行的 `src/App.tsx` 拆成「组合器 + 两个 hook + 一个纯函数库」，用户可见行为不变。
实际削减 **583 行**（目标 ≥250），全部 133 个相关测试通过，tsc 与 eslint 全绿。

## 文件清单

| 文件 | 动作 | 行数 |
| --- | --- | --- |
| `src/App.tsx` | 修改（重写组合层） | 2466 → 1883（−583） |
| `src/hooks/use-workspace-persistence.ts` | 新建 | 270 |
| `src/hooks/use-studio-chrome.ts` | 新建 | 101 |
| `src/lib/studio-editor-helpers.ts` | 新建 | 303 |

未改动任何 FORBIDDEN 文件（server/、card-layout、DataWorkspace、styles.css、其他组件）。
`src/App.test.tsx` 无需改动（App 公共 API 未变）。

## 提取内容（inventory → 落地）

### 1. `use-workspace-persistence.ts`（持久化/水合 hook）
从 App 原样迁移（逐行等价）：
- 工作区文档状态全套：`project` / `previewCommands` / `userAssets` / `userFonts` / `customTemplates` / `renderSettings` / `syncState` / `statusMessage` / `projectLoading` / `projectMissing`，含各自的懒初始化（浏览器镜像优先）。
- `LocalWorkspaceOverwrite` 保存管线（localStorage 草稿 + 完整镜像 + IndexedDB 项目记录），含原有的 `eslint-disable react-hooks/refs` 豁免与中文注释。
- 三个水合 effect：latest-ref 同步 + markPending、浏览器完整工作区异步恢复、projectId 模式的项目记录加载（含渲染期 prevProjectId 重置模式）。
- `saveWorkspaceNow` / `overwriteBrowserStorage` / `handleBackToWorkbench` / visibilitychange+pagehide 兜底保存。
- 返回 `latestWorkspaceRef` 与 `workspaceSync` 供 App 内协作同步与提交边界继续使用。

### 2. `use-studio-chrome.ts`（主题/皮肤/面板布局 hook）
- `themeMode` / `skin` / `prefersDark` / `panelLayout` / `resizingPanel` 状态与持久化 effect（saveThemeMode、saveStudioSkin、`<html>` dataset 同步、面板宽度写入、window resize 归一化）。
- 派生值：`resolvedTheme`、`sidebarBounds`、`inspectorBounds`、`workspaceStyle`、`updatePanelWidth`。

### 3. `studio-editor-helpers.ts`（纯函数，全部可单测）
- `snapCanvasPoint`（maybeSnap 的纯核心）、`freezeCardPositions`、`buildCollaborationPackage`（协作包去历史封装，覆盖 currentCollaborationPackage 与增量 diff 两个调用点）。
- `buildResolvedTemplate`、`buildAssetUsageMap`、`listContentLayoutIssues`、`resolveStyleLayerSelection`、`resolveLayoutIssueSelection`。
- 事务工厂：`createApplySystemTemplateTransaction`、`buildCustomTemplateDraft`、`createDataViewTransaction`、`createAppendStudentsTransaction`、`createReplaceStudentsTransaction`、`createStudentUpdateTransaction`（含 province/locationScope 清除逻辑）、`createStudentVisibilityToggleTransaction`、`createStudentDeleteTransaction`、`createStudentsVisibilityTransaction`。

### 4. App 内重复内联 handler 去重（行为逐字相同，只定义一次）
`uploadUserFont`（4 处）、`applyBackgroundAsset`（2 处）、`applyProvinceThemes`（2 处）、`moveProvinceTexture` / `resizeMapImage`（各 3 处）、`moveTextElement` / `moveAssetElement` / `resizeAssetElement` / `moveCardPosition` / `moveGuestsPanel`（ContentLayoutWorkspace 与 PosterCanvas 各 1 处）、AssetPanel 的 `onCreateDecoration` 复用 `handleCreateDecoration`。
注意：AssetPanel 的 `onApplyProvinceAppearance` / `onResetProvinceAppearance` 与 map 阶段版本**不**相同（多 try/catch 与 setActivePanel），保持独立未合并。

## 行为等价性说明

- Hook effect 相对顺序变化仅限互不交互的 effect（持久化 effect 现在先于会话保存/主题 effect 注册）；有依赖关系的顺序（latestWorkspaceRef 同步 → 协作 debounce 发送）保持不变。
- 所有 setState 均为 React 稳定引用，effect deps 数组与原文件一致；协作 debounce effect 保留原 `eslint-disable react-hooks/exhaustive-deps` 及注释。
- 用户可见字符串零改动；键盘快捷键 effect 保持无 deps 数组的原语义。

## 验证（failure → cause → fix → recheck）

全程一次通过，无失败需要修复：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit -p tsconfig.app.json` | 0 错误 |
| Lint | `npx eslint src/App.tsx src/hooks/... src/lib/studio-editor-helpers.ts` | 0 问题 |
| 必跑测试 | `npx vitest run src/App.test.tsx src/App.debug.test.tsx src/components/AppProjectMode.test.tsx` | 3 文件 / **127 通过** |
| 可选测试 | `npx vitest run src/components/StudioEditorShell.test.tsx` | **6 通过** |

覆盖点包括：项目模式加载/缺失/返回自动保存/pagehide 兜底（persistence hook 路径）、主题/皮肤切换与面板宽度恢复（chrome hook 路径）、学生编辑/导入/模板应用/省份贴图/协作房间（helper 事务路径）。

## Round 2 遗留风险与建议

1. **App.tsx 仍有 1883 行**（AGENTS.md 目标 <400）。最大剩余块是 `buildStageSlots`（约 250 行 JSX）与 legacy 经典界面 JSX（约 530 行）。JSX 抽取需要新建 `src/components/studio-editor/`（本轮按规则未创建）；建议 Round 2 把 stage slots 拆成组件并给它们收敛 props 面。
2. `previewCommands` 在整个代码库中只被写入 `[]`（AI 预览走 `agentPreview`），疑似死状态；确认后可删除 `previewEditorCommands` 分支——本轮为保行为未动。
3. `mapStyleAssetPanelProps` 仍是约 40 行的大 props 对象，每次渲染重建；如后续有性能诉求可 memo 化（当前与原实现一致，无回归）。
4. 协作 debounce effect（约 50 行）可再抽成 `use-collaboration-sync` hook；本轮因它横跨 `collaboration` 控制器对象与手工 deps 豁免，保守保留在 App。
5. 新 helper 尚无独立单测（行为由 App 级 DOM 测试覆盖）；Round 2 可给 `studio-editor-helpers.ts` 补纯函数测试以固化契约。

## 交付纪律

- 验收方式：上表四项本地检查 + 既有 DOM 级行为测试（无新增用户可见行为，无导出格式/API 形状变更，无需回滚方案）。
- 按任务要求**未执行 git commit**。工作区内其他并行 agent 的改动（server/、components/ 等）未被触碰。
