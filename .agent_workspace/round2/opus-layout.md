MODEL_SLUG: claude-opus-5-thinking-high-fast

# R2-opus-layout — 布局质量与性能第二轮

分支 `cursor/agent-sota-polish-cbcd`。未提交（按简报要求）。
`solveCardLayout` 的公共签名未变；未新增可选参数。

改动文件：`card-layout.ts`、`card-layout-space.ts`、`card-layout-optimizer.ts`、
`card-layout-candidates.ts`、`card-layout-connectors.ts`、`card-layout-geometry.ts`、
`card-layout-pack.ts`、`card-layout-manual.ts`、新增 `card-layout-saturation.ts`，
以及 `card-layout.test.ts` / `card-layout-space.test.ts` / `card-layout-cache.test.ts`。

---

## 0. 一句话结论

连接线搜索在 R1 其实是**空转**的（34 张卡的省界盘面上 34/34 张卡候选数为 0），
本轮把它修好并加了预算与种子保护；同时手动拖拽钳制的指数级回退被修掉
（真实地图上 1068ms/帧 → 4.9ms/帧），饱和画布不再产生任何"被完全压住"的卡片。

---

## 1. 各项要求的落点

### 1.1 200 张卡的重叠（要求 1）

R1 的饱和回退靠**把卡片精确叠在一起**压低重叠对数：一张卡被另一张完全盖住时只贡献 1 对，
但它在海报上等于消失了——不可见、不可选。本轮把 `layoutQuality` 的比较维度改成
`[越界, 隐藏, 重叠对, 压地图, 锚点距离]`，"隐藏"排在"重叠对"之前，
并让 `layeredPack` 把卡片均摊到画布能容纳的**每一个**槽位（`balancedGroups` + `spreadSlots`，
从「每槽最少卡片」改成「画布能放下的最多槽位」）。

真实重叠对（gap=0，即肉眼可见的压盖）与隐藏卡片数：

| 场景 | HEAD 重叠对 | 本轮 重叠对 | HEAD 隐藏 | 本轮 隐藏 | HEAD 耗时 | 本轮耗时 |
|---|---:|---:|---:|---:|---:|---:|
| 200 卡 @1500×1000 | 83 | 83 | 83 | **0** | 149ms | 19ms |
| 200 卡 @900×650 | 276 | 276 | 146 | **0** | 50ms | 7ms |
| 200 卡 @600×400 | 736 | 736 | 176 | **0** | 12ms | 8ms |
| 400 卡 @1500×1000 | 350 | 350 | 250 | **0** | 200ms | 22ms |

重叠对与 HEAD **完全相同**，隐藏卡片从 83/146/176/250 降到 0，同时快 1.5–9 倍。
新测试 `fills every slot the saturated canvas holds` 直接把重叠对数钉在
「均分到画布槽位容量」这个理论下界上（三种形状全部精确命中，不是不等式）。

饱和扫描（412 组画布/卡片尺寸/数量组合）：无掉卡、无 NaN、**无任何两张卡坐标重合**。

> 注意读数陷阱：`overlapPairs(placements, gap)` 统计的是"间距小于 gap"，
> 不是真的压盖。饱和时 cascade 会吃掉槽间 gap，所以那个口径的数字会从 276 涨到 1009，
> 但卡片并没有真的重叠。上表用的是 gap=0 的真实压盖口径。

### 1.2 多边形命中测试的网格/边细化（要求 2）

`LayoutSpace` 现在有两层结构，共享同一次边遍历（`buildObstacleIndexes`）：

- **边索引**：每条省界线段进 `RectIndex`，卡片只测它覆盖网格里的那几条边，
  180 点的省和三角形一样便宜——除非卡片真的压在海岸线上。
- **占用栅格 `PolygonRaster`**：把画布切成边索引同样大小的格子，标成
  free / full / mixed。**这是精确的而非启发式的**：没有任何边穿过的格子，
  整格要么全在形状内、要么全在形状外，一次射线检测就能定论；
  `fillInteriors` 按行做游程填充，所以射线检测次数随海岸线复杂度增长，
  而不是随包围盒面积——有远岛的省份包围盒巨大，逐格测会吃掉整个 solve。

`space.blocked()` 吞吐（40000 次探测，命中数两侧完全一致，可作为等价性证据）：

