MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 2 — R2-fable-arch 报告

## 结果总览

- **App.tsx：1883 → 1136 行（−747，目标 ≤1600 达成）**，App 仅保留状态编排与组合职责。
- 阶段 JSX、旧版编辑器、跳转链接全部落入 `src/components/studio-editor/`，所有新文件均 ≤400 行。
- 跳转链接（skip-link）已接线到两条渲染路径，键盘可用，带 2 个 chrome 回归测试。
- `studio-editor-helpers.ts` 新增 6 个单元测试（locationScope 清除、freezeCardPositions、buildCollaborationPackage）。
- 死代码 `previewCommands` 从 App 与 `use-workspace-persistence` 中移除（Round 1 判断确认：只被置为 `[]`，消费分支永不执行）。

## 新增/修改文件

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/App.tsx` | 1136 | 纯组合器：构造一次 `StageSlotsContext`，分派到 `StudioStageScreen` 或 `LegacyEditorChrome` |
| `src/components/studio-editor/stage-slots.tsx` | 286 | `StageSlotsContext` 契约 + `buildStageSlots` 阶段分派（原 App 内联 JSX，行为不变） |
| `src/components/studio-editor/StudioStageScreen.tsx` | 39 | 聚焦阶段页面：SkipToStageLink + StudioLayoutTemplate + 槽位；组件边界见下文 lint 修复 |
| `src/components/studio-editor/LegacyEditorChrome.tsx` | 388 | 旧版经典编辑器整体外壳（顶栏/工作区/检查器） |
| `src/components/studio-editor/LegacySidebarPanels.tsx` | 312 | 旧版六个侧栏面板 |
| `src/components/studio-editor/LegacyProjectExportDialog.tsx` | 47 | 旧版导出确认对话框（从 LegacyEditorChrome 再拆，使其 <400 行） |
| `src/components/studio-editor/SkipToStageLink.tsx` | 19 | 视觉隐藏跳转链接；拦截默认锚点行为避免 hash 路由被改写 |
| `src/components/studio-editor/stage-target.ts` | 5 | `STUDIO_STAGE_TARGET_ID` 常量（独立模块满足 react-refresh 仅导出组件约束） |
| `src/hooks/use-workspace-persistence.ts` | 264 | 删除 `previewCommands` 状态 |
| `src/hooks/use-studio-chrome.ts` | 104 | 导出 `StudioChrome` 类型（LegacyEditorChrome 的 props 依赖） |
| `src/lib/studio-editor-helpers.test.ts` | 136 | 新建单元测试 |
| `src/App.test.tsx` | — | 「Shell CSS contract」块新增 2 个 skip-link 接线测试 |

## 关键设计决策

1. **`StageSlotsContext` 单对象上下文**：App 构造一次（文档状态 + 派生检查 memo + 全部命令回调），`buildStageSlots` 与 `LegacyEditorChrome` 共用，避免两套 30+ props 的漂移。
2. **skip-link 与 hash 路由**：应用用 `#/project/<id>` hash 路由，原生片段跳转会改写 `location.hash` 触发路由切换。`SkipToStageLink` 拦截默认行为、改为 `focus()` 到 `id="studio-stage"`。落点在 studio 路径是 `display: contents` 包裹 div（不产生布局盒，已核对无子代组合器选择器受影响），在旧版路径直接挂在 `.editor-area` section 上。
3. **`StudioStageScreen` 组件边界**：`buildStageSlots` 在子组件渲染期执行，App 仅以 JSX prop 传递含 `posterRef` 的上下文（详见 lint 修复链）。

## 验证证据链（failure → cause → fix → recheck）

### 链 1：tsc TS2322（App.tsx dataWorkspaceProps）
- **failure**：`tsc --noEmit` 报 3 处 TS2322（`string | null | undefined` 不可赋给 `string | null` 等）。
- **cause**：`dataWorkspaceProps` 显式标注为 `ComponentProps<typeof DataWorkspace>`，把可选字段拓宽为 `undefined`，下游 `GlobalSettingsScreen` 需要必填形态。
- **fix**：移除显式标注，让对象字面量结构推断保留必填性。
- **recheck**：`npx tsc --noEmit -p tsconfig.app.json` 通过。

### 链 2：ESLint react-hooks/refs（App.tsx:1085）+ react-refresh 警告
- **failure**：`buildStageSlots(activeStage, editorContext)` 报 "Cannot access refs during render"（editorContext 含 `posterRef`，渲染期传入普通函数被编译器判为可能读 `.current`）；`SkipToStageLink.tsx` 同文件导出常量触发 react-refresh 警告。
- **cause**：编译器无法跨模块证明 `buildStageSlots` 只转发 ref 不读取；JSX prop 传递才是规则允许的形态。常量与组件同文件破坏 fast refresh。
- **fix**：新建 `StudioStageScreen` 组件承接模板组合，App 改为 `<StudioStageScreen ctx={editorContext} … />`（ref 仅经 JSX 边界传递）；`STUDIO_STAGE_TARGET_ID` 移入 `stage-target.ts`。
- **recheck**：ESLint 全部触达文件 0 error 0 warning；tsc 通过；vitest 142 通过。

## 最终验证命令与结果

```
npx eslint src/App.tsx src/App.test.tsx src/hooks/... src/lib/studio-editor-helpers*.ts src/components/studio-editor/
→ 通过（0 问题）

npx tsc --noEmit -p tsconfig.app.json
→ 通过

npx vitest run src/App.test.tsx src/App.debug.test.tsx \
  src/components/AppProjectMode.test.tsx src/components/StudioEditorShell.test.tsx \
  src/lib/studio-editor-helpers.test.ts
→ Test Files 5 passed (5) / Tests 142 passed (142)
```

## 遗留事项（下轮候选）

- `mapStyleAssetPanelProps` 仍每次渲染重建（本轮未动，避免与行为无关的 memo 化风险混入结构重构）。
- `LegacySidebarPanels`（312 行）可再按面板拆分，但当前低于 400 行阈值，未强拆。
- 未提交（遵循 Do not commit 指令）。
