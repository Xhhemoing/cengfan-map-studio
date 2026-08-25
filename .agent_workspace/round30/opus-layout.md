MODEL_SLUG: claude-opus-5-thinking-high-fast

# R30 opus-layout — 门面去掉冗余 `orderResult` 包裹 + `mergePinnedCards` 去掉非空断言

## 结论

两处都按 BRIEF 落地，几何未变：门面三处外层 `orderResult` 已删（`leastBad` 的那一处按要求保留），
`mergePinnedCards` 的 `placed[cursor]!` 换成走 `marginSeat` 的显式兜底，并把 `LayoutSpace` 复用为一个实例。
先证明"包裹是幂等空操作"，再删——不是删完再看测试是否恰好通过。

## 变更 1：`src/lib/card-layout.ts` 冗余 `orderResult`

| 位置 | 改动前 | 改动后 |
| --- | --- | --- |
| `repairLadder` | `orderResult(cards, repackAll(...), space)` | `repackAll(...)` 直接参与 `validateHard` |
| `solve()` grid 分支 | `orderResult(inputs, layoutGrid(...), space)` | `layoutGrid(inputs, space)` |
| `solve()` 侧栏分支 | `orderResult(inputs, packSides(...), space)` | `packSides(inputs, space, mode, options)` |
| `leastBad` | `orderResult(cards, winner, space)` | **保留**（混合候选的输入序公共契约） |

`repackAll` / `layoutGrid` / `packSides` 三者的返回语句本身就是 `orderResult(cards, ..., space)`，
所以外层再包一次只是把同一个数组重算一遍。注释同步更新：`repairLadder` 与 `solve()` 说明"门面只做组合、不重排"，
`leastBad` 的措辞从"同每条 solved 路径"改为"同每个 packing 策略自己所做的"，避免删掉外层后文档与代码对不上。

### 幂等性证据（先证明，再删）

`/tmp/idempotence.ts`（临时脚本，未入库）：LCG 固定种子生成 **400** 组随机画布——
随机 width/height/map/margin/gap（含 margin=0、gap=0）、40% 带随机 occupiedArea、部分整块画布被占满、
卡片数 1–14 且**故意构造重复 id**（`orderResult` 按 id 分桶 `shift`，重复 id 是它唯一可能乱序的地方）。
对每组分别取 `layoutGrid` / `repackAll` / `packSides(quadrant|radial|right-stack)` 的输出 `X`，
比较 `JSON.stringify(orderResult(cards, X, space)) === JSON.stringify(X)`：

```
{ checked: 1942, mismatched: 0 }
```

1942 次比较全部逐字节相同 → 被删掉的三处包裹对结果无任何影响，不是 load-bearing。
（BRIEF 的分支条件"若发现包裹是必需的则保留并附失败测试"不成立，故按主路径删除。）

## 变更 2：`src/lib/card-layout-pinned.ts` `mergePinnedCards`

```ts
const space = new LayoutSpace(plan.bounds);
const placed = orderResult(plan.free, solved, space);
...
const placement = placed[cursor] ?? marginSeat(plan.free[cursor], space);
```

- 去掉 `placed[cursor]!`：断言一旦失效会静默产出 `undefined` 元素；显式兜底则退回和其他所有 leftover
  出口相同的 `marginSeat`，`side` 从座位读出而不是占位值。
- `LayoutSpace` 只构造一次并复用给 `orderResult` 与兜底（BRIEF 的 "better" 方案），不是每张卡片重建。
- 已固定卡片的 slot 原样返回，x/y 未动。

## 变更 3：测试

### `src/lib/card-layout.test.ts` 新增 `describe("leftover cards on the facade path")`（5 条）

1. **grid 路径原样出货** —— `solveCardLayout(roster, bounds, { mode: "grid" }).placements`
   `toEqual` 独立调用的 `layoutGrid(roster, space)`。
2. **侧栏路径原样出货** —— 同上，对 `packSides(roster, space, "quadrant", options)`；
   该 bounds 无 occupiedAreas / polygons，连接线搜索走 `skipped-no-geography`，所以打包结果就是出货结果。
3. **grid leftover 由座位定 side** —— 宽扁 map + 一条遮住 x∈[300,1460] 的保护带，5 张卡片的所有网格单元
   都落在带上，全部走 `stackAtMargin` 兜底到 margin 列；断言 `status === "solved"`（即出货的确是 `layoutGrid`
   的原始数组）、id 保持输入序、每张 `side === space.sideOf(placement)`，且 side 集合恰为 `{top, left}`
   ——列从宽扁 map 的北侧一直排到它左侧，任何单一占位 side 都描述不了它。
4. **侧栏 leftover 不沿用分类列** —— 同一画布跑 `right-stack`。`classifyRightStack` 把每张卡都判成 `"right"`，
   而右翼整个压在保护带下，5 张卡全部经 `containFree` 修到对侧空列；断言 `side === sideOf` 且
   **结果里不含 `"right"`**——占位 side 若被带出来，5 条引线全指向背对地图的边。
5. **完全放不下时（4 种 mode 参数化）** —— 整块画布被保护，梯子每一级都失败，走 `contain`/`leastBad`；
   断言 `status === "fallback"`、id 输入序、每张 `side === sideOf`。

