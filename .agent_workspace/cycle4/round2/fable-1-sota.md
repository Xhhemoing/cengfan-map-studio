# Round 2 — fable-1 SOTA 复审：拆分方案 + 交叉产品化验收标准

- 作者：fable-1（SOTA 复审），模型 `claude-fable-5-thinking-xhigh`
- 基线时刻：**2026-08-25 09:10Z 工作区快照**。本文写作期间有并行 Round 2 子代理在飞改动（opus 拆分已落 8 个新模块、gpt 已点亮探针并拆 `modes.test.ts`、UI 代理在改 `CardsInspector`/`scene-document`）。凡引用行号，以 commit `7bc8144` 的 `src/lib/card-layout.ts`（2016 行）为准；凡引用在飞文件，均注明"快照"。
- 取证命令（本轮实际执行）：`npx vitest run scripts/file-size-ratchet.test.ts` → **2 failed | 3 passed**，失败明细见 §1 D1 行。

---

## 1. Round 1 实现 vs 锁定规格差距表

规格出处均为 `.agent_workspace/PROGRESS.md`；交叉数据以 `round2/gpt-1-perf.md`（Round 2 复测，探针无 skip）为准。

| # | 规格条款 | 实现现状（代码证据） | 差距与判级 |
| --- | --- | --- | --- |
| G1 | §3「优化路径：有 0 交叉候选则禁止选交叉候选」，且硬约束对**有连接线的所有模式**生效 | 交叉感知只存在于 `optimizedLayout`（quadrant/radial 专属）与 `layoutProximity`。`columns`/`right-stack`/`grid` 走 `sidePackLayout`/`layoutGrid`，全程零交叉感知。24 卡 straight 复测：proximity **0**，columns **39**，quadrant **39**，radial **9**，right-stack **96**，grid **78** | **D2 主体，R2 必修**。columns 是本轮新卖点「分列整齐」，39 交叉直接违反「能找到 0 交叉解则不得输出交叉」 |
| G2 | §3「无 0 交叉可行解：选**交叉最少**的布局，`status: "fallback"`」 | `chooseLayout`（1852–1871 行）在**第一个**几何可行但有交叉的 attempt 上立即 `return fallback`，后续 attempt 从不求值、交叉数从不比较。1866–1867 行注释声称「后面 attempt 只是饱和恢复，交叉不会更少」——对 `[optimized?, sidePack, repackAll]` 链不成立：`optimizedLayout` 返回 `null` 时 sidePack 的交叉直接出货，`repackAll`（角点装箱、锚点距离优先）完全可能交叉更少但永远没机会 | **D2 核心，R2 必修**。「最少」目前是「第一个可行的是多少就是多少」，规格语义未实现 |
| G3 | §3 硬约束不依赖障碍存在 | `solveCardLayout` 1887–1891 行：optimized 通道仍要求 `occupiedAreas`/`elementZones`/`occupiedPolygons` 至少一项非空。「双开关全放开 + 无文本嘉宾装饰」的工程绕过全部交叉优化，只剩 `validateHard` 事后否决 → 恒 fallback | **R2 必修**（Round 1 架构文 R2 风险原文重申，当时只补了 elementZones 一个条件） |
| G4 | ROUND1-BRIEF 攻坚 2「side-pack / grid / right-stack 增加拆线或换侧修复」 | 无任何 crossing-repair pass。sidePack 输出即终局 | **R2 必修**（范围可按 §3 验收表裁剪：columns/quadrant 必修，grid/right-stack 尽力+豁免） |
| G5 | AGENTS.md 400 行纪律 + ratchet | **现在就是红的**：ratchet 2 用例失败——`src/lib/card-layout.ts: 2016 lines (limit 400)`（offender 用例，因超过登记值失去豁免）+ `2016 lines, allowlisted at 1662 (+354)`（grown 用例）。`modes.test.ts` 469 行未登记的问题已被在飞拆分收敛（快照：276 + `modes-extra.test.ts` 204） | **D1，R2 必修**，方案见 §2 |
| G6 | ROUND1-BRIEF D3 探针点亮 | **已收敛**：`round2/gpt-1-perf.md` 复测 28/28 无 skip，`adaptCardLayout` 0.119ms | 关闭，无需再派 |
| G7 | ROUND1-BRIEF D4 properties 点亮 | `properties.test.ts` 在飞修改中（快照 264 行）。要求：几何硬约束 H1–H3 断言**不论 status** 执行；完成报告记录 solved 率（Round 1 基线 107/180） | R2 在飞，以其完成报告为准 |
| G8 | §1 双遮挡开关 | **已达标**：`elementAreas` 独立通道 + `obstacleZones` 单点门控，overlap-flags 探针激活。**残留条件项**：cache key 已纳 `allowElementOverlap` 但**未纳 `elementAreas` 内容**（opus-1 报告已知缺口 3）——若 Round 2 集成把 PosterCanvas 改为传 `elementAreas`，key 必须同批扩容，否则翻转元素障碍集合会假命中 | 条件必修：与 PosterCanvas 集成方式绑定 |
| G9 | §4 adapt + 拖拽 | 已达标（纯函数、0.119ms、pointerup 事务回写） | 关闭 |
| G10 | 向后兼容 API 面 | 新发现低危分叉：门面 1994–2001 行的 `solveDestinationCardLayout` 只透传 `mode`/`autoBalance`（丢 `connectorStyle`/`forbidConnectorCrossing`），而 deprecated `destination-layout.ts` 40–47 行同名导出透传 `...options`。两份 legacy 面行为不一致 | R2 搬运时顺手统一为 `...options` 透传，禁止继续漂移 |