| 几何 | HEAD 构建 | 本轮构建 | HEAD 每次 | 本轮每次 | 加速 |
|---|---:|---:|---:|---:|---:|
| 34 部件 × 180 点 | 0.1ms | 1.4ms | 1.77µs | 0.31µs | 5.7× |
| 329 部件 × 19 点（≈真实中国地图） | 0.3ms | 2.0ms | 0.68µs | 0.29µs | 2.3× |
| 329 部件 × 200 点（病态） | 0.7ms | 17.0ms | 2.95µs | 0.45µs | 6.6× |

构建是每次 solve 一次的固定成本，回本点约 4000–10000 次探测；
真实盘面的 solve 探测量在十万级，所以稳赚。真实地图（实测 329 部件 / 6242 个点）
构建只要约 1.3ms。

`card-layout-space.test.ts` 新增了一个穷举等价测试：环形+孔洞+碎片三种多边形，
三种探测尺寸 × 数百个位置，`space.blocked()` 必须逐点等于
`rectangleIntersectsPolygon` 的答案，并对栅格做了变异检验。

### 1.3 连接线搜索：自适应上限（要求 3）

**先说一个反直觉的发现**：R1 的搜索在有障碍的盘面上基本是空转的。
`nearestRails` 把导轨按离锚点的距离截断到 14 条，而每个省贡献 2 条导轨，
于是省界导轨把画布边缘和地图框导轨全挤掉了——而后者才是唯一可靠避开地理的导轨。
结果是候选集为空：

| 场景 | HEAD 候选总数 | HEAD 空候选卡片 | 本轮候选总数 | 本轮空候选 |
|---|---:|---:|---:|---:|
| 34-rect-obstacles | 206 | 24 / 34 | 2510 | 0 |
| 60-rect-obstacles | 72 | 55 / 60 | 2712 | 0 |
| 34-province-vector | 0 | 34 / 34 | 2952 | 0 |
| 60-city-vector | 31 | 57 / 60 | 2705 | 0 |

`mergeRails` 现在把「框架导轨」和「障碍导轨」分开，只有当一张卡候选为空时
才豁免框架导轨不被截断（`keepFrame`）——只对真正饿死的卡片放宽，避免全局变贵。

在此基础上做了三件事：

1. **种子化搜索（quality ratchet）**。求解顺序改成"先侧边打包 + 修复阶梯，
   拿到一个合法布局，再把它作为种子交给搜索"。`optimizedLayout` 只在
   **打败种子**时才返回结果，否则返回 `null`。搜索因此**在数学上不可能变差**，
   只可能变好或原地不动。新测试 `never lets the connector search return a worse
   layout than packing alone` 用两个几何等价、但只有一个会触发搜索的画布对比钉住这点。
2. **确定性工作预算**。`SEARCH_BUDGET = 2_500_000`（单位是候选比较次数，不是毫秒——
   墙钟预算会让输出取决于机器负载，破坏确定性）。预算只决定**试几个插入顺序**；
   已经开始的顺序一定跑完，所以耗尽预算只会少探索，永远不会少放一张卡。
3. **修复定价**。`containFree` 修复要在 12px 点阵上扫过整个空闲画布，CPU profile 显示
   60 卡 + 全图障碍时它独占整个 solve 的 ~20%。`REPAIR_COST = 60_000`（扫过 20k→60k）
   是实测拐点：再便宜就是拿一大块帧预算换几条交叉，再贵则真正需要修复的盘面拿不到修复。

**关于 80 → 120**：试过了，不划算，所以 `MAX_OPTIMIZED_CARDS` 维持 80，但把常量注释
从"成本上限"改写成了实测理由。100 卡和 120 卡盘面（向量与矩形障碍各测）上，
搜索**每一次**都原样退回种子，只是白花几百毫秒。上限之上的成本控制交给
`SEARCH_BUDGET`，上限本身只是"搜索开始不赚钱"的那条线。

**不掉卡的证明**：`never drops, duplicates or corrupts a card, on either side of
the search cap` 覆盖 1 / 34 / 79 / 80 / 81 / 200 张卡 × 3 种画布 × 2 种模式，
断言输出的 id 序列与输入**逐一相等**（顺序也相等），且每张卡有限、在边界内。
79/80/81 刻意跨过上限，200 张让每个画布都饱和。

### 1.4 手动钳制的指数级回退（本轮最大的单点修复）

`PosterCanvas.performance.test.tsx` 在本轮改动下从 172ms 变成 20s 超时。
四步取证：

