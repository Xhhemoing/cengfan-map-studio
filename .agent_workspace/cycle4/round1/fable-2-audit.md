# Round 1 / fable-2 — 现有求解器多维差距审计

**模型:** claude-fable-5-thinking-xhigh
**审计基线:** commit `51803ea`（HEAD）的 `src/lib/card-layout.ts`（1663 行、四模式版）及其调用链。
**重要前置说明（在飞漂移）:** 审计进行期间，工作区有其它 Round 1 子代理的**未提交改动**落盘：
`card-layout.ts`（+62 行：六值 `CardLayoutMode`、`elementAreas`/`allowElementOverlap`、`obstacleZones`、`validateHard` 重构为 `HardCheck` 并接 `forbidConnectorCrossing`）、`scene-document.ts`（`CARD_LAYOUT_MODES` 扩为六值、`allowElementOverlap` 默认写入）、`CardsInspector.tsx`（六项下拉 + 双「禁止遮挡」勾选）、`PosterCanvas.tsx`（+53 行）、`App.data-and-canvas.test.tsx`，以及四个新增测试文件（`card-layout.adapt.test.ts`、`card-layout.crossing.test.ts`、`card-layout.overlap-flags.test.ts`、`card-layout.perf.probe.test.ts`）。
下文以 HEAD 基线为主体，凡在飞改动已部分覆盖的条目标注 **[在飞]**，主调度器合并时按 worktree 实况复核，避免重复修或漏验。

---

## 1. 四种 mode 与用户需求的映射与缺口

| 用户要的 | 基线映射 | 缺什么 |
| --- | --- | --- |
| 四周整齐 | `quadrant`（默认，`classifyQuadrant` + 四侧 isotonic + 可选 `autoBalance`） | 基本满足；`autoBalance` 仅在 quadrant 生效，columns 落地后需共用 |
| 省份近 | **无对应模式**。最接近的是 quadrant/radial 的 `optimizedLayout` 路径，但锚点距离（`distance`）在候选评分里排第 7 位、总分里排第 7 位，且候选 rail 全部贴地图/障碍**边缘**（`buildCandidates` 的 rail 源），卡片不会主动停在地图内部的非省份空白区 | 缺 `proximity`：以锚点距离为首要软目标、允许卡片贴近省份（含地图框内空白），同侧仍保持 gap **[在飞：类型已加，实现待核]** |
| 分列整齐 | **无对应模式**。`right-stack` 是右侧单列；quadrant 是四侧 | 缺 `columns`：按锚点 X 分左右两列、列内按锚点 Y isotonic、贴地图左右缘。基础设施（`isotonicPack`、`placeSide`、`autoSplitX`）可直接复用，缺的是分类器 + 两列专属 normal + `autoBalance` 接通 **[在飞：类型已加，实现待核]** |

保留模式 `radial` / `right-stack` / `grid` 与规格一致，不需要动行为。

**结构性缺口：**
- 枚举有**两份独立定义**：`card-layout.ts` 的 `CardLayoutMode` 与 `scene-document.ts` 的 `CARD_LAYOUT_MODES`（`normalizeLayoutMode`、AI 端 `agent-conversation-store` 的合法值 Set 都吃后者）。两份必须同步扩到六值，否则出现「schema 放行、solver 不识别」。
- `solveCardLayout` 对未知 mode 的行为是**静默降级**：非 grid/radial/right-stack 一律走 `classifyQuadrant` 侧打包，且因 `mode === "quadrant" || mode === "radial"` 的判断**跳过 `optimizedLayout`**——比真 quadrant 还差，同时 `result.mode` 原样回显传入值。这意味着只放开枚举、不实现算法时，用户选「省份近」得到的是一个劣化的四周整齐，且无任何告警。`normalizeLayoutMode` 只在读工程 JSON 时归一化，`PosterCanvas` 把 `project.cards.layoutMode` 直接 cast 传 solver，不经二次归一。

## 2. 连接线交叉：soft 还是 hard？哪些路径完全不看交叉

**基线是纯 soft，且不是最高优先级的 soft。**
- 唯一考虑交叉的地方是 `optimizedLayout`：贪心逐卡评分向量 `[splitClusters, crossings, throughCards, mapIntersections, sideDeviation, sideLoad, distance, y, x]`，以及整体 `scoreLayout` 的 `[splitClusters, crossings, throughCards, throughMap, sideDeviation, sideLoad, distance]`。注意 **`splitClusters`（同锚点簇分侧）排在 `crossings` 之前**：一个 0 分簇但有交叉的布局会赢过 1 分簇 0 交叉的布局，所以「有 0 交叉候选则禁止选交叉候选」在基线并不成立。
- `validateHard`（基线版）只查画布边界、障碍、卡卡重叠，**完全不查交叉**；有交叉的布局照样 `status: "solved"`。**[在飞：validateHard 已重构为返回 `{feasible, crossings}` 并接 `forbidConnectorCrossing`，是否已接到 solve 主流程各返回点待核]**
- 无 0 交叉解时，基线返回贪心意义上交叉较少的布局但 status 仍是 `"solved"`，与规格「`status: "fallback"`」不符。

