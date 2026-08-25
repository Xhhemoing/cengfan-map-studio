# Cycle 1 Round 2 — fable-A：当前 HEAD 重审计（SOTA re-audit）

- 执行者：fable-A（模型 `claude-fable-5-thinking-xhigh`）
- 审计对象：分支 `cursor/canvas-render-display-46a1`，**commit `3dc2684`**（下文"HEAD 行号"均锚定此提交）
- 范围：只读审计，不改 `src/**`，不提交
- ⚠️ **并发实况**：审计期间（16:23–16:35 UTC）工作树被 Round 2 并行 agent 实时写入。已观测到的在途改动：opus-A（`App.tsx` 回调稳定化、`useCardLayoutWorker.ts` SWR、`PosterCanvas.tsx` layout memo 依赖收窄）、opus-B（`ReferenceCardVisual.tsx` 新建、`DestinationCard.tsx` 接入解析层、`card-templates.ts` presentation 复位）、gpt-sol-A（渲染挂载基准）、gpt-sol-B（3 个 P0 回归测试，已出报告）。本文所有"在途"条目落地前需由集成者重跑全量验证，与本文结论去重。
- 遵守 P1-2 裁决：不复活 `.display-frame-workspace` 编辑台，渲染器 + `display-frame-style.ts` 解析层继续服务数据与参考样式台。

---

## 1. Round 1 backlog：HEAD 已落地 vs 仍开放

### 1.1 HEAD 已落地（commit `44312ea` + `72dce16`）

| 条目 | 证据 |
|---|---|
| `memo(DestinationCard)` 抽取（P1-7 主体） | `DestinationCard.tsx:DestinationCard`（227 行，memo 包装）；`DestinationCard.test.tsx` 3 条契约测试含"同身份 props 跳过重渲染" |
| `cardStyle` 聚合 memo | `PosterCanvas.tsx:640-700`（HEAD）`DestinationCardStyle` 单对象，依赖收窄到具体字段 |
| `displayFrame` 依赖收窄（Round 1 backlog P0-3） | `PosterCanvas.tsx:613-634`（HEAD）依赖 11 个具体 `project.cards.*` 字段。字段清单与 `display-frame.ts:deriveFixedDisplayFrameFromCardSettings` 读取集核对一致（background/fontSize/textColor/opacity/padding/gap/maxWidth/visibleFields/fieldFonts/fieldTypography + displayFrame 本体） |
| 卡片 pointer handler 稳定化 | `PosterCanvas.tsx:910-998`（HEAD）`cardsByKey` Map + 四个共享 useCallback，不再每卡四闭包 |
| 渲染计数测试升级 | `PosterCanvas.performance.test.tsx:73-107`：无关 state（showGrid/selectedTextId）与单卡位置提交均不触发卡体重渲染 |
| `display-frame-style.ts` 解析层 + 测试 | 存在且有 158 行测试；**但 HEAD 上 `DestinationCard` 尚未消费它**（P1-1 开放，见 1.2） |
| perf:canvas 基线 | `scripts/perf-canvas-bench.ts`（HEAD 版 92 行，纯函数基准） |
| 边界测试 | `PosterCanvas.boundary.test.tsx`、`display-frame.boundary.test.ts` 等，HEAD 全绿 |

**HEAD 测试证据**：在 `git worktree`（`3dc2684` 干净快照 + 共享 node_modules）跑 `npx vitest run src/components/canvas src/lib/display-frame.boundary.test.ts src/lib/display-frame-style.test.ts src/lib/canvas-render-metrics.test.ts` → **19 文件 / 155 测试全过**（10.3s）。HEAD 无红。

### 1.2 HEAD 仍开放 → 其中在途的

