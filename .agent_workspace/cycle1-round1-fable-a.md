# Cycle 1 Round 1 — fable-A：画布渲染管线架构 / SOTA 审计

- 执行者：fable-A（模型 `claude-fable-5-thinking-xhigh`）
- 基线：分支 `cursor/canvas-render-display-46a1`，commit `897a2a6`（下文行号均以该提交为准）
- 范围：只读审计，不改动 `src/**`，不提交
- ⚠️ 并发提示：审计期间工作树存在**同轮其他 agent 的未提交改动**（`src/components/canvas/DestinationCard.tsx` 新建、`PosterCanvas.tsx` +193/-152、`displayFrame` useMemo 依赖收窄、`DisplayFrameSubcanvas` 系列改动、`src/lib/canvas-render-metrics.ts`、`scripts/perf-canvas-bench.ts`）。第 6/5 节相关条目已标注"⚠️在途"，后续轮次落地前先与之去重。

---

## 1. 渲染管线图（层、z 序、失效链）

### 1.1 静态结构

`PosterCanvas.tsx:PosterCanvas`（HEAD 1589 行，远超 AGENTS.md 400 行上限）输出单个 `<svg class="poster">`，DOM 顺序即绘制顺序：

```
<svg viewBox="0 0 W H">                        ← App.tsx:2318 canvas-zoom-inner 用 CSS transform scale 缩放（GPU 合成，合理）
├─ <defs data-font-faces>                      ← fonts.ts:buildFontFaceCss，仅 userFonts.length>0
├─ <rect data-canvas-background>
├─ <image data-background-image>?
├─ <g data-editor-grid>?                       ← 仅编辑态，导出时被 export-poster.ts:serializePosterSvg 剥除
└─ layerBlocks.sort(by z)                      ← PosterCanvas.tsx:903-1516
   ├─ map        z = project.map.zIndex ?? CANVAS_LAYER_Z.map(0)     （scene-document.ts:53）
   │   ├─ MemoizedMapLayer（memo 包装，PosterCanvas.tsx:44）
   │   └─ MemoizedRegionalAssetLayer（仅 kind="landmark"，PosterCanvas.tsx:41 LANDMARK_ASSET_KINDS）
   ├─ cards      z = project.cards.zIndex ?? 10   ← 内联 JSX ~270 行（PosterCanvas.tsx:950-1222），未组件化
   ├─ guests     z = 20（固定）                    ← 内联 JSX ~260 行（PosterCanvas.tsx:1223-1484）
   ├─ decorations z = 30（固定）                   ← MemoizedDecorationLayer
   └─ texts      z = 40（固定）                    ← MemoizedTextLayer
```

`MapLayer.tsx:MapLayer` 内部子管线（一个 `<g data-map-layer>` 带五段复合 transform，MapLayer.tsx:309）：

```
selection overlay → data-map-frame 命中矩形
→ <g data-map-content>（opacity + shadow filter）
   ├─ MapDataLayer 第一遍：renderFills=true, borders/textures=false     （底色填充）
   ├─ renderMapImage（imageZIndex < BORDER_Z=50）
   ├─ <g data-map-borders>：MapDataLayer 第二遍：fills=false, textures+borders=true
   ├─ renderMapImage（50 ≤ z < LABEL_Z=100）
   ├─ SouthSeaInset（collapse 时，独立 geoMercator 投影）
   ├─ 学生 pins → 省名 labels
   └─ renderMapImage（z ≥ 100）
→ 省份透明命中 path × ~34（仅编辑态）
→ MapImageResizeHandles（选中 + 有 alignment 时）
```

cards 层单卡结构（导出契约，见第 7 节）：`<g>`（连接线 underlay/stroke paths + `data-destination-anchor` 圆点）包 `<g data-destination-card transform=translate>`（`data-display-frame-surface` 面板矩形 → 省纹理 → preset 装饰 → customFrameItems → title 行 → 计数 → 分隔线 → 行 text/tspan）。`presentation !== "standard"` 时整体切换到 `renderReferenceCardVisual`（PosterCanvas.tsx:270-357，四种变体）。

