# Round 1 架构验收文档 — 展示框自动排布重构

- 作者：fable-1（架构规划 / SOTA 把控），模型 `claude-fable-5-thinking-xhigh`
- 依据：`.agent_workspace/PROGRESS.md`（锁定规格）、`.agent_workspace/cycle4/ROUND1-SPEC.md`、当前分支 `cursor/display-frame-layout-d264` 源码与已落盘守卫测试
- 阅读的关键源码：`src/lib/card-layout.ts`（1663 行）、`src/lib/connector-geometry.ts`、`src/lib/card-layout-cache.ts`、`src/lib/scene-document.ts`、`src/components/canvas/PosterCanvas.tsx`（359–380、562–662）、`src/components/inspector/CardsInspector.tsx`、`src/components/canvas/DestinationCardsLayer.tsx`、`server/ai/{tool-registry,patch-validator,agent-request}.ts`、`src/lib/editor-canvas-actions.ts`
- 已落盘守卫测试（未跟踪文件，即本轮契约）：`card-layout.overlap-flags.test.ts`、`card-layout.crossing.test.ts`、`card-layout.adapt.test.ts`、`card-layout.perf.probe.test.ts`、更新版 `CardsInspector.test.tsx`

---

## 1. 对 PROGRESS.md 锁定规格的架构评审

### 1.1 同意的部分

- **双开关正向文案 + 内部 `allow*` 字段**：UI 用「禁止遮挡」正向勾选、内部保留 `allowMapOverlap` 语义并新增可选 `allowElementOverlap`，旧 JSON 缺字段视为 `false`。这是对既有 `normalizeScene`（`allowMapOverlap === true` 收紧）模式的自然延伸，可选字段回滚成本为零。
- **quadrant 保持默认、`normalizeLayoutMode` 未知值回落 quadrant**：`scene-document.ts` 现有实现已是这个形状，扩容枚举不动默认值即可避免旧海报跳版。
- **求解器永不抛 + `fallback` 状态**：与现有 `solveCardLayout` 的 `containFree → repackAll → fallback` 降级链一致，交叉硬约束作为 `validateHard` 的追加维度而非新异常路径，是正确的接法。
- **全量求解走 worker + 缓存、拖拽走纯函数局部自适应**：职责边界干净。`adaptCardLayout` 放入 `src/lib/card-layout-adapt.ts` 独立文件（ROUND1-SPEC 建议）同时缓解 400 行纪律压力。
- **`positions` 冻结语义不动**：`frozenPlacements`（PosterCanvas 584–605）短路求解器的现状被保留，规格未要求开关切换移动已冻结卡片，语义一致。

### 1.2 风险（按严重度排序）