---

## 2. 可执行的文件拆分方案（对照 opus 在飞实况校准）

### 2.1 已落盘部分的验收（快照 09:10Z，全部 ≤400 ✓）

opus 的模块图与我 Round 1 §7 规划同构（geometry→polygons、repair→collision+fallback、optimize 再拆 candidates），依赖方向经我逐文件核对 import 表，**无环**：

| 文件（已存在，未跟踪） | 实测行数 | 迁入内容 | 依赖 |
| --- | ---: | --- | --- |
| `src/lib/card-layout-types.ts` | 130 | 全部公共类型 + `EPSILON`/`MIN_GAP` + `clamp`/`overlaps`/`centerOf` | 仅 `connector-geometry`（type） |
| `src/lib/card-layout-polygons.ts` | 299 | `PreparedRing`/`PreparedPolygon`、`preparePolygon`、`ringContains`、`preparedContainsPoint`、`polygonBounds`、`preparedCrossesRectangleEdges`、`preparedIntersectsRectangle`、`rectangleIntersectsPolygon`、`PolygonIndex`、`polygonsHitRectangle` | types |
| `src/lib/card-layout-collision.ts` | 248 | `protectedZones`/`elementZones`/`obstacleZones`（含三个 WeakMap）、`isInsideCanvas`、`hitsProtected`、`hitsPlaced`、`RectIndex`/`buildRectIndex`、`containFree`、`sideForPlacement`、`orderResult`、`validateGeometry` | types, polygons |
| `src/lib/card-layout-connectors.ts` | 218 | `connectorBounds`、`placementGeometry`、`boundsTouch`、`connectorIntersects`、`connectorIntersectsPolygon`、`connectorMapIntersections`、`connectorHitsCard`、`compareScores`、`sideDistance`、`sideAxisSize`、`normalizedSideLoad`、`sameAnchorCluster`、`crossingsEnforced`、`connectorClearance`、`countConnectorCrossings` | types, polygons, connector-geometry |
| `src/lib/card-layout-pack.ts` | 337 | `isotonicPack`、`SideAssignment`、`bandRatio`、`classifyQuadrant`、`autoSplitX`、`classifyRadial`、`classifyRightStack`、`classifyColumns`、`primarySpan`/`primaryKey`/`normalForSide`、`placeSide`、`resolveObstacles`、`overflowSide`、`sidePackLayout` | types, collision |
| `src/lib/card-layout-candidates.ts` | 227 | `LayoutCandidate`、`MAX_OPTIMIZED_CARDS` 等常数、`homeSides`、`addRail`/`nearestRails`、`buildCandidates` | types, polygons, collision, connectors, pack |
| `src/lib/card-layout-fallback.ts` | 134 | `layoutGrid`、`repackAll` | types, collision |
| `src/lib/card-layout-optimize.ts` | 227 | `angularOrder`、`scoreLayout`、`optimizedLayout` | types, collision, connectors, candidates |

把 `containFree`/`sideForPlacement`/`orderResult` 落进 collision 是正确的一手：它消除了我预判的 `pack ⇄ repair` 环（`sidePackLayout` 调 `containFree`，而 fallback 模块不回依赖 pack）。

### 2.2 未收尾部分（决定成败，`card-layout.ts` 快照仍 2016 行）