### 1.2 失效链（什么改动触发什么重算）

```
project.students ──→ visibleStudents → summary → counts → pins → groups
                                                        └→ preparedCards（全量文本换行）→ layoutRequest → worker 解算 → destinationCards → cards 层
project.map.*（任意字段）──→ provinceAreas / provincePolygons / mapContentBounds / mapOccupiedAreas / nonProvinceMapAreas
                              └→ layoutOccupiedAreas / layoutOccupiedPolygons → layoutRequest（key 若不变则 LRU 命中，但 key 序列化成本照付，见 2.2）
project.map.x/y/scale ──→ preparedCards 依赖它们（PosterCanvas.tsx:783-787）→ 地图平移/缩放也会全量重跑 wrapCardText（不必要耦合）
project.cards.*      ──→ preparedCards + displayFrame（HEAD 版依赖整个 project.cards，PosterCanvas.tsx:667-672）
project.textElements ──→ layoutOccupiedAreas → layoutRequest（文本挪动会触发卡片重布局，语义上正确）
guests 几何          ──→ guestHeight（函数体内联标量）→ layoutOccupiedAreas → layoutRequest
project.assetElements ──→ decorationAssets（memo）→ DecorationLayer；不影响卡片布局（正确）
```

关键事实：**卡片布局解算期间 `destinationCards` 返回 `[]`**（PosterCanvas.tsx:840-849 + useCardLayoutWorker.ts:115），即任何导致 layout key 变化的编辑（地图缩放拖动、卡片字号调整）都会让整个 cards 层卸载再重挂——闪烁，无 stale-while-revalidate。缓解手段只有 `CardLayoutCache`（card-layout-cache.ts:87，容量 12 的 LRU）。

---

## 2. 热路径分析

### 2.1 拖拽预览（最优路径，架构上正确）

卡片/嘉宾拖拽是**纯命令式**的：`updateCardPreview`（PosterCanvas.tsx:478-497）直接 `setAttribute("transform")`，连接线每帧重建 `buildConnectorGeometry`（connector-geometry.ts:114，curve 采样 CURVE_STEPS=16）并 `querySelectorAll("path")` 改 `d`。调度经 `CanvasDragPreview.ts:scheduleCanvasPreview`：`renderIntervalMs<=0` 走 rAF 合帧，否则 setTimeout 节流。**React 零重渲染**，由 `PosterCanvas.performance.test.tsx` 守护（mock 层 + 渲染计数）。

每帧成本点：① 连接线几何 + 字符串拼接；② `querySelectorAll`（可在 pointerdown 时缓存 path 引用）；③ pointermove 里同步跑 `clampDestinationCardPosition`（card-layout.ts:1202，含 `rectangleIntersectsPolygon` 对全部省多边形的候选扫描）——省多边形已被 `simplifyProjectedRing` 截到每环 ≤180 点，通常可接受，但大量省份 + elbow 候选时是 pointermove 里最重的一段。

### 2.2 卡片布局 worker 链路

- 请求构造：`layoutRequest` useMemo（PosterCanvas.tsx:791-837）→ `createCardLayoutCacheKey`（card-layout-cache.ts:28）**JSON.stringify 全部 occupiedPolygons 环点**（~34 省 × ≤180 点/环 × 多环）。`project.map` 任何字段（含纯配色）变更都会让 `provincePolygons` 身份变化 → key 重新序列化，量级 1–3ms/次，每次 commit 都付。
- 解算：`useCardLayoutWorker.ts` 三态——LRU 命中同步返回；`exportMode`/无 Worker（jsdom）在 **useMemo 渲染期间同步解算**（useCardLayoutWorker.ts:42-50，渲染期写 cache 是幂等副作用，测试依赖此路径）；否则 postMessage 到 `workers/card-layout.worker.ts`。worker onerror 回退主线程同步解算。
- 求解器：`card-layout.ts:solveCardLayout`。quadrant/radial 且卡数 ≤ MAX_OPTIMIZED_CARDS=80 时走 `optimizedLayout`：每卡候选 rail 生成 → 每侧 ≤36（>36 卡降为 12）→ 最多 8 个插入顺序 × 贪心 + `scoreLayout` 全对连接线相交检测（O(n²·seg²)，curve 每条 16 段）。这正是必须放 worker 的原因；`exportMode` 同步解算意味着**切到导出工作台时若 key 未命中缓存会阻塞主线程**。
- pending 空窗：见 1.2，解算期间卡片整层消失。