### `src/lib/card-layout-pinned.test.ts` 新增 `describe("merging pinned cards back")`（2 条）

1. **每个 slot 一个 placement、保持输入序、pin 不动** —— roster `[free-a, pinned, free-b]`，
   solved 故意按 pack 序（`free-b` 在前）传入；断言输出 id 序为输入序、坐标逐一对上（pin 仍是 `{60,620}`）、
   两张自由卡 `side === space.sideOf(placement)`。
2. **solve 没返回的自由卡落到 margin 座位并由座位定 side** —— `mergePinnedCards(plan, [])`；
   断言两张自由卡 x/y 都是 margin、`side === "top"`（宽扁 map 之北）且 `=== space.sideOf(placement)`，
   pin 的坐标不受影响。这条覆盖的是 `orderResult` 的补位路径，也正是显式兜底所描述的语义。

## 验证证据链（failure → cause → fix → recheck）

1. **BRIEF 指定命令**
   `npx vitest run src/lib/card-layout-pinned.test.ts src/lib/card-layout.test.ts src/lib/card-layout-pack.test.ts src/lib/card-layout-modes.test.ts src/lib/card-layout-optimizer.test.ts`
   → **5 files / 136 tests passed**。

2. **failure → cause → fix → recheck（新测试是否真的兜得住）**
   新增的门面测试若只是"跟着实现写"，删包裹这类改动就没有护栏。故做两次反向变异，各自确认失败后复原：
   - 变异 A：grid 分支输出统一改 `side: "right"`。
     → `labels a grid leftover by the seat it was stacked into` 失败：`expected 'right' to be 'top'`
     （card-layout.test.ts:1398）。**cause**：leftover 的 side 不再来自座位。**fix**：`cp` 复原原文件。
     **recheck**：该用例恢复通过。
   - 变异 B：`packSides(...)` 输出 `.reverse()`（模拟"包裹其实是必需的"那种世界）。
     → 2 条用例失败，含 id 序断言 `["crowd-0".."crowd-4"]` vs 反序（card-layout.test.ts:1416）。
     **cause**：门面不再输出调用方序。**fix**：复原。**recheck**：全部恢复通过。
   两次变异证明：如果打包器哪天不再自带输入序或不再由座位定 side，新测试会直接红，而不是靠人工复核。

3. **类型检查**
   根 `tsc --noEmit` 是 solution no-op（`files: []` + references），按 BRIEF 用
   `npx tsc --noEmit -p tsconfig.app.json` → exit 0，无诊断。
   （附带确认：`tsconfig.app.json` 未开 `noUncheckedIndexedAccess`，所以 `placed[cursor] ?? ...` 的兜底
   不需要再补 `!`，改动没有把断言从一处挪到另一处。）

4. **回归面**
   - 其余 card-layout 套件：`saturation / space / cache / index / worker-protocol` → **5 files / 41 tests passed**。
   - 下游消费方：`scripts/perf-layout-bench.test.ts`、`src/lib/studio-journey.test.ts`、
     `src/workers/card-layout.worker.test.ts`、`src/lib/destination-layout.test.ts` → **4 files / 29 tests passed**。

5. **Lint**
   `npx eslint src/lib/card-layout.ts src/lib/card-layout-pinned.ts src/lib/card-layout.test.ts src/lib/card-layout-pinned.test.ts`
   → 无输出，exit 0。

## 约束核对

| 约束 | 状态 |
| --- | --- |
| optimizer `repairPlacement` 的 `side: "right"` | 未触碰 |
| 第二 margin 列 / `stackAtMargin` y=maxY 饱和堆 | 未触碰 |
| pack 几何、`nearestValues`、`CONTAIN_STEP` | 未触碰 |
| `classifyRightStack` 全判 `"right"` | 未触碰（新测试反而把它当作"占位 side"的反例来用） |
| `pack.ts`（395/400） | **完全未改**，仍从中 import `marginSeat` / `orderResult` |
| ALLOWED PATHS | 只动了 `card-layout.ts` / `card-layout-pinned.ts` / 两个对应测试 + 本报告 |
| 实现文件 ≤400 行 | `card-layout.ts` **374**、`card-layout-pinned.ts` **117** |
| git | 未 commit / stash / push / 新分支；改动留在工作区，仍在 `cursor/agent-sota-polish-cbcd` |

## 交付与回滚

- 验收方式：CI 的 `npm test` + `npm run lint`；本地已跑 BRIEF 指定命令 + 其余 card-layout 套件 + 4 个下游消费方套件。
- 破坏性风险：无。`placements` 的顺序、坐标、`side` 逐点等价于改动前（1942 次幂等比较 + 全量既有用例通过），
  API 形状、导出格式、数据均未变。
- 回滚方案：两处改动互不依赖，可分别回滚。
  1. 门面：把三处调用重新包成 `orderResult(inputs, <call>, space)` 即可（`orderResult` 的 import 仍在，`leastBad` 用着）。
  2. pinned：把 `placed[cursor] ?? marginSeat(plan.free[cursor], space)` 换回 `placed[cursor]!`，
     并去掉 `marginSeat` import、`LayoutSpace` 改回内联构造。
  新测试可独立保留（它们断言的是改动前后都成立的契约，回滚后仍会通过）。