| 动作 | 内容 | 预估行数 | 硬要求 |
| --- | --- | ---: | --- |
| **新建 `src/lib/card-layout-proximity.ts`** | `PROXIMITY_CANDIDATE_LIMIT`/`PROXIMITY_MAX_PROBES`、`ProximitySpot`、`proximitySpots`（现 1619–1680）、`layoutProximity`（1687–1765） | **≈170**（150 正文 + 头/import） | 必须拆出。若留在门面，门面将落在 400±20 的零余量区，Round 2 交叉收敛（G2/G4）还要往门面/optimize 加 40–80 行，必然顶破 |
| **`clampCardPosition` 迁入 `card-layout-collision.ts`** | 现 1914–1966（58 行），依赖 protectedZones/elementZones（同文件）、rectangleIntersectsPolygon/polygonBounds（polygons）、clamp/overlaps（types） | collision → **≈306**，仍 ≤400 | 目的是打断现存 `card-layout ⇄ card-layout-adapt` 模块环（见 §5 R1）。`card-layout-adapt.ts` 的 import 从 `"./card-layout"` 改为 `"./card-layout-collision"` + `"./card-layout-types"`；门面继续 re-export |
| **`card-layout.ts` 瘦成门面** | 保留：类型 re-export（全量，含 `Rect`）、`HardCheck`/`validateHard`（1041–1065）、`chooseLayout`（1852–1871，R2 将重写为跨 attempt 取最小交叉）、`solveCardLayout`（1873–1899）、`layoutCards`、`clampCardPosition` re-export、`adaptCardLayout` re-export、Destination* 别名（1974–2016，透传统一见 G10） | **≈250–280**；G2/G4 收敛后 **≤340**；硬上限 400 | 导出集与签名逐项保持（§5 R3 清单），外部 20+ 消费文件 import 零迁移 |

行数守恒自查：2016 ≈ 1820（已落盘 8 模块）+ 170（proximity）+ 260（门面）− 约 230（各文件头注释/import 重复开销），量级吻合，无大段代码悬空。

### 2.3 allowlist 动作（同一改动内完成，禁止上调）

ratchet 三条规则（`scripts/file-size-ratchet.test.ts` 96–170 行）决定了唯一合法操作序列：

1. `card-layout.ts` 门面 ≤400 ⇒ **删除** `"src/lib/card-layout.ts": 1662` 条目。注意：不是改小——stale 检查对「≤400 但仍有条目」也会红（`now X lines, at or under the limit — delete this entry`）。
2. 若门面意外落在 401–1662 之间 ⇒ 条目改为**实测 `wc -l` 值**（不是估算值；countLines 与 `wc -l` 同口径）。低于 1662 的任何值都算「下调」达标，但应以 ≤400 + 删除条目为目标。
3. **禁止**为以下任何文件新增条目：10 个新模块、`modes-extra.test.ts`、其余测试。任何新文件 >400 = 拆分失败，回去再拆，不许登记。
4. 连带雷区：`scene-document.ts` 正好压在登记值 766 上且在飞修改中（D6 要求把挤行还原，还原必然 +1~2 行）——**必须同 commit 拆出子模块或删减到 766 以内**，否则 grown 用例红。这属于 UI/scene 代理的所有权，但 ratchet 是全局闸，主调度器合并时按此复核。
5. 验收命令：`npx vitest run scripts/file-size-ratchet.test.ts` → **5/5 绿**（当前 3/5）。

### 2.4 搬运纪律

- **两个 commit**：commit A 纯搬运（placements 逐字节不变，用 `modes.test.ts` 确定性用例 + seeded 快照证明）+ allowlist 删除/下调；commit B 交叉行为收敛（G2/G3/G4）。混在一个 diff 里回归无法定位。
- 搬运 commit 的四道闸：`npx tsc -b --noEmit` 干净；`npx vitest run scripts/file-size-ratchet.test.ts` 绿；目标测试（modes / modes-extra / crossing / overlap-flags / adapt / manual-clamp / degenerate / properties / perf.probe + cache 三件）绿；`npx eslint` 改动文件干净。禁止并行全量（AGENTS.md）。

---

## 3. 交叉产品化的可证伪验收

### 3.1 必须 0 交叉（`status === "solved"` 且独立复算 = 0）的输入类别