### 2.3 geo 投影

- 模块级：`getChinaMapFeatures()` + 两份南海折叠 split 在 `PosterCanvas.tsx:37-39` 模块作用域算一次（好）；但 `MapLayer.tsx:56-71` 又有一套 `splitCache` WeakMap 做同样的事——**同一份 split 两处实现**，拆分时应统一。
- PosterCanvas 内 `projection/mapPath` 已 useMemo（依赖 width/height/collapse，正确）。
- **MapLayer 每次渲染重建投影**：`MapLayer.tsx:270-274` 每次 render 都 `geoMercator().fitExtent(...)`（fitExtent 内部要投影全部要素求 bounds），且 `path(feature)` 在一次渲染中对每省重复序列化 **5–8 次**（fills 遍、texture clip defs、texture bounds 兜底、borders 遍、renderMapImage clipPaths、命中 paths、labels 的 `path.centroid`）。全国省界点数万级，这是 MapLayer 单次渲染的主要 CPU；叠加第 3 节"memo 被击穿"，实际上每次 App 渲染都在付。
- `provincePolygons`（PosterCanvas.tsx:555-581）在主线程全量投影每个环再简化，依赖整个 `project.map`——改个 `edgeColor` 也重投影。

### 2.4 display-frame 卡片 SVG

cards 层在 `destinationCards.map` 里内联生成全部节点：每行每 fragment 一个 `<tspan>` 且逐个调用 `resolveFontFamily`（PosterCanvas.tsx:1199-1206）；`flowBlocks` 排序、`customFrameItems` 排序在每次 PosterCanvas 渲染时重算（PosterCanvas.tsx:676-687）。无 per-card 组件、无 memo：**任何一次 App 重渲染都重建整个 cards 层 vdom 并 reconcile**（几十卡 × 几十行 × tspan，数千节点）。DOM 未变时无 mutation，但 vdom diff 本身在中大型班级数据下可感知。⚠️在途：工作树已开始抽 `DestinationCard.tsx` + `cardStyle` 聚合 memo。

### 2.5 连接线

渲染期每卡一次 `buildConnectorGeometry` + `connectorEdge.underlays/strokes` 多 path 展开（edge-styles 花式描边）；`connectorPathToCenter` 用正则改写 path 头（PosterCanvas.tsx:208-214）——属于 lib 逻辑却写在组件文件里。滤镜 `soft-glow`（feGaussianBlur）/`ink`（feTurbulence+feDisplacementMap）是 SVG 滤镜中最贵的一类，连接线数量多时浏览器渲染（非 React）成本显著，导出到 PNG 时同样生效。

---

## 3. 重渲染 / memo 缺口（按严重度）

