# R2-fable-ux 报告 — 非数据工作区 / 检查器 / 画布选择 A11y

分支：`cursor/agent-sota-polish-cbcd`（按指令未提交，工作区改动保留在磁盘上）。
目标：MapStyle / ContentLayout / Delivery 三个非数据工作区 + 检查器 + 画布选择的 SOTA 键盘与读屏 UX。

## 一、改动清单（仅限授权文件）

### 1. `src/components/canvas/PosterCanvas.tsx` — 选中对象播报 + 卡片层键盘操作
- 新增 `selectionAnnouncement` 计算：根据 `selectedTextId` / `selectedAssetId` / `selectedProvince` / `selectedStudentId` / `mapSelected` / cards / guests 生成中文描述（如「已选中省份：北京市」「已选中文字：…」）。
- 根 `<svg>` 的 `aria-label` 在有选中对象时附加该描述；同时在 SVG 旁渲染一个 `.sr-only` 的 `role="status"` + `aria-live="polite"` 区域播报选中变化（导出模式下不渲染，避免污染导出 DOM）。**播报区放在 SVG 外部**是有意为之：`aria-live` 在 SVG 内部的读屏支持不可靠。
- `<g data-cards-layer>` 增加 `tabIndex={0}`、`role="button"`、`aria-label`（含板块数量），Enter/Space 触发 `onSelect({ type: "cards" })`，与点击行为一致。
- `<g data-guests-layer>` 原有 `tabIndex`/`aria-label` 保留，补齐 Enter/Space 键盘触发 `onSelect({ type: "guests" })`。
- **未触碰任何布局求解（layout solver）调用。**

### 2. `src/components/inspector/InspectorPanel.tsx` — 受保护的焦点迁移 + 面板命名
- 面板内容包裹在 `role="group"` + 动态 `aria-label`（「当前对象属性：画布/地图/文字…」）的容器中，`tabIndex={-1}` 允许程序化聚焦。
- **焦点策略（本任务要求记录的设计决策）**：选中对象变化时焦点移入面板容器，但满足以下守卫——
  - 首次挂载不抢焦点（用 `useRef` 记录上一次 `selectionIdentity`，仅在真实变化时触发）；
  - 通过 `window` 级 `pointerdown`/`pointerup`/`pointercancel` 监听维护 `pointerActiveRef`，**指针按住期间（画布拖拽中）跳过焦点迁移**，拖拽释放后的下一次选中变化恢复正常迁移。
  - 理由：拖拽选中是画布最高频操作，焦点被抢会中断拖拽手势与滚轮上下文；键盘用户（Tab/Enter 选中）不会置位指针标志，仍然获得即时焦点迁移。
- `RangeNumberControl` 字段的既有 label 关联未改动（本就合规）。

### 3. `src/components/workspaces/DeliveryWorkspace.tsx` — 语义化问题列表 + 导出组
- 检查问题列表改为语义化 `<ul>/<li>`（内联样式清零默认列表样式，未动全局 CSS）；每个「定位」按钮 `aria-label` 含**严重级别文字**＋问题详情（如「定位警告：缺少城市」），不再仅靠颜色区分严重度。
- 状态图标（`CheckCircle2`/`TriangleAlert`）标记 `aria-hidden`，旁加 `.sr-only` 文字（「检查通过」/「有待处理问题」）。
- 导出动作已是 `role="group"` + 标签；PNG 按钮补 `aria-label="导出 PNG"`；导出错误块赋 `id="delivery-export-error"`，重试按钮与导出组通过 `aria-describedby` 关联到错误文本。
- 新增 `role="status"` + `aria-live="polite"` 播报导出进度（「正在导出，请稍候」→「导出完成」）。

### 4. `src/components/WorkflowGuide.tsx` — 键盘关闭 + 关联
- topbar 变体：包裹层监听 Escape，关闭面板并把焦点还给指引条按钮。
- 指引条按钮在面板展开时带 `aria-controls="workflow-guide-panel"`，面板赋对应 `id`。
- 警告列表与导出动作区补 `role="group"` + `aria-label`。

### 5. `src/components/WorkflowStageStepper.tsx` — 装饰元素隐藏
- 步骤序号与状态图标 span 标记 `aria-hidden="true"`（信息与按钮 `aria-label` 重复）。刻意**不改**按钮 `aria-label` 文案：`App.test.tsx`（非本 agent 所有）按精确 label 匹配按钮。

### 6. `src/components/workspaces/DisplayFrameLayerList.tsx` / `ReferenceCardStyleWorkspace.tsx`
- 图层列表由 `div[role=list]`+`button[role=listitem]` 改为语义化 `<ul>/<li>` 包按钮（内联样式保持视觉不变）。
- 展示框样式选项容器补 `role="group"` + `aria-label="展示框样式选项"`；选项按钮本就有可见名与 `aria-pressed`。

