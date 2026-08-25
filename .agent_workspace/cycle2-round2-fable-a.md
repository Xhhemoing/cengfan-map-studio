MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 Round 2 — fable-A：拆分/抽层复审 + 平移残余成本排名 + Round 3 收官清单

- **基线：** 分支 `cursor/canvas-render-display-46a1`，HEAD `07cf4f3`，工作树干净（开场快照中的改动已在 `1d8932c` 落地）。本轮零 src 改动、零 git 操作。
- **取证方式：** 逐行复核 + 实测。`npm run perf:canvas` 当前 HEAD 全量跑通；目标测试 6 文件 52 用例全绿（`DestinationCardsLayer.connector-preview.cycle2` / `PosterCanvas.pan-wrap.cycle2` / `PosterCanvas.performance` / `DestinationCardsLayer` / `prepared-card-content` / `destination-card-metrics`）。

---

## 1. preparedCards 拆分复审：结论「实现正确，收益已锁」

按 Round 1 fable-A 规划 §1 逐条对账当前 HEAD：

| 验收点 | 现状证据 | 判定 |
| --- | --- | --- |
| contents 侧零 map 依赖 | `PosterCanvas.tsx:398–440` `preparedCardContents` 依赖数组逐项核对：全部是 cards/canvas/分组/排版字段，**无 `project.map.*`、无 `projection`、无 `mapPath`**；`buildPreparedCardContents`（`prepared-card-content.ts:186`）计算体亦无 map 读取 | ✓ |
| anchors 侧只带仿射 | `cardAnchors`（:442–474）依赖 = map x/y/scale/width/height + projection + mapPath（仅 centroid 兜底）；byProvince 去重，国际卡 `province=""` 共享地图中心兜底，无害 | ✓ |
| zip 浅合并保引用 | `preparedCards`（:476–479）`{ ...content, ...anchors[index] }`，`rows`/`titleLines`/`group` 按引用透传 | ✓ |
| 叶子 memo 命中 | `DestinationCard` 是 memo（`DestinationCard.tsx:155`），props 全部来自 content 侧引用；performance.test「keeps destination cards out of a map pan and zoom」锁叶子计数零增量，实测绿 | ✓ |
| 换行文本不变 | `PosterCanvas.pan-wrap.cycle2.test.tsx` 直接锁 pan+zoom 后标题/正文行 DOM 文本逐字相等，实测绿 | ✓ |
| 防「锁死不重排」假阳性 | 换 `cards.fontSize`/`fieldTypography` 走 contents 依赖 → 必然重 wrap；无额外闸门 | ✓ |

**与规划的偏差（登记，非缺陷）：** 规划验收线 1.3-1 要求 mock `wrapCardText` 计数锁，实现改用「叶子渲染计数 + DOM 文本快照」双锁。等效性成立：若未来有人把 map 依赖加回 contents deps，`rows` 引用必变 → 叶子 memo miss → 计数锁报警。可接受。

## 2. DestinationCardsLayer 复审：结论「抽取干净，`:scope > path` 修复确认有效」

### 2.1 `:scope > path` 修复确认（Round 1 风险榜 #1，唯一「现状已坏」项）

- **代码：** `DestinationCardsLayer.tsx:121`，`drag.connectorGroup.querySelectorAll(":scope > path")`。`connectorGroup` 取自 pointerdown 的 `currentTarget.parentElement`（:147），即每卡外层 `<g key={group.key}>`（:296）。该 g 的**直接子** path 只有 connector underlay（:262）与 stroke（:278）；卡体是子 `<g data-destination-card>`，emblem-list 装饰 path（`ReferenceCardVisual.tsx:117–118`）是孙代，不被匹配。DOM 嵌套与抽取前一一对应（规划 §2.3-3 结构保真达成）。
- **测试锁：** `DestinationCardsLayer.connector-preview.cycle2.test.tsx` 用 `presentation="emblem-list"` 真实拖拽 + 节流推进，断言装饰 path 的 `d` 不变、连接线 `d` 变化且两者不相等。**实测通过。** 多描边（underlay+stroke 同写 `d`）也被 `:scope > path` 正确覆盖，与渲染路径一致。
- **偏差登记：** 规划 §2.3-1 建议 pointerdown 时快照 path 列表进 `cardDrag`，实现保留每帧 `querySelectorAll`。直接子查询 + `renderIntervalMs` 节流下开销可忽略，判定为可接受偏差，不立项。

### 2.2 抽层质量与残留

- 层 memo（:351）+ `cardsAppearance` 聚合对象（`PosterCanvas.tsx:595–628`）+ `selectCards` useCallback（:592）：无关重渲染穿透已由 performance.test 选中态探针锁死。`PosterCanvas.tsx` 831 行、层 352 行（400 行红线内；PosterCanvas 本体仍超 400，属既有存量，不建议本 cycle 再拆）。
- **残留 a（Round 1 风险榜 #5 未消）：** `connectorHidden` 仍两份字面一致表达式——pointerdown 侧 :168 与渲染侧 :254，未统一 helper。漂移风险仍在。
- **残留 b（= C2-4）：** `feTurbulence`（:229）无 `seed`；connector 滤镜 id 前缀固定 `"connector-edge"`（`PosterCanvas.tsx:555`）。同页多 `PosterCanvas` 实例（编辑器 + 模板预览 `dataTemplateId`）时 SVG id 全文档解析会撞车：`stdDeviation` 依赖各自 `connectorWidth`，实例间设置不同时会串滤镜。仍开放。