1. **App 回调身份击穿全部层 memo（最严重）**。`App.tsx:2327-2394` 传给 PosterCanvas 的 `onSelect={handleLegacySceneSelect}`、`onMoveText/onMoveAsset/onResizeAsset/onMoveCard/onMoveGuests/...` 全是每次渲染新建的内联闭包或普通函数（`handleLegacySceneSelect` App.tsx:1014、`captureCardPositions` App.tsx:717 均非 useCallback）。PosterCanvas 内 `selectMap/selectProvince/selectAsset/selectText` useCallback 依赖 `onSelect`（PosterCanvas.tsx:874-878）→ 全部随 App 渲染变化 → `MemoizedMapLayer/RegionalAssetLayer/DecorationLayer/TextLayer` 四个 memo **在真实 App 中每次都失效**。`PosterCanvas.performance.test.tsx` 只在独立挂载（回调稳定/缺省）下验证隔离，没有覆盖 App 集成路径——测试绿≠线上有效。
2. **PosterCanvas 自身未 memo**：App 任何无关 state（selection、statusMessage、zoomPercent、panelLayout、协作心跳…）变更都重跑 1589 行组件体 + cards/guests 内联 JSX。`renderProject` 已是 useMemo（App.tsx:415），把 PosterCanvas `memo` 化 + 回调稳定化后即可整体短路。
3. **`displayFrame` useMemo 依赖整个 `project.cards`**（PosterCanvas.tsx:667-672）：手动拖一张卡（只改 `cards.positions`）也会重跑 `normalizeDisplayFrame`/`deriveFixedDisplayFrameFromCardSettings`，且其输出身份变化会连带 `frameTitleItem/frameBodyItem/customFrameItems` 全部重建。⚠️在途：工作树已把依赖收窄到具体字段（用 `cardSettingsRef` 规避 lint），落地时需验证字段清单与 `display-frame.ts:deriveFixedDisplayFrameFromCardSettings` 实际读取集一致，否则会出现"改了字段但 frame 不更新"的正确性 bug。
4. **`preparedCards` 把文本排版与锚点投影耦合**：依赖含 `project.map.x/y/scale`（PosterCanvas.tsx:783-787），地图平移/缩放全量重跑 `wrapCardText`。应拆成 `cardTextModel`（只依赖 students/cards 排版字段）与 `cardAnchors`（只依赖投影与 map transform）两个 memo。
5. **`onCardPositionsResolved` effect 依赖不稳定回调**（PosterCanvas.tsx:851-854）：`captureCardPositions` 每次新身份 → effect 每次 App 渲染重跑并重建 `Object.fromEntries`。回调稳定化后自然消失。
6. **MapDataLayer 纹理拖拽不受 renderIntervalMs 节流**：`MapDataLayer.tsx:427-435` 每个 pointermove 直接 `setTexturePreview` → MapLayer 子树整体重渲染 + `provinceTextureRecords`/`resolveProvinceTexturePlacements` 全量重算。与 DecorationLayer/ResizeHandles/CanvasDragPreview 的节流路径不一致。
7. **guests 布局标量内联**（PosterCanvas.tsx:600-651，~50 行派生计算每渲染重算）：量小，但既污染主体又让 `guestHeight` 无法被下游 memo 复用语义化。
8. **TextLayer 拖拽无实时预览**：`TextLayer.tsx:82-90` pointermove 只标记 `moved`，视觉上文本在 pointer-up 才跳到新位置。与其余四类可拖对象体验不一致（是缺口还是有意防抖，列入第 8 节问题）。

---

## 4. SOTA 差距 vs Figma/Canva 级画布编辑器

| 维度 | Figma/Canva 做法 | 本项目现状 | 现实差距与可行等价物 |
|---|---|---|---|
| 层隔离 | retained scene graph + 脏区/瓦片重绘，交互只碰脏层 | memo 四层 + 命令式拖拽预览，但 memo 被回调身份击穿（3.1） | 不需要换渲染器：回调稳定化 + memo(PosterCanvas) + per-card memo 即可拿到"编辑一处只 reconcile 一处"的等价收益 |
| GPU 友好变换 | 合成器驱动 pan/zoom | 缩放走外层 div CSS transform（App.tsx:2318，✅合成器路径）；SVG 内部拖拽写 transform 属性触发重绘 | 海报固定尺寸场景可接受；不建议为 SVG 引入 CSS transform hack（导出序列化会带上 style，风险大于收益） |
| 虚拟化/视口剔除 | 视口外对象不渲染 | 无；但画布=成品海报，天然无 offscreen 内容 | 虚拟化**不是**本项目正确目标；等价物是"交互期间降级"：拖拽时跳过 ~34 个省命中 path 的事件层与 labels（editor-only 节点） |
| 增量布局 | 局部约束求解，只重排受影响对象 | 任何 key 变化全量重解；解算期间卡片整层消失（1.2/2.2） | ① stale-while-revalidate（保留上一次 placements 渲染直到新结果到达）；② 手动 `cards.positions` 固定的卡从 solver 输入剔除、作为障碍物传入，缩小 n；③ key 拆为"几何 key"与"样式 key"避免无效重解 |
| 布局缓存 | 持久化/结构共享 | 12 条 LRU + 巨型 JSON key（2.2） | key 改短哈希或(polygons 身份计数器 + 数值 transform)复合键；容量对撤销/重做往返可能偏小 |
| 文本度量 | 字体表精确度量 | `card-text-layout.ts:wrapCardText` 字符宽启发式 | 有意取舍（jsdom/导出确定性），保留；Latin 密集内容偏差列为已知限制 |
| 帧调度 | rAF 对齐 + 帧预算 | `render-settings.ts` 档位 → setTimeout 节流；interval=0 走 rAF | 统一到 rAF 网关（低档位=跳帧而非 setTimeout）收益中等，非优先 |
| 交互命中 | 单监听 + 空间索引命中测试 | 每元素 React 合成事件（数百 handler） | 规模尚可，不动；拆分时避免进一步增加 per-node handler |

