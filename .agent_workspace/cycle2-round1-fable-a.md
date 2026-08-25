# Cycle 2 Round 1 — fable-A：preparedCards 拆分 + DestinationCardsLayer 抽取规划

MODEL: claude-fable-5-thinking-xhigh

- 执行者：fable-A，规划轮（只读 src，只写本文件，无 git 操作）
- 基线：分支 `cursor/canvas-render-display-46a1` 工作树，`PosterCanvas.tsx` 1159 行（Cycle 1 全部在途项已并入工作树）
- 输入：`.agent_workspace/cycle1-round3-conclusion.md` 开刀顺序 1（R3-4）与 2（R3-5）
- Cycle 2 SOTA 目标：**地图平移/缩放不触发 `wrapCardText`；cards 层可 memo**
- 行号锚定当前工作树，实现轮以 symbol 为准

---

## 0. 现状锚定（本轮取证，全部对当前文件核实）

| 关注点 | 现状证据 |
|---|---|
| 排版与地图耦合 | `PosterCanvas.tsx:preparedCards`（533–631）单个 useMemo 同时产出换行结果（`rows[].lines`、`titleLines`、`width/height`）与锚点（`anchorX/anchorY`）；依赖数组含 `project.map.x/y/scale/width/height` + `projection` + `mapPath` |
| 投影本身与平移无关 | `PosterCanvas.tsx:projection`（347–350）只 `fitExtent` 到 `map.width/height`；`map.x/y/scale` 仅在锚点公式（555–558）与 `provincePolygons`/`provinceAreas` 里出现。**平移/缩放不换 projection，只换锚点仿射** |
| 拖拽预览命令式路径 | `PosterCanvas.tsx:updateCardPreview`（303–322）：`drag.element.setAttribute("transform", …)` + `drag.connectorGroup.querySelectorAll("path")` 全量覆写 `d`；`connectorGroup` 取自 `handleCardPointerDown`（746–776）的 `event.currentTarget.parentElement` |
| cards 层 JSX | `PosterCanvas.tsx:layerBlocks` 的 `key:"cards"` 块（884–1028）：`data-cards-layer` 组 + connector 滤镜 defs + 每卡（连接线描边/underlay、锚点圆、卡体 g）；`onClick` 是**内联闭包**（891） |
| 叶子已 memo | `DestinationCard.tsx:DestinationCard`（155，memo）、`ReferenceCardVisual.tsx:ReferenceCardVisual`（71，memo）。拆分只要保住 props 引用即可命中 |
| SWR 混帧 | `useCardLayoutWorker.ts:useCardLayoutWorker`（118、132–137）pending 期保留旧 result；`PosterCanvas.tsx:destinationCards`（682–691）把**新 prepared** 与**旧 placement** 合帧——平移期间现状即如此 |
| 基准探针已在位 | `perf-canvas-bench.ts:posterCanvasMapPanRerender`（270–283，含 `data-map-layer` transform 与卡数守卫）、`wrapCardTextPreparedContent`（189–193） |

---

## 1. 第一刀：`preparedCards` 拆分（wrap 侧 vs 锚点侧）

### 1.1 依赖归边审计（对 533–631 逐依赖核对）

| 归边 | 依赖 |
|---|---|
| **wrap 侧**（换行/尺寸） | `groups`、`grouping`、`expressionTemplates.city/row/title`、`noWrapFieldSet`、`lineHeightMultiplier`、`horizontalPadding`、`project.cards.{visibleFields,fieldTypography,fontSize,maxWidth,padding,bottomPadding,nameFormat,citySubgroups,compactLayout,preset,showProvinceTexture}`、`project.canvas.{width,safeMargin}`、`project.dataView` |
| **锚点侧**（地图仿射） | `groups`（取首个学生省份）、`projection`、`mapPath`（仅 centroid 兜底，549–554）、`project.map.{x,y,scale,width,height}` |
| **两侧都要** | `province`/`isInternational`/`findProvinceFeature`——每 group 一次字符串查找，两侧各自派生，成本可忽略，换取两个 memo 完全独立 |

关键确认：wrap 侧计算体（`cardRowsForGroup`→`rowFragments`→`wrapCardText`、`titleLines`、`destinationHeight`）**没有任何一处读 map 或 projection**。现有依赖数组里的 `project.map.*`/`projection`/`mapPath` 全部只喂锚点。拆分是纯依赖收窄，零语义变化。