| ID（结论简报编号） | HEAD 现状 | 在途状态（审计时刻工作树） |
|---|---|---|
| **P0-1 App 回调击穿** | 完全开放：`App.tsx:2338-2393` 全内联闭包；`App.tsx:611 commitProject`、`687 maybeSnap`、`717 captureCardPositions`、`1014 handleLegacySceneSelect` 均非 useCallback | ⚠️在途（opus-A）：latest-ref 模式，`canvasCallbacksRef` + 9 个 `handleCanvas*` useCallback，三处 PosterCanvas 接线全换。**但 `memo(PosterCanvas)` 不在在途改动里**——回调稳定后四层 memo 生效，PosterCanvas 1470 行组件体仍每次 App 渲染重跑（见第 2 节） |
| **P0-2 布局 pending 闪烁** | 开放：`useCardLayoutWorker.ts:115` `result: null`；`PosterCanvas.tsx:851`（HEAD）空数组分支 | ⚠️在途（opus-A）：`setState((previous) => ({...result: previous.result, pending: true}))` + 返回值三分支保旧布局。jsdom 同步解算路径（`resolved` 分支）保留，测试地基未动。gpt-sol-B 的 `useCardLayoutWorker.stale.test.tsx` 锁行为 |
| **P0-3 presentation 不复位** | 开放：`card-templates.ts:applyCardTemplate`（HEAD 128-136）只显式重置 `displayFrame`，不写 `presentation` | ⚠️在途（opus-B）：`presentation: template.cards.presentation ?? "standard"`。gpt-sol-B 的 `card-templates.presentation.test.ts` 锁行为（审计中亲历该测试从 9 failed → 修复落入的写入竞态） |
| **P0-4 reference 多行拍单行** | 开放：`PosterCanvas.tsx:244`（HEAD）`textFor` 仍 `lines.join(" ")` | ⚠️在途（opus-B）：`ReferenceCardVisual.tsx:referenceRowLines` 按 `wrapCardText` 行数逐行 `<text>`，与 `destinationHeight` 的行数口径终于一致；`ReferenceCardVisual.round2.test.tsx` 锁行为 |
| **P1-1 DestinationCard 未接解析层** | 开放：HEAD `DestinationCard.tsx:77-116` 自带 `frameTextAnchor/frameTextX/renderDisplayFrameItem` 三份平行实现 | ⚠️在途（opus-B）：改用 `resolveDisplayFrameSurface/resolveDisplayFrameItemPaint/displayFrameTextX/displayFrameTextBaseline/displayFrameFontWeightValue`，双端对齐 |
| **P1-3 ReferenceCardVisual 抽取** | 开放：HEAD `renderReferenceCardVisual` 内联（216-303） | ⚠️在途（opus-B）：`ReferenceCardVisual.tsx` 169 行独立 memo 组件已建，PosterCanvas 相应 -105 行 |
| **P2 polygon memo 依赖** | 开放：HEAD `PosterCanvas.tsx:501-527` `provincePolygons` 依赖整个 `project.map` | ⚠️在途（opus-A）：依赖已收窄到 `provinceStyles/renderSource/scale/x/y/width/height` 等具体字段 |
| **渲染挂载基准** | HEAD 仅纯函数基准 | ⚠️在途（gpt-sol-A，已出报告）：`posterCanvasMount/SelectedTextRerender/CardPositionRerender` 三探针。关键数字：24 组 warm 挂载 114.8ms；selectedText 切换重渲染 **3.9ms**；单卡位移 3.6ms（jsdom 量纲） |

### 1.3 仍开放且**本轮无人认领**（Round 3 候选池）