**完全不看交叉的路径清单（基线）：**
1. `grid` 模式全程（`layoutGrid` + `repackAll`）。
2. `right-stack`（`classifyRightStack` → `placeSide`）。
3. quadrant/radial 的**非优化回退**：`optimizedLayout` 触发条件不满足时（卡数 > `MAX_OPTIMIZED_CARDS`=80，或 `occupiedAreas` 与 `occupiedPolygons` **都为空**——即 `allowMapOverlap=true` 且画布无文本/嘉宾时）直接侧打包。
4. `optimizedLayout` 全部 order 失败后的侧打包回退（`placeSide` + 溢出邻侧）。
5. 溢出卡的 `containFree` 网格扫描（只查 inside/protected/placed）。
6. 兜底 `repackAll`（角点候选装箱，无连接线概念）。

**附带语义问题：** `optimizedLayout` 用 `options.connectorStyle ?? "curve"` 评分——调用方没声明连接线时也按曲线几何算交叉，与规格「`connectorStyle` 存在即视为要画线」的判定方向相反（该 hard 的地方不 hard，不该花的算力照花）。共享锚点花束豁免已在 `connectorGeometriesIntersect` 内实现（豁免半径 `max(4×clearance, 10, 24)`，且仅豁免整段落在锚点半径内的尾段），保持即可。

## 3. `allowMapOverlap` 三处一致性；元素避让现状

- **PosterCanvas（装配层）：** 行为正确但语义全靠「预烘焙」——`layoutOccupiedAreas = (allowMapOverlap ? [] : nonProvinceMapAreas) ⊕ textAreas ⊕ guestAreas`，`layoutOccupiedPolygons = allowMapOverlap ? [] : provincePolygons`。地图与元素 rect **混在同一个数组**，solver 无法区分二者。
- **solver（`hitsProtected`）：** 基线**不读** `bounds.allowMapOverlap`；`protectedZones` 只在 `occupiedAreas === undefined` 时才用它决定是否拿 `bounds.map` 兜底。PosterCanvas 永远传 defined 数组，所以该字段在求解路径上近乎死字段，一致性完全依赖调用方纪律。
- **`clampCardPosition`：** 库内唯一真正分支该字段的地方：`allowMapOverlap=true` 时 blockers 取 `occupiedAreas` 原样、polygons 清空。与 PosterCanvas 的烘焙约定拼起来是自洽的（true 时 occupiedAreas 恰好只剩元素），但这是**约定一致而非结构一致**：任何调用方在 true 时忘剔地图 rect，clamp 就会错误挡地图。另有一处已知偏差：clamp 用 `overlaps(..., gap=0)`，solver 用 `bounds.gap`——同一位置自动布局判违规、手动拖拽却允许贴死（可能是有意的拖拽宽容，需在规格里明示）。
- **元素今天是否总是避让：** 文本（`textLayoutObstacle`）+ 嘉宾面板**无条件**并入 occupiedAreas → 总是避让、无开关；**装饰素材 `assetElements` 从不避让**（根本不进 occupiedAreas），与规格「元素含可见装饰素材」不符。`allowElementOverlap` 基线不存在。
- **结论：** 要实现独立的双开关，必须把元素 rect 从 `occupiedAreas` 分离出去（规格的 `elementAreas` 思路），并让 `hitsProtected`/`clampCardPosition` 显式尊重两个开关，而不是继续靠装配约定。**[在飞：solver 侧 `elementAreas`+`obstacleZones` 已落，PosterCanvas 装配、装饰素材并入、clamp 分支、cache key 是否同步待核]**

## 4. 性能热点