- **R1（高）双重门控的语义分叉**：规格同时要求「调用方组装时按开关并入」与「`hitsProtected`/`clampCardPosition` 尊重两套开关」。若元素 rect 匿名混入 `occupiedAreas`，bounds 层就无法区分元素与地图 rect，第二句要求不可实现——详见第 2 节，这是本文「必须改的一点」。
- **R2（高）交叉硬约束的覆盖面**：现有 `optimizedLayout` 只在 `mode ∈ {quadrant, radial}`、`cards.length ≤ 80` 且**存在障碍**时启用（`solveCardLayout` 1485–1491）。若把交叉硬约束只实现在 optimized 通道内，则「双开关全放开、无文本无嘉宾」的工程（`occupiedAreas=[]`、`occupiedPolygons=[]`）会绕过硬约束。交叉校验必须落在 `validateHard`（对所有模式、所有通道生效），不能只落在候选过滤。
- **R3（高）fallback 未记录最少交叉解**：`optimizedLayout` 目前失败即返回 `null`，落回 `placeSide` 通道，后者对交叉零感知。规格要求「无 0 交叉可行解时选交叉最少的布局」——必须在多起点序的尝试中保留 crossings 最小的完整合法布局作为 fallback 候选，而不是丢弃后交给不懂交叉的兜底链。
- **R4（中）评分优先级与硬约束冲突**：现有候选评分把 `splitClusters`（花束内聚）排在 `crossings` 之前（`buildCandidates`/`optimizedLayout` 的 score 向量第 0、1 位）。硬约束语义下，当存在 0 新增交叉候选时必须过滤掉交叉候选（或把 crossings 提到第 0 位），否则花束内聚会挑中带交叉的候选、随后被 `validateHard` 整体否决，白白烧掉起点序。
- **R5（中）缓存假命中**：`createCardLayoutCacheKey` 序列化了 `allowMapOverlap`、`occupiedAreas`、`options.mode` 等，但不知道 `allowElementOverlap` 与（若新增的）`elementAreas`。若元素障碍走独立字段而 key 不扩容，切换开关会命中旧布局（脏结果且难以复现）。
- **R6（中）国际卡幻影连接线**：`PosterCanvas` 把国际卡也送入求解器（锚点回落地图中心），渲染层靠 `isInternational` 跳过连线（`DestinationCardsLayer` 256 行）。求解器不知道这一位——硬约束升级后，幻影连线可能制造假交叉、把可行解判成 fallback。PROGRESS 已把责任划给调用方（「国际无锚点卡由调用方不送入求解器或宽高已在上层处理」），Round 1 必须在 PosterCanvas 侧核实并落一条守卫。
- **R7（低）装饰素材首次成为障碍**：现有 `layoutOccupiedAreas`（PosterCanvas 359–369）只含文本障碍 + 嘉宾面板，**没有** `assetElements`。规格要求把可见装饰并入元素障碍，这对「旧工程 + 有装饰 + 未冻结 positions」是一次真实的重排（跳版）。回滚方案已有（还原 diff），但必须写入 CHANGELOG 用户可见条目，并用「无装饰旧工程 placements 逐像素不变」的回归测试圈住变更半径。
- **R8（低）文件体积**：`card-layout.ts` 已 1663 行。Round 1 按 ROUND1-SPEC 允许新 mode 内联到 `classify*`/`placeSide` 旁，但交叉硬化 + 两个新 mode 内联后预计逼近 2000 行，Round 2 拆分（第 7 节）从「建议」升级为「必须」。

### 1.3 必须改的一点

**元素障碍必须以独立通道进入 `CardLayoutBounds`（`elementAreas?: CardArea[]`），门控语义唯一落点是 bounds 层的一个 effective-blockers 纯函数；调用方的「仅当 … 时并入」只能作为与 bounds 门控严格等价的性能优化存在，禁止把元素 rect 匿名混入 `occupiedAreas`。**

理由：守卫测试 `card-layout.overlap-flags.test.ts` 的 `hasElementOverlap` 探针（对同一 bounds 只翻转 `allowElementOverlap` 并比较 `clampCardPosition` 结果）只有在 bounds 层能区分元素障碍时才会激活——匿名合并方案会让该测试永久 `skipIf` 跳过，且使规格中「`hitsProtected`/`clampCardPosition` 必须尊重两套开关」一句沦为空话。详细组合方案见第 2 节。

---

## 2. 双遮挡开关：bounds 层与调用方的组合，避免语义分叉

### 2.1 现状盘点（分叉已经在萌芽）

今天 `allowMapOverlap` 的门控就分散在两层，靠「同一谓词 `allowMapOverlap === true`」保持一致：

| 读取点 | 现状行为 |
| --- | --- |
| PosterCanvas 367 | `allowMapOverlap === true` 时不把 `nonProvinceMapAreas` 并入 `occupiedAreas` |
| PosterCanvas 370–380 | `allowMapOverlap === true` 时传空 `occupiedPolygons` |
| `protectedZones`（card-layout 424） | `occupiedAreas` 缺席且无 polygons 且 `!allowMapOverlap` 时回落 `[bounds.map]` |
| `clampCardPosition`（1571–1574） | `allowMapOverlap` 为真时 blockers 取 `occupiedAreas`、跳过所有 polygons |

四处判定，两处在调用方、两处在库内。加入第二个开关时若延续「散点式」写法，读取点会翻倍到八处，任何一处默认值写反（`=== true` vs `!== false`）都是静默语义分叉。

### 2.2 规定的组合方式（规范性）