### 1.2 拆法：三个 memo，消费面不动

```
preparedCardContents = useMemo(...)   // wrap 侧：{ group, province, isInternational,
                                      //   rows(lines), titleLines, headerExtra, width, height }
cardAnchors          = useMemo(...)   // 锚点侧：Map<group.key, { anchorX, anchorY }>
preparedCards        = useMemo(zip)   // 按 group.key 合并，deps = [preparedCardContents, cardAnchors]
```

- 空数组闸门（`visibleFields.length === 0 || dataView === "pins"`，534）留在 contents 侧；zip 见空即空。
- **zip 必须浅合并**：`{ ...content, anchorX, anchorY }`，`rows`/`titleLines` 数组按引用透传。平移帧上 `DestinationCard`/`ReferenceCardVisual` 的 props 逐项 `Object.is` 相等 → memo 命中，只有连接线 path、锚点 circle 和外层 transform 走 React diff。
- 下游 `PosterCanvas.tsx:layoutRequest`（633–679）、`destinationCards`（682–691）、`cardsByKey`（741–744）签名与行为完全不动。平移仍然换 `layoutRequest.key`、仍走 worker 重解算 + SWR 保旧帧——**这是语义要求**（锚点动了布局就该动），本刀只砍 wrap 税，不碰解算频次（后者列 Cycle 2 禁区外的观察项，见 §5）。
- 缩放（`map.scale`）与平移同路径；改 `map.width/height` 会换 `projection` → 只重算锚点侧，wrap 侧依旧不动（其依赖不含 projection）。

### 1.3 验收线（第一刀）

1. **新测试锁**（进 `PosterCanvas.performance.test.tsx`，沿用 vi.mock 计数模式）：mock `../../lib/card-text-layout` 包一层计数的 `wrapCardText`；渲染后换 `{ ...project, map: { ...project.map, x: +16 } }` 与 `{ scale: ±0.1 }` 重渲染 → **计数零增量**；换 `cards.fontSize` → 计数增加（防"锁死不重排"的假阳性）。
2. `perf:canvas`：`posterCanvasMapPanRerender`（8/24 卡）应下降约一个 `wrapCardTextPreparedContent` 的量级；`posterCanvasUnchangedPropsRerender` 不回归。
3. 存量绿线：`PosterCanvas.test.tsx` 全部（尤其换行断言 461–468、重叠断言 264 起）、`PosterCanvas.card-sizing.test.tsx`、`useCardLayoutWorker.swr-boundary.round3.test.tsx`。

---

## 2. 第二刀：`DestinationCardsLayer` 抽取

### 2.1 搬迁清单（symbol 级）

新文件 `src/components/canvas/DestinationCardsLayer.tsx`（预算 <400 行，AGENTS.md 红线），从 `PosterCanvas.tsx` 迁入：

- 拖拽宿主整套：`cardDrag` ref（282–300）、`cardPreviewScheduler`、`updateCardPreview`、`clearCardPreview`、`scheduleCardPreview`、卸载清理 effect（301–330）、`cardsByKey`、`handleCardPointer{Down,Move,Up,Cancel}`（741–829）、`cardDragEnabled`。
- cards 块 JSX（888–1025）：`data-cards-layer` 组、`data-connector-edge-filters` defs、每卡 strokeNodes/锚点圆/卡体 g。
- `connectorEdge` memo（698–703）随层走（`resolveEdgeStyle` 输入全是层内 props）。
- `connectorPathToCenter`（140–146）**归位 `connector-geometry.ts`** 并补单测（结论第 2 刀打包项）；层与预览更新器共用。
- `connectorHidden` 判定统一为层内单一 helper（现状两份：render 侧 933、pointerdown 侧 774——字面一致但会漂移）。
- 留在 `PosterCanvas.tsx`：`preparedCardContents`/`cardAnchors`/`preparedCards`/`layoutRequest`/`useCardLayoutWorker`/`destinationCards`/`onCardPositionsResolved` effect（693–696）、`canvasPoint`（GuestsLayer 同款按 prop 下传，见 `PosterCanvas.tsx:1044`）。

### 2.2 props 面（照 `GuestsLayer.tsx` 的扁平标量先例，`memo` 浅比较）

