# Cycle 1 Round 1 — fable-B：展示框（display frame）样式 SOTA 审计

**模型:** `claude-fable-5-thinking-xhigh` ｜ **分支:** `cursor/canvas-render-display-46a1` ｜ **范围:** 只读审计，无生产代码改动。

## 0. 审计范围与工作树快照

审计对象覆盖两条渲染路径与一条编辑路径：

1. **画布目的地卡片**：`PosterCanvas.tsx` 中 `data-display-frame-surface` 周边（约 1131–1212 行）+ `renderDisplayFrameItem`（176–203 行）+ `renderReferenceCardVisual`（270–357 行）。
2. **展示框工作台编辑器**：`DisplayFrameSubcanvas.tsx` / `DisplayFrameItemInspector.tsx` / `DisplayFrameLayerList.tsx` / `FlowFrameEditor.tsx` / `ReferenceCardStyleWorkspace.tsx`。
3. **数据模型**：`src/lib/display-frame.ts`、`src/lib/card-templates.ts`、`scene-document.ts:CardSettings`。

审计时并发子代理已在工作树留下未提交改动（需在后续轮次协调，不视为 HEAD 基线）：

- 新建 `src/lib/display-frame-style.ts`（+测试）：`resolveDisplayFrameSurface` / `resolveDisplayFrameItemPaint` 等纯函数 token 解析层——**这正是本审计第 5 节建议的核心构件，但 PosterCanvas 与 Subcanvas 目前均未消费它**。
- `display-frame.ts:normalizeItemStyle` 新增 `opacity` 字段（渲染路径尚无消费者）。
- `DisplayFrameSubcanvas.tsx` 引入本地 RAF 拖拽预览（已验证存在）。
- gpt-sol 侧新增 `PosterCanvas.boundary.test.tsx`、`display-frame.boundary.test.ts`、`canvas-render-metrics.ts` 等探针。

### 关键架构事实（后续所有结论的前提）

**展示框工作台是"孤儿"代码。** `DisplayFrameSubcanvas`、`DisplayFrameItemInspector`、`DisplayFrameLayerList`、`FlowFrameEditor` 四个组件没有任何生产代码 import（仅测试引用）。"展示框样式" stage 实际挂载的是 `ReferenceCardStyleWorkspace` + `CardsInspector`（`App.tsx:1726-1750`）。`scene-document.ts:197` 已把 `CardSettings.displayFrame` 标注 `@deprecated`，而 `App.test.tsx:1119` 显式断言 `.display-frame-workspace__header` 不出现在该 stage——旧工作台是**有意下线**的。但 `PosterCanvas` 的渲染路径仍完整支持 `displayFrame`（fixed/flow 双模式、自定义文字/装饰项），`styles.css:3102-3167` 约 66 行工作台 CSS + `styles.css:3041-3098` 的 atelier 皮肤覆盖也全部保留。**"编辑器已死、渲染器还活着、样式表还在"的三方脱节是本模块最大的架构债**，Round 2 必须先做去留决策（见第 6 节 P0-3）。

---

## 1. 样式 token 模型：定义 vs 画布实渲 vs 编辑器预览

`DisplayFrameStyle`（`display-frame.ts:9-21`）+ `DisplayFrameItemStyle`（`display-frame.ts:23-31`）名义上是卡面 token 层，实际消费情况如下：

| Token | 定义/归一化 | 画布消费（PosterCanvas） | 子画布消费（Subcanvas） | 结论 |
| --- | --- | --- | --- | --- |
| `background` | `normalizeStyle`:147 | `:1137` `style.background \|\| cards.background`（normalize 后 fallback 是死分支） | `:152` 直接用 | 一致 |
| `opacity` | `:148` clamp 0–1 | `:1138` `?? cards.opacity`（同为死分支） | `:153` | 一致 |
| `borderColor/Width` | `:152-153` | `:1139-1140`，**borderless preset 强制 none** | `:154-155`，无 preset 覆盖 | 子画布失真 |
| `borderRadius` | `:154` clamp 0–120 | `:1136`，**被 preset 硬编码覆盖：ticket→12、borderless→0** | `:151` 永远用原值 | 子画布失真 |
| `padding` | `:149` | **仅 flow 模式**作 `horizontalPadding`（`:688-690`）；fixed 模式被 name item 的 `x` 顶替 | 不消费 | 语义漂移 |
| `margin` | `:150`，derive 时来自 `cards.gap`（`:224`） | **无消费者** | 无 | **死 token** |
| `align` | `:151` | 字段行**从不消费**（行文本永远左锚于 `frameBodyItem.x`）；仅自定义 text item 经 `frameTextAnchor`:164 生效 | 仅作 item align 的 fallback | 语义漂移 |
| `fontSize/color/fontId` | `:145-157` | 字段行走 `fieldTypography`/`fieldFonts` 优先链（`:1163-1207`），frame token 只是末位 fallback | `:159-161` 直接用（**不解析 fontId**） | 双端 fallback 链不同 |
| `fieldOrder` | `normalizeFieldOrder`:136 | **渲染无消费者**（只在 derive/normalize 间往返） | 无 | **死 token** |
| item `opacity`（新增） | 工作树 diff | 无 | 无 | 待接线 |