---

## 5. 优化 backlog（供后续轮次，按 影响×风险×工作量 排序）

| # | 事项 | 影响 | 风险 | 工作量 | 说明 |
|---|---|---|---|---|---|
| P0-1 | App 侧回调 useCallback 化（`handleLegacySceneSelect`、`captureCardPositions`、onMove* 系列，或引入 useEvent 模式）+ `memo(PosterCanvas)` | 高：让既有四层 memo 真正生效，App 无关 state 变更不再 reconcile 画布 | 低 | 低 | 需补一条"App 集成级渲染计数"测试，防止回归（现有 perf 测试测不到） |
| P0-2 | `useCardLayoutWorker` stale-while-revalidate：pending 时返回上一个 key 的 placements | 高：消除地图缩放/卡片字号调整时 cards 层闪烁 | 低（注意 manual positions 合并仍按新 preparedCards 走） | 低 | 改 `useCardLayoutWorker.ts:115` 与 PosterCanvas.tsx:840 的空数组分支 |
| P0-3 | `displayFrame` 依赖收窄 ⚠️在途 | 中 | 中：字段清单必须覆盖 `deriveFixedDisplayFrameFromCardSettings` 全部读取，否则出正确性 bug | 低 | 与在途工作树改动合并，补 boundary 测试 |
| P1-4 | MapLayer 内 projection/path 串结果缓存：`useMemo` 投影 + 每 feature path 字符串算一次复用于 5–8 处 | 高（配合 P0-1 后仍受益于 map 自身变更时的渲染） | 低 | 中 | 顺带统一 PosterCanvas 模块级 split 与 `MapLayer.tsx:splitCache` 两套实现 |
| P1-5 | `preparedCards` 拆分：文本排版 memo（不依赖 map x/y/scale）+ 锚点投影 memo | 中高：地图平移/缩放不再全量重排文本 | 低 | 中 | 拆分方案（第 6 节）里的 `usePreparedCards` 自然承载 |
| P1-6 | 布局 cache key 降本：以 `provincePolygons` 身份版本号 + map 数值 transform + 卡片数组浅指纹代替全点 JSON | 中：每次 commit 少 1–3ms 序列化 | 中：key 碰撞=错误布局，需保守设计（身份计数器仅在真正重投影时递增） | 中 | `card-layout-cache.ts:createCardLayoutCacheKey` |
| P1-7 | per-card `DestinationCard` memo 组件 ⚠️在途 | 中：单卡编辑/选中不再重建全卡 vdom | 低 | 中 | 依赖 P0-3 的 displayFrame 稳定身份才有效 |
| P2-8 | MapDataLayer 纹理拖拽接入 `CanvasDragPreview` 调度器 | 低中 | 低 | 低 | 补齐节流一致性 |
| P2-9 | TextLayer 拖拽实时预览（命令式 setAttribute，同卡片路径） | 中（体验） | 低 | 低 | 先确认是否有意省略（第 8 节 Q2） |
| P2-10 | 拖拽期间禁用省命中 path/labels 的 pointer-events（editor-only 降级） | 低 | 低 | 低 | 减少拖拽 hit-test 开销 |
| P3-11 | 求解器增量化：manual positions 卡剔除出 solver 输入、作为 occupiedAreas 传入 | 中 | 高：布局语义变化，需快照对比 | 高 | 后置；先量化收益（配合在途 `scripts/perf-canvas-bench.ts`） |
| P3-12 | 卡片拖拽 pointerdown 缓存连接线 path 元素引用，去掉每帧 `querySelectorAll` | 低 | 低 | 低 | 微优化，顺手做 |