| ID | 内容 | HEAD 证据 |
|---|---|---|
| A | **`memo(PosterCanvas)` 缺失**——P0-1 的另一半 | 工作树在途版仍是 `export function PosterCanvas`（无 memo）。回调稳定后此项才有意义，现在正是时机 |
| B（P1-4） | MapLayer 每渲染重建投影 + path 每 feature 序列化 5–8 次；两套 south-china-sea split 并存 | `MapLayer.tsx:270-273` 组件体内 `geoMercator().fitExtent`；`MapLayer.tsx:56-71 splitCache` vs `PosterCanvas.tsx:38-40` 模块常量 |
| C（P1-5） | `preparedCards` 文本排版仍耦合 `project.map.x/y/scale`，地图平移全量重跑 `wrapCardText` | 工作树 `PosterCanvas.tsx:preparedCards` 依赖仍含 `project.map.x/y/scale/width/height, projection`（opus-A 在途改动未拆此项） |
| D（P1-6 修正） | **更正 Round 1 结论**：`card-layout-cache.ts:32 serializedPolygons` WeakMap 早在 `8d840dd` 就存在，polygon 段序列化按数组身份记忆——"每次 commit 照付 1–3ms"仅在 polygons 身份变化时成立。opus-A 在途的依赖收窄落地后，纯配色编辑不再换身份，此项残余成本大幅缩小。Round 3 只需评估 cards/occupiedAreas 段 stringify（量级小），**不必再做短哈希改造** | `card-layout-cache.ts:34-40` |
| E（P2-8） | MapDataLayer 纹理拖拽每 pointermove 直接 setState，不走 CanvasDragPreview 调度 | `MapDataLayer.tsx:427-435` |
| F（P2-9） | TextLayer 拖拽无实时预览 | `TextLayer.tsx:82-90` 仍只置 moved。**注意**：main 分支 `96d3302 fix(canvas): 文本拖拽期间用 transform 做实时预览` 已修同一问题——Round 3 应优先 cherry-pick/对齐而非重写，避免未来合并冲突 |
| G（7.1） | 导出契约集成测试缺失：`export-poster.test.ts` 用合成 DOM，从未渲染真实 PosterCanvas → serialize → 断言选择器 | `export-poster.test.ts:9-50` |
| H（7.2） | 悬挂预览属性：拖回原位时 React vdom 与 DOM 失同步，导出错位 | `PosterCanvas.tsx:983-989`（HEAD）pointerup 未强制复位属性 |
| I（7.3） | defs id 无实例前缀（`guest-avatar-clip-*`、`map-image-clip`、connector filter） | 同 Round 1，未动 |
| J（新增） | connector ink 滤镜 `feTurbulence` 未固定 seed（`MapDataLayer.tsx:307` 固定了，连接线没有） | `PosterCanvas.tsx:1075-1078`（HEAD） |
| K（P3-12） | 拖拽每帧 `querySelectorAll("path")` | `PosterCanvas.tsx:441`（HEAD） |
| L（P3-11） | 求解器增量化（manual 卡剔除出 solver 输入） | 未动；gpt-sol-A 基线 `solveCardLayout(60)=65.8ms` 与 Round 1 持平，仍是最大热点 |

---

## 2. DestinationCard memo 在"App 传新鲜闭包"下是否真有效 —— **有效，且有测试佐证；被击穿的是另外四层**

结论先行：**HEAD 上 App 每次渲染新建闭包并不会击穿 `DestinationCard` 的 memo**。机制：

1. **回调从不进入 DestinationCard 的 props**。其 props 只有 `style/group/province/rows/titleLines/headerExtra/width/height/provinceTexture`（`PosterCanvas.tsx:1174-1184`，HEAD）。拖拽 handler（`handleCardPointerDown` 等）挂在**外层宿主元素** `<g data-destination-card>`（1147-1156）上——宿主元素的 prop 变化只是 DOM 事件绑定替换，不会触发子 memo 组件重渲染。`handleCardPointerUp` 依赖 `onMoveCard`（989）身份漂移，代价止步于宿主属性 diff。
2. **props 身份链条闭合**。App 无关 state 变更时 `renderProject`（`App.tsx:415` useMemo）身份不变 → PosterCanvas 重跑但 `displayFrame`（613）→ `frameBodyItem`（636，非 memo 但经由 displayFrame 身份传递引用稳定）→ `cardStyle`（640）→ `preparedCards`（701）→ `destinationCards`（850）逐级保持身份 → memo 命中。单卡位置提交只换 `project.cards.positions` → 仅 `destinationCards` 重算，`rows/titleLines/group` 内层引用不变。
3. **测试佐证**：`PosterCanvas.performance.test.tsx:84-103` 每次 render 都传 **新的** `onMoveCard={vi.fn()}`，卡体渲染计数仍保持 2——这正是"新鲜闭包不击穿卡 memo"的直接证据。

**真正被击穿的（HEAD）**：`selectMap/selectProvince/selectAsset/selectText`（`PosterCanvas.tsx:884-888`）useCallback 依赖 `onSelect` → App 每渲染新建 `handleLegacySceneSelect` → 四个回调全换身份 → `MemoizedMapLayer/RegionalAssetLayer/DecorationLayer/TextLayer` 每次 App 渲染全量重渲染。MapLayer 重渲染 = 重建投影 + 全省 path 序列化 5–8 次（1.3-B），这是 HEAD 上最大的无效渲染税。opus-A 在途的 latest-ref 修复正中此靶。

**两个脆弱点（Round 3 需守护）**：