- **候选规模（`optimizedLayout`/`buildCandidates`）：** 每卡 X/Y 各取最近 14 条 rail（`MAX_RAILS_PER_AXIS`），raw 组合 ≤ ~196 + preferred，按侧 shortlist 后每卡最终候选 ≤ 4×36=144（>36 卡时降为 4×12=48）。每个候选都要 `buildConnectorGeometry`（curve = 16 段折线）+ `connectorMapIntersections`（对全部省份多边形逐边×逐段）。orders ≤ 8 个（≤6 个旋转起点 + reverse + 候选稀缺序），每个 order 的贪心是 O(n × 候选 × 已放卡 × 段²)。上限 80 卡时这是主开销。
- **rail 注入是 O(n²)：** `buildCandidates` 对每张卡把**所有**卡的锚点加进 rails，既贵又稀释 `nearestRails` 的 14 个名额。
- **多边形探测：** `preparePolygon` / `polygonIndexFor` 用 WeakMap 按**对象/数组实例**缓存，同实例反复 solve 免费；但 **worker 每条消息经 structured clone 生成全新实例 → WeakMap 全 miss**，每次 worker solve 都冷启动重建 prepared 环 + 网格索引（全国地图 100+ 环时显著）。≤4 个多边形时不建索引、线性扫。
- **`containFree`：** 12px 步长全画布网格扫描 × `hitsProtected`（含多边形索引查询），有 bestDistance 行级剪枝，但饱和场景最坏上万探针；它恰好是溢出/兜底路径，即最挤的时候最贵。
- **缓存 miss 条件（`cardLayoutCache`，LRU 容量 12）：** key = 卡片(id/锚点/尺寸) + bounds(宽高/map/margin/gap/`allowMapOverlap`/occupiedAreas 全量坐标) + options(mode/autoBalance/topBottomBandRatio/connectorStyle/connectorWidth) + 多边形段（`polygonOrigin` 时为 `originX,originY@ringsHash`，rings 哈希按实例 memo）。必 miss 的操作：移动任何文本/嘉宾（occupiedAreas 变）、卡片内容改变尺寸、**pan（origin 变——rings 哈希不重算但 key 仍变）**、改 gap/margin/画布、改任一 option。未冻结（无 `positions`）工程 pan 一帧一个新 key，12 容量瞬间被冲光 + worker 每帧全量重解；已冻结工程 `frozenPlacements` 直接绕过 solver，无此热点。worker 侧有 latest-generation 合并（旧请求被新代取代），SWR 保旧图，掉帧但不闪空。
- **key 缺口（与 Q3 联动）：** 基线 key 不含 `elementAreas` / `allowElementOverlap` / `forbidConnectorCrossing`。新字段进 solver 而 key 不进，会命中语义不同的旧缓存——这是正确性问题不是性能问题，必须与字段同批落地。**[在飞：待核]**

## 5. 拖拽只有单卡 clamp 的用户可见后果

- **拖放可与邻卡完全重叠：** `clampDestinationCardPosition`（pointermove 与最终提交共用）只避障碍/画布边界，**不把其它卡当障碍**。用户把卡拖到另一张卡上，两卡叠死、连接线穿卡，界面不阻止、导出原样带走。「禁止遮挡」的产品承诺在手动路径下只对地图/元素成立，对卡片间不成立。
- **邻居不让位：** pointerup 只把该卡写进 `cards.positions`（manual 覆盖发生在 `destinationCards` 组装时），solver 不知道 manual 位置也不重排其余卡。用户想把卡插进两卡之间必须手动逐张挪开——规格第 4 条 `adaptCardLayout` 正是补这个。**[在飞：`card-layout.adapt.test.ts` 已就位（缺实现时 skipIf 跳过），worktree `card-layout.ts` 尚无 `adaptCardLayout` 导出]**
- **被夹时瞬移：** clamp 命中障碍时跳到最近的 blocker 边缘轨道，卡片从指针位置突跳，不跟手。
- **gap 不一致：** clamp 允许贴障碍 0px，自动布局保 `gap`，手动摆过的版面与自动版面留白观感不一致。
- **pan 冻结坐标：** `frozenPlacements` 按存储值原样使用、注释明确「clamping them here would drag frozen cards」——规格「禁止 pan 时 clamp 已冻结坐标」目前是满足的，改动时别破坏。

## 6. 缺陷优先级（Round 1 必修 vs Round 2 可留）

**Round 1 必修：**
1. solver 缺 `proximity` / `columns` 两模式；未知 mode 静默降级为「跳过优化的 quadrant」且回显 mode（用户可见的选项失效）。**[在飞：类型已放开，实现待核]**
2. 连接线交叉未成 hard：`validateHard` 不查交叉、无 `forbidConnectorCrossing`、无 0 交叉解时 status 不降级 `"fallback"`。**[在飞：validateHard 已重构，主流程接线待核]**
3. 贪心/总分里 `splitClusters` 排在 `crossings` 之前——交叉转 hard 后若不调序，优化器会为保簇同侧选交叉解、被 validateHard 整批打回、掉进完全不看交叉的侧打包回退，结果反而更差。必须与 2 同批处理。
4. quadrant/radial 在「无障碍」时（`allowMapOverlap=true` 且无文本/嘉宾）**跳过** `optimizedLayout` → 交叉完全无人管；交叉转 hard 后该触发条件必须放宽或回退路径必须补交叉检查。
5. `allowElementOverlap` 全链缺失：solver bounds、PosterCanvas 装配（**装饰素材今天从不避让**，规格要求默认避让）、`clampCardPosition` 双开关分支、CardsInspector。**[在飞：solver 与 UI 部分已落，装配/clamp/素材待核]**
6. cache key 未纳入 `elementAreas` / `allowElementOverlap` / `forbidConnectorCrossing` / 新 mode 行为差异——新字段落地而 key 不动会串缓存，属正确性缺陷，与 1/2/5 同批。
7. `adaptCardLayout` 不存在：拖拽无邻居自适应，Q5 全部后果成立。规格第 4 条。