另有一条**隐式耦合**：fixed 模式下 `horizontalPadding = frameBodyItem?.x ?? cards.horizontalPadding ?? cards.padding`（`PosterCanvas.tsx:688-690`），而该值同时决定 `preparedCards` 的换行宽度 `contentWidth`（`:699`）、divider 的 x 范围（`:1172`）、count 文本的右锚（`:1171`）。即**在子画布里把"姓名"项往右拖 = 收窄全卡换行宽度 + 移动分隔线与人数**，用户不可能预期到。token 系统若重建，必须把"卡面内边距"与"name 项局部坐标"解耦。

魔数清单（应升为 token 的硬编码）：header 高 `44`（`destinationHeight`:160-162）、divider `y=30+headerExtra`（`:1172`）、count `y=22`（`:1171`）、title 默认 `y=12`（`:1164`）、ticket accent 条宽 `8` / 打孔圆 `(w-18,18) r7 α.2`（`:1156`）、photo 头像 `r13 @ (hp+13,21)`、首字 `fontSize 11`（`:1157`）、photo/贴图偏移 `+32/+36`（`:1147,1163`）、省份贴图 `30×30 @ y=3`（`:1147-1150`）、borderless 连接线隐藏阈值 `opacity<0.9`（`:1000`）。

---

## 2. 视觉不一致清单

### 2.1 fixed vs flow 模式

- **flow 的 `order` 对渲染零效果。** `flowContentStart`（`PosterCanvas.tsx:682-684`）是对全部 block 的无序求和，`flowBlockFor`（`:677`）按 field 查找，两处都与 order 无关。`FlowFrameEditor.tsx:24` 的"顺序"输入框只改变编辑器内预览 pill 的排序，画布字段顺序纹丝不动——控件事实性失效。
- **flow 正文起点双重计入标题高度。** `flowContentStart` 已含 title block 的 `spacing + fontSize*lineHeight`，正文 y 又加 `+ flowTitleFontSize + 8`（`:1186`），且 university/city block 的高度也被计入起点（尽管正文行是按学生行流式排布、并不按 block 分段）。结果：flow 模式正文显著下沉。
- **卡高不感知 frame 布局。** `destinationHeight` 固定 `44` 头部常量，对 fixed 模式的 `frameBodyItem.y`（可被拖到 100+）和 flow 模式的下沉起点均不感知 → 文本溢出 `data-display-frame-surface` 矩形底边。这是"所见非所得"类问题里最刺眼的一个。
- flow 模式每行行高 `max(16, fs+6) * block.lineHeight`（`:1183-1185`）与 fixed 模式 `max(20, fs+6) * canvas.lineHeight`（`:1174-1177`）基数不同（16 vs 18/20），同字号切换模式行距跳变。

### 2.2 ticket / photo / borderless preset

- 三个 preset 的装饰全部是内联硬编码（见第 1 节魔数清单），无法被 displayFrame token 或 CardsInspector 触达；ticket 的 `rx=12` 直接压掉用户设置的 `borderRadius`。
- photo 的 `+32` 左偏只作用于 title 与省份贴图 x（`:1147,1163`），**正文行 x 不加偏移**（`:1193` 只用 `frameBodyItem?.x ?? horizontalPadding`）→ photo 卡正文与头像重叠区依赖默认 `frameBodyItem.x=12` 恰好躲开，一旦缩小 padding 即穿模。
- borderless 在 `opacity<0.9` 时整条连接线消失（`:1000`），阈值行为无 UI 提示；divider 隐藏（`:1172` 条件），但 count 仍渲染——半透明背景上悬浮的"N 人"缺少视觉锚。

### 2.3 四个 reference presentation（color-pill / emblem-list / city-label / glass-stat）

共性问题：

