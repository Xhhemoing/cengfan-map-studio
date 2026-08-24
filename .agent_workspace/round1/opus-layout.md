MODEL_SLUG: claude-opus-5-thinking-high-fast

# R1-opus-layout — 卡片布局求解器 SOTA 化

分支 `cursor/agent-sota-polish-cbcd`。未提交（按简报要求，交由主调度器统一提交）。

## 1. 模块拆分（`solveCardLayout` 公共 API 完全不变）

`src/lib/card-layout.ts` 从 **1297 行** 降到 **280 行**，保留为门面（facade）：所有公共类型、
`solveCardLayout` / `layoutCards` / `clampCardPosition` 以及 destination-* 兼容别名仍从该路径导出，
`PosterCanvas`、worker、`card-layout-cache`、`agent-session`、`scripts/perf-layout-bench.ts` 的导入零改动。

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `src/lib/card-layout.ts` | 280 | 门面：硬约束文档、输入净化、模式编排、降级阶梯、兼容别名 |
| `src/lib/card-layout-types.ts` | 87 | 公共值类型 + `EPSILON` / `MIN_GAP` / `SIDE_ORDER` |
| `src/lib/card-layout-geometry.ts` | 213 | 纯几何：矩形/线段/多边形谓词、side 数学、字典序打分比较 |
| `src/lib/card-layout-space.ts` | 296 | `LayoutSpace`（归一化画布 + 均匀网格障碍索引）、`PlacementIndex`、`validateHard` |
| `src/lib/card-layout-modes.ts` | 251 | 四象限 / 放射 / 右栈分侧 + isotonic 单侧打包 |
| `src/lib/card-layout-pack.ts` | 349 | 全画布策略：`containFree` / `repackAll` / `sweepPack` / `shelfLayout` / `layoutGrid` |
| `src/lib/card-layout-candidates.ts` | 189 | 连接线感知搜索的候选矩形（导轨）生成 |
| `src/lib/card-layout-connectors.ts` | 78 | 连接线谓词：交叉、穿卡、穿省、同锚点簇 |
| `src/lib/card-layout-optimizer.ts` | 290 | best-of-N 插入搜索 + 整体布局打分 |
| `src/lib/card-layout-manual.ts` | 71 | 手动拖拽位置钳制 |
| `src/lib/card-layout-worker-protocol.ts` | 95（原 20） | 协议类型 + 运行时结构校验 |
| `src/workers/card-layout.worker.ts` | 35（原 19） | 校验入参、try/catch、错误以 `error` 响应回传 |

所有源码模块均 ≤ 400 行（最大 349），满足 AGENTS.md 约束。门面顶部保留并扩写了四条硬约束说明
（画布内、卡片不重叠、避让 `occupiedAreas`、永不抛出且饱和降级为受控网格），并补充了
「`status: "solved"` 当且仅当 1–3 全部成立」的语义说明。

## 2. 算法要点

### 2.1 空间模型（新增 `LayoutSpace`）
- **输入归一化**：非有限数、负尺寸、超过画布半宽/半高的 `margin` 全部被钳制，而不是让 NaN 传播到
  下游。`solveCardLayout` 另有 `sanitizeCards`，保证 anchor/宽高有限且非负。
- **均匀网格索引**（`RectIndex`）：`occupiedAreas`、省份多边形 AABB、已落位卡片全部入网格，
  命中查询从 O(全部障碍) 降到 O(邻近格内障碍)。
- **多边形 AABB 只算一次**（原实现每次命中测试都 `rings.flat()` 重算）——这是多边形场景最大的一笔浪费。

### 2.2 降级阶梯（新的 `degrade`）
原实现只有「分侧打包 → `repackAll` → 直接返回带重叠的结果」。现在是：

1. 分侧 isotonic 打包（+ 溢出到邻侧，最多 4 轮）
2. `containFree` 修复剩余卡片；一旦某次扫描确认无空位就锁存「饱和」，后续卡片直接走堆叠兜底
   （避免在满画布上反复做全画布扫描）
3. `repackAll`：锚点贪心 + 障碍/卡片边缘导轨（导轨按「距锚点最近」截断，密集场景再降到 16 条/轴）
4. `sweepPack`：逐行 first-fit 扫掠，遇阻直接跳到阻挡矩形右边缘（多边形只按步长前进，避免漏掉缝隙），
   成本与行内障碍数成正比而非行宽
