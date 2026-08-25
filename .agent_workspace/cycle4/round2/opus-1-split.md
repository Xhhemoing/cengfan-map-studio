# Round 2 · opus-fast-1 — 拆分 `card-layout.ts` + 连接线拆线

模型：`claude-opus-5-thinking-high-fast`　分支：`cursor/display-frame-layout-d264`（未提交，按指令不做 git commit / push）

## 一、拆分结果（D1）

`src/lib/card-layout.ts` **2016 → 301 行**，全部新文件 ≤ 400 行；行为按「零迁移」搬运，公开 API 一字未改。

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/lib/card-layout.ts`（门面） | 301 | 类型 re-export、`solveCardLayout`、`chooseLayout`、`clampCardPosition`、`adaptCardLayout` re-export、back-compat 别名 |
| `card-layout-types.ts` | 130 | 全部公开类型 + `clamp` / `overlaps` / `centerOf` / `EPSILON` / `MIN_GAP` / `SIDE_ORDER` |
| `card-layout-polygons.ts` | 299 | 多边形预处理（`PreparedPolygon`）、点/矩形命中、均匀网格 broad phase |
| `card-layout-collision.ts` | 248 | `protectedZones` / `elementZones` / `obstacleZones`、`hitsProtected`、`buildRectIndex`、`containFree`、`sideForPlacement`、`orderResult`、`validateGeometry` |
| `card-layout-connectors.ts` | 218 | 连接线几何谓词 + 计分原语（`connectorIntersects`、`connectorMapIntersections`、`compareScores`、`crossingsEnforced`、`countConnectorCrossings` …） |
| `card-layout-pack.ts` | 337 | `isotonicPack`、四种 classify、`placeSide`、`resolveObstacles`、`sidePackLayout` |
| `card-layout-fallback.ts` | 134 | `layoutGrid`、`repackAll` |
| `card-layout-candidates.ts` | 227 | `buildCandidates`、`homeSides`、轨道生成 |
| `card-layout-optimize.ts` | 227 | `scoreLayout`、`optimizedLayout`、`angularOrder` |
| `card-layout-proximity.ts` | 186 | `proximitySpots`、`layoutProximity` |
| `card-layout-uncross.ts` | 329 | **新增** `repairConnectorCrossings` |
| `card-layout.uncross.test.ts` | 165 | **新增** 拆线单测（12 例） |

依赖图无环：`types ← polygons ← collision ← {pack, fallback, connectors} ← {candidates, optimize, proximity, uncross} ← card-layout`。
`card-layout-adapt.ts` 未改动（原有的 `facade ↔ adapt` 循环是纯函数定义期循环，ESM 下安全）。
worker 协议、`import { solveCardLayout } from "../lib/card-layout"` 全部不变。

**ratchet：** `src/lib/card-layout.ts` 已降到 301 行（≤ 400），按 `file-size-ratchet.test.ts` 的第 4 条规则（`now N lines, at or under the limit — delete this entry`）**删除**了 allowlist 条目，而不是改成新数字——保留任何数字都会让 ratchet 报 stale。allowlist 里其它条目一字未动。新文件已 `git add -N`，因此 ratchet 的 `git ls-files` 能量到它们（全部 ≤ 400，无新增条目）。

## 二、交叉产品化（D2）

### 1. `chooseLayout` 改为跨 attempt 排序

原来 `crossings > 0` 立即 `return fallback`，后续 attempt 一律不跑。现在遍历 attempt，记录几何可行结果中**交叉最少**的一个：0 交叉 ⇒ `solved`，否则最少交叉 ⇒ `fallback`。

**一处与任务书字面不同、需要评审确认的偏差：** `repackAll` 被标成 `recovery: true`，只有当该 mode 自己的 attempt 全部几何不可行时才参与排序。原因是把它平等纳入交叉排序会造成真实回归——它是 mode 无关的全盘重排，在 24 卡探针盘上恰好 0 交叉，于是 `columns` / `quadrant` / `radial` / `right-stack` 全部返回同一块重排盘，模式选择被静默吞掉。这会同时打红两个测试（`perf.probe.test.ts` 的 “columns 与 quadrant 必须产出不同布局”、`modes.test.ts` 的 “grid 应报 fallback 且仍有交叉”），二者都独立指向同一产品判断：**用户选了「分列整齐」就该拿到分列的盘，交叉解不掉时用 `fallback` 状态如实上报，而不是偷偷换一种布局。** 若评审认为交叉硬约束应压过模式身份，把 `recovery` 标记去掉即可（一行），但那两个测试需要同步改。

### 2. `repairConnectorCrossings(placements, bounds, options)`

在 side-pack / columns / grid / proximity / optimize 每条 attempt 产出后、`chooseLayout` 计分前调用（`solveCardLayout` 里的 `untangle` 包装）。

- 逐轮取交叉对，对每对尝试固定的 7 类动作，**按「越不打乱版面越靠前」排序**：① 只换主轴坐标（同轨换位）② 只换副轴坐标 ③④ 沿轨滑到对方前 / 后（各 2 个方向、两张卡各一组）⑤ 整体换位（互换中心）⑥⑦ 任一张卡沿地图中心镜像到对侧轨道。
- 选择规则：只接受**严格降低总交叉数**的动作；同样降幅时取曼哈顿位移最小的那个（版面扰动最小）。
- 每个候选都过 `isInsideCanvas` + `hitsProtected` + 与所有卡的 gap 重叠检查，**不可能用交叉换来越界或重叠**。
- 增量计分：只重算涉及移动卡的那些 pair（`O(k·n)`），交叉标记存在 `Uint8Array` 对称矩阵里，移动后只刷新对应行。
- 预算硬上限：`≤96` 张卡、12 轮、每轮 ≤64 对、总计 ≤4000 次候选评估；无回溯、无递归。
- `forbidConnectorCrossing === false` 或没有 `connectorStyle` 时直接原样返回（同一个数组引用），既不拆线也不因交叉判 fallback。

## 三、效果（真实求解器输出，非构造样例）

日志：`/opt/cursor/artifacts/round2_opus1_crossing_metrics.log`

**两卡穷举（每个 mode 20449 组锚点，straight）——有交叉的组合数：**

| mode | 修复前 | 修复后 |
| --- | --- | --- |
| columns | 676 | 143 |
| quadrant | 509 | 143 |
| radial | 524 | 143 |
| right-stack | 1435 | 143 |
| grid | 4109 | 143 |

五个 mode 收敛到同一个 143，且这 143 组的锚点间距**全部为 0**（完全重合锚点 + straight，两条线必在锚点相交，属豁免不掉的花束情形）。也就是说：两卡场景下，凡是几何上可解的交叉现在全部被解掉。

**24 卡探针盘（`perf.probe` 同一副盘，straight / clearance 1.5）：**

| mode | 修复前交叉 | 修复后交叉 | 修复前 ms | 修复后 ms |
| --- | --- | --- | --- | --- |
| proximity | 0 | 0 | 3.7 | 7.1 |
| columns | 39 | 5 | 2.5 | 7.1 |
| quadrant | 39 | 2 | 10.8 | 17.0 |
| radial | 9 | 2 | 6.1 | 10.9 |
| right-stack | 96 | 6 | 1.8 | 5.9 |
| grid | 78 | 6 | 0.2 | 2.5 |

**180 个 fuzz 场景（`fuzzScenario`，即 D4 那组）：** solved `107/180 → 122/180`，总交叉 `547 → 231`。

代价是求解变慢 2~10 倍的绝对小量（24 卡最慢 17ms，48 卡最慢 46ms），远低于 `perf.probe` 的 200ms 软阈值与 1000ms 硬阈值。

## 四、验证（failure → cause → fix → recheck）

**F1 — `perf.probe.test.ts` 的 “columns 必须区别于 quadrant” 变红。**
- cause：`chooseLayout` 把 mode 无关的 `repackAll` 平等纳入交叉排序，而它在该盘上 0 交叉，于是两个 mode 都改返回同一块重排盘（用 `git worktree` 拉 HEAD 复跑确认该测试在 HEAD 上是绿的，即确系本轮引入）。
- fix：给 attempt 加 `recovery` 分层（见上）。
- recheck：`npx vitest run src/lib/card-layout.perf.probe.test.ts` 28/28 通过。

**F2 — 首版拆线只有换位 / 镜像，24 卡 columns 只从 39 降到 20，且全量 pair 重算导致 24 卡多花 20ms。**
- cause：缺少「沿轨滑动」这一类对侧栏布局最有效的动作；`scoreMoves` 遍历了整个 `n²` pair 矩阵。
- fix：加入 `railSlides`；改成只遍历「移动卡 × 全盘」的增量计分，并放宽预算。
- recheck：columns 24 卡 39 → 5、48 卡 317 → 26；拆线耗时 ≤16ms。

**最终跑过的命令（全绿）：**

```
npx vitest run scripts/file-size-ratchet.test.ts src/lib/card-layout.modes.test.ts \
  src/lib/card-layout.uncross.test.ts src/lib/card-layout.crossing.test.ts \
  src/lib/card-layout.degenerate.test.ts        → 5 files / 57 tests passed