| 类别 | 构造 | 可证伪判据 |
| --- | --- | --- |
| A1 proximity | perf 探针 24 卡 seeded straight 场景（现状已 0） | 回归锁：交叉计数保持 0。任何改动使其 >0 即拒 |
| A2 quadrant/radial 有障碍 | `crossing.test.ts` 现有「手搓对调布局有交叉 → 求解器 0 交叉」用例 | 保持 solved + 独立计数 0 |
| A3 quadrant/radial **无障碍**（G3 靶子） | 同 A2 场景但 `allowMapOverlap: true`、无 `elementAreas`、无 polygons | **今天必红**（绕过 optimized 通道 → sidePack 交叉 → fallback），修复 G3 后必须 solved + 0 交叉。这条是 G3 的证伪器 |
| A4 columns 结构可解 | 两列各 ≤6 卡、锚点 X 清晰分离两侧、锚点 Y 各列内严格递增、无障碍、straight | 0 交叉 + solved，同时列不变量保持：左列贴 `map.x − gap`（右缘对齐）、右列贴 `map.x + map.width + gap`、列内 y 保持锚点序 |
| A5 跨 attempt 择优（G2 靶子） | 构造 sidePack 产出 ≥1 交叉、`repackAll` 存在 0 交叉解的实例（卡片小、画布大、锚点集中在地图内使 side 打包必然拉长线交叉，而角点装箱可各归各位） | **今天必红**（chooseLayout 在 sidePack 处立即 fallback 出货），修复后必须 0 交叉 solved。这条是 G2 的证伪器 |

「独立复算」定义（A 类全部适用）：测试内用 `buildConnectorGeometry({card: p, anchor, preferredSide: p.side, style})` + `connectorGeometriesIntersect` 对结果 placements 两两计数，**不读 solver 自报的任何字段**。`modes.test.ts` 的 `straightCrossings` 帮助函数就是这个形状，沿用。

### 3.2 允许 fallback 的输入类别（豁免格）

| 类别 | 理由 | fallback 时仍必须满足 |
| --- | --- | --- |
| B1 >80 卡（`MAX_OPTIMIZED_CARDS`） | Round 1 架构文 §4.3 锁定的承诺边界 | 下述 F1–F4 |
| B2 `grid` / `right-stack` | 模式语义（网格/单列）与锚点几何天然冲突，opus-1 已知缺口 2 | F1–F4；不强制 0 交叉，但**尽力修复后**交叉数不得高于修复前 |
| B3 构造性无 0 交叉解 | 例：两张卡被障碍钉死在同侧、锚点左右对调（pigeonhole） | F1–F4，且测试内穷举小实例验证 F3 的「最少」 |
| B4 饱和画布 | 48 卡小画布（degenerate 已覆盖） | F1、F2（不抛、全量返回） |

fallback 四条硬底线：

- **F1** placements 与输入等长，求解器不抛（现契约保持）；
- **F2** 几何硬约束 H1–H3 不因交叉修复被牺牲（画布内、两两 gap、按开关避障）——fallback 豁免的只有 H4，不豁免几何；
- **F3** 交叉数 = 本次 solve **评估过的全部完整可行布局**中的最小值（G2 修复后的 chooseLayout 语义），且 ≤ 同输入 `forbidConnectorCrossing: false` 的交叉数（crossing.test 已有该断言形状）；
- **F4** `status === "fallback"` 与独立复算 >0 双向一致：solved ⇒ 计数 0；fallback（因交叉）⇒ 计数 >0。两个断言必须同时写，缺一即是「只改 status」的漏洞。

### 3.3 「禁止只改 status 不改几何」的封堵清单

作弊路径逐条封死，验收时按清单核对：

1. **改判定谓词**：不许动 `connector-geometry.ts` 的花束豁免半径（`max(4×clearance, 10, 24)`）、曲线 16 段采样、`segmentsCross` 容差。回归锁：crossing.test 的 bouquet 用例（同锚三卡 curve 0 误报）+ gpt-2 边界报告里"长直线不吃豁免"的用例。
2. **偷偷关约束**：`crossingsEnforced` 语义（`forbidConnectorCrossing !== false && connectorStyle !== undefined`）不许收窄。回归锁：crossing.test 的 `Object.defineProperty` 选项读取探针。
3. **从探针输入里拿掉 connectorStyle**：perf 探针的 24 卡 straight 交叉计数表是公共记分板，输入构造归 gpt 所有，实现代理不许碰。
4. **只把 fallback 改名 solved**：被 F4 双向断言封死。
5. **靠 skip 缩水**：properties 点亮（G7）后，几何断言不论 status 执行；完成报告必须记录 solved 率相对 107/180 的变化方向及原因。
6. 结果性总指标：修复后 24 卡 straight 探针，**columns 与 quadrant 的交叉计数必须下降**（当前 39/39）。「测试全绿但记分板数字不动」= 验收拒绝。

