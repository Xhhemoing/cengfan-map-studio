# 全局布局模板化设计（2026-08-13 v2 · 已合并双评审）

> 基准：GitHub `a769be8` 经典布局（顶栏步骤条 + 左栏 + 画布 + 右检查器）。
> v2 吸收两份独立评审（产品/UX + 前端架构）。核心结论：方向正确，但
> **不得把「运行时 JSX」塞进模块级注册表**；应拆成「静态元数据 + 显式渲染分派」，
> 所有 hooks/state/refs 保持在 StudioApp 顶层。本文档同时补齐交互与可访问性契约。

## 一、基准布局（GitHub 参考）

```
┌────────────────────────────────────────────────────────────┐
│ 品牌   名单·地图·版式·内容·素材·交付（步骤条）         操作   │ 56px 顶栏
├──────────┬─────────────────────────────────┬───────────────┤
│ AI 助手   │                                 │  检查器        │
│ + 阶段总览 │           画布 / 海报             │  选中元素编辑   │
└──────────┴─────────────────────────────────┴───────────────┘
   280px 可拖(240-380)                    240px 可拖(220-420)
```

要点：**步骤引导永远在顶栏**；**左栏 = 位置/进度/下一步 + AI 建议**；**右栏 = 当前选中对象 + 可改属性**；画布居中最大。

## 二、模板化架构（修正后）

### 0. 顶层视图状态机（先决）

App 渲染优先级，T1 只收敛「focused stage」，其余路径保持原样：

```
projectLoading / projectMissing
  → globalSettingsSection（全局设置，覆盖层）
  → legacyEditorEnabled（旧版编辑器，兼容路径）
  → focused stage（本模板化范围，6 个阶段）
```

### 1. 全局布局模板 `StudioLayoutTemplate`

统一框架组件，公共外壳持有：`assistantEntry / projectActions / workflowNav / drawer`。
阶段相关内容走 `StageSlots` 槽位：

```ts
interface StageSlots {
  stageActions?: ReactNode;   // 阶段专属顶栏动作（如 frame/content 的历史/刷新/返回）
  rightRail: ReactNode;        // 右栏编辑工具
  rightRailLabel: string;      // 右栏标题
  workspace: ReactNode;        // 中心画布内容
}
```

框架职责：左右栏可拖宽 + 持久化（含视口校验）、移动端抽屉化、皮肤变量。

### 2. 静态元数据 + 显式渲染分派（**不存运行时 JSX**）

```ts
// 静态层：仅 label/description/rightRailLabel，复用 WORKFLOW_STAGES 单一事实源
const STAGE_METADATA = {
  template: { label: "选择模板", rightRailLabel: "模板列表", description: "…" },
  data:     { label: "数据与素材", rightRailLabel: "数据质量与素材", description: "…" },
  map:      { label: "地图样式",   rightRailLabel: "地图对象属性",   description: "…" },
  frame:    { label: "展示框样式", rightRailLabel: "展示框公共样式", description: "…" },
  content:  { label: "内容与排版", rightRailLabel: "内容对象属性",   description: "…" },
  export:   { label: "最终导出",   rightRailLabel: "导出与检查",     description: "…" },
} satisfies Record<WorkflowStageId, StageMetadata>;

// 渲染层：App 内纯函数，禁止 hooks；只接收 ctx 里的 state/setter/ref 并传递
function buildStageSlots(stage: WorkflowStageId, ctx: StageRenderContext): StageSlots {
  switch (stage) { /* 返回各阶段 slots */ }
}
```

**硬约束（T1 必须遵守）**：
- 不移动/新增/删除/条件调用任何 StudioApp 顶层 hook
- 不改变 `posterRef`、协作 refs、工作区同步 refs 的创建位置；renderer 只传递 ref 对象，不创建替代 ref
- 阶段 renderer 若要用 hooks，必须是 `<StageRenderer />` 组件，禁止 `renderer(ctx)` 普通函数调用
- 注册表模块级只读 `satisfies`，渲染期不得补 props
- 禁止静态 import `xlsx`（保持 `DataWorkspace` 内 `await import("xlsx")`）
- T1 禁止任何视觉/DOM 顺序/文案/ARIA/组件 key/lazy 边界/state 所有权变化

## 三、功能分区细则（左/右职责边界）

### 左栏（280px）：我处于哪里 · 进度如何 · 下一步 · AI 建议
1. **AI 助手**（上，默认激活）：对话 + 应用步骤；首次进入给最多 2-3 条上下文建议，可折叠并记住状态
2. **阶段总览**（下）：每张卡回答「当前阶段最需要做的决定是什么」，**优先异常/缺失/待处理**，其次才是计数/尺寸
   - 数据：缺失字段/重复记录/未定位人数/待确认告警
   - 地图样式：样式是否适配数据、未映射类别
   - 展示框：画布比例、溢出/裁切、可用空间
   - 内容：未排版/溢出元素、层级冲突
   - 交付：导出格式、资源缺失、最近一次导出状态
   - 卡片点击 → 跳转到对应编辑位置或筛选结果