npx tsc -b --noEmit                              → OK
npx vitest run src/lib/card-layout src/components/canvas src/lib/destination-layout \
  src/lib/agent-session scripts/file-size-ratchet.test.ts → 66 files / 414 tests passed
npx eslint <本轮 12 个文件>                       → 0 problems
```

日志：`/opt/cursor/artifacts/round2_opus1_mandated_suite.log`；
前后对比图：`/opt/cursor/artifacts/screenshot_columns_24_cards_crossings_before_after.png`。

## 五、交付与回滚

- 未改任何数据格式、导出格式或 API 形状：`CardLayoutResult` / `CardPlacement` / worker 协议 / `solveCardLayout` 签名全部不变，新增的只有 `repairConnectorCrossings` 一个具名导出。回滚 = 还原这 12 个文件 + allowlist 里那一行，无数据迁移。
- 未触碰：`card-layout.modes.test.ts`、`card-layout.modes-extra.test.ts`、`CardsInspector`、`PosterCanvas`、`scene-document.ts`、`perf.probe.test.ts`、`card-layout-adapt.ts`。
- 遗留：24 卡以上密集盘仍有个位数残留交叉（贪心在局部最优处停手，符合「禁止指数回溯」的约束）；`columns` 在拆线后个别卡会离开列轨（候选顺序与位移 tie-break 已尽量压制，但当离轨是唯一降交叉手段时仍会发生）。若要进一步压低，下一步应该做的是「整条轨道按角序重排」这一类全局动作，而不是继续加大成对贪心的预算。