- **换行被拍平（最严重的渲染缺陷）。** `textFor = row.lines.map(join).join(" ")`（`PosterCanvas.tsx:298`）把 `wrapCardText` 已算好的多行重新拼成单行 `<text>` → 长校名+多人名必然横向溢出卡宽；而卡高仍按 wrap 后行数计算（`destinationHeight`）→ **宽度溢出 + 高度虚高**双重失真。
- **fieldTypography / fieldFonts 全部失效**（fragments 的 field 信息在 `textFor` 中丢失），仅 `titleFont` 被透传。
- 各自维护私有行高 `max(17, fs+5)`（`:299`）或 `max(22, lineHeight+3)`（`:320`），既不与标准卡行高体系一致，也不乘 `canvas.lineHeight`。

个性问题：

- **color-pill**：标题 fill `#1c3154` 硬编码（`:307`）无视 `cards.textColor`；胶囊 `rx=min(28,max(18,h/3))` 不吃 `borderRadius`。
- **emblem-list**：荧光笔 `#f1c84b`、图钉 `#e24d42`、标题 `#263b78` 三色全硬编码（`:316-318`），换深色画布背景即报废。
- **city-label**：白描边 `strokeWidth 2.5` 硬编码（`:331`）；accent 依赖 `referenceCardColor` 哈希（`:254-260`），除省份 manual-color 外用户无法指定。
- **glass-stat**：`fillOpacity=clamp(opacity, 0.55, 0.9)`（`:344`）——用户把透明度拉到 0.2 实渲 0.55，CardsInspector 滑杆区间大半无效；`rx=4` 与标准卡 `6` 不一致。

### 2.4 模板状态 bug（P0）

`applyCardTemplate`（`card-templates.ts:128-136`）返回 `{...template.cards, templateId, displayFrame: undefined}`，而 standard/ticket/photo/borderless/compact 五个模板的 `cards` **均未定义 `presentation`** → patch 合并后旧值保留。复现：应用"彩色胶囊省份卡"再从 `CardsInspector` 切"标准毕业去向表"，`cards.presentation` 仍为 `color-pill`，画布继续走 `renderReferenceCardVisual`（`PosterCanvas.tsx:1116` 判定 `presentation !== "standard"`）。副作用：`ReferenceCardStyleWorkspace.tsx:30` 的 `selected = templateId匹配 || presentation匹配` 会同时高亮两个选项。修复只需给非 reference 模板补 `presentation: "standard"`（或在 `applyCardTemplate` 兜底），不破坏任何现有测试。

---

## 3. 子画布预览保真度 vs 最终卡片

`DisplayFrameSubcanvas` 是固定 `240×160` 的抽象预览（`:4-5`），与真卡的差距分五档：

1. **坐标系失配**：真卡宽 = `cards.maxWidth`（模板 200–260 不等），高度随行数动态；子画布无缩放映射，item 拖到 x=220 在 210 宽的真卡上直接出界，且用户看不到出界。
2. **字段项几何半失效**：子画布允许拖动全部 4 个 field item，但画布只消费 `id==="title"` 与 `id==="name"` 两项的 x/y（`PosterCanvas.tsx:674-675`）；"院校/城市"项拖动后画布毫无反应（正文行按 rowHeight 流式排布）。这是编辑器承诺与渲染器能力的直接矛盾。
3. **preset/presentation 完全缺席**：子画布不渲染 ticket 色条、photo 头像、省份贴图、count、divider；`presentation !== "standard"` 时真卡整体切换到 `renderReferenceCardVisual`，子画布预览与真卡毫无关系。
4. **文本保真**：不解析 `fontId`（真卡走 `resolveFontFamily`）、预览文案硬编码（`itemPreview`:15-20 的"北京市/林舟/北京大学"），不用项目真实数据。
5. **表面细节**：surface `rx` 不含 preset 覆盖；子画布用 `x=0.5` hairline 对齐技巧（`:147-148`）而真卡不用——两端描边渲染策略相反。

正面资产：两端的 text anchor / baseline 公式目前逐字一致（`frameTextX`/`frameTextAnchor` vs `itemTextX`/`itemTextAnchor`；baseline 均为 `y + min(height, fontSize)`），并发新建的 `display-frame-style.ts:displayFrameTextX/displayFrameTextBaseline` 已把它们抽成单一实现——**Round 2 让双端 import 同一模块即可把"逐字一致"升级为"结构一致"**。

---

## 4. 交互质量（RAF 拖拽之后的剩余问题）