### 3.4 columns 的结构不变量与 H4 的优先序（裁定）

Round 1 架构文 §3.2 的立场维持：columns 的保序（C2）消除同列相邻逆序这一主导交叉类别，但不是结构性 0 交叉保证。Round 2 修复 pass 的合法手段，按优先序：

1. 列内相邻对交换（仅当交换**消除交叉且不引入新交叉**时接受——注意交换即破坏该对的锚点序，允许，因为 H4 硬约束优先于 C2 软不变量；C1 贴缘不变量不许破坏）；
2. 单卡换列（重新打包两列，接受当且仅当总交叉严格下降）；
3. 都修不到 0 ⇒ fallback + F3。

quadrant sidePack 路径同理（同侧相邻交换、邻侧转移）。禁止为修交叉发明第二套交叉判定谓词。

---

## 4. Round 3 才做 vs 本轮必须收敛

### 本轮（Round 2）必须收敛，缺一不验收

1. **拆分落地 + ratchet 5/5 绿**：§2 全部动作，`card-layout.ts` 条目删除（或下调至实测值），无任何新增条目，`scene-document.ts` 不越 766。
2. **G2**：`chooseLayout` 重写为跑完 attempts、feasible 优先、交叉最少、先序 tie-break；A5 用例绿。
3. **G3**：optimized 通道门控放宽（无障碍时 quadrant/radial 也过 0 交叉筛选）；A3 用例绿。
4. **G4（columns 部分）**：columns 修复 pass + A4 用例 + 记分板 columns 交叉数下降。grid/right-stack 按 B2 豁免格处理（尽力修复可以留到 Round 3，豁免断言本轮就要写死）。
5. **G7**：properties 点亮（在飞，验收其完成报告的 failure→cause→fix→recheck 链）。
6. **G10**：两份 `solveDestinationCardLayout` 统一 `...options` 透传。
7. **G8 条件项**：若集成改传 `elementAreas`，cache key 同批扩容 + `card-layout-cache.test.ts` 断言更新。

### Round 3 才做（本轮禁止顺手夹带）

1. **D5 无头浏览器手测 + demo 视频**（walkthrough 工件，配合主调度器验收）。
2. 性能优化项（fable-2 审计 §6 的 8–11）：worker structured-clone 导致的 prepared 结构冷启动、`buildCandidates` O(n²) rail 注入、cache 容量 12 与 pan 节流。这些有 perf 探针兜底记录，不阻塞正确性。
3. proximity 有界 2-opt 质量提升、>80 卡尽力修复策略、grid/right-stack 常亮 fallback 的 UI 提示策略（产品决策，需 UI 侧参与）。
4. 拖拽 clamp gap=0 与 `hitsProtected` gap 口径统一（牵动手感，需 Round 3 手测配合）。
5. 任何渲染器/画布层重构（全局硬约束本来就禁止）。

边界裁定原则：本轮只收敛「规格已锁定但未兑现」的项（G1–G5）；「规格未锁定的质量/性能改进」一律 Round 3，避免拆分 + 行为收敛 + 性能优化三种 diff 搅在同一轮互相掩护。

---

## 5. 对 opus 拆分的风险清单

**R1（高）循环 import — 现存环必须借拆分打断，而不是继承。** 今天 `card-layout.ts` 1972 行 re-export `card-layout-adapt`，而 adapt 第 11–17 行反向 import `clampCardPosition`——这是一个真实的 ESM 模块环（目前靠函数声明提升侥幸工作）。拆分后若 `clampCardPosition` 留在门面，环原样保留；更糟的是新模块若图省事 import `"./card-layout"` 拿 `validateHard`/类型，环会扩大成多文件环并出现 TDZ 隐患。**规定：任何 `card-layout-*.ts` 禁止 import `"./card-layout"`**（快照核对：已落盘 8 模块全部合规，import 只指向 types/polygons/collision/connectors/pack/candidates）；`clampCardPosition` 迁 collision 后 adapt 改从 collision/types 进口。验收：`rg 'from "\./card-layout"' src/lib/card-layout-*.ts` 结果为空（adapt 除外，且 adapt 只许指向 collision/types）。