- 数据：`destinationCards`、`cardStyle`、`lineHeightMultiplier`、`userFonts`
- cards 标量：`preset`、`presentation`、`opacity`、`background`、`textColor`、`fontSize`、`connectorStyle`、`connectorDash`、`connectorColor`、`connectorWidth`、`showProvinceTexture`、`allowMapOverlap`、`gap`
- map 侧：`activeColor`、`edgeColor`、`provinceStyles`
- 拖拽钳制：`canvasWidth`、`canvasHeight`、`safeMargin`、`mapContentBounds`、`layoutOccupiedAreas`、`layoutOccupiedPolygons`（三者在 PosterCanvas 已是 useMemo）
- 行为：`exportMode`、`renderIntervalMs`、`canvasPoint`、`onSelectCards`、`onMoveCard`

其中 `onSelectCards` 必须新建 `useCallback`（对齐 `selectGuests`，714–719）——现状 891 行是内联闭包，不稳定化则层 memo 永不命中。不传整个 `project.cards`/`project.map` 切片：切片粒度会让与层无关的 map 编辑（如 `zIndex`、南海折叠）穿透 memo，且扁平标量与既有三层（Map/Guests/Text）口径一致。

### 2.3 打包修复（同刀进场，各带测试锁）

1. **1.3-K 升级为必修（本轮新取证，风险榜第 1）**：`updateCardPreview` 的 `querySelectorAll("path")` 作用在每卡外层 `<g key>` 上，匹配的是**全部后代** path——而 `ReferenceCardVisual.tsx` emblem-list 形态在卡体内渲染装饰 `<path>`（117–118 行两条）。结构推断：拖拽 emblem-list 卡时装饰 path 的 `d` 会被覆写成连接线路径，且 commit 后 React 因 vdom 中 `d` 未变**不会写回**，破坏持续到内容级重渲染。修法：pointerdown 时快照 `Array.from(connectorGroup.querySelectorAll(":scope > path"))` 存入 `cardDrag`（连接线 strokeNodes 是外层 g 的**直接子节点**，卡体 path 不是；不能按 `data-destination-connector` 选择——非首条 stroke 无该属性，959 行），每帧走缓存引用，顺带消掉每帧 DOM 查询。先写复现测试（presentation="emblem-list" + 拖拽 + 断言卡体 path 的 `d` 不变）再修。
2. **1.3-H**：`handleCardPointerUp` 在 `onMoveCard` 前同步执行一次 `updateCardPreview({ id, x: drag.x, y: drag.y })`（非调度），保证 App 侧 commit 被浅等跳过时 DOM 也与提交值一致；`handleCardPointerCancel` 复位 originalX/Y 逻辑保持。
3. DOM 嵌套逐字节保真：`handleCardPointerDown` 依赖 `event.currentTarget.parentElement` 即"每卡 g"——抽层时**不得**在卡体外再包 `<g>`，层组件返回结构与 884–1028 现状一一对应。

### 2.4 验收线（第二刀）

1. `PosterCanvas.performance.test.tsx` 新增层探针（GuestsLayer stub 同款）：`selectedTextId` 只换选中 → 层渲染零增量；平移 → 层 +1 但 `DestinationCard` 叶子计数零增量（吃第一刀红利）。
2. DOM 奇偶校验：抽取前后同一 fixture 走 `export-poster.ts:serializePosterSvg`，cards 层输出字节一致（一次性校验，可临时脚本或直接落成真实渲染导出集成测试——结论第 3 刀提前到此兜底）。
3. 拖拽绿线：`PosterCanvas.test.tsx` 818–866（commit 时机、renderIntervalMs 节流）、`PosterCanvas.performance.test.tsx:55`（拖拽不重渲染地图）、新增 emblem-list 复现测试。

---

## 3. 风险排序（拖拽预览 + 导出 data-*，按"炸了多难发现 × 多难修"降序）

