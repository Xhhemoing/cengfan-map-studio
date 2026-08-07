# 顶部流程与左侧助手栏实现进度

## 2026-08-06 顶部工作流与左侧助手壳层

将六阶段制作流程固定在可见顶栏，左栏改为稳定的「AI 助手 / 高级功能」双页签工作区，右侧对象属性栏保持不变。`ProjectDocument` 仍是唯一持久化画布状态，`AgentSession` 继续负责 AI 传输、影子预览与选中步骤应用；`AgentAssistant` 新增仅展示层的 docked 呈现，不重复任何状态。

## 交付内容

- `AgentAssistant` 支持 `presentation?: "floating" | "docked"`，默认 floating；docked 在左栏内联渲染现有对话、选中步骤提案、风险标签与显式「确认应用」，无启动器/拖拽头部/固定定位对话框。
- 新增 `StudioAssistantRail`：`role="tablist"` 双页签（AI 助手 / 高级功能），AI 面板组合 docked 助手，高级面板仅含「工程状态 / 协作与邀请 / 数据诊断 / 渲染性能 / 开发者配置」操作摘要与显式回调；AI 面板内不再出现第二个高级入口。
- `App.tsx` 共享壳层：所有公开阶段与兼容编辑器共用同一个左栏 rail；`WorkflowStageStepper` 在 Atelier 顶栏保持可见（移除 `topbarWorkflowHidden` 与 aria-hidden 隐藏行为）；`ProjectMenu` 作为项目文件/导出动作保留在顶栏「导出与工程」分组，协作区仍是动作面而非导航路由；右侧 `InspectorPanel` 与窄屏 `inspector-toggle-group` 保持不变。
- `styles.css`：新增 `.studio-assistant-rail` 及其页签/面板/状态列表、docked 助手样式；移除 Atelier 顶栏工作流隐藏规则；窄屏顶栏工作流横向滚动，rail 保持紧凑面板。

## 验证证据

目标测试（`src/components/AgentAssistant.test.tsx`、`src/components/StudioAssistantRail.test.tsx`、`src/App.test.tsx`）：

```text
3 test files passed, 127 tests passed
```

其中：AgentAssistant 22 tests（含新增 docked 渲染契约）、StudioAssistantRail 3 tests（页签语义、单高级入口、状态可见性）、App 102 tests（含新增顶栏流程/rail 集成与 CSS 契约）。

TypeScript：`npx tsc -p tsconfig.app.json --noEmit` 通过（exit 0）。
Lint：`npm run lint` 通过。
Build：`npm run build` 通过；Vite 仅报告既有的大 chunk 警告。
Diff：`git diff --check` 通过；Git 仅报告现有文件的换行（CRLF）提示，无空白错误。
机械设计检测（impeccable detect.mjs）：`[]`，无机械性 UI 发现。

## TDD_EVIDENCE

1. **Task 1 docked 呈现** — RED：`npx vitest run src/components/AgentAssistant.test.tsx -t "renders the active AI workspace inline when docked"` 失败（`presentation` 属性不存在，docked 标记缺失）。修复：抽取共享对话渲染 helper，新增 docked 分支；因 docked 无启动器，草稿须在渲染阶段初始化（渲染期 setState + ref 守卫），否则首个 `flushSync` 内无对话可用。曾尝试 `useLayoutEffect` 提前建草稿，但同步提交会连带冲刷被动 hydration，改变 4 个既有项目变更测试的时序而失败；回退为渲染期初始化后全部通过。GREEN：22 tests 全绿。
2. **Task 2 rail 双页签** — RED：`npx vitest run src/components/StudioAssistantRail.test.tsx` 模块不存在失败。GREEN：3 tests 全绿（默认 AI 助手选中、高级内容仅在选择后出现、唯一「高级功能」按钮、状态可见）。
3. **Task 3 壳层接线** — RED：新增两项集成测试失败（Atelier 顶栏流程被隐藏、rail 不存在）。修复：`StudioStageShell` 改为渲染 `leftRail`，rail 在 `StudioApp` 构造一次并传入 6 个公开阶段与兼容编辑器；移除 `topbarWorkflowHidden`/aria-hidden；`ProjectMenu` 移入顶栏「导出与工程」；同步更新断言旧左栏导航的既有测试与助手入口 helper。GREEN：App 101 tests + rail 3 + AgentAssistant 22 全绿。
4. **Task 4 CSS 契约** — 本环境 `styles.css?raw` 返回空串、`node:fs` 不在 `tsconfig.app.json` 的 node 类型范围内，按计划回退条款将断言改为 DOM 行为契约测试（`.topbar .topbar-workflow` 无 aria-hidden、`.studio-assistant-rail`、`.inspector-toggle-group` 可达）。RED：旧 `aria-hidden` 隐藏规则与缺失 rail 样式使测试失败。修复：删除两条 Atelier 隐藏规则、拆分侧栏 grid 行、新增 rail/docked/高级面板样式与窄屏滚动/紧凑规则。GREEN：102 tests 全绿。
5. **Task 5 验证** — 上述 tsc/lint/build/diff 全部通过；detect.mjs 无发现；人工自审发现并修复窄屏 rail 内容被裁剪（`max-height: 46vh` + `overflow-y: auto`）。

## REVIEW

独立评审不可用（本会话无外部评审者）；按计划完成代码自审：diff 逐段核对计划约束——左栏唯一高级入口为「高级功能」页签、AI 面板无底部高级入口、顶栏六阶段可见、ProjectMenu/协作/同步复用、无服务端/依赖改动、`ProjectDocument` 与导出内容不变。机械检测无 Critical/Important 发现。

## MANUAL_ACCEPTANCE

桌面（≥1120px）：
1. 打开编辑器，确认顶栏显示六阶段步骤条（Atelier 下不隐藏），左栏显示「AI 助手 / 高级功能」两个页签。
2. AI 助手页签内可直接描述需求、查看提案复选框与风险标签、点「确认应用」；切换步骤再返回，对话历史保留。
3. 切到「高级功能」页签，确认显示工程状态（ProjectDocument/学生数/同步状态）、协作房间与人数、数据告警、渲染间隔，以及「项目配置与设置」按钮；点击后进入全局设置全屏页并可返回。
4. 顶栏「项目」菜单内导出 SVG/工程、在线协作创建/加入/邀请功能照常可用；右侧对象属性面板照常可编辑。

窄屏（≤760px）：
1. 顶栏步骤条横向滚动可见；左栏 rail 保持紧凑面板（46vh 上限内滚动）。
2. 「打开属性面板」切换按钮仍可见且键盘可达，可展开右侧对象属性。

## ROLLBACK

回滚壳层/rail 相关提交（`git revert` 或 `git reset` 至实施前）即恢复旧的浮动助手与左侧步骤导航，不会触碰 `ProjectDocument`、导出数据或 API 契约；`AgentAssistant` 保留 `presentation` 默认 floating，旧调用方无需改动。