- **failure**：该用例超时（测试体实测 66.8s）。
- **cause**：给 `clampCardPosition` 打点后确认——250 次 pointermove 里有 17 次
  落在地理上，走了穷举候选扫描；累计 **7,293,357** 个候选点对，每个点对再对全部
  **329** 个省界多边形做一次无索引的 `rectangleIntersectsPolygon`。
  这条路径 R1 报告里就列为遗留项 5，本轮只是第一次真的踩到：布局改了，
  卡片起始位置变了，拖拽终点落到了省界上。
- **fix**：三处。障碍 AABB 进 `RectIndex`（探测只测身边的障碍）；
  多边形 AABB 用 `WeakMap` 按对象身份记忆（拖拽每帧重建 bounds 对象但省界是同一批）；
  候选点按到原点的距离升序扫描并做分支限界（一旦找到空位，更远的整行整列直接剪掉），
  外加 `MAX_PROBES = 4096` 的硬上限。
- **recheck**：该用例 2 passed / 193ms。

**等价性**：写了一个对拍脚本，400 组画布（含 0×0、margin 5000、
`allowMapOverlap`、退化多边形、NaN 坐标）× 12 个探测位置 = **4800 个用例**，
新旧实现输出 `Object.is` 逐字段相同，**0 处不一致**，且全部有限。

拖拽帧耗时（250 帧连续拖拽，每帧都被地理推开）：

| 几何 | HEAD 每帧 | 本轮每帧 | 加速 |
|---|---:|---:|---:|
| 34 部件 × 60 点 | 3.86ms | 1.02ms | 3.8× |
| 120 部件 × 120 点 | 94.18ms | 3.29ms | 29× |
| 329 部件 × 200 点 | 1068.47ms | 4.86ms | **220×** |

顺带把 NaN 洞补上：`Math.max(0, position.width)` 遇到 `NaN` 会一路传染到返回值，
改成 `finiteOr` 之后不会了；测试里补了 NaN 宽高、以及**原点被挡住**（会走候选扫描那条路）
的退化用例——原来的 NaN 测试只覆盖了提前返回那条路。

刻意**没有**在 `clampCardPosition` 里复用 `LayoutSpace`：它的边索引+栅格构建在真实地图上
要约 1.3ms，一次 solve 摊得起，每个拖拽帧摊不起。

### 1.5 新增测试（要求 4）

`card-layout.test.ts`（+7）：

- `never drops, duplicates or corrupts a card, on either side of the search cap` — 不掉卡。
- `never lets the connector search return a worse layout than packing alone` — 搜索单调不劣化。
- `keeps every saturated card contained, distinct and mostly unstacked` — 饱和时每张卡都在、
  在界内、坐标互不相同。
- `fills every slot the saturated canvas holds instead of leaving spares empty` — 重叠对数
  精确等于均分到槽位容量的下界。
- `clamps a manual position on degenerate and hostile bounds without NaN` — 扩到 8 组，
  含 NaN 宽高与"原点被挡"的候选扫描路径。
- `pushes a manual card clear of a province-dense map, deterministically and quickly` — 240 个
  省界部件下拖拽 60 帧，结果确定、有限、在界内，并有每帧 50ms 的悬崖探测器。
- `puts a manually dragged card on the nearest legal spot, not merely a legal one` — 钉住
  "最近合法位置"而不只是"某个合法位置"。
- `stays deterministic on a board large enough to exhaust the search budget` — 预算耗尽路径的确定性。

`card-layout-space.test.ts`：栅格与精确多边形测试的穷举等价 + 变异检验。

### 1.6 never-throw

`solveCardLayout` 仍然不抛。412 组饱和扫描 + 4800 组钳制对拍 + 现有的退化画布测试
全部无异常、无 NaN、无掉卡。

---

## 2. 质量 / 性能总表

`mode: quadrant`, `connectorStyle: curve`, `connectorWidth: 1.5`。
cross = 渲染态连接线交叉对数，dist = 卡心到锚点距离和，p50/p95 取 9 次采样。
两侧 determinism 均为 stable。