1. **`CardLayoutBounds` 扩容**：`allowElementOverlap?: boolean`（缺省视为 `false`）+ `elementAreas?: CardArea[]`（缺省视为 `[]`）。`occupiedAreas` 保持「地图类 rect + 其他历史遗留」的既有含义不变，旧调用方零迁移。
2. **单一汇聚函数**：库内新增（或改造 `protectedZones` 为）唯一的 effective-blockers 帮助函数，语义为：

   ```
   effectiveRects(bounds)    = protectedZones(bounds) ∪ (allowElementOverlap !== true ? elementAreas : ∅)
   effectivePolygons(bounds) = allowMapOverlap === true ? ∅ : occupiedPolygons
   ```

   `hitsProtected`、`resolveObstacles`、`buildCandidates` 的 rail 采集、`containFree`、`repackAll`、`layoutGrid`、`validateHard`、`clampCardPosition`、`adaptCardLayout` **全部**经由它取障碍。今天 `resolveObstacles` 直接读 `protectedZones`、`clampCardPosition` 自带一套 `allowMapOverlap` 分支——Round 1 不允许出现第三种取障碍写法。
3. **调用方（PosterCanvas）的分工**：
   - 地图类 rect / polygons 的条件并入**保留现状**（这是缓存 key 与 memo 稳定性的支柱，`layoutOccupiedCenteredPolygons` 的实例恒定性依赖它）；
   - 元素 rect（嘉宾面板、`textLayoutObstacle`、可见 `assetElements`）**无条件**放入 `elementAreas`，把 `allowElementOverlap` 原样传给 bounds，由库内统一门控。调用方若出于 memo 原因想在开关为 true 时传空数组，必须证明与库内门控等价（同谓词 `!== true`），且缓存 key 同时纳入开关与数组（见 2.4），否则禁止。
4. **默认值纪律**：所有读取点统一写 `allowElementOverlap !== true`（禁止）与 `allowMapOverlap === true`（放行），与 `normalizeScene` 的 `=== true` 收紧方向一致。UI 勾选态映射固定为 `checked ⇔ allow* !== true`。

### 2.3 为什么不是「调用方合并进 occupiedAreas」

- 合并后 `hitsProtected` 无法对元素类单独放行——`allowMapOverlap === true` 且 `allowElementOverlap === false` 时，`clampCardPosition` 现有分支 `blockers = occupiedAreas` 恰好「碰巧」正确（此时 occupiedAreas 只剩元素），但这依赖调用方组装顺序的隐性契约，任何第二个调用方（测试、AI 服务端、导出路径）都可能踩错。
- `overlap-flags` 守卫测试永久跳过，Round 1 验收线 1（「两个勾选改变交给求解器的 occupiedAreas/occupiedPolygons」）只能靠组件测试间接覆盖，库层无回归保护。
- 语义真相分散在 React memo 依赖数组里，Round 2 拆库时无法安全搬移。

### 2.4 缓存与 worker 的连带义务

- `createCardLayoutCacheKey` 的 bounds 段必须追加 `allowElementOverlap: bounds.allowElementOverlap === true` 与 `elementAreas: (bounds.elementAreas ?? []).map(areaKey)`。mode 已在 options 段序列化，新枚举值自然生效。
- `CardLayoutWorkerRequest` 透传 `CardLayoutBounds`，类型扩容后 worker 协议零改动；`useCardLayoutWorker` 的 stale/SWR 语义不受影响（key 变化即重新求解）。

---

## 3. 三种主算法的几何不变量与评分优先级

全模式共享的**硬不变量**（`validateHard` 的现有三条 + 本轮第四条）：

- H1 画布内：`margin ≤ card ≤ canvas − margin`（EPSILON 容差）；
- H2 两两不重叠：任意两卡 AABB 间距 ≥ `gap`；
- H3 按开关避障：与 `effectiveRects`/`effectivePolygons` 不相交（含 `gap` 膨胀）；
- H4（新）连接线不交叉：见第 4 节，`forbidConnectorCrossing !== false` 且 `connectorStyle` 存在时生效。

### 3.1 `proximity`（省份近）

| 不变量 | 可证伪判据 |
| --- | --- |
| P1 自由锚邻域必贴锚 | 构造一张卡：以 `(anchorX − w/2, anchorY − h/2)` 为原点的 AABB(+gap) 不撞任何障碍/画布缘/他卡，则最终位置与该原点的偏差 ≤ ε（建议 ε = 0.5px） |
| P2 距离占优 | 同一 seeded 实例集上，`Σ dist(卡心, 锚点)` ≤ quadrant 模式的同项（proximity 至少不劣于四象限的贴近度） |
| P3 同侧 gap | 由 H2 覆盖（规格的「同侧仍保持 gap」不弱于全局 gap） |
| P4 确定性 | 同输入两次求解 `toEqual`（`card-layout.adapt.test.ts` 122–160 已断言） |

