MODEL_SLUG: claude-opus-5-thinking-high-fast

# R3-opus-layout — 消除「变慢但不变好」的布局开销

分支 `cursor/agent-sota-polish-cbcd`，**未提交**（按简报要求）。
`solveCardLayout` 的公共签名、参数与返回形状**未变**。

改动文件：`src/lib/card-layout.ts`、`src/lib/card-layout-optimizer.ts`、
`src/lib/card-layout-saturation.ts`、`src/lib/card-layout.test.ts`。

> 注：本轮工作区被多个 Round 3 agent 共享，`src/App.tsx`、`server/*`、
> `src/components/DataWorkspace*` 等文件同时在被别人改写（全仓 `tsc` 因此是红的）。
> 我只改了上面 4 个文件，类型检查用 `tsconfig.app.json` 的同一套编译选项、
> 但把 `include` 限定到布局子图后跑（0 error，命令见 §5）。

---

## 0. 一句话结论

搜索现在**在证明自己有用之前不会跑满**：插入顺序按实测收益重排，连续 2 个顺序打不过
种子就停。八个会搜索的盘面从固定 8 个顺序降到 1–6 个，耗时 0.49×–0.85×，
**质量指标一格未降**。另外把饱和路径（grid/所有模式在画布装不下时都会走）的
`layeredPack` 从 O(n²) 降到接近线性——400 卡从 39ms 降到 5.7ms（**0.15×**），
840 组配置的输出与 HEAD **逐字段完全相同**；顺带补掉了 `gap: 0` 画布上
「卡片坐标完全重合」的漏洞（600 组随机饱和盘面：HEAD 隐藏 2126 张 → 本轮 0 张）。

---

## 1. 要求逐条落点

### 1.1 搜索的提前退出（要求 1）

三处早退，全部确定性、全部只影响「探索多少」，不影响「放不放得下」：

1. **零候选直接放弃**（`optimizedLayout` 开头）。候选集为空时连种子都不打分就返回
   —— 给种子打分本身是一次 O(n²) 的连接线比较，为一个无法产出任何布局的搜索付这笔钱
   毫无意义。
2. **耐心值早退**：`SEARCH_PATIENCE = 2`。连续 2 个插入顺序没能打败当前最优（**包括
   跑出非法布局的顺序**）就停，`trace.stop = "no-gain"`。有改进就清零，所以
   「最后一次改进之后最多再跑 2 个顺序」是一条可断言的不变式（测试里就是这么断言的，
   而不是断言魔法数字）。
3. **顺序重排**：`insertionOrders` 从「6 个角度旋转 + 反向 + 稀缺优先」改成
   `[旋转0, 稀缺优先, 旋转1, 反向, 旋转2..5]`。因为有了早退，**顺序的先后决定了短搜索
   能看到什么**。实测收益集中在这 4 个顺序上：

   | 盘面 | HEAD 中产生改进的顺序下标（共 8 个） |
   |---|---|
   | 16-province-vector | 0, 6(反向) |
   | 34-province-vector | 0, 1 |
   | 34-province-wide | 0 |
   | 34-province-coarse | 0, 1 |
   | 16-rect-obstacles | 3 |
   | 34-rect-obstacles | 0, 1, 7(稀缺) |
   | 34-rect-multi | 0, 1, 7(稀缺) |
   | bench-vector-quadrant-24 | 无（8 个顺序全部产不出合法布局） |

   稀缺优先顺序在「障碍是一整块大矩形」的盘面上是最优解的唯一来源
   （34-rect-obstacles 交叉 17 → 6），却排在最后；旋转 2–5 在 8 个盘面里只赢过 1 次，
   所以被放到最后。重排后**短搜索找到的布局与跑满 8 个顺序找到的完全一致**（唯一例外见 §3.1）。

**关于「跑完第一个顺序就退出」**：试过，太狠。`SEARCH_PATIENCE = 1` 会让
34-province-vector 的交叉停在 10（跑满是 7）；`= 3` 则在两个盘面上比 HEAD 还慢
（16-province-vector 77ms vs HEAD 72ms）而只换回一格。2 是实测拐点，常量注释里写了这条证据。

搜索后各盘面实际跑的顺序数（`__layoutDebug.last.trace`）：