- **resize 未 RAF 化**：`moveItem` 的 resize 分支每个 pointermove 直接 `onChangeItem`（`DisplayFrameSubcanvas.tsx:86-89`）→ 每事件一次 React 全量 commit，与刚修复的 move 路径形成新旧对照；且 `Math.round(originWidth + dx)` 可为负，瞬态负宽 rect 在 SVG 中非法（依赖后续 normalize 兜底，但预览帧已经画出去了）。
- **endMove 靠正则回读 transform**（`:113-119`）恢复最终坐标，脆弱且已有承认失效场景的死代码注释块（`:122-126`）；应在 ref 中直跟最后坐标。
- **键盘可达性**：item 可聚焦并 Enter/Space 选中（`:167-176`，好），但无方向键 nudge 移动/缩放；resize handle 完全键盘不可达；`aria-live` 状态行已有（`:211-213`，好）。
- **hit-testing**：line 装饰 height=1，hit-area `max(height,12)` 从 `item.y` 向下延伸（`:191`）——命中区不以线为中心，线上方 1px 内点不中；建议 `y - max(0,(12-height)/2)` 居中。
- **无吸附/参考线**：主画布有网格（`PosterCanvas.tsx:1559-1583`），子画布无网格、无对齐线、无等距提示。
- **主画布卡拖**：`clampDestinationCardPosition` 带省界多边形碰撞，逐 pointermove 执行（`:1083-1097`）而预览绘制才走 RAF 合并——碰撞计算应一并挪进 `scheduleCanvasPreview` 回调（`CanvasDragPreview.tsx:24-48` 已具备 pending 合并语义，改动面小）。
- **卡层 a11y**：`data-cards-layer` 有 `role="button"`（`:959`）但无 `tabIndex`/`aria-label`；单卡 `<g>` 可拖不可聚焦，键盘用户无法移卡（嘉宾面板反而做了 `tabIndex+aria-label`，`:1233-1235`，可对照补齐）。

---

## 5. SOTA 展示卡样式系统（目标形态）

1. **三层 token 架构**：
   - L1 设计 token（`src/lib` 常量）：type scale（如 11/12/14/17/20 模块化阶梯，替代散落的 `+5/+8/+2`）、spacing 阶梯、radius 阶梯（4/6/12）、stroke 阶梯（hairline 0.75 / regular 1 / bold 1.5）。
   - L2 卡面语义 token：`surface{fill,tint,texture}` / `border` / `title` / `body` / `heading(city)` / `accent` / `divider` / `count`，由 preset 与 presentation 以**声明式覆盖表**生成，而非 JSX 内联三元。
   - L3 per-item override：现有 `DisplayFrameItemStyle`。
   - 解析层唯一入口 = 已存在的 `display-frame-style.ts`（`resolveDisplayFrameSurface`/`resolveDisplayFrameItemPaint`），PosterCanvas、Subcanvas、未来的模板缩略图三端共同消费。
2. **单一布局引擎**：把 header 行、divider、正文行、count 的几何（含 `destinationHeight`）抽为 `src/lib` 纯函数（符合 AGENTS.md"地图与布局逻辑在 src/lib 纯函数中可测"），卡高由布局输出导出——同一份布局喂画布渲染与子画布预览，第 3 节的 1/2/3 档失真自然消失。
3. **分层填充与光学细节**：surface = base fill + 可选 accent tint（presentation 用）+ 可选贴图层；标题基线按 cap-height 光学对齐（当前 `y + min(h, fontSize)` 是近似，字号大时下坠）；divider/border 用 0.5 对齐 + 按导出 `pngScale` 归一的 hairline 策略（现状：屏显子画布有 0.5 技巧、导出卡没有，1px 边框在 3x PNG 下变 3px 实线，失去 hairline 质感——可在导出分支按 scale 折算 strokeWidth 或用 `vector-effect`，需先验证像素锁定测试容忍度）。
4. **presentation 渲染器 token 化**：accent 显式可配（fallback 才走哈希）；body 行复用标准 wrap 行渲染管线（保留 field fragments），emblem/pill/label 只做装饰层差异。

---

## 6. 样式/渲染 backlog（按优先级排序，供 Round 2/3 认领）

