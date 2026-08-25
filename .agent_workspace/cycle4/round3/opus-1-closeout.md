# Round 3 — opus-fast-1 收尾报告（残余交叉 + AI 障碍对齐）

模型 slug：`claude-opus-5-thinking-high-fast`。未执行任何 git 操作。

## 1. 交付内容

| 文件 | 变化 |
| --- | --- |
| `src/lib/card-layout-uncross.ts` | 339 → 316 行。状态/评分/下降/公开 API；改为多方案下降取最优 |
| `src/lib/card-layout-uncross-rails.ts` | 新增 185 行。轨道识别 + 轨道重排候选 |
| `src/lib/card-layout-uncross-moves.ts` | 新增 159 行。成对候选动作 + `REPAIR_PLANS` |
| `src/lib/card-layout-element-obstacles.ts` | 新增 71 行。`collectElementObstacles` 从 canvas 迁入 lib |
| `src/components/canvas/card-layout-obstacles.ts` | 65 → 14 行，纯 re-export |
| `src/lib/agent-session-layout.ts` | 新增 113 行。`runAutoLayout` / `healthInput` / `layoutElementAreas` |
| `src/lib/agent-session.ts` | 799 → 746 行 |
| `scripts/file-size-allowlist.json` | `agent-session.ts` 799 → **746**（只下调） |
| `src/lib/card-layout.uncross.test.ts` | 165 → 258 行，新增轨道重排与密集板回归锁 |
| `src/lib/agent-session.auto-layout.test.ts` | 新增 198 行 |

所有文件 ≤400 行，唯一 allowlist 条目 `agent-session.ts` 下调 53 行。未上调任何条目。未改 CardsInspector / PosterCanvas / `card-layout.ts` 门面。

## 2. AI 障碍对齐（任务 1）

`collectElementObstacles` 迁到 `src/lib/card-layout-element-obstacles.ts`，canvas 侧改 re-export，避免 UI→lib 倒依赖。`runAutoLayout` 现在传入：

- `texts`：`project.textElements`（隐藏 / 空白文本自动不占位）
- `decorations`：`assetElements` 里 `kind === "decoration"` 且可见、不透明的
- `guests`：`computeGuestPanelLayout(...).height` 的**真实盒**，不再是硬编码 120px
- `allowMapOverlap` / `allowElementOverlap` 与文档字段一致（两个开关仍互不干扰）
- 顺带补上 `connectorStyle` / `connectorWidth`，与 PosterCanvas 传给 solver 的选项一致

### 证据链（failure → cause → fix → recheck）

1. **failure**：用老障碍集（只有一个 120px 嘉宾盒）跑 8 省 quadrant，**8 张卡里 3 张**（湖北省 / 江苏省 / 四川省）压在海报文本或装饰上；嘉宾盒实测高度 78px，硬编码 120px 多占 42px。
2. **cause**：`agent-session.ts` 自建 `elementAreas`，完全没有 texts / decorations，嘉宾高度是猜的。
3. **fix**：改用共享 `collectElementObstacles` + `computeGuestPanelLayout`。
4. **recheck**：同一板 0/8 被埋（截图 `round3_opus1_ai_auto_layout_obstacles_before_after.png`）；`agent-session.auto-layout.test.ts` 6 项通过。

新测试锁定：与 canvas 输入逐项相等、嘉宾高度取实测且 `!== 120`、隐藏 / 空白 / 全透明 / 非 decoration 元素不占位、自动版式不压元素、positions 回写、两个开关互相独立（放开元素不放开地图，放开地图不放开元素）。

## 3. 残余交叉（任务 2）

### 做法

拆线原本只有成对动作。**同一轨道内不同高度卡片的顺序反转，成对动作永远修不了**：按中心互换两张卡会把第三张压掉，滑动到邻居旁边会落在第三张身上，候选在打分前就被判非法。

新增两类动作（`card-layout-uncross-rails.ts`）：

- **窗口重排**：只动交叉两卡之间那一段，从该段当前起点连续重排。连续排列是同一组卡最紧的摆法，所以这段永远不会撑出它已占的跨度。
- **整轨按锚点重排**：整条轨道按锚点坐标排序，是唯一「轨道内零反转」的排法，代价是整条轨道位移。

轨道定义 = 同一 side + 沿垂轴投影相连的一串卡（垂轴重叠正是它们必须沿轴分开的原因）。

贪心下降只会落进它步序走到的那个盆地，所以改成**五个方案各跑一遍同一起始板、取交叉最少者**（`REPAIR_PLANS`）：`none/window/sort` × 正序，`window/sort` × 逆序。`none` 方案逐字复现 Round 2 的成对下降——这是「新动作只可能变好、不可能变坏」的保证。中途早期退出：任一方案到 0 立即停。

预算改为按「移动卡片数」计费（4000 → 6000），轨道重排按宽度付费。

### 数字（24 卡密集板，`bounds` fixture，seed `0xc205524+24`，straight/1.5）

| mode | 拆线前 | Round 2 | **Round 3** |
| --- | --- | --- | --- |
| proximity | 6 | 2 | **0** |
| columns | 49 | 11 | **2** |
| quadrant | 51 | 1 | **1** |
| radial | 9 | 2 | **0** |
| right-stack | 100 | 15 | **9** |
| grid | 98 | 6 | **3** |

perf probe 板（含 `occupiedPolygons`，seed 同上）：columns 5 → **1**，right-stack 6 → **5**，grid 6 → **3**，quadrant 2 → **1**，radial 2 → **0**，proximity 0 → 0。六模合计 17 → 10。