| 盘面 | HEAD 顺序数 | 本轮 | 停止原因 |
|---|---:|---:|---|
| 16-province-vector | 8 | 6 | no-gain |
| 34-province-vector | 8 | 5 | no-gain |
| 34-province-wide | 8 | 3 | no-gain |
| 34-province-coarse | 8 | 5 | no-gain |
| 16-rect-obstacles | 8 | 2 | no-gain |
| 34-rect-obstacles | 8 | 4 | no-gain |
| 34-rect-multi | 8 | 4 | no-gain |
| bench-vector-quadrant-24 | 6（预算耗尽） | 2 | no-gain |
| 1-province-vector | 1 | 1 | exhausted |

### 1.2 grid / 简单模式不付搜索税（要求 2）

**先澄清一处简报里的归因错误**：grid 模式在 R2 里就**从来没有**调用过连接线搜索
（`solveCardLayout` 的 grid 分支在 `refine` 之前就返回了）。简报说的
「grid 400 卡 p95 7ms→98ms 因为搜索开始干活」不成立——我实测 grid 400 卡走的是
`skipped-infeasible` 分支，那 39ms 全在 `layeredPack` 里（见 §1.5），与搜索无关。

不过「无法证明」正是问题本身，所以本轮把这条路径变成**可断言的**：

- 新增 `__layoutDebug`（`card-layout.ts` 导出，非公共 API、不在文档里）：每次 solve 记录
  `{ mode, status, cards, decision, trace, improved }`。`decision` 是一个封闭枚举：
  `ran` / `skipped-mode` / `skipped-no-geography` / `skipped-card-count` /
  `skipped-no-legal-layout` / `skipped-infeasible` / `skipped-empty`。
  代价是每次 solve 一个小对象，求解器自己从不回读它。
- 搜索的准入判断集中到 `searchPlan()` 一个函数，返回判别式联合类型，
  「只有 quadrant/radial 能进搜索」由类型系统而不是注释保证。
- 新测试 `only pays for the connector search in a mode that can act on it`：
  同一个 34 省向量盘面上跑四种模式，断言 `decision` 与「有没有 trace」精确相等
  （quadrant/radial = `ran`，grid/right-stack = `skipped-mode`），
  并断言跳过路径的**摆放结果**逐字段稳定复现（不是只测时间）。
- 另一组 `skips the search on …`：无地理、超过 `MAX_OPTIMIZED_CARDS`、画布装不下、空名单，
  四条跳过分支各钉一个。

**为什么不用计时断言**：共享机器上 grid 与 quadrant 的耗时差在小盘面上会被 JIT 噪声淹没，
断言路径比断言毫秒稳得多。

### 1.3 不掉卡、不回退隐藏卡策略（要求 3）

- 400 组随机盘面（画布/边距/间距/障碍形状/模式/张数全随机）：
  **掉卡 0、非确定性 0、越界 0**；`decision` 分布 `skipped-infeasible` 149、
  `skipped-mode` 93、`skipped-no-legal-layout` 81、`skipped-no-geography` 24、`ran` 51、
  `skipped-card-count` 2。同一份随机盘面在 HEAD 上跑，各项指标一致。
- 隐藏卡：见 §1.5，本轮**从 HEAD 的非零降到 0**，方向是改善不是回退。
- 早退在数学上不可能掉卡：它只结束「探索」，返回的永远是调用方已经握着的合法布局
  （`optimizedLayout` 在没打赢种子时返回 `placements: null`，调用方原样保留自己的结果）。
  新测试 `hands back the packed layout untouched when it stops without a win` 用两块
  几何等价、但只有一块会触发搜索的画布，断言 `improved === false` 时两边摆放**逐字段相等**。

### 1.4 owned 测试全绿（要求 4）

见 §5。

### 1.5 顺带修掉的两处（都在 owned 文件内）

**(a) 饱和路径 `layeredPack` 的 O(n²)。** 它从「一卡一槽」往下逐个试槽数，每次都
物化一遍分组——`readingOrder` 全量排序 + n 次 `slice`，而其中除了最后一次全部丢弃。
改成用**索引区间**描述槽（`SlotPlan`），排序按分组方式提到循环外，只有packing 成功的那次
才真正切出卡片（`fillSlots`）。packing 只需要知道每组的最大宽高，区间就够。

| 卡数 | HEAD `layeredPack` | 本轮 |
|---:|---:|---:|
| 100 | 3.4ms | — |
| 200 | 7.2ms | — |
| 400 | 36.9ms | — |

整条饱和 solve（含 `shelfLayout` + 两次 `layoutQuality`）：400 卡 39.1ms → **5.7ms**，
四种模式一致（见 §2 表 20–23、27–30、34–37、41–44 行）。
**等价性**：7 种画布 × 6 种卡片尺寸 × 5 种张数 × 4 种模式 = **840 组**配置的完整摆放
（id/x/y/side）与 HEAD **逐字段完全相同，0 处差异**；整批耗时 17.2s → 4.9s。

