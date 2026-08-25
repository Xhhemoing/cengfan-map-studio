[Model: claude-fable-5-thinking-xhigh]
round: R1
role: review
scope: 检查器（src/components/inspector/*）/ 全局设置（GlobalSettingsScreen、GlobalSettingsDrawer）/ 展示框编辑（DisplayFrame*、ReferenceCardStyleWorkspace、FlowFrameEditor）/ 配对控件（RangeNumberControl、DeferredInput）/ CardPresentationSettings / TypographyPanel。只读，未改任何业务文件。

done:
- 通读上述全部组件与其接线（App.tsx → StageLayoutScreen / GlobalSettingsShell / LegacyEditorInspector），核对 frontUI2.md §3.1/§4.3/§11、DESIGN-CONTRACT.md。
- 关键事实用数据层验证过：sceneResetPatch 返回整份默认场景（canvas-edit-transactions.ts）；applyTransaction 对"新对象但内容等价"的 patch 照样记历史并清 redo（project-document.ts L250-284）；`preset:"compact"` 在 normalizeScene 已归一化，CardsInspector 里的 `|| preset==="compact"` 是死防御不构成缺陷；`project.guests` 非可选，InspectorPanel 的 DEFAULT_GUESTS 兜底同为死代码。
- 确认 legacyEditorEnabled（localStorage `cengfan-legacy-editor`）默认关闭：GlobalSettingsScreen 整页（含 guests/typography/advanced 三个分区）在默认新版 UI 无任何打开路径（editor-navigation-actions.ts 非 legacy 分支只跳 frame/content 阶段）。

open:
- 地图阶段右栏 MapStyleRail 用 MapInspector 默认 `collapsible=false`：热力色阶、单省颜色、南海折叠、图片对齐全部平铺（frontUI2 §5.2 要求进高级设置）。属**渐进披露缺口**，不是改不了；组件已有 collapsible 能力，只差一处传参，但要先确认地图阶段的信息密度取舍。
- legacy 全局设置「辅助板块」导航描述写"嘉宾板块的**位置**与外观"，但 GuestsInspector `layoutOnly` 有意隐藏 placement（拆分正确，文案骗人，改描述即可）。legacy 面，低优先级。
- ReferenceCardStyleOptions 选中态双真相：`templateId === id || presentation === …`，换整体模板后可能高亮过期样式格。观察项。
- WorkflowGuide 在生产代码零渲染点（连同其全局设置快捷入口），是否删除需产品决策。

tests:
- 只读轮未运行测试。提醒实现方：`InspectorPanel.test.tsx` L69-77 把 P1-4 的空 patch 行为固化成断言（选 image → 期望 patch vector），修复时必须同步改该测试，走 failure → cause → fix → recheck。

p0/p1/p2:

- **P0-1【真改不了】姓名脱敏与卡片字段模板在默认 UI 无入口**
  path: 默认阶段壳所有阶段（StageLayoutScreen）
  复现: 默认 UI（未设 `cengfan-legacy-editor=1`）下想改「姓名展示」（王*明 等）或字段模板（{count}/{names}）→ 翻遍六阶段与右栏找不到入口。
  Given 一个默认路径工程；When 用户需要脱敏姓名后导出；Then 无 UI 可达——`CardPresentationSettings` 仅挂在 GlobalSettingsScreen「高级设置」分区，而该整页只有 legacy 开关下可打开；渲染（prepared-card-content.ts）与 AI 通道（agent-session.ts 可写 nameFormat/expressionTemplates）仍消费该字段，形成"AI 能改、人改不了"。
  文件: src/components/CardPresentationSettings.tsx、src/components/GlobalSettingsScreen.tsx L355-360、src/lib/editor-navigation-actions.ts L136-156、src/App.tsx L695-728

- **P1-2【标签骗人/配对不一致】数字输入越界提交被静默吞掉，输入框长期显示未生效值**
  path: 编辑器任一带 min/max 守卫的数字框
  复现: 选中地图 → 宽度输 9999（max 6000）→ Enter → 画布不变，但输入框一直显示 9999，与工程值永久脱节（DeferredInput 只在 externalValue 变化时重置 draft，被拒的 commit 不触发变化）。
  Given 越界草稿；When commit 走 `if (isFinite && >=min && <=max)` 被丢弃；Then 无 clamp、无回退、无提示。对照 RangeNumberControl 会 clamp 并回写草稿——同类配对控件两种行为。
  文件: src/components/DeferredInput.tsx L37-40、inspector/MapInspector.tsx L57-64、CanvasInspector.tsx L20-27、CardsInspector.tsx L39-49、TextInspector.tsx L14-19、AssetInspector.tsx L6-32、ProvinceInspector.tsx L266-270

- **P1-3【改了不生效/配对不一致】四个透明度滑杆失焦才生效，且同面板另一条滑杆是即时的**
  path: 画布/卡片/嘉宾属性、地图图片设置
  复现: 选中画布 → 拖「背景透明度」滑块 → 画布毫无反应也无数值回显，点击面板空白处才突变生效。
  Given `canvas-background-opacity`、`cards-opacity`、`guests-opacity`、`map-image-opacity` 都是 `DeferredInput type="range"`（blur 才 commit）；When 用户拖动；Then 违反 frontUI2 §4.3「滑杆立即生效」；同一 MapInspector 里 `map-opacity` 却是原生 onChange 即时生效并带 % output。RangeNumberControl 滑条同为 blur 提交（数字随动、画布不动），修复时一并统一。
  文件: src/components/inspector/CanvasInspector.tsx L100-110、CardsInspector.tsx L160、GuestsInspector.tsx L118-120、MapInspector.tsx L293-304 vs L444-454、src/components/RangeNumberControl.tsx L56-61

- **P1-4【改了不生效 + 假历史】「地图显示」下拉选『上传图片地图』永远选不中，还污染撤销栈**
  path: 地图属性 → 地图显示
  复现: 矢量状态下选「上传图片地图」→ 下拉跳回「原始矢量地图」，画布不变；但 onChange 分支 `else if (kind!=="image") onPatch({renderSource:{kind:"vector"}})` 产生新对象 → applyTransaction 记一条「更新地图」并**清空 redo**。
  Given 无已上传图片；When 用户从下拉切 image；Then 唯一真实入口是下方 FileDropzone，下拉里却陈列着一个选不中的选项。建议选 image 时聚焦/高亮上传框，或无图时禁用该 option。注意需同步改 InspectorPanel.test.tsx L69-77。
  文件: src/components/inspector/MapInspector.tsx L393-401、src/lib/project-document.ts L250-284

- **P1-5【改了不生效】内容阶段「字体排版 → 省份名称」省份下拉为空，单省应用写进空键**
  path: 内容阶段右栏 → 折叠区「字体排版」→ 省份名称
  复现: 进内容阶段 → 展开「字体排版」→ 省份 select 一个选项都没有；不勾「应用到全部」换字体 → applyTypographyFont 写 `provinceStyles[""]`，画布无变化、无提示。
  Given ContentLayoutRail 调 InspectorPanel 未传 `provinces`（默认 []，Legacy 路径传了 provinceNames）；When TypographyPanel 以 province="" 应用；Then 单省路径完全失效，仅「应用到全部」可用。
  文件: src/components/workspaces/ContentLayoutWorkspace.tsx L134-143、src/components/inspector/InspectorPanel.tsx L35-39、src/components/TypographyPanel.tsx L38/L110-133

- **P1-6【标签骗人】mode=global 的「重置」把面板里看不见的 placement 与手摆位置一起重置**
  path: 版式阶段右栏「重置卡片」；legacy 全局设置「地图展示框」页「重置地图」
  复现: 版式阶段（CardsInspector mode=global，placement 已按拆分意图隐藏）点「重置卡片」→ sceneResetPatch 返回整份默认 cards：x/y 回 1140/160、maxWidth/zIndex 回默认、`positions:{}` 清光所有手动摆位。legacy 全局设置地图页同理重置 x/y/宽高/scale，且该页连画布都看不到。
  Given 用户在只暴露外观字段的面板；When 点重置；Then 作用范围远超可见字段——这不是渐进披露，是按钮标签撒谎。建议按 mode 裁剪 reset patch 或在按钮文案/确认里说明范围。
  文件: src/lib/canvas-edit-transactions.ts L179-187、src/components/inspector/CardsInspector.tsx L139、MapInspector.tsx L254-257、src/components/editor/StageLayoutScreen.tsx L183/L263

- **P2-7【标签骗人/配对不一致】TypographyPanel「应用到全部」只约束字体族，字号/颜色永远全局**
  path: 字体排版 → 省份名称 / 特邀嘉宾
  复现: 选省份「浙江」、不勾「应用到全部」→ 改字号或颜色 → 全部省名一起变（patch 的是 map.provinceLabelTypography 全局字段）；嘉宾人员块同构（peopleTypography）。字体族倒是老实按单省/单人存储。
  Given 同一分组里并排的字体/字号/颜色三控件；When 用户以为勾选框统一管作用域；Then 三控件两种作用域且无任何提示。最小修法：把字号/颜色挪出单对象选择器分组或标注"（全部省份）"。
  文件: src/components/TypographyPanel.tsx L125/L132/L167/L175、src/lib/typography.ts L23-52

- **P2-8【真改不了（孤儿编辑器）】展示框 fixed/flow 编辑器全家无挂载点；若复挂需先修裸 input**
  path: 无（这正是问题）
  复现: DisplayFrameSubcanvas / DisplayFrameLayerList / DisplayFrameItemInspector / FlowFrameEditor 在生产代码零引用（仅测试）；`cards.displayFrame` 标 @deprecated 但 PosterCanvas L381-457 仍渲染旧工程里的 displayFrame——带旧数据的工程没有任何 UI 能编辑或移除它（只有换整体模板顺带清空）。
  Given 旧工程含 displayFrame；When 用户想调其中一个字段位置；Then 页面上真改不了。需产品决策：要么删组件收尾弃用，要么复挂。若复挂，先修：FlowFrameEditor 裸 onChange 每键即提交（每键一条历史、清空输入提交 Number("")=0、行高可提交 0），DisplayFrameItemInspector 的 onCommit 无 isFinite/min 守卫——均与 DeferredInput 家族约定不一致。
  文件: src/components/workspaces/FlowFrameEditor.tsx L39-41、DisplayFrameItemInspector.tsx L41-48、DisplayFrameLayerList.tsx、DisplayFrameSubcanvas.tsx、src/components/canvas/PosterCanvas.tsx L381-457

assumptions:
- legacyEditorEnabled 默认关闭（localStorage `cengfan-legacy-editor`≠"1"），因此 GlobalSettingsScreen 及其 guests/typography/advanced 分区视为 legacy-only 面；涉及它们的缺陷按默认路径可达性降级。
- mode=global / layoutOnly 隐藏 placement 是有意拆分（任务书明示），本报告不建议把 map/cards/guests 的 x/y 塞回全局面板；P1-6 针对的是 reset 越权，不是隐藏本身。
- P0-1 判 P0 依据：字段仍被渲染与 AI 消费、且 frontUI2 §4.1 L3 明列"自定义表达式和姓名脱敏模板"应经"高级设置"可达（渐进披露≠不可达）。

do_not_touch:
- 业务文件（本轮只读，仅新增本报告）。
- cursor/fix-advanced-settings-editable-05ab 已修项：mapBoundaryMargin 全局可见、safeMargin 上限、summary list-item——本报告未重提。
- 不合并该分支、不合 main。

next:
- 建议落地顺序：P0-1（给 CardPresentationSettings 在默认路径找归属，候选：版式阶段 CardsInspector 高级折叠区或内容阶段）→ P1-2 + P1-3（同一控件族，统一 clamp/回写 + 滑杆即时提交，一个 PR）→ P1-4（连同 InspectorPanel.test 断言更新）→ P1-5（ContentLayoutRail 补 provinces 一行 + TypographyPanel 空列表兜底）→ P1-6（sceneResetPatch 按 mode 裁剪）→ P2-7/P2-8（P2-8 先要产品决策删或挂）。
- P1-2/3 修复后建议补一条 DeferredInput 行为规格测试（越界回写、range 即时提交），防止回归。