| # | 条目 | 归属（按 PROGRESS 所有权） | 依据 |
| --- | --- | --- | --- |
| P0-1 | 非 reference 模板补 `presentation: "standard"`，修"切回标准仍渲染 pill"| opus-fast-B（card-templates） | §2.4 |
| P0-2 | reference presentation 改用 wrap 后逐行渲染，消除横向溢出 | opus-fast-A（PosterCanvas） | §2.3 |
| P0-3 | **决策**：展示框工作台重挂载 or 删除孤儿组件+66 行死 CSS+atelier 覆盖（`App.test.tsx:1119` 锁定现状，重挂载需改测试） | 主调度器裁决 | §0 |
| P1-1 | PosterCanvas + Subcanvas 双端接入 `display-frame-style.ts` 解析层 | opus-fast-A/B 协同 | §3、§5.1 |
| P1-2 | 卡片布局几何纯函数化，`destinationHeight` 感知 frame 起点；顺带消除 44/30/22/12 魔数 | opus-fast-A | §2.1 |
| P1-3 | flow 模式修复：正文起点去重复计入、`order` 真正参与字段排序（或删除该控件） | opus-fast-B | §2.1 |
| P2-1 | glass-stat 尊重用户 opacity；presentation accent 可配置 | opus-fast-A | §2.3 |
| P2-2 | 子画布按 `maxWidth`/实卡高做等比映射 + preset/贴图装饰预览 + 真数据文案 | opus-fast-B | §3 |
| P2-3 | resize RAF 化 + 负值 clamp；endMove 去正则化 | opus-fast-B | §4 |
| P2-4 | photo 正文行 x 加 `+32` 偏移对齐（与 title 一致） | opus-fast-A | §2.2 |
| P3-1 | 键盘 nudge（方向键 ±1/Shift±10）、resize 键盘可达、卡层 tabIndex | opus-fast-B | §4 |
| P3-2 | 子画布网格/吸附/对齐参考线；line hit-area 居中 | opus-fast-B | §4 |
| P3-3 | type scale / spacing / radius / stroke 设计 token 落地 | fable 定标准，opus 落地 | §5.1 |
| P3-4 | hairline 导出 scale 策略（需先加渲染基准/快照护栏） | gpt-sol 建护栏 → opus 实施 | §5.3 |
| P3-5 | 清理死 token（`margin`/`fieldOrder`）或给出消费者——二选一，禁止悬空 | opus-fast-B | §1 |

主画布卡拖碰撞下放 RAF（§4）建议并入 fable-A 的 canvas 管线轮次，避免与本清单重叠。

## 7. 不可破坏项（本轮及后续轮次红线）

1. **持久化 schema**：`CardSettings` 与 `DisplayFrameDefinition` 的序列化形状不得变；`displayFrame` 保持 optional + deprecated——存在则 `normalizeDisplayFrame` 往返保真（`scene-document.ts:642-644`），缺失则**不得**物化写回（`display-frame.test.ts:83-97`、`display-frame.boundary.test.ts:121-129` 锁定 `undefined` 语义）。
2. **归一化边界与默认值**：fontSize clamp 8–240、padding/margin 0–120、zIndex ±1000、lineHeight 0.8–2.5，及默认 `{fontSize:12, color:"#1c3154", background:"#ffffff", padding:12, align:"left", borderRadius:6}`——`display-frame.test.ts` 全量锁定。
3. **渲染双分支**：`displayFrame === undefined ? deriveFixedDisplayFrameFromCardSettings : normalizeDisplayFrame`（`PosterCanvas.tsx:667-672`）；derive 不得引入最终卡位（测试断言序列化不含 positions 值）。
4. **DOM 测试锚点**：`data-display-frame-surface/-mode/-text/-decoration`、`data-card-visual`、`data-card-presentation`、`data-destination-card`、`data-card-title-line`、`data-card-row-line`、`data-city-section`、`data-destination-connector`、`data-card-accent`、`data-card-avatar`、`data-card-province-texture` 属性名与挂载元素类型（如 line/rect）不得变。
5. **导出像素锁**：`PosterCanvas.test.tsx:430-441`（自定义 frame stroke `#123456`/width 3）、`PosterCanvas.boundary.test.tsx:190-192`（fill-opacity 0、字号 8/240 极值）、`PosterCanvas.reference-styles.test.tsx`（四 presentation 经真实 SVG 渲染）。既有模板的导出观感变化必须先扩测试再改渲染（AGENTS.md 验证纪律：failure→cause→fix→recheck）。
6. **模板应用契约**：`applyCardTemplate` 必须继续返回 `displayFrame: undefined`（`ReferenceCardStyleWorkspace.test.tsx:24-29` 锁定）。
7. **阶段挂载现状**：`App.test.tsx:1116-1121` 锁定"展示框样式" stage = `main[aria-label="展示框样式"]` + 无旧 workbench header + 右栏"展示框公共样式"——P0-3 若选择重挂载，测试改动须与实现同 PR 并在报告中记录回滚方案。
8. **许可证边界**：AGPL-3.0-only，不引入支付/套餐/模板手续费结算。

---

*验收方式：本轮交付为审计文档（本文件），无生产代码改动，无需 CI；结论均附 file:line 证据，Round 2 认领人可直接复核。*