**(b) `gap: 0` 画布上的隐藏卡。** R2 的策略是「隐藏比重叠更糟」，但
`affordableCascade` 把扇形位移限制在 `space.gap` 以内，于是 `gap: 0` 时位移恒为 0，
同槽卡片坐标完全重合——正是策略要避免的结果。改成：gap 预算为 0 时，从槽到画布边缘的
余量里取一个 `HAIRLINE_STEP = 0.01px`（仍然保证在边界内）。

600 组随机饱和盘面（一半 `gap: 0`）：

| | HEAD | 本轮 |
|---|---:|---:|
| 隐藏卡（坐标完全重合） | 2126 | **0** |
| 真实重叠对（gap=0 口径） | 362716 | **307955** |
| 掉卡 / 越界 | 0 / 0 | 0 / 0 |

重叠对同时下降是副作用而非巧合：`betterLayout` 的排序是
`[越界, 隐藏, 重叠对, 压地图, 距离]`，以前 `layeredPack` 会因为「隐藏」这一项输给
`shelfLayout`，于是选中了重叠更多的那个。
回归守卫写进了 `keeps every saturated card contained, distinct and mostly unstacked`
的形状表：新增的 1078×460 / gap 0 / 59 卡这一格，HEAD 只有 36/59 个不同坐标。

---

## 2. 质量 / 性能总表

`connectorStyle: curve`、`connectorWidth: 1.5`、`autoBalance: true`；
p50/p95 取 11 次采样，warmup 2 次。cross = 渲染态连接线交叉对数，
dist = 卡心到锚点距离和。两侧 determinism 均 stable，id 序列均与输入逐一相等。

| 盘面 | n | 模式 | status | cross | dist | HEAD p50 | 本轮 p50 | 时间比 |
|---|---:|---|---|---|---|---:|---:|---:|
| 16-province-vector | 16 | quadrant | solved | 0 | 4471 | 72.3 | 61.3 | 0.85× |
| 34-province-vector | 34 | quadrant | solved | 7 | 13029 | 217.3 | 159.9 | 0.74× |
| 34-province-wide | 34 | quadrant | solved | 8 | 20743 | 242.3 | 133.1 | **0.55×** |
| 34-province-coarse | 34 | quadrant | solved | 7 | 13029 | 213.5 | 156.0 | 0.73× |
| 16-rect-obstacles | 16 | quadrant | solved | 0 | 4253 → **3878** | 20.5 | 10.0 | **0.49×** |
| 34-rect-obstacles | 34 | quadrant | solved | 6 | 12836 | 147.1 | 98.5 | 0.67× |
| 34-rect-multi | 34 | quadrant | solved | 6 | 12754 | 150.5 | 94.6 | 0.63× |
| bench-vector-quadrant-24 | 24 | quadrant | solved | 20 | 11900 | 137.0 | 83.9 | 0.61× |
| 1-province-vector | 1 | quadrant | solved | 0 | 84 | 0.53 | 0.53 | 1.00× |
| 60/80/100-city-vector | 60–100 | quadrant | fallback | 不变 | 不变 | 83–116 | 84–118 | 0.99–1.02× |
| 60/80/100-rect-obstacles | 60–100 | quadrant | fallback | 不变 | 不变 | 26–38 | 26–38 | ~1.00× |
| bench-\*-400（四种模式） | 400 | 全部 | fallback | 不变 | 不变 | 38.9–39.1 | 5.7–5.8 | **0.15×** |
| bench-\*-200（四种模式） | 200 | 全部 | fallback | 不变 | 不变 | 8.2–8.7 | 1.7–1.9 | **0.21×** |
| bench-\*-100（四种模式） | 100 | 全部 | fallback | 不变 | 不变 | 1.6–1.7 | 0.59–0.63 | 0.37× |
| bench-\*-16/24/36 | 16–36 | 全部 | 不变 | 不变 | 不变 | 1.3–15.2 | 1.3–15.2 | ~1.00× |

**没有任何一格变慢超过 1.04×**（1.02–1.04 的几格是 5ms 以内的采样噪声）。
质量维度只有一格变化：16-rect-obstacles 的距离和从 4253 降到 3878（更好），
详见 §3.1 的取舍说明。

---

## 3. 遗留瓶颈（按建议优先级，已量化）

### 3.1 16-rect-obstacles：早退放弃了一次「穿卡」修正