---

## 3. 平移残余成本排名（本轮核心产出：**Round 1 结论需要修正**）

### 3.1 实测（当前 HEAD，`npm run perf:canvas`）

```
solveCardLayout_1500x1000        n=24  10.843ms
geoMercatorGeoPath               n=34  24.612ms
posterCanvasMapPanRerender       n=8   20.845ms
posterCanvasMapPanRerender       n=24  20.197ms
posterCanvasCardPositionRerender n=24   2.299ms
posterCanvasUnchangedPropsRerender n=24 0.024ms
```

### 3.2 两条关键证据

1. **8 卡 ≈ 24 卡（20.8 vs 20.2ms）。** 若解算主导，24 卡应比 8 卡贵约 7ms（解算成本强依赖卡数）。相等说明平移重渲染由**与卡数无关**的成本主导。
2. **bench 的平移样本命中 LRU 缓存。** `posterCanvasMapPanRerender` 在两个固定 project 间交替，只产生 2 个 layout key；warmup 后 7 个样本全部走 `cardLayoutCache.get` 命中路径（容量 12）。即 **~20ms 里几乎不含解算**。Round 1 结论「24 卡 21.7ms 残差主要是布局重解」的归因不成立——残差主要是地图几何重算。

### 3.3 每次 map x/y/scale 提交的成本分解（24 卡，主线程）

先澄清语义：地图平移/缩放不是 60fps 手势——`MapInspector.tsx:57–267` 走 `DeferredInput onCommit`，是**离散提交**。因此这是「每次提交/undo/redo 的编辑延迟」，不是帧预算问题；但重着色等一切 map 编辑同样踩中第 1 项。

| 排名 | 成本 | 量级 | 定位 | 性质 |
| --- | --- | --- | --- | --- |
| **1** | 地图几何全量重投影 | **~17.9ms**（= pan 20.2 − 卡位移 2.3 的差分） | `provincePolygons`（:228–267）逐坐标 `projection()` + `simplifyProjectedRing`；`provinceAreas`（:214–227，deps 是整个 `project.map`，任何 map 编辑都触发）31× `mapPath.bounds` 再流全坐标；`polygonsKey`（`card-layout-cache.ts:34`）WeakMap 以数组身份为键，平移必 miss → 全 ring 重 `JSON.stringify` | **纯浪费**。projection 不随 x/y/scale 变（:209 只 fit 到 width/height），x/y/scale 只是仿射后缀。基几何平移不变 |
| **2** | `solveCardLayout` | ~10.8ms | worker 侧（浏览器）/ 主线程（`exportMode`、无 Worker 环境）；每次提交换 key 必 miss | **冻结稳态下 100% 弃置**（见 3.4）；另附 postMessage 全 ring 结构化克隆 + 回包后第二次 React 提交（~2ms，placements 同值新对象照样重渲染层） |
| **3** | cards 层重渲染 | ~2.3ms | connector 几何重建 + React diff；叶子 memo 全命中 | **必要工作**（锚点动了连接线必须重画），不立项 |
| **4** | `cardAnchors` / `mapContentBounds` / key JSON 其余部分 | <1ms | :442 起 | 忽略 |

### 3.4 「冻结 positions 上的 solveCardLayout」判定：不是边缘情况，是稳态

- `App.tsx:721–750`：**每一次** `patchScene({type:"map"|"province"})` 提交都经 `freezeCardPositionsForMapChange` 把当前全部卡位置并入 `cards.positions`。即第一次地图编辑后，**所有卡永久冻结**。
- `PosterCanvas.tsx:535–544`：冻结卡取 `{ ...placement, x: manual.x, y: manual.y }`——解算结果只剩 `side` 被消费（width/height 与 prepared content 恒等）。全冻结时每次 map 提交跑一次 ~11ms 解算 + 克隆 + 回包提交，产出被**整体丢弃**。
- 顺带登记既有语义皱褶（不修，仅记录）：部分冻结时，未冻结卡避让的是冻结卡的**解算位**而非**冻结位**，可能重叠——这属求解器语义，禁区内不动。

---

## 4. C2 遗留项现状对账（当前 HEAD 逐项复核）

