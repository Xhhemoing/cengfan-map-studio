[Model: claude-fable-5-thinking-xhigh]
round: R1
role: plan
scope: 工作台 / 五阶段壳 / 助手轨 / 顶栏（只读，禁止改业务文件）

done:
- 通读权威文件：AGENTS.md、docs/design/DESIGN-CONTRACT.md、frontUI2.md（重点 §3 骨架、§4 显隐、§5 六区首屏、§6 导航状态、§10 反馈、§11 重复入口、§13 验收）。
- 通读指定面：ProjectWorkbench + workbench/*（Header/Grid/Card/ContinueEditingCard）、StudioRoutes、StudioLayoutTemplate、StudioTopbar、StudioEditorShell、StudioStageShell、StudioAssistantRail、StudioAssistantDrawer、StageOverviewPanel、StageGuideLine、WorkflowGuide、WorkflowStageStepper、editor/*（StageLayoutScreen/EditorTopbarActions/MissingProjectShell）、workspaces/*（DataUpload/MapStyle/ReferenceCardStyle/ContentLayout/Delivery）；顺藤摸瓜读了 App.tsx 装配段、workflow-stages/workflow-progress/stage-overview/workspace-session/editor-chrome-effects/editor-navigation-actions、usePosterExport(pngScale)、styles.css 相关段。
- 与兄弟报告去重：R1-opus-delivery P0-1 / R1-gpt-a11y 第 2 条（ExportProjectDialog 未挂载死按钮）**不重复列**；R1-opus-data P0-1（showImport 折叠挡住模板下载）与本报告 P0-2 同根因，已标注协同；R1-gpt-a11y 第 4 条（≤760px topbar 两行溢出遮挡）与本报告 P2-6 相邻不同点。
- 确认未合并分支 cursor/fix-advanced-settings-editable-05ab 只动 inspector/scene-document/agent-session，与本报告条目零交集。

open:
- 761–1120px 顶栏 `.topbar-actions { overflow: hidden }` 是否实际裁掉「帮助/主题」按钮，需要真浏览器窄屏验证（jsdom 不认 media query），本轮只挂 P2 待证。
- 新壳（StageLayoutScreen 路径）没有任何缩放/适应画布控件（ZoomControls 只剩 legacy 用），画布是否总能自适应大画布（如 A1 尺寸）需人工验证；未列入 P0/P1，因可能是"画布自动 fit"设计使然。

tests: （只读命令）
- `git log --oneline -5`、`git branch -a`、`git diff --stat main origin/cursor/fix-advanced-settings-editable-05ab`
- `npx vitest run src/lib/workspace-session.test.ts src/lib/stage-overview.test.ts src/lib/editor-navigation-actions.test.ts` → 3 文件 30 用例全绿
- `npx vitest run src/components/editor/editor-shells.test.tsx src/components/DataWorkspace.test.tsx src/components/workspaces/DeliveryWorkspace.test.tsx` → 3 文件 21 用例全绿

p0/p1/p2:

### P0-1 · 新五阶段壳把所有 statusMessage 操作反馈静默吞掉
- path: `src/App.tsx`（`statusMessage` 只在 L890 传给 LegacyEditorInspector）、`src/components/editor/StageLayoutScreen.tsx`、`src/components/StudioLayoutTemplate.tsx`
- 复现: 默认（非 legacy）壳进入任一阶段 → 项目菜单点「保存到本机」/ 应用模板 / 导入工程包 / 帮助菜单点「复制环境信息」→ 界面无任何可见回执。全仓 `statusMessage` 只有 legacy inspector 渲染它；`setStatusMessage`/`reportStatus` 在新壳上是写进黑洞。
- Given 用户在新壳名单/地图/版式/内容阶段 When 触发任何经 `reportStatus` 报告结果的动作（保存、模板、导入、复制）Then 应出现一条 `role="status"` 的可见结果文本（frontUI2 §10.3「保存、导入、导出、上传使用明确的进行中、成功和失败状态」），当前 Then 不成立。
- 建议改: `StudioLayoutTemplate` 增加一个 `statusMessage?: ReactNode` 槽位，渲染为画布区底部/顶栏下的 `role="status" aria-live="polite"` 轻量结果条；`StageLayoutScreen` 透传；App 把现有 `statusMessage` 交进去。测试：壳层组件测试断言传入文本出现在 live region（可仿 `editor-shells.test.tsx` 写法）。
- 为何不碰冻结面: 与 mapBoundaryMargin/safeMargin/summary 三项无关；不改信息架构，只补一个新壳遗失的 legacy 能力（与 R1-opus-delivery P0-1「ExportProjectDialog 未挂载」同族根因——新壳漏槽位——但症状与修点不同，不合并计数）。

### P0-2 · 空工程的名单阶段没有起点：导入/新增全折叠 + 表格无空态
- path: `src/components/DataWorkspace.tsx`（L275-276 `useState(!compactRosterControls)`；L760-862 表格无空态分支）、`src/components/workspaces/DataUploadWorkspace.tsx`（传 `compactRosterControls`）
- 复现: 工作台「新建项目」→ 进入名单阶段。看到 0/0/0 统计、折叠的「新增学生」、折叠的「展开导入 / OCR / Excel」、一个筛选框、「全部显示/全部隐藏」按钮、和一张只有表头的空表。粘贴名单这个主动作藏在折叠钮后面。
- Given 新建的空名单项目 When 打开名单阶段 Then 首屏应直接给出「粘贴名单（主）/ 上传 Excel / 手动添加」三个起点（frontUI2 §5.1、§8.5「空状态只提供一个明确起点」），当前 Then 不成立。
- 建议改: ① `showImport` 初值改为 `!compactRosterControls || students.length === 0`（空名单强制展开导入区）；② `filteredStudents.length === 0` 时在表格位置渲染空态行：名单为空给「粘贴/上传/手动」引导，有筛选词给「没有匹配「x」· 清空筛选」。测试：`DataWorkspace.test.tsx` 补两条渲染断言。
- 协同: 与 `R1-opus-data.md` P0-1（模板下载按钮被同一个 `showImport` 折叠埋住）同根因，落地时合成一条：展开逻辑一处改，两个验收各自留测试。
- 为何不碰冻结面: 纯组件初值 + 空态渲染，不动导入解析、不动数据模型、与三项冻结修复无关。

### P1-3 · 新建工程不从名单开始：工作台会话是全局单例
- path: `src/lib/workspace-session.ts`（`WORKSPACE_SESSION_STORAGE_KEY` 全局一份）、`src/App.tsx` L148-152/L199、`src/lib/editor-chrome-effects.ts` L53-58
- 复现: 项目 A 停在「交付」阶段 → 返回工作台 → 新建项目 B → B 直接落在交付阶段（空名单的交付检查页），而不是名单。
- Given 用户新建空项目 When 编辑器打开 Then 应从名单阶段开始（frontUI2 §6.1「新工程始终从名单开始」；恢复上次工作区只该对同一工程成立），当前 Then 不成立——恢复的是"上一个被编辑工程"的阶段。
- 建议改: 会话按项目分键（`${KEY}:${projectId}`，无 projectId 用现 key 兼容旧行为），`loadWorkspaceSession`/`saveWorkspaceSession` 加 projectId 参数并保留默认值，旧数据自然失效无需迁移。测试：`workspace-session.test.ts` 补「不同 projectId 互不串台」「无记录时落 data」两条。
- 为何不碰冻结面: 只动 localStorage 键粒度与两处调用，不动工程数据格式；行为回滚 = 恢复单一键名。

### P1-4 · PNG 默认导出倍率是 1×，契约要求默认 2×
- path: `src/lib/usePosterExport.ts` L86 `useState(1)`
- 复现: 打开交付阶段，「PNG 倍率」下拉默认 1×；直接点 PNG 得到 1× 文件。
- Given 用户不动任何设置 When 在交付阶段点主导出 Then 应得到 2× PNG（frontUI2 §5.6「主按钮固定为导出 2× PNG」、§13.3「导出默认值为 2× PNG」），当前 Then 不成立。
- 建议改: 初值改 2，并给 `usePosterExport` 补一条默认值单测。现有组件测试均以 props 注入 pngScale，不受影响（已核对 4 处 fixture）。顺手把 `DeliveryRail` 主按钮文案从「PNG」改为「导出 PNG」（frontUI2 §8.5 主命令使用动词）。回滚方案：一行改回 1。
- 注意: R1-opus-delivery P1-2 在改 `describeExportPrintHint` 的倍率→dpi 口径，默认 2× 会让该 bug 首屏即现——两条一起落时先落他那条。
- 为何不碰冻结面: 不动导出管线与文件格式，只动初值与按钮文案。

### P1-5 · 空工程步骤条给「版式 ✓ / 内容 ✓」，比「名单」还先完成
- path: `src/lib/workflow-progress.ts` L96-97（layout/local 恒 `"ready"`）、`src/components/WorkflowStageStepper.tsx`
- 复现: 新建空项目 → 顶栏步骤条：1 名单 ○ 未开始、2 地图 ○、3 版式 ✓ 已完成、4 内容 ✓ 已完成、5 交付 ○。什么都没做的工程有两步"已完成"。
- Given 空名单工程 When 查看步骤条 Then 版式/内容不应显示已完成（frontUI2 §6.3：可跳过步骤不制造完成假象；状态四态里 ready 意为"用户已确认或执行主要动作"），当前 Then 不成立。
- 建议改: `computeWorkflowProgress` 中 `!hasStudents` 时 layout/local 置 `"empty"`（最小改动，两行）；stepper 无需动。测试：workflow-progress 单测补「空工程五步全非 ready」断言，另核对 `WorkflowGuide.test.tsx` 等现有断言是否依赖旧值。
- 为何不碰冻结面: 纯派生状态口径修正，不引入第二套完成标记（frontUI2 §7.3），不动步骤条结构。

### P1-6 · 地图表达 5 个选项无一句话说明、无推荐项
- path: `src/components/workspaces/MapStyleWorkspace.tsx`（DATA_VIEWS 只有 2 字标签）、建议新增 `src/lib/data-view-recommendation.ts`
- 复现: 地图阶段右栏「地图表达」只有 省份/城市/院校/图钉/热力 五个词，班主任不知道 30 人的班该选哪个；也没有任何推荐标记。
- Given 首次使用的班委在地图阶段 When 查看表达方式 Then 每种方式应有一句适用说明且有一个推荐项（frontUI2 §5.2 表格 + 「系统根据名单规模给一个推荐标记，但不自动切换」、§13.3 验收），当前 Then 不成立。
- 建议改: ① lib 纯函数 `recommendDataView(visibleCount)`（如 ≤12 → pins、≥60 → heat、否则 province），带单测；② `MapStyleRail` 在 SegmentedControl 下渲染一行当前选项说明 + 「推荐：图钉（人数较少，直接落点）」文本，不自动切换。测试：纯函数单测 + rail 渲染断言。
- 为何不碰冻结面: 只加说明与推荐展示，不动表达切换事务（`changeDataViewTransaction`）、不重排信息架构。

### P1-7 · 阶段切换丢名单导入草稿（粘贴文本 / 确认候选一并清空）
- path: `src/components/DataWorkspace.tsx`（`importText`/`reviewRows` 是组件内 state）、`src/components/editor/StageLayoutScreen.tsx`（切阶段整棵 workspace 卸载）
- 复现: 名单阶段粘贴 40 行名单 → 还没点导入，顺手点了顶栏「2 地图」看一眼 → 回到名单：textarea 空了，识别候选也没了，白粘。
- Given 用户在名单阶段有未提交的导入文本 When 切走再切回 Then 草稿应还在（frontUI2 §6.1 工作区切换保留状态精神；§2.2 高频任务不允许被中断重来），当前 Then 不成立。
- 建议改（最小裁剪）: 只保 `importText` 一项——提升到 App 层随 `dataWorkspaceProps` 传入受控（或组件内用模块级 ref 缓存初值），候选列表可由用户重按「识别文本」恢复，不值得序列化。测试：test harness 里卸载重挂 DataWorkspace，断言 textarea 保留。
- 为何不碰冻结面: 不做"全阶段 keep-alive"这类结构改造，只救最贵的那份用户输入；不动导入解析。

### P1-8 · 空名单时右栏数据质量说「城市与省份已全部定位」
- path: `src/components/workspaces/DataUploadWorkspace.tsx` L201-206（`mappingIssues.length === 0` 分支不区分空名单）
- 复现: 新建空项目 → 名单阶段右栏：「数据质量 0 项待检查」+「地图映射 · 省份管理 0 个省」+ 绿色 ✓「城市与省份已全部定位 / 无需省份覆盖」。空表被夸成健康。
- Given 名单为 0 条 When 查看数据质量栏 Then 应提示「名单为空，先导入名单」而非通过态（frontUI2 §8.5 错误/状态文案说明发生了什么；stage-overview 同一口径已修过 `data-clean` 仅在 total>0 时给，见 `stage-overview.ts` L113 注释——rail 这边漏了同样的坑）。
- 建议改: 分支加 `project.students.length === 0` 判定给空态文案与图标。测试：DataUploadWorkspace 渲染断言（该文件已有 test 基建）。
- 为何不碰冻结面: 单分支文案，不动数据质量规则本体。

### P2（不给 diff，只留结论）
- P2-1 顶栏项目菜单重复整套 PNG/SVG/倍率/透明背景导出面板（`ProjectMenu.tsx` L178-186），违反 frontUI2 §11.3「项目菜单只放工程级打开/新建/导入，不再重复 PNG/SVG」。建议收敛为一颗「快速导出 PNG」+「完整导出去交付」链接。改动会波及 ProjectMenu 三个测试文件，量不小，放 R2。
- P2-2 桌面端 AI 双入口：左栏常驻 StudioAssistantRail 的同时，顶栏 Bot 按钮还能再开一份内容完全相同的抽屉（`StudioLayoutTemplate` 把同一 `leftRail` 喂给 aside 和 Drawer 两处）。>760px 建议隐藏顶栏入口（与 `studio-editor-shell__rail-toggle` 同法），违反 §4.2「两个平级主入口不允许存在」。需真浏览器验证后再落。
- P2-3 `StudioLayoutTemplate` 没把 `returnFocusTo` 接给 `StudioAssistantDrawer`：App 里 `assistantEntryRef` 建了没传，集成测试（`StudioAssistantDrawer.integration.test.tsx`）测的是带 prop 的形态，生产形态未接线。MUI Modal 默认焦点恢复可能兜底，需验证后决定是否补线。
- P2-4 死代码三簇：`WorkflowGuide.tsx`（旧五步文案「准备名单/地图呈现/全局布局/局部调整/检查导出」与现行五阶段命名冲突，仅自测引用——R1-gpt-copy p2-7 也点到它的残留文案，直接删除优于改文案）；`FlowFrameEditor/DisplayFrameSubcanvas/DisplayFrameLayerList/DisplayFrameItemInspector` 簇（仅自测引用）；`App.tsx` `lastNonTemplateStageRef` 只写不读。删除属清理不属改名，建议 R2 顺手做。
- P2-5 名单阶段中央双份统计条：`DataUploadWorkspace` header 的 总记录/可见/重复 与其内嵌 `DataWorkspace` 的 data-summary 总记录/可见/隐藏 同屏重复（§13.2 界面整洁）。
- P2-6 761–1120px 区间 `.topbar-actions { overflow: hidden }` 疑似静默裁切帮助/主题按钮（styles.css L1273），与 R1-gpt-a11y 第 4 条（≤760px 两行溢出遮挡）相邻但不同断点，需窄屏人工验证。

assumptions:
- 「新壳/公开默认路径」= `legacyEditorEnabled === false`（`cengfan-legacy-editor` 未置 1），P0-1/P1 各条均以此路径复现。
- 班主任真实任务排序依据 frontUI2 §2.2 路径 A（首次制作）> 路径 B（改名单重导）：起点可见（P0-2）与操作有回执（P0-1）挡在路径 A 第一步和每一步，故居首；新建落错阶段（P1-3）、默认倍率（P1-4）在路径 A 首尾；其余按出现频次排。
- `recommendDataView` 阈值（≤12 图钉 / ≥60 热力）是提案值，落地方可与产品文档核定，不影响条目成立性。

do_not_touch:
- 未合并分支 cursor/fix-advanced-settings-editable-05ab 已修的三项：mapBoundaryMargin 全局可见、canvas safeMargin 上限对齐、summary display:list-item——本报告零交集，落地代理不得重改。
- ExportProjectDialog 未挂载死按钮：已由 R1-opus-delivery P0-1 + R1-gpt-a11y 第 2 条认领，本路不重复动。
- 不提信息架构重做、三分钟快速路径、场景包、HTTPS Demo、Gitee、PDF、支付；不动 server/、package.json、锁文件、导出文件格式、ProjectDocument。
- 不合 main、不动他人 PR。

next:
- R2 落地顺序建议：P0-1 → P0-2（与 R1-opus-data P0-1 合成一条落）→ P1-4（先落 R1-opus-delivery P1-2 再改默认 2×）→ P1-5 → P1-8 → P1-3 → P1-6 → P1-7；P2-2/P2-3/P2-6 需真浏览器验证后再决定是否升级。
- 每条落地按 AGENTS.md 验证纪律走 failure → cause → fix → recheck，新增断言先红后绿；交付时逐条写明验收方式（组件测试 + 走查录屏）。