这是本轮唯一一处内部评分变差的盘面。HEAD 跑满 8 个顺序后，第 3 个旋转顺序把
`throughCards`（连接线穿过别的卡片）从 1 降到 0，代价是距离和 3878 → 4253；
本轮在 2 个顺序后停手，保留了种子（渲染态交叉两者都是 0，距离更短）。
要拿回它需要 `SEARCH_PATIENCE ≥ 5`，等于取消早退，20.5ms → 10.0ms 的收益全吐回去。
**结论：这一格是主动取舍，不是 bug。** 若产品认为「穿卡」比距离更重要，
调大 `SEARCH_PATIENCE` 即可，注释里写了这条曲线。

### 3.2 候选生成已经取代搜索成为向量盘面的头号成本

34 省向量盘面 160ms 里，`buildCandidates` 占 58ms（3340 个候选，每个都要算一次
`connectorMapIntersections`），`LayoutSpace` 构建 0.5ms，剩下约 100ms 是 5 个插入顺序。
早退能砍的是后半段；前半段是「一次性、且所有卡片都要」的成本，砍不掉。
下一轮真要提速，方向是让候选的 `mapIntersections` 惰性化——但它参与每边的候选排序，
需要先把排序键换成不依赖它的形式，否则会改变候选集。

### 3.3 `skipped-no-legal-layout` 这一档没被本轮触及（27–126ms）

60–100 卡的向量/矩形盘面上，侧边打包与修复阶梯都拿不出合法布局，搜索被正确跳过，
但 `contain()` 仍要算 `sweepPack` ×2 + `shelfLayout` + `layeredPack` 并两两打分。
100-city-vector 118ms、60-city-vector 84ms，本轮前后一致。
`layeredPack` 已经便宜了，剩下的大头是 `sweepPack`（12px 点阵扫描）——
R2 遗留项 2 说的 `containFree` 同源问题，仍然成立。

### 3.4 `bench-quadrant-24 / 36` 这类 13–15ms 的小盘面

走的也是 `skipped-no-legal-layout`。张数少、画布装得下但侧边打包失败，
时间几乎全在修复阶梯。绝对值不大，但它是「24 张卡也要 13ms」的下限，
未来若要做实时预览会先撞到这里。

### 3.5 `__layoutDebug` 是进程级单例

同一个 worker 里串行 solve 没问题（现状如此），但如果将来一个 worker 里并发跑多个 solve，
它记录的就是「最后一个完成的」。它只服务测试，不参与任何决策，所以这不是正确性风险，
但写并发测试时要知道这一点。

### 3.6 饱和 cascade 仍会吃掉槽间 gap（R2 遗留项 5，未变）

`overlapPairs(_, gap)` 口径的读数仍会虚高 3–4 倍，任何后续调优要先意识到这点。

---

## 4. failure → cause → fix → recheck

| # | failure | cause | fix | recheck |
|---|---|---|---|---|
| 1 | 新测试 `skips the search on more cards than the search has ever helped` 报 `skipped-no-legal-layout`，期望 `skipped-card-count` | 我给 81 张卡用了 130×56 的尺寸，在 34 省向量盘面上根本排不出合法布局，于是在张数守卫**之前**就走掉了 | 把该用例的卡片尺寸改成 90×40（实测 81/90 张都能拿到合法布局，稳定命中张数守卫） | 该用例通过；四条跳过分支各自命中预期枚举值 |
| 2 | `tsc` 报 `TS2304: Cannot find name 'CardLayoutStatus'` | 新的 `LayoutDebugRecord` 用到了这个类型，但 `card-layout.ts` 只把它**再导出**、没有 import | 加进 `card-layout-types` 的 import 列表 | 布局子图 `tsc --noEmit` 0 error |
| 3 | `tsc` 报 `TS6133: 'slotSpan' is declared but its value is never read` | 区间化重构后 `slotSpan` 只剩一个转发给 `rangeSpan` 的壳，`affordableCascade` 自己算最大宽高 | 删掉 | 0 error，840 组输出仍与 HEAD 逐字段相同 |
| 4 | `SEARCH_PATIENCE = 2` + 首版顺序（`[旋转0, 稀缺, 反向, …]`）下，34-province-coarse 的交叉从 7 涨到 9 | 该盘面的第二次改进来自「旋转1」，而首版把它排在反向之后，两次 miss 先耗尽了耐心 | 顺序改为 `[旋转0, 稀缺, 旋转1, 反向, 旋转2..]` | 该盘面 cross 回到 7、dist 回到 13029（与 HEAD 一致），且 34-province-vector 的顺序数反而从 6 降到 5 |
| 5 | 400 组随机盘面里有 4 张卡坐标完全重合，与 R2 的「隐藏卡 = 0」策略矛盾 | 全部出现在 `gap: 0` 的画布：`affordableCascade` 的扇形预算是 `min(space.gap, slack)`，gap 为 0 时位移恒为 0 | gap 预算为 0 时改从槽到画布边缘的余量里取 `HAIRLINE_STEP = 0.01px` | 600 组随机饱和盘面隐藏卡 2126 → 0，重叠对同时下降 15%，越界/掉卡仍为 0；840 组非零 gap 配置输出**未变** |

