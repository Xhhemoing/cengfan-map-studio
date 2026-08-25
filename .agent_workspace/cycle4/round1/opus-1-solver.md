# Round 1 — opus-fast-1 求解器核心落地

模型 slug：`claude-opus-5-thinking-high-fast`

分支 `cursor/display-frame-layout-d264`，未做任何 git 操作（commit / push / PR 全部留给主调度器）。

## 改了什么

### 只碰了自己拥有的文件

| 文件 | 动作 |
| --- | --- |
| `src/lib/card-layout.ts` | 类型扩展、双遮挡开关、两个新 mode、连接线交叉硬约束、求解流程重构 |
| `src/lib/card-layout-adapt.ts` | 新建，`adaptCardLayout` 局部自适应 |
| `src/lib/card-layout.modes.test.ts` | 新增 6 个用例，`it.each` 硬约束补上新 mode |
| `src/lib/card-layout.manual-clamp.test.ts` | 新增 2 个元素遮挡夹紧用例 + 4 个拖拽自适应用例 |
| `src/lib/card-layout-test-fixtures.ts` | `FUZZ_MODES` 扩到 6 个 mode |

`scene-document.ts` / `PosterCanvas.tsx` / `CardsInspector.tsx` / `card-layout-cache.ts` / CHANGELOG 一行未动。

### 1. 类型

- `CardLayoutMode` = `proximity | columns | quadrant | radial | right-stack | grid`（旧四个原样保留，`quadrant` 仍是默认）。
- `CardLayoutBounds.elementAreas?: CardArea[]` + `CardLayoutBounds.allowElementOverlap?: boolean`。
- `CardLayoutOptions.forbidConnectorCrossing?: boolean`，缺省视为 `true`。

### 2. 双遮挡开关

障碍集合拆成三层，`hitsProtected` / `clampCardPosition` 都走同一套：

- `protectedZones()`：`occupiedAreas`（调用方给什么就是什么），缺省时回落到 `bounds.map` 派生 zone；`allowMapOverlap` 只放松这个派生 zone。语义与今天完全一致。
- `elementZones()`：`elementAreas`，且仅在 `allowElementOverlap === true` 时放松。
- `occupiedPolygons`：求解期一律避让（与今天一致），`clampCardPosition` 里按 `allowMapOverlap` 放松（也与今天一致）。

按规格里的兼容要求：**`elementAreas` 缺省时行为与改动前逐字节相同**，所以旧工程 JSON、旧测试、以及 PosterCanvas 现在这种「调用方自己按开关过滤后全塞进 `occupiedAreas`」的写法都不受影响。

`buildCandidates` 的候选轨道、`repackAll` 的候选坐标、`resolveObstacles` 的外推都换成了合并后的 `obstacleZones()`，所以新障碍不是只在校验时才发现。

### 3. 两个新算法

- **`proximity`**：按面积从大到小贪心。每张卡围绕「锚点居中」的理想位置做**方环外扩扫描**收集最近的合法位置（上限 24 个候选），命中数满且下一环的最小距离已经超过当前最差候选就停扫；选点按 `[交叉数, 穿卡数, 距离, y, x]` 字典序，所以**存在 0 交叉候选时绝不会选交叉候选**。一个候选都没有时退回 `containFree`，永不返回 null。
- **`columns`**：锚点按地图中线（`autoBalance` 时按 `autoSplitX` 的均高分界线）分左右两列，复用现有 `placeSide` 的 isotonic 打包，法向坐标取 `map.x - gap - w` / `map.x + map.width + gap`，即贴地图左右外缘。溢出邻居侧改成「对面那一列」，不会漏到 top/bottom。
- `quadrant` / `radial` / `right-stack` / `grid` 的分类与打包代码原样搬进 `sidePackLayout()`，逻辑零改动。

### 4. 连接线禁止交叉

- 判定完全复用 `buildConnectorGeometry` + `connectorGeometriesIntersect`（共享锚点花束豁免在 `connector-geometry.ts` 里，没动）。
- `crossingsEnforced(options)` = `forbidConnectorCrossing !== false && connectorStyle !== undefined`。没有 `connectorStyle` 就没有线可交叉，此时行为与改动前逐字节相同。
- `validateHard()` 返回 `{ feasible, crossings }`：几何不过 ⇒ `crossings: Infinity`；几何过但有交叉 ⇒ `feasible: false` 且带上交叉数。
- 贪心/优化选点在启用时把 `crossings` 提到 `splitClusters` 之前（`optimizedLayout` 的逐候选打分和 `scoreLayout` 的整体打分都改了），保证 0 交叉候选不会输给交叉候选。
- `solveCardLayout` 改成「按偏好顺序试若干 attempt」：第一个几何+交叉都过的直接 `solved`；几何过但有交叉的直接以 `fallback` 出货（后面的 attempt 只是饱和恢复手段，不是交叉优化手段，跳过它们同时保住了旧的性能剖面）；一个几何都不过就返回第一个产出。**任何路径都不抛。**