5. 仍不合法 → 在 {扫掠、忽略障碍的扫掠、shelf 受控网格、分侧结果} 中按
   `[出界数, 重叠对数, 压障碍数]` 字典序挑最优，报 `fallback`

关键取舍：真正饱和时，**重叠的卡片比压住地图的卡片更糟**（重叠会让文字不可读），所以受控网格会
覆盖地图几何。这正是文档里第 4 条硬约束「saturation → contained grid」的落地。

### 2.3 连接线惩罚不再丢卡
原 `optimizedLayout` 中，若某张卡的全部候选都被已落位卡片挡住，就 `break` 丢弃整个插入顺序。
现在改为用 `containFree` 就近修复后继续（每个顺序最多 3 次修复，超出才放弃该顺序）。
交叉/穿卡/穿省始终只是打分项，永远不是否决项。

### 2.4 几何微优化
- `pointOnSegment` 先做包围盒拒绝再算叉积。
- `rectangleIntersectsPolygon` 把最便宜的「省份顶点落在卡片内」判据提到最前面，射线投射与边相交测试后置。

## 3. 实测（1500×1000 画布，随机散布锚点）

A/B 脚本对 **72 个场景**（4 种模式 × 卡片数 8–200 × 0/1/8/30 个障碍）逐一对比 HEAD 基线与新实现，
判定「更差」的条件是：基线 solved 而新版不 solved、或重叠对数变多、或出界数变多。

**结果：72 个场景，0 处回归。** 典型改善：

| 场景 | 基线 | 现在 |
| --- | --- | --- |
| 8 障碍 / 40 卡 | fallback，15 对重叠 | **solved**，0 重叠 |
| 30 障碍 / 40 卡 | fallback，91 对重叠 | fallback，**0 重叠**（21 张压地图） |
| 无显式障碍 / 200 卡 | fallback，16188 对重叠 | fallback，**706 对重叠** |
| 8 障碍 / 200 卡 | fallback，13332 对重叠 | fallback，**634 对重叠** |
| 全部场景 | — | 锚点总距离平均下降约 30–40% |

耗时（同机、其余 agent 并发运行，数字有噪声）：

| 场景 | 基线 | 现在 |
| --- | --- | --- |
| 34 个省份多边形 / 40 卡 | 1870 ms | **289 ms** |
| 34 个省份多边形 / 100 卡 | 3891 ms | **467 ms** |
| 34 个省份多边形 / 200 卡 | 7448 ms | **922 ms** |
| 矩形障碍 / 200 卡 | 145–251 ms | 105–210 ms |
| `npm run perf:layout`（36–400 卡） | p50 30–100 ms | 持平（p50 30–99 ms） |

## 4. 测试

新增/更新的用例（新增 5 个文件/套件，相关用例从 62 → 74，含新建套件共 69 个直接相关用例）：

- `src/lib/card-layout.test.ts`（26 → 36 用例）：空输入（四种模式）、单卡、退化画布
  （0×0 / margin 大于画布一半 / margin 恰为一半）、非有限输入（NaN / Infinity / 负尺寸）、
  完全相同锚点的 6 张卡、`allowMapOverlap` 自动布局、饱和时 `status === "fallback"` 且仍在画布内、
  150 张密集卡（确定性 + 无重叠 + 在界内 + solved）、四模式 × 四种障碍形态 × 选项组合的确定性、
  连接线无解时不丢卡。
- `src/lib/card-layout-space.test.ts`（新建，9 用例）：margin 钳制、非有限归一化、非法多边形剔除、
  `protectedZones` 回退语义、阻挡矩形的 exact/inexact 标记、跨网格的邻居查询、`validateHard`。
- `src/lib/card-layout-worker-protocol.test.ts`（新建，14 用例）：合法消息、12 类畸形消息、响应守卫。
- `src/workers/card-layout.worker.test.ts`（新建，3 用例）：正常求解、忽略畸形消息、求解抛错时回 `error` 响应而不上抛。
- `src/components/canvas/useCardLayoutWorker.test.tsx`（6 → 8 用例）：worker 报 `error` 时主线程同步兜底并写缓存；
  畸形响应被忽略且保持 pending。

验证命令（全部通过）：