评分优先级（候选选择，字典序）：**[H4 过滤] → throughCards → throughMap(mapIntersections) → distance → y → x**。`sideDeviation` 与 `splitClusters` 在 proximity 中降权/移除：贴近锚点本身就把同锚卡聚在一起，home-side 概念在此模式无意义；保留它们会与 distance 打架。实现建议：复用 `buildCandidates` 的 rail 机制，把 homeSide 权重清零、distance 提前。

### 3.2 `columns`（分列整齐）

| 不变量 | 可证伪判据 |
| --- | --- |
| C1 列缘吸附 | 左列每卡 `|x + width − (map.x − gap)| ≤ ε`（右对齐贴地图左缘），右列每卡 `|x − (map.x + map.width + gap)| ≤ ε`；仅障碍位移可豁免且必须计入求解质量评分 |
| C2 列内保序（isotonic） | 列内按 `anchorY` 排序后，最终 `y` 单调不减；相邻间距 ≥ `gap`，列高溢出时压缩但 ≥ `MIN_GAP`(4) |
| C3 分列规则 | `anchorX < splitX` → 左列；`autoBalance` 开启时 `splitX = autoSplitX`（最小化两列高度的最大值，复用现有实现），关闭时取地图中线 |
| C4 溢出降级 | 单列超出 `primarySpan` 时先压 gap，仍放不下的卡走 `containFree`，`validateHard` 决定 status |

评分优先级：columns 是**构造式**算法，优先级体现在构造顺序而非搜索评分：H1–H3 → 列缘吸附(C1) → 保序(C2) → 块居中（`isotonicPack` 现有行为）。与 H4 的关系要诚实：保序消除了「同列相邻逆序」这一主导交叉类别，但**不是**结构性 0 交叉保证（短陡线与长缓线即使端点两端都保序仍可能相交）。残余交叉由 H4 的兜底处理：同列相邻交换是 O(k²) 有界修复，修不掉则 fallback。禁止为 columns 单独发明第二套交叉判定。

### 3.3 `quadrant`（四周整齐，默认，现有实现续用）

| 不变量 | 可证伪判据 |
| --- | --- |
| Q1 分带分类 | `topBottomBandRatio` 默认 0.28、水平中心带 30%–70%（`classifyQuadrant` 现状），不得因新模式改动 |
| Q2 侧内保序 + 法向轨道 | 每侧 isotonic 保序；法向坐标 = 地图缘 ± gap（`normalForSide`）；障碍位移仅沿法向（`resolveObstacles` ≤ 24 步） |
| Q3 降级链次序 | `placeSide` → 邻侧回流(≤4 轮) → `containFree` → `repackAll` → fallback，链条不重排 |
| Q4 autoBalance | 开启时分割线 = `autoSplitX`；`quadrant`/`columns` 之外 UI 禁用（守卫测试已断言） |

评分优先级（optimized 通道，目标态）：**[H4 过滤] → splitClusters → throughCards → throughMap → sideDeviation → sideLoad → distance → y → x**。相对现状唯一的变化是 crossings 从「第 1 位软评分」升级为「第 0 位过滤/硬校验」（见 R4）；其余次序保持，避免旧海报视觉漂移。整体布局评分 `scoreLayout` 同步调整：`crossings` 由评分项转为「进入 fallback 候选池的排序键」。

---

## 4. 连接线禁止交叉：硬约束 vs fallback 的判定

### 4.1 唯一谓词原则

交叉判定谓词全局唯一：`connectorGeometriesIntersect`（`connector-geometry.ts` 229–269，含 clearance 膨胀与花束豁免）。三处消费必须共用它：