明确**不建议**做的：虚拟化/canvas2d 重写/引入渲染库（violate "SVG 海报 + jsdom 测试 + 无重依赖"约束，且收益错配）。

---

## 6. PosterCanvas 拆分方案（目标：每文件 <400 行，行为零变化）

HEAD 1589 行 → 建议 9 个单元（组件沿用目录内 PascalCase 文件名惯例，纯逻辑进 `src/lib` kebab-case）：

| 新文件 | 迁出内容（HEAD 行号） | 公开 API |
|---|---|---|
| `src/components/canvas/DestinationCardsLayer.tsx` | cards 层 `<g data-cards-layer>` 全部（950-1222）+ `cardDrag` ref + pointer handlers + `connectorPathToCenter` 调用侧 | `DestinationCardsLayerProps { cards: PlacedCard[]; style: DestinationCardStyle; connectorEdge: ResolvedEdgeStyle; connectorConfig: {style,dash,width}; clampBounds: CardLayoutBounds; exportMode; renderIntervalMs; onSelectCards?; onMoveCard?; provinceStyles; userFonts }` |
| `src/components/canvas/DestinationCard.tsx` ⚠️在途 | 单卡视觉：surface rect、title 行、rows text/tspan、customFrameItems、preset 装饰（1131-1212）+ `renderDisplayFrameItem/frameTextX/frameTextAnchor`（164-203） | `memo` 组件；props = 单卡数据 + 聚合 `DestinationCardStyle`（稳定身份） |
| `src/components/canvas/ReferenceCardVisual.tsx` | `renderReferenceCardVisual` 四变体 + `referenceCardColor/readableTextColor`（254-357） | `ReferenceCardVisual({presentation, group, rows, …})` |
| `src/components/canvas/GuestsLayer.tsx` | guests 层（1223-1484）+ `guestDrag` + `truncateGuestText/wrapGuestCustomText`（49-77） | `GuestsLayerProps { guests, metrics: GuestPanelMetrics, edgeColor, exportMode, renderIntervalMs, onSelect?, onMoveGuests? }` |
| `src/lib/guest-panel-layout.ts` | 600-651 的 ~50 行派生度量（guestHeight/列宽/行高/自定义文本换行） | 纯函数 `computeGuestPanelMetrics(guests, lineHeightMultiplier)` → 可单测，`guestHeight` 供 layoutOccupiedAreas 复用 |
| `src/lib/poster-projection.ts` | `featureCoordinatePolygons/simplifyProjectedRing/projectedPolygon`（79-126）+ provinceAreas/provincePolygons 计算体（541-594） | 纯函数 `computeProvinceAreas(features, mapPath, map)` / `computeProvincePolygons(features, projection, map)` → 补单测（现在这段无直接测试） |
| `src/components/canvas/usePreparedCards.ts` | `preparedCards` useMemo 体 + `cardRowsForGroup/rowFragments/studentFieldParts/destinationHeight/CardDisplayRow/PreparedCardRow`（160-418、691-789） | `usePreparedCards(project, groups, projection, mapPath, …)`；内部按 P1-5 拆双 memo |
| `src/components/canvas/useDestinationLayout.ts` | `layoutRequest` + `useCardLayoutWorker` 调用 + `destinationCards` 合并 + `onCardPositionsResolved` effect（791-854） | `useDestinationLayout(prepared, bounds, cardsConfig, exportMode)` → `{ cards: PlacedCard[], pending }`；P0-2 在此实现 |
| `src/lib/connector-geometry.ts`（并入） | `connectorPathToCenter`（205-214） | 归位到几何库，补单测 |