- `npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-cache.test.ts src/lib/connector-geometry.test.ts src/lib/layout-health.test.ts src/lib/destination-layout.test.ts src/components/canvas/useCardLayoutWorker.test.tsx` → **74 passed**
- `npx vitest run src/components/canvas/PosterCanvas.test.tsx` → **47 passed**
- `npx vitest run src/lib src/workers src/components/canvas` → **730 passed / 95 files**
- `npx eslint`（本人所有文件）→ clean
- `npx tsc -p tsconfig.app.json --noEmit` → 本人文件 0 错误（仓库内 `src/lib/import-data.test.ts`、
  `src/drawer-focus-debug.test.tsx` 的 TS6133 属其他 agent 正在改的文件，非本次改动引入）

### 验证纪律（failure → cause → fix → recheck）

1. **failure**：拆分后 `keeps same-anchor cluster cards adjacent and non-overlapping` 失败
   （期望簇高 < 320，实际 778）。
   **cause**：把「是否启用连接线优化器」的判据从「调用方显式给了 `occupiedAreas`/`occupiedPolygons`」
   误改成了 `LayoutSpace.zones.length > 0`，而 `zones` 在无显式障碍时会回退为地图框，导致该用例
   多走了一条原本不会走的优化器分支。
   **fix**：判据改回 `(space.bounds.occupiedAreas?.length ?? 0) > 0 || space.polygons.length > 0`，并加注释说明。
   **recheck**：同一命令重跑，62/62 通过。

2. **failure**：`npx tsc` 报 `card-layout-worker-protocol.ts(93)` TS2352，
   `Record<string, unknown>` 无法断言为 `CardLayoutResult`。
   **cause**：响应守卫里为了取 `placements` 写了不必要的类型断言。
   **fix**：删除断言，直接在 `isRecord` 收窄后读 `value.result.placements`。
   **recheck**：`npx tsc -p tsconfig.app.json --noEmit` 本人文件 0 错误。

3. **failure（性能回归，自测发现）**：引入降级阶梯后 200 卡场景从 150 ms 涨到 1252 ms。
   **cause**：`sweepPack` 放不下的卡片又走了一遍 `containFree` 全画布扫描——而扫掠本身已在相同
   约束下逐行扫过整个画布，这次重扫必然无解，纯属浪费；`packSides` 的收尾修复也有同样问题。
   **fix**：扫掠剩余卡片直接走 `stackAtMargin` 兜底；`packSides` 增加「饱和锁存」，第一次扫描落空后
   后续卡片不再全画布重扫。
   **recheck**：200 卡回到 105–210 ms（≤ 基线），重叠对数仍为 634（基线 13332）；A/B 72 场景 0 回归。

4. **未采纳的尝试**：额外增加一轮 `largest-first / step=4` 扫掠变体，期望把更多 fallback 转成 solved。
   72 场景实测零收益、fallback 路径耗时翻倍，已回滚（连同 `SweepOrder` 选项一起删除，不留死代码）。

## 5. 遗留瓶颈

1. **多边形命中测试仍是最贵的一项**：34 省 × 200 卡约 900 ms。进一步优化需要给每个多边形预计算边数组
   并做边级空间索引（当前只索引到多边形 AABB 粒度），或缓存「卡片矩形 → 命中结果」。
2. **`MAX_OPTIMIZED_CARDS = 80`**：超过 80 张卡时完全不走连接线感知搜索，直接分侧打包。
   要提高上限需要把 best-of-N 插入搜索换成增量式（当前每个插入顺序都从空画布重来）。
3. **饱和时的取舍是策略性的**：目前「0 重叠 + 压地图」优先于「不压地图 + 大量重叠」。
   如果产品认为地图不可遮挡，应把 `layoutQuality` 的字典序调成 `[出界, 压障碍, 重叠]`——
   一行改动，位置在 `card-layout.ts` 的 `layoutQuality`。
4. **`card-layout.test.ts` 已 623 行**：仓库里 400+ 行的测试文件很常见（最大 1059 行），暂未拆；
   若要拆，自然的切分是「硬约束/模式」与「手动放置/退化输入」两个文件。
5. **`clampCardPosition` 未走 `LayoutSpace` 索引**：候选点是障碍边缘的笛卡尔积，
   障碍数极多（数百个 AABB）时是 O(n²)。目前实际调用规模下不构成问题。