### 右栏（240px）：我选中了什么 · 能改什么 · 改后怎样
- 顶部「阶段说明」一行：目标 + 当前动作 + 结果三段式，默认折叠为一句，可展开
- 下方该阶段编辑工具分组
- **空状态**：未选中对象时显示引导（如「点击画布上的省份开始编辑」），不显示空白检查器

### 顶栏（横向三组）
- 左品牌；中步骤条；右动作
- 动作分层：高频图标按钮（撤销/重做/缩放/当前阶段主操作）；低频归入项目菜单（主题/皮肤/协作/导入导出）；AI 为独立高强调入口（移动端）
- 窄桌面降级：步骤标签缩短/仅编号、动作折叠菜单，不水平溢出

### 画布
- 居中最大；模板=预览、数据/地图/展示框/内容=海报画布、交付=导出预览
- 左下角缩放控件 + 当前尺寸（现状保留）

## 四、交互与可访问性契约（新增章节）

1. **阶段状态模型**：`status: locked | available | active | complete | warning | error`，状态转换条件、步骤条点击策略（允许回跳，阻塞时给原因+修复入口）、每阶段唯一主操作（顶栏「下一步」或阶段说明内）
2. **功能归属表**：每个功能明确主入口/次入口/所在阶段/是否跨阶段调用；跨阶段操作给上下文入口（如内容元素→跳展示框）
3. **左/右内容优先级**：选中对象编辑 > 当前阶段关键任务 > 阶段辅助信息 > 全局统计；空状态定义
4. **尺寸边界**：左右栏最大宽度受视口比例约束，中心画布保留最小宽度；低于阈值自动抽屉；持久化前校验视口
5. **键盘/焦点/ARIA**：步骤条 `aria-current="step"`；状态徽标有文本（「已完成/有 2 项待处理/进行中」），颜色非唯一信息；告警 `role=status|alert`；抽屉 dialog 语义 + Escape + 焦点循环；分组折叠 `aria-expanded`；图标按钮 accessible name
6. **用户任务验收矩阵**：新用户能否找到导入/去重/地图样式/导出；能否从告警定位问题；移动端能否开两侧抽屉完成一次编辑；键盘用户能否完成阶段切换+编辑

## 五、视觉整洁规范

- 每 rail 定义固定区（AI 输入/阶段标题）与滚动区（总览/工具列表独立滚动）
- 每栏首屏最多分组数、默认展开组数、折叠规则
- 层级验收：主标题 > 当前任务 > 状态/告警 > 次要说明 > 操作控件
- 语义化 CSS 变量：`--status-success/warning/error`、`--focus-ring`、`--surface-panel`；两套皮肤分别验收对比度
- 长文本/空状态/告警/密集数据各态截图验收

## 六、实施计划（TDD，每任务独立提交）

| 任务 | 内容 | 验收 |
|---|---|---|
| **T0** | 控制流/slot 契约测试：6 阶段逐一进入验证 workspace/rightRail/label/topbar；`A→B→A` 状态保留（模板选择/学生选择/导出倍率/编辑选区）；global settings 往返；legacy flag 1/非 1 两条路径；posterRef 内容↔交付后仍有效 | 新增测试绿 |
| **T1** | 公共外壳抽取 + `STAGE_METADATA` 静态层 + `buildStageSlots` 显式 switch，保持全部顶层 hooks/state/refs 不动 | 全量 test+lint+build；T0 契约全绿；chunk 清单对比 |
| **T2** | `OverviewMetrics` 数据契约（逐项标 source/口径/派生/memo/空态）+ 窄只读 DTO + 左栏总览 UI | 新增测试 + 截图 + 点击跳转 |
| **T3** | 右栏工具分组重组 + 阶段说明行（一段式可展开） | 测试全绿 |
| **T4** | 顶栏动作分组整理（高频/低频分层、窄桌面降级） | 测试全绿 |
| **T5** | 视觉统一 + 移动端抽屉（固定入口/互斥/焦点恢复）+ 无障碍 + E2E（320/375/430/760 视口） | 4+ 视口验证 + 键盘/触摸目标验收 |

## 七、风险与缓解

| 风险 | 缓解 |
|---|---|
| T1 收敛破坏行为 | T0 契约测试先立回归网；T1 禁视觉/DOM/文案/ARIA/key/lazy/state 变化 |
| 运行时 JSX 进注册表破坏类型安全 | 拆两层：静态 metadata + 显式 `buildStageSlots`；判别联合 per-key props |
| hooks/refs 下沉改变生命周期 | T1 明文禁止；renderer 只传 ref；真正拆分另立 T1.5 并逐 workspace 验证 |
| 总览卡成噪音 | 每卡回答「最需做的决定」、优先异常、点击跳转、显示上限+折叠 |
| 移动端三栏拥挤 | 左/右抽屉互斥 + 固定入口 + 焦点恢复；低于阈值自动抽屉 |