- `frameBodyItem`（636）与 `horizontalPadding`（637）是渲染体内联派生，其引用稳定性**寄生于** `displayFrame` 的身份稳定。若未来有人把 displayFrame memo 依赖改宽（或 normalize 返回新对象），`cardStyle` → 全卡 memo 会静默塌方，现有测试测不到（perf 测试给 PosterCanvas 的 project 本身就是稳定的）。建议：App 集成级渲染计数测试（见 R3-1）。
- 回调稳定化后 `PosterCanvas` 未 memo 意味着每次 App 渲染仍要付：1470 行组件体、guests 层 ~262 行 vdom 重建（无 memo）、`destinationCards.map` 里 **每卡一次 `buildConnectorGeometry`**（curve 16 段采样）+ 连接线 path vdom 重建、`layerBlocks` 数组构造排序。gpt-sol-A 的 `posterCanvasSelectedTextRerender n=24 ms=3.933` 就是这笔税的 jsdom 量纲——`memo(PosterCanvas)` 后无关 state 变更应趋近 0。

---

## 3. PosterCanvas 残余体量与下一刀：**先 guests，后 connectors**

审计时刻工作树（ReferenceCardVisual 已抽出后）**1470 行**，距 400 行规范仍超 1000+。块分布（工作树行号，随在途改动漂移，仅供量级判断）：

| 块 | 行数 | 说明 |
|---|---|---|
| guests 层 JSX（`key:"guests"` 块 1106-1367） | **~262** | 完全内联、无 memo，双模式（cards/list）+ 头像 clipPath + 自定义文本 |
| guests 派生标量（`guestTitleFontSize`…`guestHeight`） | ~52 | 每渲染重算，`guestHeight` 被 `layoutOccupiedAreas` 依赖 |
| cards 层 JSX（`key:"cards"` 块 961-1105） | ~145 | connector filters defs + 每卡连接线 path/anchor + DestinationCard/ReferenceCardVisual 分发 |
| 卡拖拽 handlers + cardsByKey | ~85 | `cardDrag` ref 生命周期 |
| preparedCards/layoutRequest/destinationCards hooks | ~200 | opus-A 本轮在改 memo 依赖，勿并行动结构 |
| 投影/多边形/地图 memos + 顶层组装 | 其余 | |

**裁决：Round 3 先抽 guests**（`src/components/canvas/GuestsLayer.tsx` + `src/lib/guest-panel-layout.ts:computeGuestPanelMetrics`），理由：

1. **行数收益最大**（~310 行，一刀砍掉残余超标量的 1/3）；connectors 只有 ~230 且含 drag ref 耦合。
2. **边界最干净**：guests 层与卡布局唯一的耦合点是 `guestHeight` 标量——纯函数化后 `layoutOccupiedAreas` 直接消费返回值，语义零变化且可单测（Round 1 第 6 节方案照搬）。
3. **零冲突**：opus-A（layout hooks）与 opus-B（cards 层内部）本轮都在 PosterCanvas 的另外两个区域动刀；guests 块本轮无人触碰，合并面干净。
4. **memo 收益真实**：guests 层 props（guests 对象、metrics、edgeColor、回调）在 P0-1 落地后全部可稳定；当前它是除 MapLayer 外最后一个"每次渲染全量重建 vdom"的大层。
5. connectors 层（`DestinationCardsLayer`）**其次**：它的 memo 有效性同样依赖 P0-1 落地，且抽取时要一并处理 `cardDrag`/`cardsByKey`/preview scheduler 的归属与 `connectorPathToCenter` 归位 `connector-geometry.ts`——工作量更高、风险更高，放 Round 3 后半或 Round 4，抽取时同步解决 buildConnectorGeometry 的每渲染重算（memo 层级挡掉即可，无需缓存几何本身）。

导出契约约束（两刀通用）：`data-guests-layer/data-guest-*`、`data-destination-card/-connector/-anchor` 的**属性名与嵌套层级冻结**；`guest-avatar-clip-${id}` defs 留在层内移动无害（id 全局性问题见 1.3-I，另行处理）。

---

## 4. 本轮改动的导出 DOM 契约风险清单

导出链 = `export-poster.ts:serializePosterSvg` 克隆活 DOM，逐条对照本轮在途改动：