| ID | 现状 | 判定 |
| --- | --- | --- |
| C2-1 | city-only 分叉仍在：`PosterCanvas.tsx:353` 对 visibleFields 内字段一律 `?? fontSize`，`prepared-card-content.ts:79/94/101` 对 city 取 `max(9, fontSize−1)`。`visibleFields===["city"]` 且 fontSize≥10 时渲染步进比求高步进大 1×m/行 | **开放**（= fable-b D1，须裁决的窄视觉变更） |
| C2-2 | `prepared-card-content.ts:1` 仍 `import type { CardDisplayRow, PreparedCardRow } from "../components/canvas/DestinationCard"`，lib→component 类型边未消 | **开放**（纯类型移动，零像素） |
| C2-3 | 见 §3.4，成本已量化、稳态已确认 | **Round 3 主攻** |
| C2-4 | `feTurbulence` 无 seed（`DestinationCardsLayer.tsx:229`）；滤镜 id 无实例前缀（`PosterCanvas.tsx:555`） | **开放**（小） |
| C2-5 | photo 正文 x 无 +32（`DestinationCard.tsx:210–214` titleX 加 headerOffset、:254 正文不加）；flow 标题步进渲染侧 `flowTitleBlock?.lineHeight ?? m`（:309）vs 求高侧恒 `m`（`prepared-card-content.ts:103`） | **开放**（S5 族，需布局侧感知，不宜本 cycle 顺手改） |

---

## 5. Cycle 2 Round 3 应收官什么

按「实测收益 × 侵入度」排序，全部在禁区（不复活工作台、不虚拟化、不改 `data-*`、不动求解器内部）之内：

### P0 — 地图基几何仿射缓存（收益最大，~17.9ms → ~2–3ms，惠及一切 map 编辑）

- **修法：** 基投影环/基 bounds 以 `[mainlandFeatures, projection]` 为键缓存一次；`provincePolygons`/`provinceAreas` 每次提交只做 `map.x + c + (p − c) × scale` 仿射。**字节保真论证：** `simplifyProjectedRing` 只看点间距离——平移不改距离，缩放等比缩放距离（阈值 1.5px 画布空间 ⇔ 1.5/scale 基空间），故基缓存需以 `scale` 入键：平移纯命中，缩放重简化，输出与现状逐字节一致。`provinceStyles` 可见性过滤留在仿射层外侧。这与 preparedCards 拆分是同一手法（平移不变量下沉），不碰求解器。
- **验收线：** bench `posterCanvasMapPanRerender` 24 卡 20.2 → ≤5ms 且 8/24 卡差值出现（卡数相关成本显形）；`pan-wrap.cycle2`、performance.test 全绿；新增「重着色不重投影」锁（provincePolygons 输出数组身份在 provinceStyles 仅换色时保持，或 polygonsKey WeakMap 命中计数）。

### P1 — C2-3 全冻结跳解算（窄路径，消 ~11ms 解算 + 克隆 + 回包二次提交）

- **修法：** `layoutRequest` memo 里判定「所有 prepared 卡键 ∈ `project.cards.positions`」→ 返回 null，placements 直接由冻结坐标 + prepared width/height + side 合成。部分冻结维持现状解算。
- **side 语义裁决（Round 3 唯一决策点）：** 会话内优先复用最近一次解算的 side（ref 保存）；无历史（冷加载全冻结文档）时用求解器自己的事后规则 `sideForPlacement`（`card-layout.ts:494`，导出即可，非求解器改动）按冻结几何推导。跨会话首帧个别卡连接线端口可能与历史解算不同——交付说明记录规则与回滚（revert 单批恢复恒解算）。
- **验收线：** 全冻结 + map 提交 → `solveCardLayout` 调用计数 0（mock 锁）、placements 等于冻结值、会话内 side 不翻转；部分冻结 → 解算照跑；`useCardLayoutWorker.swr-boundary` 绿线不动。

### P2 — 两个小批（可与 P0/P1 拼轮）

1. **C2-2 类型下沉：** `CardDisplayRow`/`PreparedCardRow` 移入 lib（`prepared-card-content.ts` 或独立类型模块），组件侧 re-export 兼容。纯类型移动。
2. **C2-4：** `feTurbulence` 固定 `seed`；`resolveEdgeStyle` 已有 `filterPrefix` 参数，`PosterCanvas` 传入实例化前缀（如 `useId` 派生）。先核对导出/快照测试是否锁了现有 id 字面量再动。
3. 顺带消掉 `connectorHidden` 双份表达式（§2.2 残留 a，统一 helper，Round 1 风险榜 #5 收尾）。

### 登记不做（防散佚）

- **C2-1/D1**：窄视觉变更，按 fable-b 批次 B2 流程（先回归锁、交付说明记录受影响文档条件），若 Round 3 预算不足则归下一 cycle，**不许无锁顺手改**。
- **C2-5**：S5 族（标题字号/步进布局耦合），需布局侧感知方案，归下一 cycle。
- **部分冻结避让语义**（§3.4 皱褶）与**worker 请求合并节流**：均涉求解器/调度语义面，平移已确认是离散提交而非逐帧手势，收益不足以破禁区，登记观察。

---

## 6. 复核证据链（验证纪律四步）

- **failure→cause→fix→recheck 本轮无失败项**：目标测试 52/52 绿；bench 全量跑通无守卫抛错（卡数守卫、transform 守卫均过）。
- 归因修正一处：Round 1 结论「pan 残差主要是布局重解」→ 实测证伪（§3.2 两条证据），已按新归因重排 Round 3 优先级。P0 若按旧归因立项（先做跳解算）将只回收 bench 上近乎为零的那部分，白费一轮。