**Round 2 可留：**
8. clamp 的 gap=0 与「不避其它卡」——与 adapt 联调时统一拖拽语义。
9. `buildCandidates` 的 O(n²) rail 注入与名额稀释、候选阶段 curve 16 段几何的常数成本——性能项，已有 perf probe 兜底记录。
10. worker structured clone 导致 `preparePolygon`/索引 WeakMap 全 miss——worker 侧按几何哈希复用 prepared 结构，性能项。
11. `cardLayoutCache` 容量 12 偏小 + 未冻结工程 pan 每帧 miss 的节流/防抖策略。
12. `connectorStyle` 缺省时仍按 `"curve"` 评分（无线场景白算交叉）——语义微调兼省时，若 2 的实现顺手改掉则提前完成。

## 7. 回归风险：改 `CARD_LAYOUT_MODES` / `validateHard` 会打红哪些测试

**扩 `CARD_LAYOUT_MODES`（scene-document）：**
- `scene-document.test.ts`：`normalizeLayoutMode` 合法值断言。**[在飞已改 +32 行]**
- `CardsInspector.test.tsx`：下拉项数量/文案断言。**[在飞已改]**
- `agent-conversation-store` 相关测试：`layoutMode` 合法值 Set 直接复用该枚举。
- `card-layout.perf.probe.test.ts`：`supportsMode` 的判定是「枚举含 mode 且 `solveCardLayout([]).mode === mode`」，而 solveCardLayout 对任意 mode 都回显——**枚举一放开，proximity/columns 的 perf 用例立即解除 skip**。实现缺失时不红但记录的是降级 quadrant 的误导数据；实现抛错则红。

**改 `validateHard`（加交叉判定/改返回形状）：**
- `validateHard` 是模块私有，无测试直接调；风险全部经由 `status` 与卡位外显。
- 直接高危（断言 `status === "solved"` 且场景带 connectorStyle）：`destination-layout.test.ts` 至少 4 处（175/228/262/300 行附近）；`card-layout.modes.test.ts` 的「restarts fallback packing…」（明确 expect solved）。这些场景一旦被新规则判 fallback 即红——红了要按验证纪律查是「场景确实无 0 交叉解」（改断言容忍 fallback）还是「求解器该找到解而没找到」（修实现），不许直接放宽。
- 间接风险：`card-layout.modes.test.ts` 的「uses the renderer connector geometry…」既要求 0 交叉又要求 `totalDistance < 2400`——为消交叉牺牲距离可能顶破阈值。
- 静默削弱而非打红：`card-layout.properties.test.ts` 全部硬约束断言都在 `if (status !== "solved") continue` 之后，判 fallback 变多会让 fuzz 覆盖悄悄缩水；完成报告应记录 solved 率变化。`card-layout.degenerate.test.ts` 同为条件分支，不易红。
- 画布层：`PosterCanvas.placement.test.tsx`、`PosterCanvas.boundary.test.tsx`、`App.data-and-canvas.test.tsx`（**[在飞已改]**）真实跑 solver（exportMode 强制同步）；status 不外显，但布局变化会红位置/侧断言。
- 安全区：`useCardLayoutWorker*` 系测试注入假结果，不受 solver 行为影响（除非改 worker 协议）；`card-layout-cache*.test` 只测 key/LRU，不跑 solver——但若为 Q6-6 改 key 格式，`card-layout-cache.test.ts` / `card-layout-cache.invariants.cycle3.test.ts` / `card-layout-cache.affine.cycle3.test.ts` 中对 key 组成的断言会红，属预期红，需同步更新。
- 新增的 `card-layout.crossing.test.ts` / `card-layout.overlap-flags.test.ts` / `card-layout.adapt.test.ts`（在飞）本身就是这些改动的验收面：adapt 测试在实现缺失时 skipIf 跳过，交叉/开关测试在实现不全时会红——合并顺序上应把实现与测试当同一批验。