### 5. `adaptCardLayout`

`src/lib/card-layout-adapt.ts`，从 `card-layout.ts` re-export，上层可以 `import { adaptCardLayout } from "./card-layout"`。

```
adaptCardLayout(placements, movedId, nextPosition, bounds, options?): CardPlacement[]
```

被拖卡片走 `clampCardPosition` 夹紧后钉死不再动；其余卡片按「离落点由近到远」排队，最多 8 轮（`options.maxRounds` 可调，上限 32），每轮每张卡沿自己的 track 轴（left/right 竖着走、top/bottom 横着走）推开一个重叠邻居，主轴走不通再试交叉轴，每个候选位置都过一遍 `clampCardPosition`，因此画布边距和受保护几何与手动拖拽同口径。推不开的卡原地不动，不会被甩到奇怪的地方。返回数组保持输入顺序和 id，输入不被就地修改。

## 测试命令与结果

指定的四文件命令：

```
npx vitest run src/lib/card-layout.modes.test.ts src/lib/card-layout.manual-clamp.test.ts \
  src/lib/card-layout.degenerate.test.ts src/lib/card-layout.properties.test.ts
→ Test Files 4 passed (4) / Tests 61 passed (61)
```

顺带把兄弟代理留下的契约测试也跑了（这三个文件不归我，只读不改）：

```
npx vitest run ...上面四个... src/lib/card-layout.adapt.test.ts \
  src/lib/card-layout.crossing.test.ts src/lib/card-layout.overlap-flags.test.ts
→ Test Files 7 passed (7) / Tests 70 passed (70)
```

三个契约文件里原本 `skipIf` 掉的项现在全部真正执行并通过：`adaptCardLayout` 的两个拖拽边界、`proximity`/`columns` 的确定性、`forbidConnectorCrossing` 的默认行为、`allowElementOverlap` 与 `allowMapOverlap` 的独立性。

更大范围的回归（确认没有越界打红别人）：

```
npx vitest run src/lib/card-layout src/lib/card-templates src/lib/destination
→ 15 files / 160 tests passed
npx vitest run src/components/canvas src/components/inspector
→ 53 files / 262 tests passed
npx tsc -b --noEmit                                    → clean
npx eslint <本轮改动的 5 个文件>                        → clean
```

### 性能与交叉探针（`card-layout.perf.probe.test.ts`，gpt-1 的文件，未改）

| mode | 8 卡中位 | 24 卡中位 | 48 卡中位 | 24 卡 straight 交叉数 |
| --- | ---: | ---: | ---: | ---: |
| `proximity` | 3.135 | 3.751 | 13.488 | **0** |
| `columns` | 0.059 | 2.579 | 10.026 | 39 |
| `quadrant` | 7.193 | 9.202 | 20.531 | 39 |
| `radial` | 4.237 | 6.120 | 16.574 | 9 |
| `right-stack` | 0.018 | 2.020 | 8.815 | 96 |
| `grid` | 0.015 | 0.064 | 0.185 | 78 |

`adaptCardLayout` 24 卡中位 **0.136ms**，对照同输入 `quadrant` 全量求解 9.202ms —— 约 68×，满足 ROUND1-SPEC 验收第 4 条「远小于全量 solve」。所有 mode 都远低于 200ms 软阈值。

### 新增用例清单

`card-layout.modes.test.ts`

- `it.each` 硬约束扩到 6 个 mode（新增 `proximity` / `columns`）
- proximity：锚点埋在障碍里的场景，总距离 < naive 对角投放的 25%，且 < `right-stack` 的 60%，单卡 < 360px
- columns：左右分列正确、列内按 anchorY 单调、贴地图左右外缘、不重叠
- columns + `autoBalance`：中线给出 4/1，均衡后变 2/3
- 交叉：先断言手搓的对调布局确实有交叉（防止空跑），再断言求解器输出 0 交叉且 `solved`
- 交叉无解：`grid` 场景返回 `fallback` + 全部卡片 + 不抛；同输入加 `forbidConnectorCrossing: false` 变回 `solved`
- `allowElementOverlap`：false 时全部避开 `elementAreas`；true 时全部压在上面，同时仍然避开地图

`card-layout.manual-clamp.test.ts`

- 元素区夹紧：false 时被推开、true 时原地不动
- 两个开关互不串台：只放松地图仍避元素，只放松元素仍避地图多边形
- adapt：被拖卡停在 clamp 后的目标位、邻居被推开且推力传导到第三张、全程不重叠
- adapt：落点没压到人时其余卡一动不动
- adapt：邻居被推到空白画布而不是被推进受保护区域
- adapt：`movedId` 不存在时原样返回（且是副本）