**R2（高）worker 必须继续从门面进口。** `src/workers/card-layout.worker.ts` 现在 import `"../lib/card-layout"` 的 `solveCardLayout`——保持。若 worker 直连 `card-layout-optimize` 绕过 `chooseLayout`，G2 的跨 attempt 择优在 worker 路径整个失效且主线程测试测不出来。连带项：`preparedPolygons`/`polygonIndexes`（polygons）与 `derivedZones`/`mergedZones`（collision）四个 WeakMap 必须保持**模块级单例**；若搬运时误入函数作用域，worker 每消息冷启动会从「已知性能债」恶化成「每次调用全 miss」，而 perf 探针在主线程复用实例，测不出该回归。验收：对四个 WeakMap 各 `rg` 确认声明在模块顶层。

**R3（高）门面导出集是 20+ 消费文件的契约面。** 全部测试、`PosterCanvas`、`DestinationCardsLayer`、`useCardLayoutWorker`、`card-layout-cache`、`card-layout-worker-protocol`、`canvas-render-metrics`、`agent-session`、`card-drop-adapt`、`destination-layout` 都 import `"./card-layout"`。逐项保持清单：`solveCardLayout`、`layoutCards`、`clampCardPosition`、`adaptCardLayout` + `CardLayoutAdaptOptions`、全部类型（`CardSide`/`CardLayoutMode`/`CardLayoutInput`/`CardArea`/`CardPoint`/`CardPolygon`/`CardLayoutBounds`/`CardPlacement`/`CardLayoutStatus`/`CardLayoutOptions`/`CardLayoutResult`/**`Rect`**——最容易漏）、Destination* 全家（`DestinationCardInput`/`DestinationCardArea`/`DestinationCardBounds`/`DestinationCardSide`/`DestinationCardPlacement`/`DestinationLayoutStatus` 三值联合/`DestinationLayoutResult`/`DestinationLayoutOptions`/`solveDestinationCardLayout`/`layoutDestinationCards`/`clampDestinationCardPosition`）。deprecated 的 `destination-layout.ts` 还从门面吃 `CardLayoutStatus` 等类型，删任何一个导出它先红。验收：`npx tsc -b --noEmit` + 上述目标测试全绿，**不允许改任何消费方的 import 行**来救编译。

**R4（中）搬运与行为改动混 diff。** §2.4 已规定两 commit。额外证据要求：commit A 的完成报告附「同 seed 输入拆分前后 placements `toEqual`」的运行输出——`modes.test.ts` 确定性用例天然充当此证据，但要在拆分后**真跑**并贴结果，不许口头声明。

**R5（中）并行所有权冲突。** 快照显示 gpt 代理同时在改 `modes.test.ts`/`modes-extra.test.ts`/`properties.test.ts`/`perf.probe.test.ts` 等测试，UI 代理在改 `CardsInspector`/`scene-document`/CHANGELOG。opus 的写权限应限定为：`card-layout*.ts` 实现文件（含新模块）+ `scripts/file-size-allowlist.json` 的 card-layout 条目。测试文件红了→通知所有者修，不许越界改断言；`scene-document.ts` 的 766 雷区（§2.3-4）归 UI 代理，但 ratchet 全局闸红账算合并批次的，主调度器兜底。

**R6（中）门面行数余量不足。** 若 proximity 不拆出（§2.2 第一行），门面 ≈400±20 且 G2 重写 `chooseLayout` 还要加行——等于刚拆完就再次顶穿 400、被迫重新登记 allowlist（= 违反「禁止上调」）。proximity 拆出是硬要求不是建议。

**R7（低）allowlist 操作顺序错误。** 常见翻车：先删条目后拆文件（中间态 offender 红）、拆完忘删条目（stale 红）、给新模块登记（哲学违规 + 上调）。正确序：拆分与 allowlist 编辑在**同一个 commit A** 内原子完成，提交前跑一次 ratchet 确认 5/5。

---

## 附：与本轮其他产出的衔接

- 性能基线以 `round2/gpt-1-perf.md` 为唯一事实来源（六模式 8/24/48 卡中位 + 24 卡交叉记分板）；G4 修复后的「不得劣化超 2×」对照它算。
- 本文 §3 验收表与 Round 1 架构文 §8 SOTA 验收表是叠加关系不是替换：§8 的 H1–H3 属性、round-trip、无障碍、AI 面条目继续有效。
- 建议实现落地顺序：commit A（§2 搬运 + allowlist）→ commit B1（G2 chooseLayout + A5 用例）→ commit B2（G3 门控 + A3 用例）→ commit B3（G4 columns 修复 + A4 用例 + 记分板复跑）。每步只跑对应目标测试 + ratchet。