**留在 `PosterCanvas.tsx`（~300 行）**：props 接口、模块级 features/split 常量（与 MapLayer splitCache 统一后可能进一步瘦身）、projection/mapPath/counts/pins/groups 等顶层 memo 编排、五个 layerBlocks 的组装与 z 排序、svg root/背景/网格、`canvasPoint`。

**迁移次序**（每步可独立提交、独立跑 `npx vitest run src/components/canvas`）：先纯函数（guest-panel-layout / poster-projection / connectorPathToCenter，零 JSX diff）→ 再 hooks（usePreparedCards / useDestinationLayout）→ 最后组件（ReferenceCardVisual → DestinationCard → DestinationCardsLayer → GuestsLayer）。每步用"导出 SVG 字符串快照对比"验收（见 7.1）。

**测试兼容**：`PosterCanvas.performance.test.tsx` 的 `vi.mock("./MapLayer")` 等路径不受影响；新层建议补两条渲染计数测试（cards 层在嘉宾拖拽时不重渲染、GuestsLayer 在卡片拖拽时不重渲染）。`PosterCanvas.test.tsx / card-sizing / reference-styles` 断言 `data-*` 属性——属性名与嵌套关系是契约，不得改。

---

## 7. 视觉回归 / 导出 SVG 保真风险

导出链路 = `export-poster.ts:serializePosterSvg` **克隆活 DOM**（cloneNode + XMLSerializer）→ 任何 DOM 结构/属性调整都直接进导出产物。风险清单：

1. **data-\* 属性即导出契约**：`serializePosterSvg` 按属性选择器剥除 `[data-selection-overlay] [data-map-selection-overlay] [data-asset-selection] [data-editor-grid]`，透明导出剥 `[data-canvas-background] [data-background-image]`，字体阻塞替换定位 `[data-font-faces] style`。拆分时这些属性的**名称与所在节点层级**一律冻结；建议在拆分 PR 里加"契约测试"：渲染→serialize→断言选择器命中数。
2. **命令式预览 vs 声明式提交的悬挂属性**：`clearCardPreview` 会取消 pending 的 timer，DOM 停留在最后一次已应用的预览位；若 commit 后 React 端 `transform` 字符串与其 vdom 旧值相等（拖回原位、snap 吸附回原点），React 跳过 DOM 写 → **DOM 与 state 永久失同步**，此刻导出即错位。低概率但真实；修法：pointerup 时强制把元素属性复位为提交值（或 flush pending 再 commit）。guests/assets 同理。
3. **defs id 全局唯一性**：`editor-grid-pattern`、`map-image-clip`、`guest-avatar-clip-${id}`、`province-texture-clip-${featureId}`、connector/edge filter id（`resolveEdgeStyle` 的 filterPrefix 只区分到前缀）。同一页面若同时挂两个 PosterCanvas（编辑器 + 模板预览 `dataTemplateId`，或未来缩略图），clipPath/filter 会互相串扰且导出克隆会引用到另一实例的 defs。拆分不引入新 id 前缀时风险不变，但建议 backlog 记一条"id 加实例前缀"。
4. **z 序稳定性**：`layerBlocks.sort` 相等 z 依赖 Array.sort 稳定性（ES2019 起稳定）。用户可把 `map.zIndex`/`cards.zIndex` 调成相等（范围 -100..100），此时先 map 后 cards 的插入顺序即语义——拆分时保持数组构造顺序不变。
5. **布局 fallback 无视觉区分**：`solveCardLayout` 返回 `status:"fallback"` 时卡片可能重叠（card-layout.ts:483-491 饱和堆叠），渲染端不感知 status。回归测试需覆盖降级路径，导出前的 layout-health 检查是否捕捉此态（未验证，见 Q7）。
6. **jsdom 同步解算路径是测试地基**：`useCardLayoutWorker` 在无 Worker 环境渲染期同步 solve——拆 `useDestinationLayout` 时必须保留，否则全部卡片断言（PosterCanvas.test.tsx 等）失效。
7. **P0-2（stale-while-revalidate）的回归面**：pending 期间渲染旧 placements + 新 preparedCards 合并时，若卡片集合变化（新增省份分组）需处理"旧 placement 缺新卡"的空档——实现时按 group.key 交集渲染，缺失卡等新结果，避免闪现在 (0,0)。
8. **SVG 滤镜导出一致性**：feTurbulence/feDisplacementMap（ink 风格）在不同 rasterizer（浏览器 canvas drawImage vs 外部工具）下噪声 seed 表现可能不同；`MapDataLayer.tsx:307` 固定 seed=3，连接线 ink 滤镜（PosterCanvas.tsx:973-976）**未固定 seed**——建议补齐，属一行级修复。