| 场景 | n | HEAD cross | 本轮 cross | HEAD dist | 本轮 dist | HEAD p95 | 本轮 p95 | 时间比 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 34-province-vector | 34 | 135 | **42** (−69%) | 18709 | 14259 | 365.0 | 225.0 | 0.62× |
| 34-province-wide | 34 | 70 | 70 | 14783 | 14783 | 673.2 | 59.6 | **0.09×** |
| 34-province-coarse | 34 | 159 | **33** (−79%) | 19248 | 14993 | 95.5 | 191.9 | 2.01× |
| 60-city-vector | 60 | 351 | **193** (−45%) | 33096 | 27549 | 728.8 | 175.3 | **0.24×** |
| 100-city-vector | 100 | 1065 | 1065 | 56545 | 56545 | 1082.3 | 86.9 | **0.08×** |
| 34-rect-obstacles | 34 | 48 | 48 | 18462 | 18462 | 48.6 | 101.9 | 2.10× |
| 60-rect-obstacles | 60 | 443 | **240** (−46%) | 36245 | 31137 | 56.4 | 85.3 | 1.51× |
| 100-rect-obstacles | 100 | 696 | 696 | 43687 | 43687 | 90.2 | 38.4 | 0.43× |
| 120-city-vector | 120 | 422 | 422 | 60323 | 60323 | 3129.7 | 217.4 | **0.07×** |
| 200-city-vector | 200 | 1214 | 1214 | 80994 | 80994 | 5207.9 | 377.2 | **0.07×** |

质量维度上**没有任何一格变差**（种子化搜索从结构上保证了这点）。

**关于"60 卡不得慢过 2 倍"**：两个 60 卡场景分别是 **0.24×**（快 4.2 倍）和 **1.51×**，
都在约束内。

变慢的两格都是 34 卡盘面，原因同一个——搜索从空转变成真的在跑：

- `34-province-coarse` 2.01×，换来交叉数 159 → 33。
- `34-rect-obstacles` 2.10×，交叉数没变（48 → 48），是纯成本。这一格搜索在
  任何预算下都赢不了打包结果；事前无法便宜地判断，所以只能付。绝对值 102ms、
  跑在 worker 里，可以接受，但它是本轮最不划算的一格。

---

## 3. 遗留瓶颈（按建议优先级）

1. **`34-rect-obstacles` 类盘面的白付**（本轮最该继续的一项）。
   搜索在"障碍是一整块大矩形"的盘面上跑满 8 个插入顺序却从不打败种子。
   可能的方向：给种子分数设一个"值得挑战"的门槛（比如种子交叉数为 0 时直接跳过搜索），
   或者只跑第一个插入顺序、确认它相对种子有改善后再继续跑其余顺序。
   后者是自适应的、确定性的，估计能把这一格拉回 HEAD 附近而不动任何有收益的场景。

2. **`containFree` 仍是 CPU profile 的头号热点**（60 卡 + 全图障碍时约 20%）。
   它在 12px 点阵上扫空闲画布，卡片深陷大障碍中心时首次命中前要探上千个格点。
   本轮只做到了「用平方距离替代 `Math.hypot`」和「用 `REPAIR_COST` 给它定价」。
   真正的解法是从阻挡它的障碍 AABB 边缘起扫，而不是从原点起扫——但那会改变
   等距候选之间的先后顺序，需要先把它的 tie-break 改成与顺序无关才安全。

3. **`RectIndex` 构建成本随地图精度线性增长**。65k 边的病态地图要 17ms/solve。
   真实地图（6.2k 点）只要 1.3ms，所以现在不痛；如果将来接入未简化的省界，
   `RectIndex.insert` 每条边一个对象 + 一次 Map 查找会变成瓶颈，
   届时值得改成扁平 `Float64Array` + 桶内存索引。

4. **单卡 solve 在省界地图上 1.6ms → 6.2ms**。主要不是索引构建（1.3ms），
   而是候选生成终于开始为这张卡建 100+ 个候选并逐个算 `connectorMapIntersections`。
   一张卡不可能有交叉，搜索能改善的只有 throughMap 和距离。可以考虑
   `cards.length === 1` 时跳过搜索，但收益只有几毫秒且跑在 worker 里，本轮没做。

5. **饱和 cascade 会吃掉槽间 gap**。卡片不会真的压盖（`affordableCascade` 把偏移
   限制在 `space.gap` 内，仍落在槽距里），但按 gap 口径统计的"重叠对"会虚高 3–4 倍。
   任何后续基于 `overlapPairs(_, gap)` 的调优都要先意识到这一点，否则会误判。

6. **`layeredPack` 的槽位搜索是从 n 递减的线性扫描**。400 卡时约 22ms。
   分组尺寸随槽数单调收缩，所以理论上可以二分；但卡片尺寸不一时单调性不是严格可证的，
   本轮选了确定正确的线性版本。

---

## 4. 验证记录