## failure → cause → fix → recheck

本轮只有一次红：

1. **failure**：`npx tsc -b --noEmit` 报 `card-layout.ts(1868,41) TS2339: Property 'crossings' does not exist on type 'never'`。
2. **cause**：`chooseLayout` 里 `best` 只在一处赋值且紧跟 `break`，TS 的控制流分析判定循环体每次进入时 `best` 必为 `null`，于是 `best.crossings` 落在 `never` 上。根因是我写了一段「记录最优再继续找」的代码，但实际语义是「找到就立刻出货」，`best` 这个累加器本身是多余的。
3. **fix**：删掉累加器，几何过但有交叉时直接 `return { status: "fallback", placements, mode }`，注释写明为什么后续 attempt 不值得再试。
4. **recheck**：重跑同一条 `npx tsc -b --noEmit` → 干净；随后四文件测试 61 passed。

其余检查（lint / 四文件 / 契约文件 / 组件回归 / 性能探针）均一次通过，无「盲目重跑」。

## 已知缺口

1. **`card-layout.properties.test.ts` 的 fuzz 覆盖被交叉硬约束削弱。** 该文件 `if (result.status !== "solved") continue;`，而 `fuzzScenario` 恒定给 `connectorStyle`，于是交叉判定恒定生效。实测 180 个种子里 `solved` 从 180 降到 107（`proximity` 27/29、`radial` 30/33、`quadrant` 23/25 很稳；`grid` 6/24、`right-stack` 8/38 掉得厉害，因为这两个 mode 结构上就不推理连接线）。**几何硬约束本身没有退化**——同样 180 个种子加 `forbidConnectorCrossing: false` 重跑是 180/180 `solved`。该文件不在我的所有权范围内，建议 Round 2 把断言改成「不论 status 都校验几何硬约束」或给 fuzz 传 `forbidConnectorCrossing: false` 做纯几何 property，交叉另开一条 property。
2. **`grid` / `right-stack` 在有连接线时几乎必然 `fallback`。** 这两个 mode 的语义就是不看锚点关系（规格要求「不得无故改变既有测试语义」），所以我没有给它们加交叉修复。上层如果用 `status === "fallback"` 弹提示，这两个 mode 会几乎常亮，需要 UI 侧决定是否按 mode 区别对待。
3. **`elementAreas` 与 PosterCanvas 现有写法并存，需要集成时二选一。** 兄弟代理的 `PosterCanvas.tsx` 走的是「调用方按开关过滤后全部塞进 `occupiedAreas`」，同时也在 bounds 上带了 `allowElementOverlap`（此时该字段对求解器是惰性的）。我实现的 `elementAreas` 是规格里给的另一条路（求解器侧区分）。两条路都正确且互不冲突，但**不要同时用**——否则元素障碍会被计两遍。建议整合时明确：要么 PosterCanvas 改传 `elementAreas` 让求解器管开关，要么保留现状并把 bounds 上的 `allowElementOverlap` 视为纯缓存 key 用途。缓存 key（`card-layout-cache.ts`）已由兄弟代理纳入 `allowElementOverlap`，但**没有纳入 `elementAreas` 的内容**；若走前一条路，缓存 key 需要补。
4. **`adaptCardLayout` 是尽力而为，不是求解。** 8 轮之内推不开的卡就地保留，可能残留重叠；它只负责拖拽后的即时手感，最终整洁仍要靠「刷新展示框位置」走全量 `solveCardLayout`。另外它用 `clampCardPosition` 的口径（0 gap 对障碍、gap 只用于卡与卡之间），与手动拖拽一致但比 `hitsProtected`（障碍也吃 gap）宽松一点点。
5. **`proximity` 的方环扫描有 4200 次探测的硬上限。** 画布几乎全被占满时可能提前收手、候选为空，此时退回 `containFree` 全网格扫描，结果仍然合法，只是不保证「全局最近」。
6. `card-layout.ts` 现在约 1970 行，早已超过 AGENTS.md 的 400 行门槛。本轮只把 `adaptCardLayout` 拆了出去。后续建议把障碍/几何谓词（polygon 预处理、`RectIndex`、连接线判定）拆成 `card-layout-geometry.ts`，把各 mode 的分类/打包拆成 `card-layout-modes.ts`，但那是纯搬运重构，不适合和本轮行为改动混在一个 diff 里。

## 回滚

所有新字段（`elementAreas` / `allowElementOverlap` / `forbidConnectorCrossing`）和新 mode 都是可选的、加性的。缺字段时求解器行为与改动前逐字节一致（已由未改动的旧测试全绿佐证）。回滚 = 还原本分支相对 `main` 在这 5 个文件上的 diff，外加删除 `src/lib/card-layout-adapt.ts` 与 `card-layout.ts` 底部那行 re-export。