1. **候选过滤**（optimized 通道贪心插入时）：对当前候选，若存在与所有已放置连线 0 新增交叉的候选，则携带交叉的候选整体出局；全部候选都带交叉时，取新增交叉数最少者继续（保证完整性优先于洁癖）。
2. **`validateHard(placements, bounds, options)`**：签名扩容（追加 options），当 `options.forbidConnectorCrossing !== false`（默认 true）且 `options.connectorStyle` 存在时，用 `buildConnectorGeometry`（`preferredSide = placement.side`）重建全部连线并两两过谓词，任一命中即整体失败。**该校验对所有模式、所有求解通道生效**（对应 R2：不依赖障碍存在、不依赖 optimized 通道启用）。
3. **fallback 计数**：所有满足 H1–H3 的完整布局进入候选池，按 `(crossings, 原 scoreLayout 向量)` 字典序取最小者，`crossings > 0` 则 `status: "fallback"`。求解器永不抛（现契约保持）。

判定开关：`connectorStyle` 存在即视为要画线（规格锁定）；`forbidConnectorCrossing: false` 是逃生门，守卫测试 `card-layout.crossing.test.ts` 用 `Object.defineProperty` 探测该选项被真实读取，并断言约束态交叉数 ≤ 非约束态。

### 4.2 与共享锚点花束豁免的关系

豁免逻辑**内建于谓词**（`sharedAnchor` 判定 + `anchorRadius = max(4×clearance, 10, 24)`，且豁免段必须整段落在锚点半径内），因此硬约束自动继承豁免——同锚多卡的「花束」不会被判死。两套机制正交且都要保留：

- 豁免解决**判定误报**（曲线 16 段采样在锚点附近的会合不算交叉）；
- `splitClusters` 评分解决**视觉聚拢**（把同锚卡拉到同一侧）。

架构风险点：硬化之后 `anchorRadius = 24px` 从「评分噪声」升格为「成败分界」，成为敏感常数。`crossing.test.ts` 的 bouquet 用例（同锚三卡 curve 样式断言 0 交叉）就是它的回归锁，**禁止任何人在不动该测试的前提下调这个常数**。

### 4.3 边界与责任划分

- **无连接线的卡不得参与判定**：国际卡（`isInternational`）由调用方处理——要么不送入求解器、要么送入但布局输入携带「无连线」标记。鉴于规格锁定为调用方责任，Round 1 在 PosterCanvas 侧核实现状并补守卫；若发现国际卡在输入里携带伪锚点，修在 PosterCanvas，不修在求解器。
- **规模边界**：`MAX_OPTIMIZED_CARDS = 80` 内保证「有 0 交叉解则输出 0 交叉」；超过 80 卡走 packing 通道 + validateHard + 有界修复（同列/同侧相邻交换），修不到 0 则如实 `fallback`。「不得输出交叉」的强承诺只对 ≤80 卡成立，验收表如此写死，避免不可证伪的全称命题。

---

## 5. `adaptCardLayout` 的复杂度上限与「简单自适应」边界

### 5.1 契约

```
adaptCardLayout(placements, movedId, nextPosition, bounds, options?): CardPlacement[]
```

纯函数（不改入参数组与元素）、确定性、返回全量 placements。算法步骤与复杂度上限：

1. 被拖卡走 `clampCardPosition(nextPosition, bounds)`——继承双开关语义（第 2 节的 effective-blockers），O(blockers)；
2. 收集与被拖卡 AABB(+gap) 相交的邻居；
3. 沿邻居**自身 side 的主轴**单向推开（left/right 侧沿 Y、top/bottom 侧沿 X），链式传播；每卡至多被推一次（按主轴排序后的一遍扫，等价单向 isotonic），迭代上限 n；
4. 被推卡只做画布 clamp + effective-blockers 检查；无处可推时**保留重叠**并返回——用户手动拖拽的意图优先，宁可留重叠也不得抛错、不得触发全量回溯。

**复杂度上限：O(n log n)（主轴排序）+ O(n)（推挤扫）。** 明令禁止调用：`solveCardLayout`、`optimizedLayout`、`repackAll`、`containFree`（其 12px 栅格扫是 O(画布面积/144 × 碰撞检测)，与「跟手」目标不相容）、任何连接线交叉计算。

### 5.2 「简单自适应」不做什么（边界清单）

- 不换 side、不重新分类（quadrant 分带 / columns 分列结果保持）；
- 不做全侧 isotonic 重排（只推被波及的链）；
- 不优化连接线交叉（拖拽是用户表达意图，交叉留给下一次「刷新展示框位置」全量求解）；
- 不回写 `positions`（调用方在 pointerup 收集位置变化后经事务回写，pointermove 期间仍只 clamp 当前卡——保持跟手，`DestinationCardsLayer` 现有拖拽预览机制不动）;
- 不处理多卡同时拖动、不处理 pan（pan 冻结坐标禁 clamp，PROGRESS 锁定）；
- 不保证被推邻居的锚点贴近度（推开即可，不追求最优）。