Round 2 基线是把 `REPAIR_PLANS` 临时收成单个 `none` 方案实测得到的，不是引用旧报告。

### 性能（perf probe 中位）

| mode | 24 卡 R2 → R3 | 48 卡 R2 → R3 |
| --- | --- | --- |
| proximity | 5.7 → 6.0 ms | 21.6 → 28.1 ms |
| columns | 5.8 → 11.0 ms | 27.7 → 53.6 ms |
| quadrant | 12.7 → 17.0 ms | 41.7 → 65.9 ms |
| radial | 10.1 → 11.4 ms | 36.8 → 59.2 ms |
| right-stack | 5.0 → 10.2 ms | 24.1 → 52.1 ms |
| grid | 1.2 → 7.3 ms | 6.4 → 29.5 ms |

24 卡最坏 17.0ms，远低于 50ms 线；48 卡最坏 65.9ms，远低于 200ms 软线。代价来源是「跑五遍取最优」，是换来单调不退化的直接开销。

### 剩余交叉的几何类型

到不了 0，剩下的都是这一版动作集没有合法解的两类：

1. **近重合锚点、卡片落在不同车道**（如 columns 里两张锚点相距 24px 的卡，一张在 x=32 车道、一张在 x=185 车道）。两条直线连接器指向几乎同一像素必然相遇——这是花束的推广形态：花束要求两卡同轨才不算交叉，跨车道就算。修法只有把外侧卡挪进内侧车道，而密集板上内侧车道没有空位。
2. **卡片被 mode 摆到锚点的对侧**（如 right-stack 里锚点 x=464 的卡被摆到 x=1337）。它的连接器横跨整个画布，会和沿途所有东西相交。修法是跨轨迁移（把 A 插进 B 的轨道、B 插进 A 的轨道，两轨各自重排），本轮没有实现——见下面的后续项。

`right-stack` 剩 9 条最多，因为它按设计把所有卡堆到一侧，第 2 类结构性地多。

### 回归锁

`card-layout.uncross.test.ts` 新增 `dense 24-card boards`，逐模断言：

- `after ≤ 拆线前`（`forbidConnectorCrossing: false` 的同板结果）——真正的不变式
- `after ≤ CEILINGS[mode]`——当前实测值作上限，任何悄悄回退都会红
- `status === "solved"` 当且仅当 `after === 0`
- 全部 `assertHardConstraints`

另加 `rail reordering` 两项：先证明该板拆线前真的交叉（防止空过），再断言修完 0 交叉、留在同一车道同一 side、按锚点顺序、且**重排后的跨度不大于重排前**（连续重排不许扩张）。

## 4. 验证

```
npx vitest run src/lib/card-layout.uncross.test.ts \
  src/lib/card-layout.modes-extra.test.ts \
  src/lib/card-layout.perf.probe.test.ts        → 54 passed
npx tsc -b --noEmit                              → clean
npx vitest run src/lib/agent-session src/lib/card-layout \
  scripts/file-size-ratchet.test.ts src/components/canvas/PosterCanvas
                                                 → 287 passed
npm test                                         → 2514 passed / 2 skipped
npm run lint                                     → 0 errors（5 条既有 warning，都在无关文件）
```

过程中出现并修掉的两次失败：

- **ceiling 断言红**：把 perf probe 板（带 `occupiedPolygons`）的数字抄到用普通 `bounds` 的测试上 → 板子不同数字自然不同 → 改成在同一 fixture 上实测后再写死。
- **quadrant 从 1 退到 2**：第一版方案表里没有「完全不用轨道动作」的方案，`window` 级别在 quadrant 上走进了更差的盆地 → 把 `wholeRailSort: boolean` 换成 `railMoves: "none" | "window" | "sort"` 三档并补上 `none` 方案 → quadrant 回到 1，其余模式不受影响。

## 5. 交付与回滚

- 面向用户的行为变化：AI `auto_layout` 现在会避开海报文本与可见装饰，嘉宾盒按实际高度占位；连接线交叉更少。没有数据、导出格式或 API 形状变更。
- 验收方式：上面四条命令 + 两张对比截图（同一板、同一 solver，只换障碍集 / 只换拆线动作集）。
- 回滚：`REPAIR_PLANS` 收成 `[{ railMoves: "none", reversePairs: false }]` 即回到 Round 2 拆线行为（其余代码无需动）；AI 障碍对齐回滚则把 `agent-session-layout.ts` 的 `elementAreas` 换回单个 120px 嘉宾盒。两处都是单点改动。

## 6. 交接给下一轮

1. **跨轨迁移动作**没做。这是压掉上面第 2 类残余的唯一路子：A 插进 B 的轨道、B 插进 A 的轨道、两轨各自连续重排，入轨卡的垂轴坐标按目标轨道朝地图那一侧的边对齐。`card-layout-uncross-rails.ts` 里的 `packOrder` 已经可以直接复用。
2. **`right-stack` 剩 9 条**是六模里最差的，值得单独看：它把所有卡堆一侧，第 2 类残余是结构性的，可能需要在 packer 层而不是拆线层解决。
3. `MAX_MOVE_EVALUATIONS = 6000` 在 24/48 卡上都没被触到（实测 ~600），如果后续加动作可以先看这个数够不够，再谈调大。
4. **并行改动提醒**：本轮工作期间同一 workspace 里另有代理改了 `src/lib/card-layout.perf.probe.test.ts`，删掉了两处 `expect(median).toBeLessThan(1_000)` 硬上限。不是我的改动，但和本轮把求解耗时抬到 24 卡 17ms / 48 卡 66ms 有关，父调度器合并时值得确认那是有意为之。