```
npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-space.test.ts \
  src/lib/layout-health.test.ts src/lib/destination-layout.test.ts \
  src/lib/connector-geometry.test.ts src/workers/card-layout.worker.test.ts \
  src/components/canvas/useCardLayoutWorker.test.tsx
→ 7 files / 93 tests passed
```

（简报里写的是 `useCardLayoutWorker.test.ts`，仓库里实际文件名是 `.test.tsx`。）

扩到全部相关面：

```
npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-space.test.ts \
  src/lib/card-layout-cache.test.ts src/lib/layout-health.test.ts \
  src/lib/destination-layout.test.ts src/lib/connector-geometry.test.ts \
  src/workers/card-layout.worker.test.ts src/components/canvas/
→ 21 files / 218 tests passed
```

`npx tsc --noEmit -p tsconfig.app.json` → 0 error。
`npx eslint` 覆盖本轮全部改动文件 → 0 error。

### failure → cause → fix → recheck

| # | failure | cause | fix | recheck |
|---|---|---|---|---|
| 1 | `PosterCanvas.performance.test.tsx` 20s 超时（测试体 66.8s），HEAD 为 172ms | 打点确认 `clampCardPosition` 走穷举扫描：7.29M 个候选点对 × 329 个多边形，全程无空间索引 | 障碍 AABB 进 `RectIndex`；多边形 AABB `WeakMap` 记忆；候选按距离升序 + 分支限界 + `MAX_PROBES` 硬上限 | 2 passed / 193ms；另用 4800 组对拍确认输出与 HEAD 逐字段相同 |
| 2 | `tsc` 报 `TS7022 'score' implicitly has type 'any'` | 新的剪枝在 `score` 声明之前读 `selectedScore![1]`，而 `selectedScore` 的窄化类型来自对 `score` 的赋值，触发 TS 的循环推断保护 | 给 `score` 加显式 `number[]` 注解 | `tsc --noEmit` 0 error |
| 3 | `eslint` 报 `no-useless-assignment`（`splitClusters`）与 `no-unused-vars`（`CELL_FREE`） | 前者是我把声明提到循环外留下的无用重置；后者是 `Uint8Array` 零初始化让常量成了纯文档 | `splitClusters` 声明移回循环内；`cells` 改为显式 `.fill(CELL_FREE)` | `eslint` 0 error，218 tests 仍全绿 |
| 4 | 修好候选饥饿后 `34-rect-obstacles` 从 48.6ms 涨到 158ms，且交叉数毫无改善 | CPU profile 指向 `containFree`（占 20%）：`REPAIR_SHARE=0.4` 让每个顺序最多做 24 次全画布点阵扫描，而 `REPAIR_COST=20_000` 在 2.5M 预算下几乎不限制它们 | 按实测拐点把 `REPAIR_COST` 调到 60_000；`containFree` 内部距离比较改用平方距离 | 该格 101.9ms；两个 60 卡场景回到约束内（0.24× / 1.51×），质量维度无一格变差 |
| 5 | 修 `containFree` 时误把 `card-layout-candidates.ts` 整个 `git checkout` 回 HEAD，导轨修复丢失 | 手滑 | 按 diff 逐段重新施加 `mergeRails` / `railPlacements` 改动 | `git diff` 逐行核对；候选数探针重测（2510 / 2712 / 2952 / 2705，空候选 0），质量表复现 |

---

## 5. 交付方式与回滚

**验收**：CI 上跑上面两条 vitest 命令 + `npm run lint`。
`PosterCanvas.performance.test.tsx` 是这轮最有价值的守门员——它会在
`clampCardPosition` 再次退化成穷举时超时。

**破坏性变更**：无 API、无导出格式、无数据格式改动。行为上有两处**输出会变**：

1. 饱和画布（`status: "fallback"`）的卡片位置会变——不再有完全重合的卡片。
   回滚办法：把 `card-layout-saturation.ts` 里 `layoutQuality` 返回数组的
   `hidden` 与 `overlapPairs(...)` 两项对调，即可恢复 R1 的取舍（注释里写了这一点）。
2. 有障碍的盘面上连接线布局会变（更好）。回滚办法：`refine()` 里直接返回 `legal`
   即可完全关掉搜索；或把 `SEARCH_BUDGET` 调成 0 达到同样效果。

`clampCardPosition` 的输出**不变**（4800 组对拍为证），
唯一例外是宽/高传入 `NaN` 或 `Infinity` 时——原来返回 `NaN`（bug）或钉在 margin，
现在按 0 尺寸处理。