### 5.3 可证伪性能判据

`card-layout.perf.probe.test.ts` 已落盘：24 卡 × 8 次采样记录 solve 与 adapt 的中位数（console.info 输出数字，满足 Round 1 验收线 4「探针记录数字」）。验收标准：

- adapt(24 卡) 中位数 < solve(quadrant, 24 卡) 中位数 × 1/10，且绝对值 < 5ms（CI 级硬件）；
- solve 任一模式 24 卡中位数 ≥ 200ms 时探针发软阈值告警（已实现），Round 1 内不得触发。

---

## 6. 入口清单与回归守卫

### 6.1 入口清单（每一处都要改到或核实到）

| # | 入口 | 要求 |
| --- | --- | --- |
| 1 | `src/lib/scene-document.ts` | `CardSettings.allowElementOverlap?`；`layoutMode` 联合类型扩到 6 值；`CARD_LAYOUT_MODES` = 6 项；`normalizeLayoutMode` 接受新值、未知回落 quadrant；`createDefaultScene` 补默认；`normalizeScene` 读 `allowElementOverlap === true`（round-trip） |
| 2 | `src/lib/card-layout.ts` | `CardLayoutMode` 扩容；`CardLayoutBounds` + `allowElementOverlap`/`elementAreas`；`CardLayoutOptions` + `forbidConnectorCrossing?`；effective-blockers 单点；`validateHard` 交叉校验；分发 proximity/columns |
| 3 | `src/lib/card-layout-adapt.ts`（新） | `adaptCardLayout` + 单测（ROUND1-SPEC 指定归属） |
| 4 | `src/lib/card-layout-cache.ts` | key 纳入 `allowElementOverlap` + `elementAreas`（mode 已覆盖） |
| 5 | `src/components/canvas/PosterCanvas.tsx` | 359–380：元素 rect（嘉宾 + `textLayoutObstacle` + 可见 `assetElements`，装饰为新增）进 `elementAreas`；`cardLayoutBounds`（562–582）带上两开关；memo 依赖数组补 `project.cards.allowElementOverlap`、`project.assetElements`；核实国际卡不携伪锚点进求解（R6） |
| 6 | `src/components/inspector/CardsInspector.tsx` | `#cards-layout-mode` 6 项中文（省份近/分列整齐/四周整齐（默认）/极角环绕/右侧单列/边缘网格）；`#cards-auto-balance` disabled = mode ∉ {quadrant, columns}；新增 `#cards-avoid-map-overlap`、`#cards-avoid-element-overlap`（checked ⇔ `allow* !== true`）；撤下 `#cards-allow-map-overlap` 与「允许卡片覆盖地图」文案 |
| 7 | `src/components/canvas/DestinationCardsLayer.tsx` + 上游 `onMoveCard` 链 | pointermove 仅 clamp（现状保持）；pointerup 经 `adaptCardLayout` 回写**所有**变化卡的 `cards.positions`（`canvas-edit-transactions` 需要批量位置事务） |
| 8 | `src/lib/editor-canvas-actions.ts` | `refreshDisplayFramePositions` 保留（确认弹窗 + `clearCardPositions` 现状），可加简短 hint |
| 9 | `server/ai/tool-registry.ts` | `auto_layout` 的 mode 枚举补 `proximity`/`columns`；`update_cards` 描述提及新开关 |
| 10 | `server/ai/patch-validator.ts` | cards 白名单追加 `allowElementOverlap`（`layoutMode`/`allowMapOverlap` 已在） |
| 11 | `src/lib/card-layout-worker-protocol.ts` / `useCardLayoutWorker` | 类型透传即覆盖，无逻辑改动；核实 stale/SWR 行为不受 key 扩容影响 |
| 12 | `CHANGELOG.md` Unreleased + `USER_GUIDE.md` | 用户可见条目（含 R7 装饰障碍的行为变化说明）+ 版式排布一句话 |

### 6.2 回归守卫测试文件

**本轮新契约（已落盘，实现必须点亮而非跳过）：**