1. **ReferenceCardVisual 逐行渲染（P0-4 修复）**：reference 卡的 `<text>` 节点数从每行 1 个变为每换行 1 个，并**新增** `data-card-row-line` 属性到四种 reference 变体。serializePosterSvg 的剥除选择器不涉及该属性 → 纯增量，安全。但任何"每 row 单 text"的既有断言会红——`PosterCanvas.reference-styles.test.tsx`（HEAD 绿）必须在 opus-B 落地后复跑。视觉上多行卡不再横向溢出，glass-stat 高度虚高同步消失；color-pill/emblem/city-label 过滤 cityHeading 行导致的"卡略高于内容"是**既有**残留，非本轮回归。
2. **presentation 显式写入（P0-3 修复）**：patch 从"缺省字段"变为写 `presentation:"standard"` 进 `CardSettings`——这是**存量数据形状变更**（交付纪律要求回滚方案）：旧文档 `presentation === undefined` 与新文档 `"standard"` 必须处处等价。已核 `PosterCanvas.tsx:1151`（HEAD）`data-card-presentation={presentation ?? "standard"}` 导出属性值不变；`ReferenceCardStyleWorkspace` 选中态按 `?? "standard"` 比较不受影响。**回滚方案**：该字段可选，revert `applyCardTemplate` 即回旧行为，已写入的 `"standard"` 是合法枚举值，旧代码路径 `!== "standard"` 判断兼容。剩余核查点交 opus-B：协作 merge/digest 是否有对 `cards` 做 deep-equal 的路径会把 undefined→"standard" 误判为冲突。
3. **SWR（P0-2）不污染导出**：`DeliveryWorkspace.tsx:141` 独立挂 `<PosterCanvas exportMode>` → `forceSync` 渲染期同步解算，导出永远拿新鲜布局。反而**修复**了旧行为的一个隐患：以前编辑画布 pending 期间 cards 层整层为空，此刻若有旁路截图/序列化会丢全部卡片。遗留：切到交付工作台时 key 未命中缓存会同步解算阻塞主线程（Round 1 2.2，未变）。
4. **SWR 两个瞬时态（可接受，需知晓）**：① pending 期 `destinationCards` 用旧 placements 合并新 `preparedCards`——新增省份的卡在解算完成前缺席（flatMap 跳过无 placement 的卡，不会闪 (0,0)，符合 Round 1 7.7 预案）；② 旧 placement 的 width/height 与新 rows 短暂不匹配（如字号变更触发的重解），表面盒与文字尺寸瞬时错位，解算落地自愈。均不入导出（见 3）。
5. **`onCardPositionsResolved` pending 期上报旧位置**：`PosterCanvas.tsx:769-772`（工作树）无 `layoutState.pending` 守卫，SWR 后 pending 期会把上一 key 的 placements 报给 `App.tsx:captureCardPositions` → `freezeCardPositionsForMapChange` 可能把旧布局固化进 `cards.positions`。语义上这恰是"冻结用户当下所见"（WYSIWYG），**不算 bug**，但新增省份缺席上报会让 freeze 漏卡。列为 Round 3 审阅项（一行守卫或按语义保留并写测试注记）。
6. **DestinationCard 接解析层（P1-1）**：导出字节级变化——`fontWeight` 从"缺省不写"变为显式 `400`，新增 `opacity="1"`。视觉等价，但任何精确字符串快照/属性缺省断言会红；`DestinationCard.test.tsx` 现有断言不受影响（查过，断言的是 y/fill/stroke/textContent）。双端（画布 vs 子画布）字重/字号/对齐从两份实现收敛为一份，`display-frame-style.test.ts` 的 158 行成为唯一真源。
7. **未变的旧风险**：悬挂预览属性（1.3-H）、defs id 冲突（1.3-I）、connector ink seed（1.3-J）、`layerBlocks.sort` 稳定性契约本轮无人触碰。
8. **流程风险（本轮实证）**：gpt-sol-B 先交测试、opus 后落修复的窗口期内，工作树存在"测试红着等修复"的状态（我亲测 `card-templates.presentation.test.ts` 9 failed，60 秒后修复写入）。**集成者合并顺序必须是：生产修复 + 测试同 commit 落地，或修复先行**；禁止把红测试单独提交上历史。

---

## 5. Round 3 backlog（影响 × 风险 × 工作量排序）

前提：本表假设 opus-A/opus-B 在途改动如实落地并全量绿。若有条目流产，其对应 Round 2 遗留自动升回 P0。