| # | 风险 | 定位 | 缓解/锁 |
|---|---|---|---|
| 1 | **拖拽预览误伤卡体 path**：`updateCardPreview` 后代级 `querySelectorAll("path")` 覆写 emblem-list 装饰 `d`，commit 后不回写（React vdom 未变）。抽层若忠实照搬等于把地雷搬进新文件 | `PosterCanvas.tsx:updateCardPreview` × `ReferenceCardVisual.tsx:117` | §2.3-1：pointerdown 直子快照 + 复现测试；这是本轮唯一"现状已坏"项 |
| 2 | **拖拽 DOM 契约断裂**：`parentElement` 取 connectorGroup、`data-destination-card` 反查 `cardsByKey`——多包一层 g 或改嵌套即静默失联（预览不动或动错元素，测试有 mock pointer capture 才能测到） | `PosterCanvas.tsx:handleCardPointerDown` | §2.3-3 结构保真 + 818–866 绿线 + 层探针测试 |
| 3 | **zip 克隆破坏叶子 memo**：若合并时 `rows: [...content.rows]` 之类深拷贝，第一刀收益静默归零（功能全绿、性能回退） | §1.2 zip | 验收线 1.3-1 的 wrapCardText 计数 + 叶子渲染计数双锁 |
| 4 | **导出 data-\* 迁移遗漏/改名**：`data-cards-layer`、`data-destination-{card,connector,connector-underlay,anchor}`、`data-connector-{style,dash}`、`data-connector-edge-filters`、`data-card-{preset,presentation}` 共 10 名随层迁移。`serializePosterSvg` 是"剥除白名单、其余保留"，所以风险不在剥除而在**发射端漏发/改名**；现锁是合成 DOM（`export-poster.round3.test.ts:32`）偏弱 | `PosterCanvas.tsx:884–1028` → 新层 | 迁移=纯移动零改名（结论禁区）；真实渲染导出集成测试与抽层同 PR 落地（§2.4-2）；`App.test.tsx:903/922` 与 `perf-canvas-bench.ts:213/237/279` 卡数守卫兜底 |
| 5 | **connectorHidden 双处漂移**：render 侧与 pointerdown 侧各写一份三元条件，抽层重排后一处改一处忘 → 拖半透明 borderless 卡时预览画出隐藏连接线 | `PosterCanvas.tsx:774,933` | §2.3 统一 helper，两个调用点 |
| 6 | **层 memo 静默失效**：内联 `onClick`（891）、或把非 memo 化对象（如临时组装的 bounds 对象）当 props | `PosterCanvas.tsx:891` | `onSelectCards` useCallback；§2.4-1 选中态零增量探针把失效变成红灯 |
| 7 | **SWR 混帧语义被顺手"修好"**：平移期间新锚点+旧 placement 是现状且被 swr-boundary 测试认可；zip 若引入对 `layoutState` 的依赖或反向对齐，行为面扩大 | `PosterCanvas.tsx:destinationCards` | zip deps 只含两半 memo；`destinationCards` 一行不动 |
| 8 | **pointerdown 闭包读旧 props**：层内 handler 依赖数组从 `project.cards.*` 换成 props 时漏项 → 拖拽中改 connectorStyle 用旧值（现状同款边界，不劣化即可） | 新层 handleCardPointerDown | eslint exhaustive-deps 不加豁免 |

---

## 4. SOTA 目标对账

| 目标 | 达成判据（可机判） |
|---|---|
| 平移/缩放不 `wrapCardText` | §1.3-1 计数测试零增量（pan + zoom 两用例）；`posterCanvasMapPanRerender` 下降且 `data-map-layer`/卡数守卫续绿 |
| cards 层可 memo | §2.4-1 探针：无关重渲染（选中文本、showGrid）层零增量；`memo(DestinationCardsLayer)` 默认浅比较即可（props 面全标量/已 memo 对象），不引入第二个 WeakMap 比较器——顶层 `arePosterCanvasPropsEqual` 已负责原地变异兜底 |
| 体积纪律 | `PosterCanvas.tsx` 预计 1159 → ~830 行（cards JSX ~140 + 拖拽 ~130 + connectorEdge/杂项）；新层 <400 行，超线则把 strokeNodes 渲染拆子函数而非再开组件 |

## 5. 顺序与禁区

顺序：**第一刀（§1）单独成 commit 并跑完验收线，再开第二刀（§2）**——拆分先行让层的 props 面干净（结论排序理由 2），且两刀测试锁互不遮蔽。两刀都不动 `data-*` 名、不虚拟化、不碰求解器（结论禁区 5 延续）。平移期间"每帧换 key → worker 重解算"在第一刀后成为剩余成本，仅记录 `posterCanvasMapPanRerender` 前后值供 Cycle 2 后续轮裁决是否立项节流，本轮不做。