- `src/lib/card-layout.overlap-flags.test.ts` — 双开关分离语义（`hasElementOverlap` 探针激活是 R1 的验收信号）
- `src/lib/card-layout.crossing.test.ts` — `forbidConnectorCrossing` 默认硬约束、约束态 ≤ 非约束态、花束豁免不误杀
- `src/lib/card-layout.adapt.test.ts` — adapt 纯函数契约、饱和画布不抛、proximity/columns 确定性
- `src/lib/card-layout.perf.probe.test.ts` — 6 模式 8/24/48 卡耗时探针、直线连线交叉计数、adapt 中位数
- `src/components/inspector/CardsInspector.test.tsx` — 6 项下拉 + 中文标签、autoBalance 禁用条件、两个「禁止」勾选映射、旧文案退场

**既有回归（不得无故失败，Round 1 验收线 5）：**

- `src/lib/card-layout.modes.test.ts`、`card-layout.properties.test.ts`、`card-layout.degenerate.test.ts`、`card-layout.manual-clamp.test.ts`
- `src/lib/card-layout-cache.test.ts`、`card-layout-cache.invariants.cycle3.test.ts`、`card-layout-cache.affine.cycle3.test.ts`
- `src/components/canvas/useCardLayoutWorker.test.tsx`、`useCardLayoutWorker.stale.test.tsx`、`useCardLayoutWorker.swr-boundary.round3.test.tsx`
- `src/components/canvas/PosterCanvas.polygon-origin.cycle3r3.test.tsx`、`PosterCanvas.pan-projection.cycle2.test.tsx`、`PosterCanvas.recolor-projection.cycle3.test.tsx`
- `src/lib/scene-document.test.ts`（round-trip）、`src/lib/editor-canvas-actions.test.ts`
- `server/ai/agent-request.test.ts`、`server/ai/agent-loop.test.ts`（`auto_layout` 与 `update_cards` 冲突约束等）

测试执行遵循 AGENTS.md：各实现代理只跑自己改动对应的目标测试（`npx vitest run <file>`），禁止并行全量。

---

## 7. Round 2 攻坚拆分（`card-layout.ts` 已 1663 行）

Round 1 按 ROUND1-SPEC「避免大爆炸重构」，只强制拆出 `card-layout-adapt.ts`；Round 2 必须完成以下拆分（按依赖方向排序，先拆无策略的底层）：

| 新模块 | 迁入内容（现行行号段） | 依赖方向 |
| --- | --- | --- |
| `card-layout-geometry.ts` | `PreparedPolygon`/`PolygonIndex`/`RectIndex`、`overlaps`、多边形谓词、effective-blockers（约 100–530 行） | 无策略纯几何，最先冻结接口 |
| `card-layout-pack.ts` | `isotonicPack`、`classifyQuadrant/Radial/RightStack` + columns/proximity 分类、`placeSide`、`resolveObstacles`、`autoSplitX` | 依赖 geometry |
| `card-layout-optimize.ts` | `buildCandidates`、`scoreLayout`、`optimizedLayout`、交叉硬约束与 fallback 候选池 | 依赖 geometry + connector-geometry |
| `card-layout-repair.ts` | `containFree`、`repackAll`、`layoutGrid` | 依赖 geometry |
| `card-layout.ts`（门面） | 类型、`solveCardLayout` 分发、`validateHard`、`clampCardPosition`、back-compat 别名 | 汇聚层，调用方 import 面零迁移 |

拆分纪律：门面文件的导出集与签名不变（`solveDestinationCardLayout` 等 legacy 别名保留），每个新模块 ≤ 400 行，`WeakMap` 缓存（`preparedPolygons`/`polygonIndexes`/`derivedZones`）随几何模块走且保持模块级单例。

Round 2 其余攻坚项：proximity 质量提升（有界 2-opt 局部搜索）、columns 残余交叉的相邻交换修复、`buildConnectorGeometry` 结果按 (placement, style) 记忆化、>80 卡场景的交叉尽力修复策略、拆分后的所有权表（多子代理并行时 geometry 接口先冻结）。

---

## 8. SOTA 验收表（每项可证伪）

