# 流程引导 × 全局设计 深度挂钩实施计划

日期：2026-08-01
状态：待批准

## 目标

将 5 步流程式引导（WorkflowGuide）与全屏全局设置深度挂钩：引导步骤直接驱动全局设置的分区与内容，全局设置中的非全局设计界面单独分类。核心原则：**引导是全局设置的"目录"，全局设置是引导第 3 步的"工作台"**，两者双向联动、状态互见，不引入第二套项目数据模型。

## 现状（已批准交互回顾）

### 流程引导（WorkflowGuide）
- 5 步：准备名单 → 地图呈现 → 全局布局 → 局部调整 → 检查导出。
- topbar 变体：紧凑状态条（`N/5 · 步骤` + 5 状态圆点），悬停/点击展开详情面板；面板内含各步骤操作（模板、数据呈现、导出等）。
- fullscreen 变体（全局设置顶部）：默认展开步骤导航，`showStepPanel=false` 只显示步骤状态与点击跳转，说明文案按当前步骤动态显示。

### 全局设置（GlobalSettingsScreen）
- 5 个平铺分区：画布设置 / 地图展示框 / 数据板块 / 辅助板块 / 字体排版。
- 顶部已有 fullscreen 引导条。
- 现有步骤→分区映射：
  - 准备名单 → 数据板块 · 人员数据
  - 地图呈现 → 数据板块 · 数据展示
  - 全局布局 → **无动作**（仅更新步骤状态）← 主要缺口
  - 局部调整 / 检查导出 → 返回编辑器

### 已确认的问题与缺口
1. 全屏设置内点击「全局布局」步骤没有任何界面响应（`handleWorkflowStep` 中 layout 分支缺失）。
2. 全局设置分区平铺无分类：辅助板块、字体排版与流程核心的全局设计混在一起。
3. 引导与分区间无双向状态联动：切换分区时引导无感知，引导点击时分区无高亮。
4. 模板选择只存在于 topbar 引导面板中，全局设置内无模板入口（引导第 3 步的核心工具未进入全局设置）。

## 新的交互设计

### 1. 全局设置分区分组（「其他的界面再单独分类」）

左侧导航由平铺 5 项改为两组，组内顺序不变：

| 分组 | 分区 | 与流程关系 |
|---|---|---|
| **全局设计**（流程第 3 步「全局布局」的工作台） | 画布设置、地图展示框、数据板块 | 流程挂钩的核心界面 |
| **其他设置**（独立分类） | 辅助板块、字体排版 | 非流程核心，单独归类 |

- 分组标题为纯展示元素（`role="presentation"`），不参与 tab 焦点序；5 个分区仍是同一 tablist 的连续 tab，保持现有 roving tabindex 与方向键切换。
- 组内 tab 行为不变（aria-selected / aria-controls / is-active）。

### 2. 引导 ↔ 分区 双向挂钩（「尽可能挂钩」）

**A. 步骤 → 分区（点击引导步骤）**，补齐 layout 分支：

| 步骤 | 全局设置动作 |
|---|---|
| 准备名单 | 数据板块 · 人员数据（已有） |
| 地图呈现 | 数据板块 · 数据展示（已有） |
| 全局布局 | 跳转「全局设计」组（保持当前全局设计分区，未进入过则默认画布设置） |
| 局部调整 | 返回编辑器（已有） |
| 检查导出 | 返回编辑器（已有） |

**B. 分区 → 引导（切换分区时）**：
- 全局设置内点击任意分区，若当前不在 `layout` 步骤则把引导步骤同步为「全局布局」（全局设置即全局布局的落地界面）。
- 当前分区在 fullscreen 引导的「全局布局」步骤条目上以子项形式高亮：引导面板的「全局布局」步骤下显示 5 个分区快捷子项（画布 / 地图 / 数据板块 / 辅助板块 / 字体排版），当前分区高亮 `is-active`，点击子项切换分区。

**C. 模板进入全局设置**：在「全局设计」组的数据板块分区顶部（或画布分区）增加「整体模板」区块：系统模板 + 我的模板 + 保存当前模板，与 topbar 引导面板共用同一套 `onApplyTemplate / onApplyCustomTemplate / onSaveTemplate` 回调，行为与数据源完全一致（模板仍来自 ProjectDocument，无第二份状态）。

**D. 引导状态互见**：全局设置分区导航的「数据板块」条目显示 roster/presentation 步骤徽标状态（✓ / ! / 数字），复用 `computeWorkflowProgress`，仅展示不改数据。

### 3. 响应式与无障碍