---

## 8. 问题 / 未知项（需产品或后续轮次确认）

1. **真实数据规模**：学生数 / 分组卡数的 P95 是多少？决定 per-card memo（P1-7）与求解器增量化（P3-11）的真实收益。`MAX_OPTIMIZED_CARDS=80` 与 `>36 降密`的阈值来源未见基准记录（在途 `scripts/perf-canvas-bench.ts` 可能正在补）。
2. **TextLayer 无拖拽预览是有意还是缺口**？pointermove 只置 `moved` 标记（TextLayer.tsx:87-89），体验与其余拖拽不一致。
3. **是否存在同页多 PosterCanvas 实例**？`dataTemplateId` prop 暗示模板预览场景；若有，第 7.3 条 id 冲突从"潜在"升级为"现存 bug"。
4. **renderIntervalMs 低档位（low/fixed 10fps）的真实使用率**？决定是否值得把 setTimeout 节流统一为 rAF 跳帧。
5. **provinceAreas 不过滤 `provinceStyles.visible===false` 而 provincePolygons 过滤**（PosterCanvas.tsx:544 vs 569）：隐藏省仍参与 `mapContentBounds`/AABB，但不参与多边形避让——语义是否符合预期？
6. **在途工作树改动的归属与验收**：`DestinationCard.tsx` 抽取、displayFrame 依赖收窄、`DisplayFrameSubcanvas` 系列由哪个 agent 负责跑全量测试并提交？本文 backlog P0-3/P1-7 与其重叠，落地前必须对齐，避免双改冲突。
7. **导出前是否有 fallback 布局拦截**：layout-health/DeliveryRail 是否会在 `status:"fallback"`（卡片重叠）时警告用户？未验证。
8. **cardLayoutCache 容量 12** 对撤销/重做在多个布局形态间往返是否足够？key 巨大（含全点 JSON）也意味着 12 条缓存的内存占用不小，与 P1-6 一并处理。

---

## 附：证据链（验证纪律）

- 通读文件：`PosterCanvas.tsx`（HEAD 全文）、`MapLayer.tsx`、`MapDataLayer.tsx`、`DecorationLayer.tsx`、`TextLayer.tsx`、`RegionalAssetLayer.tsx`、`ResizeHandles.tsx`、`CanvasDragPreview.tsx`、`useCardLayoutWorker.ts`、`workers/card-layout.worker.ts`、`lib/card-layout.ts`、`lib/card-layout-cache.ts`、`lib/card-layout-worker-protocol.ts`、`lib/render-settings.ts`、`lib/map-content-bounds.ts`、`lib/connector-geometry.ts`（前 120 行）、`lib/display-frame.ts`（前 120 行）、`lib/export-poster.ts`、`PosterCanvas.performance.test.tsx`、`App.tsx` renderSettings/PosterCanvas 接线段。
- 未运行测试/构建（本轮为只读审计，且工作树含他人未提交改动，跑全量校验会把他人在途状态误计入本轮证据）。
- 行号漂移声明：审计期间 `PosterCanvas.tsx` 被并行 agent 从 1589 行改到 1689 行（未提交）；本文行号一律锚定 commit `897a2a6`。