| 维度 | 验收项 | 可证伪标准 |
| --- | --- | --- |
| 功能 | 双开关生效 | 翻转任一勾选 → `PosterCanvas` 交给求解器的 `elementAreas`/`occupiedAreas`/`occupiedPolygons` 内容变化（组件测试断言 layoutRequest）；`overlap-flags` 探针激活（不再 skip） |
| 功能 | 6 模式可选可解 | `CardsInspector` 下拉 6 项且值/标签逐项等于守卫测试的期望表；每个 mode 对 seeded 8/24/48 卡输入 `solveCardLayout` 返回全量 placements 且 `result.mode` 回显 |
| 功能 | 拖拽自适应 | pointerup 后除被拖卡外至少一个受挤邻居位置变化并写入 `positions`；pointermove 期间 `positions` 不变（仅预览 transform） |
| 正确性 | 硬不变量 H1–H3 | 属性测试：seeded ≥ 200 实例 × 6 模式 × 双开关四组合，无一违反画布内/两两 gap/按开关避障；`status === "solved"` 时 `validateHard` 为真 |
| 正确性 | 交叉硬约束 H4 | ≤80 卡且 `connectorStyle` 存在：`status === "solved"` ⇒ 用 `connectorGeometriesIntersect` 复数为 0；存在交叉 ⇒ `status === "fallback"` 且交叉数 ≤ 关闭 `forbidConnectorCrossing` 时的交叉数（crossing.test 已断言）；花束用例 0 误报 |
| 正确性 | fallback 最少交叉 | 对构造的「无 0 交叉可行」实例，fallback 结果的交叉数 = 候选池最小值（测试内穷举小实例验证） |
| 正确性 | JSON round-trip | `allowElementOverlap` + 新 mode 经 `normalizeScene` 序列化/反序列化后逐字段相等；未知 mode 回落 quadrant |
| 性能 | 求解耗时 | perf 探针 24 卡中位数 < 200ms（软阈值不告警），48 卡不超时；数字必须出现在探针输出中（口头「很快」不算） |
| 性能 | adapt ≪ solve | adapt(24 卡) 中位数 < solve(quadrant, 24) × 1/10 且 < 5ms |
| 性能 | 缓存不假命中/不假失效 | 翻转 `allowElementOverlap` → key 变化（否则假命中）；纯 pan（origin 平移）→ polygon 段复用、不重新序列化环（polygon-origin 测试保持通过） |
| 无障碍 | 控件可达 | 每个新勾选/下拉有 `<label htmlFor>` 关联、可键盘切换（getByLabelText 可命中「禁止遮挡地图」「禁止遮挡其他元素」并触发 onPatch）；状态不用纯颜色表达 |
| 无障碍 | 交互状态保持 | 拖拽仍走 pointer capture、`pointercancel` 还原原位（现有行为不回退） |
| 向后兼容 | 旧工程不跳版 | 无装饰、缺新字段的旧 JSON：默认 quadrant + 双避让，placements 与改动前逐像素一致（快照）；有装饰的旧工程行为变化写入 CHANGELOG（R7），回滚 = 还原分支 diff |
| 向后兼容 | API 面稳定 | `solveDestinationCardLayout`/`layoutDestinationCards`/`clampDestinationCardPosition` 签名与语义不变；`data-*` 导出钩子名不变；`normalizeLayoutMode` 默认不变 |
| 向后兼容 | AI 面稳定 | `update_cards` 携 `allowElementOverlap` 过 patch-validator 白名单；`auto_layout` 新 mode 枚举可用；`positions` 保护语义（与 `update_cards` 互斥）不变 |

**交付纪律对齐（AGENTS.md）**：以上每一行都指向一个可运行的检查（测试文件或探针输出）。任何一项失败必须走 failure → cause → fix → recheck 链并留证据，禁止重试碰运气。破坏性变更仅 R7 一处（装饰成为障碍），回滚方案：还原本分支相对 `main` 的 diff，旧 JSON 缺字段行为与现在一致。

---

## 附：与其他 Round 1 产出的衔接

- `round1/gpt-1-perf.md`（性能侧报告）已存在；本文件的性能判据以 `card-layout.perf.probe.test.ts` 的探针输出为唯一事实来源，两文如有阈值分歧以更严者为准。
- 实现代理落地顺序建议：先 §2 的 effective-blockers 单点（解锁 overlap-flags 探针）→ §4 的 validateHard 硬化（解锁 crossing 测试）→ 新 mode 分类/打包 → adapt。每步只跑对应目标测试。
