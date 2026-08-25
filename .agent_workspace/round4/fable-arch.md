# Round 4 — R4-fable-arch：App.tsx 瘦身为组合根

## 结果

- **App.tsx：798 行 → 331 行**（目标 ≤450，理想 ≤400，均达成）。StudioApp 本体约 280 行，只做 hook 接线与四个页面分支（加载壳 / 全局设置 / 聚焦阶段 / 旧版编辑器）的组合，无业务逻辑。
- 无行为变更：所有 JSX、用户可见文案、aria-label、类名、事务 id/label 原样搬移；skip-link 与 StageSlotsContext 契约保留。
- 新文件全部 ≤400 行（最大 194 行）；仓内其余文件也无超限（LegacyEditorChrome 384、stage-slots 299）。

## 提取清单

### 新 hooks（src/hooks/）

| 文件 | 行数 | 承接的原 App 内容 |
| --- | --- | --- |
| `use-project-commits.ts` | 91 | agentPreview 状态、commitProject / commitProjectTransaction（协作只读门槛）、describeProjectHistory、撤销/重做 + 快捷键 |
| `use-studio-navigation.ts` | 166 | activePanel / activeStage / activeWorkflowStep / globalSettingsSection / legacyEditorEnabled 状态；openGlobalData、handleWorkflowStageChange、open* 五个入口；locateLayoutIssue / locateDeliveryIssue / handleStageOverviewAction |
| `use-project-actions.ts` | 145 | 应用内置/自定义模板、保存模板、新建/恢复项目、添加装饰、应用背景 |
| `use-project-health.ts` | 81 | workflowProgress、dataHealth、dataIssues、资源/字体健康、排版问题与 stageOverview 的全部 memo |

### 新组件与组装函数（src/components/studio-editor/）

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `StudioStatusScreens.tsx` | 43 | StudioBrand（品牌标记去重，三处共用）、ProjectLoadingScreen、ProjectMissingScreen |
| `StudioTopbarActions.tsx` | 142 | ProjectMenuGroup（导出与工程菜单，聚焦阶段与旧版共用同一节点）、AssistantEntryButton、HistoryActionsGroup、ProjectActionsGroup |
| `GlobalSettingsRoute.tsx` | 117 | 全局设置整页（顶栏 + GlobalSettingsScreen 全量接线），复用 StageSlotsContext |
| `workspace-props.ts` | 194 | buildDataWorkspaceProps / buildAssetPanelProps / buildStageSlotsContext 纯组装函数 |

### 存量文件微调

- `stage-slots.tsx`：新增 `StudioDataWorkspaceProps`（把 selectedStudentId / onSelectStudent / onChangeDataView 收紧为必填，全局设置页依赖），`dataWorkspaceProps` 字段改用该类型。
- `LegacyEditorChrome.tsx`：品牌块改用 `StudioBrand`（DOM 输出不变），删除随之未用的 `MapPinned` 导入。

## 设计说明

- hook 调用顺序按依赖排布：persistence → collaboration → commits → posterExport → navigation → health → scene/resources/actions；`useWorkspaceSessionAutosave` 随 activeStage 移到 navigation 之后（effect 相对顺序变化不影响语义）。
- `buildStageSlotsContext` 返回 `Omit<StageSlotsContext, "posterRef">`，posterRef 由 App 在对象字面量上补齐——见下方 lint 证据链。
- 保留了原 App 中两处从未读取的 vestigial 引用（`lastNonTemplateStageRef`、`assistantEntryRef`），确保零行为漂移；后续轮次可评估删除。

## 验证（failure → cause → fix → recheck）

1. `npx tsc --noEmit -p tsconfig.app.json` — **通过**（首轮即绿）。
2. `npx vitest run src/App.test.tsx src/App.debug.test.tsx src/components/AppProjectMode.test.tsx src/lib/studio-editor-helpers.test.ts` — **4 文件 152 测试全过**（首轮即绿）。
3. ESLint（改动文件集）：
   - **failure**：`react-hooks/refs` 报错——`buildStageSlotsContext({ ..., posterRef })` 渲染期把 ref 传入普通函数。
   - **cause**：原 App 用对象字面量内联 posterRef（规则允许）；改为函数调用后触发"Passing a ref to a function may read its value during render"。
   - **fix**：builder 不再接收 posterRef，返回 `Omit<StageSlotsContext, "posterRef">`；App 以 `{ posterRef, ...buildStageSlotsContext(...) }` 字面量补齐（与 StudioStageScreen 既有注释一致的处理思路）。
   - **recheck**：eslint 全绿，tsc 复跑通过，四个测试文件复跑 152 全过。
4. 全量 `npm test`（经 scripts/run-heavy.mjs）— **177 文件 / 1542 测试全过**（含同轮其他 agent 的并行改动，共存无冲突）。

## 验收方式与回滚

- 验收：上述 tsc + 定向 vitest + 全量 vitest 已在本工作区通过；无数据格式、导出格式或 API 形状变更，纯前端组合层重构，人工验收可对照四个页面分支（加载壳 / 项目缺失 / 全局设置 / 聚焦阶段 / 旧版编辑器）逐一走查。
- 回滚：本轮为纯提取重构（未提交），`git checkout -- src/App.tsx src/components/studio-editor/LegacyEditorChrome.tsx src/components/studio-editor/stage-slots.tsx` 并删除 4 个新 hook 与 4 个新组件文件即可完全还原。

## 未提交

按任务要求未执行 git commit。