---

## 5. 验证记录

```
npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-space.test.ts \
  src/lib/layout-health.test.ts src/lib/destination-layout.test.ts \
  src/lib/connector-geometry.test.ts src/workers/card-layout.worker.test.ts \
  src/components/canvas/useCardLayoutWorker.test.tsx \
  src/components/canvas/PosterCanvas.performance.test.tsx
→ 8 files / 106 tests passed (5.7s；HEAD 上同一组是 9.1s)
```

扩到相邻面：

```
… 上面 8 个文件 + src/lib/card-layout-cache.test.ts + scripts/perf-layout-bench.test.ts
→ 10 files / 113 tests passed
```

（简报写的是 `useCardLayoutWorker.test.ts`，仓库里实际是 `.test.tsx`，与 R2 同。）

类型检查（工作区里 `App.tsx` 等文件正被别的 agent 改写，全仓 `tsc` 与本轮无关地红着，
所以按布局子图跑，编译选项继承自 `tsconfig.app.json`）：

```
tsconfig.r3check.json = { extends: ./tsconfig.app.json,
  include: [src/lib/card-layout*.ts, src/lib/connector-geometry*.ts,
            src/lib/layout-health*.ts, src/lib/destination-layout*.ts,
            src/workers/card-layout.worker*.ts] }
npx tsc --noEmit -p tsconfig.r3check.json → 0 error（临时文件已删除）
```

```
npx eslint src/lib/card-layout.ts src/lib/card-layout-optimizer.ts \
  src/lib/card-layout-saturation.ts src/lib/card-layout.test.ts → 0 problem
```

新增/扩充的测试：

- `only pays for the connector search in a mode that can act on it`（4 种模式 × 决策枚举 + 输出稳定性）
- `skips the search on …`（无地理 / 超张数上限 / 画布装不下 / 空名单）
- `stops exploring insertion orders once they stop paying off`（3 种障碍 × 2 种张数，
  断言「最后一次改进之后最多再跑 2 个顺序」这条不变式）
- `gives up before scoring anything when no card has a candidate rectangle`
  （直接对 `optimizedLayout` 断言整个 trace）
- `hands back the packed layout untouched when it stops without a win`（4 种张数）
- `keeps every saturated card contained, distinct and mostly unstacked` 新增 `gap: 0` 形状

---

## 6. 交付方式与回滚

**验收**：CI 跑 §5 的两条 vitest 命令 + `npm run lint`。
`PosterCanvas.performance.test.tsx` 仍是最有价值的守门员。
`__layoutDebug` 让「搜索有没有跑」这件事在 CI 里可断言，不需要计时。

**破坏性变更**：无 API、无导出格式、无数据格式改动。行为上有两处输出会变：

1. **`gap: 0` 的饱和画布**上，同槽卡片不再坐标重合（相差 0.01px）。
   回滚：把 `affordableCascade` 里 `if (affordable > 0) return affordable;` 之后的
   那一行 `return` 改回 `return 0;`（或直接删掉 `HAIRLINE_STEP` 分支）。
2. **有障碍且 ≤80 张卡**的 quadrant/radial 盘面上，搜索可能更早停手。
   实测 8 个盘面里 7 个结果与跑满 8 个顺序完全一致，1 个见 §3.1。
   回滚：把 `SEARCH_PATIENCE` 调成一个大于顺序总数的值（例如 `Number.POSITIVE_INFINITY`
   或 9），即可完全恢复 R2 的「跑满所有顺序」行为；
   顺序重排本身不改变候选集，只改变先后，若要一并回滚就把 `insertionOrders`
   的返回数组改回 `[...rotations, reverse, scarcest]`。

`layeredPack` 的区间化重构**不是**行为变更：840 组配置逐字段等价，
若仍需回滚，`fillSlots`/`packSlots(order, count, …)`/`groupStart` 三个函数
可以整体换回 R2 的 `slotGroups`/`balancedGroups`/`packSlots(groups, …)`。