### 7. MapStyle / ContentLayout 工作区
- 审查后确认既有控件（分段控件 `aria-label`/`aria-pressed`、历史操作组、素材 details）已合规，未改组件本体；补充断言测试（见下），并通过共享的 InspectorPanel / PosterCanvas 改动获得面板命名与画布播报能力。

### 8. 新增/扩展测试
- `PosterCanvas.test.tsx`：cards 层 role/tabindex/label 与 Enter/Space；guests 层 Enter/Space；live region 与 svg label 随省份/文字选中更新；导出模式不渲染播报区。
- `DeliveryWorkspace.test.tsx`：问题列表 ul/li 结构与含严重级别的定位按钮名；`.sr-only` 状态文字；`aria-describedby` 错误关联；导出组标签与导出状态播报。
- `InspectorPanel.test.tsx`：面板 `role="group"` + 动态 label；首挂载不抢焦点；选中变化迁移焦点；指针按住期间不迁移、释放后恢复。
- `MapStyleWorkspace.test.tsx` / `ContentLayoutWorkspace.test.tsx`：主控件可及名、检查器面板命名、画布播报区存在性。
- `WorkflowGuide.test.tsx`：`aria-controls` 关联、Escape 关闭并还焦。`WorkflowStageStepper.test.tsx`：按钮可及名 + 装饰隐藏。`ReferenceCardStyleWorkspace.test.tsx`：组标签与 `aria-pressed`。

## 二、验证证据（failure → cause → fix → recheck）

### 指定验证命令 — 通过
```
npx vitest run src/components/workspaces/MapStyleWorkspace.test.tsx \
  src/components/workspaces/ContentLayoutWorkspace.test.tsx \
  src/components/workspaces/DeliveryWorkspace.test.tsx \
  src/components/inspector src/components/WorkflowStageStepper.test.tsx \
  src/components/WorkflowGuide.test.tsx src/components/canvas/PosterCanvas.test.tsx
→ Test Files 14 passed (14)，Tests 130 passed (130)
```
ESLint（全部触碰文件）：0 error 0 warning。
非所有文件回归抽查：`App.test.tsx`、`StudioEditorShell.test.tsx`、`StudioTopbar.test.tsx`、`WorkflowPrototype.test.tsx`、`ReferenceCardStyleWorkspace.test.tsx`、`DisplayFrameSubcanvas.test.tsx` 均通过。

### 证据链 1：WorkflowGuide Escape 关闭后被立即重开
- **failure**：新测试断言 Escape 后面板关闭，实测面板仍打开。
- **cause**：`setOpen(false)` 后调用 `barRef.current?.focus()`，焦点事件触发指引条的 `onFocus` → 再次 `setOpen(true)`。
- **fix**：交换顺序——先还焦（触发 onFocus 重开），再 `setOpen(false)` 最终关闭。
- **recheck**：`WorkflowGuide.test.tsx` 全绿。

### 证据链 2：`PosterCanvas.performance.test.tsx` 超时（非本 agent 引入）
- **failure**：性能测试单文件运行超 20s 限制。
- **cause 定位实验**：`git stash` 本 agent 对 `PosterCanvas.tsx` 的全部改动后重跑，**超时依旧**；工作区内 `useCardLayoutWorker.ts`、`card-layout*` 存在其他 agent 未提交改动（后续 tsc 也证实 `card-layout-space.ts` 有类型错误的在途修改）。
- **fix**：不适用——`card-layout*` 与性能测试均在本 agent 禁改清单内。恢复自身改动，在此记录移交。
- **recheck**：本 agent 所属 `PosterCanvas.test.tsx`（a11y 用例）单独运行全绿。

### 证据链 3：tsc 全量类型检查残留错误（非本 agent 所有文件）
- **failure**：`tsc -p tsconfig.app.json --noEmit` 报 `src/lib/card-layout-space.ts(265)` 缺 `memoX/memoY/memoInside`（更早一次运行报过 `App.tsx` GlobalSettingsScreen props 错误，已被在途改动自行消除）。
- **cause**：多 agent 共享工作树，错误位于禁改文件 `card-layout*`（R2 其他 agent 在途工作）。
- **fix**：不适用，越权文件；在此记录。
- **recheck**：本 agent 全部触碰文件无任何 tsc 报错（错误列表中不含本 agent 所属文件）。

## 三、验收方式与回滚

- **验收**：跑上方指定 vitest 命令（14 文件 130 用例）+ 手动走查——Tab 进画布 cards/guests 层 Enter 选中→NVDA/VoiceOver 播报「已选中…」→检查器获焦并朗读「当前对象属性：…」；Delivery 页用读屏浏览问题列表可听到严重级别；导出报错后焦点按钮朗读错误详情。
- **回滚**：全部改动为 ARIA 属性、语义标签与事件处理的增量修改，无数据/导出格式/API 形状变更；逐文件 `git checkout --` 即可回滚，无迁移成本。
- **未竟事项（越权，移交）**：`PosterCanvas.performance.test.tsx` 超时与 `card-layout-space.ts` 类型错误归属 card-layout 所有者。