| # | 事项 | 影响 | 风险 | 量 | 说明 |
|---|---|---|---|---|---|
| R3-1 | **`memo(PosterCanvas)`** + App 集成级渲染计数测试（挂真实 App 或最小 harness，改无关 state 断言 canvas 零重渲染） | 高：切断 App→画布最后的无差别重跑（guests vdom、每卡 connector 几何、1470 行组件体）；`posterCanvasSelectedTextRerender` 应从 3.9ms 趋近 0 | 低（回调已稳定，props 全 memo 友好；`posterRef`/`onSelectStudent=setState` 天然稳定） | 低 | 同时补第 2 节两个脆弱点的守护测试 |
| R3-2 | **GuestsLayer 拆分** + `src/lib/guest-panel-layout.ts` 纯函数 + memo | 高：-310 行；最后一个无 memo 大层 | 低：`guestHeight` 数值等价即可，`data-guest-*` 契约冻结 | 中 | 第 3 节裁决；导出快照对比验收 |
| R3-3 | **MapLayer 投影/path 串缓存**（useMemo 投影 + 每 feature path 算一次复用 5–8 处）+ 统一双 split 实现 | 高：地图自身变更时的最大 CPU；R3-1 后仍受益 | 低 | 中 | `MapLayer.tsx:270`；顺带删 `PosterCanvas.tsx:38-40` 或 `MapLayer.tsx:splitCache` 之一 |
| R3-4 | **preparedCards 拆分**：文本排版 memo（去掉 map.x/y/scale 依赖）+ 锚点投影 memo | 中高：地图平移/缩放不再全量 `wrapCardText`（配合 SWR 后，重解算频次高的正是这条路径） | 低 | 中 | 与 opus-A 本轮改动同区域，务必基于其落地版做 |
| R3-5 | **DestinationCardsLayer 抽取 + memo**（含 connector 几何随层 memo 挡掉、`connectorPathToCenter` 归位 `connector-geometry.ts`、pointerdown 缓存 path 引用去 querySelectorAll） | 中 | 中：cardDrag/cardsByKey 耦合 + 导出契约 | 高 | P1-3 收尾 + 1.3-K 顺手 |
| R3-6 | **导出契约集成测试**：渲染真实 PosterCanvas（含 reference 卡、guests、grid、选中态）→ serializePosterSvg → 断言剥除选择器命中数与保留节点 | 中（防回归基建，R3-2/R3-5 的安全网） | 低 | 低 | 1.3-G；顺带固定 connector ink seed（1.3-J，一行） |
| R3-7 | SWR 边界补测：新增省份 pending 缺席、旧尺寸新 rows 瞬时态、`onCardPositionsResolved` pending 语义注记 | 中（锁住 P0-2 的正确性边界） | 低 | 低 | 第 4 节条目 4/5 |
| R3-8 | 纹理拖拽接入 CanvasDragPreview 调度（1.3-E）；TextLayer 实时预览**对齐 main `96d3302`**（1.3-F） | 中（体验一致性） | 低 | 低 | TextLayer 优先 cherry-pick，勿重写 |
| R3-9 | pointerup 强制复位预览属性（1.3-H） | 低中（导出正确性长尾） | 低 | 低 | cards/guests/assets 三处同修 |
| R3-10 | defs id 实例前缀（1.3-I） | 低 | 低 | 中 | 若确认无同页多实例场景可降为 P3 |

**明确不做**：虚拟化 / canvas2d 重写 / 复活展示框工作台 / 改 `data-*` 契约 / P1-6 短哈希改造（1.3-D 已论证收益消失）/ 求解器增量化（1.3-L 保持后置，待 R3 基线证明 65ms 解算在 SWR 下仍是体感瓶颈再立项）。

---

## 附：证据链（验证纪律 failure → cause → fix → recheck 不适用于只读轮，改记取证链）

1. 通读 HEAD `3dc2684`：`PosterCanvas.tsx`（1560 行全文）、`DestinationCard.tsx`、`useCardLayoutWorker.ts`、`display-frame-style.ts`、`card-templates.ts`、`card-layout-cache.ts`、`MapLayer.tsx`（关键段）、`TextLayer.tsx`、`MapDataLayer.tsx`（关键段）、`export-poster.test.ts`、`DestinationCard.test.tsx`、`PosterCanvas.performance.test.tsx`、`App.tsx` 接线段（2280-2400 + 回调定义处）。
2. HEAD 测试取证：独立 `git worktree /tmp/head-audit @3dc2684` + symlink node_modules，19 文件 155 测试全绿（用后已清理）。避免把并行 agent 的在途状态误计入 HEAD 证据。
3. 在途改动取证：多次 `git status/diff HEAD`（16:24–16:33 UTC），逐文件读 diff；期间实证一次"测试先红、修复后至"的写入竞态（`card-templates.presentation.test.ts`）。
4. 行号声明：HEAD 行号锚定 `3dc2684`；工作树行号标注"审计时刻"，落地后必然漂移，引用以 symbol 为准。