- 分组标题在窄屏（≤620px）横向导航中隐藏文字、保留分组分隔视觉（细分割线）。
- tablist 语义保持：`role="tablist"` 内只含 5 个 tab；分组标题用 `role="presentation"` 或独立于 tablist 的标题行。
- 引导子项高亮与键盘可达：子项按钮可从引导面板 Tab 进入。

## 实施切片（TDD，每片先写失败测试）

### 切片 1：全局设置分区分组
- 测试：`GlobalSettingsScreen` 渲染两组标题（全局设计 / 其他设置）；5 个 tab 仍是同一 tablist；方向键切换跨组连续；辅助板块、字体排版归入「其他设置」。
- 实现：`sections` 常量改为分组结构 `[{ id: "global-design", label, sections: [...] }, { id: "other", ... }]`；导航渲染分组；styles.css 增加分组标题样式。
- 验收：App.test 全局设置全分区测试仍绿；浏览器 1440/768/390 无溢出。

### 切片 2：引导步骤 ↔ 分区 双向联动
- 测试：
  - 全屏设置内点击「全局布局」→ 跳转「全局设计」组（画布设置激活，或保持原全局设计分区）；
  - 点击「辅助板块」分区 → 引导步骤同步为「全局布局」（`onWorkflowStep("layout")` 被调用）；
  - 点击「准备名单/地图呈现」→ 仍跳数据板块对应子视图（回归）。
- 实现：`handleWorkflowStep` 补 layout 分支；分区 `onClick` 调用 `onWorkflowStep("layout")`；App.tsx 无需新状态（复用 `activeWorkflowStep`）。
- 验收：App.test 全屏引导集成测试扩展后全绿。

### 切片 3：引导「全局布局」步骤分区子项联动
- 测试：fullscreen 引导的 layout 步骤条目展开 5 个分区子项；当前分区（如地图展示框）对应子项 `is-active`；点击子项触发分区切换；topbar 变体不渲染子项（避免重复）。
- 实现：WorkflowGuide 增加可选 `globalSections` + `activeSection` props（仅 fullscreen 且 activeStep=layout 时渲染子项），回调 `onOpenGlobalSettings`。
- 验收：WorkflowGuide.test 新增用例绿。

### 切片 4：模板区块进入全局设置
- 测试：全局设置「数据板块」分区出现「整体模板」区块；点击系统模板调用 `onApplyTemplate`；「我的模板」点击调用 `onApplyCustomTemplate`；保存调用 `onSaveTemplate`；与 topbar 引导面板状态一致（currentTemplateId 高亮）。
- 实现：GlobalSettingsScreen 增加模板区块（复用 WorkflowGuide 的模板渲染逻辑，抽公共小组件 `TemplatePicker` 供两处使用）；App.tsx 传现有回调。
- 验收：新增集成测试绿；App 中 topbar 引导与全局设置模板点击后 canvas 同步变化（复用现有模板应用事务）。

### 切片 5：分区导航引导徽标 + 样式 + 全量验证
- 测试：数据板块条目显示 roster 状态徽标（有未匹配时 `!`，全部就绪 `✓`）；分组样式类存在。
- 实现：分区导航读取 `workflowProgress` 渲染徽标；styles.css 完成分组标题、徽标、窄屏样式。
- 验证：
  - 目标测试 → 串行 `npm run test` / `npm run lint` / `npm run build`；
  - 真实 Chromium 验收：1440/768/390 三视口打开全局设置，点击引导各步骤跳转正确、分区切换后引导高亮同步、模板应用实时上画布、无控制台错误、无水平溢出。

## 风险控制

- **不触碰并行改动**：工作区已有未提交改动（PosterCanvas、CardsInspector、name-format、scene-document 等，属并行开发），本计划只改 WorkflowGuide / GlobalSettingsScreen / App.tsx 接线 / styles.css 相关 hunk，按 hunk 隔离，不整体暂存、不重置。
- **状态单一来源**：模板、数据视图、步骤状态全部继续由 ProjectDocument + App 状态派生；GlobalSettingsScreen 只新增本地 `activeSection/dataView` 等 UI 状态，不新增项目数据。
- **App.tsx 已很大**：新增接线最小化；模板区块抽 `TemplatePicker` 小组件，避免 GlobalSettingsScreen 膨胀。
- **无障碍回归**：分组标题不破坏 tablist 焦点序；引导子项按钮有明确 aria 标签。
- **回归范围**：全屏设置 42 项 App 集成测试 + WorkflowGuide 13 项必须保持全绿；全量 550+ 测试通过。

## 待确认事项

1. 模板区块放在「数据板块」分区顶部（建议）还是「画布设置」分区顶部？
2. 引导子项联动是否需要 topbar 变体也展示（当前建议：不需要，避免与 topbar 面板重复）？
