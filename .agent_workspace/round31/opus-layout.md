MODEL_SLUG: claude-opus-5-thinking-high-fast

# R31 opus-layout — 搜索**跑过**路径的 leftover side 锁 + 修复"已经输掉的插入序还在继续扫"

## 结论

1. **锁**:新增 `sides a leftover the connector search repaired for itself`(quadrant / radial 两参数化),
   在 `__layoutDebug.last.decision === "ran"` **且搜索确实赢了这一局**(`improved === true`)、
   **且出货结果里含 repair 座位**的前提下,断言每张 `side === new LayoutSpace(bounds).sideOf(placement)`,
   并断言 side 集合恰为 `{top, left, bottom}`——`"right"`(repair 探针携带的占位值)是这块板上唯一没人坐的边。
2. **生产改动**:先证明搜索路径的 leftover side **本来就是干净的**(证据见 §1),于是没有去加
   BRIEF 明令禁止的 `sideOf` 空包裹,也没有去动 `mergePinnedCards` 那个不可达的分支;
   改的是搜索路径上真实存在、可测得的缺陷:**一次落在非法座位上的 repair 已经注定让整个插入序被
   `validateHard` 丢弃,但 `runOrder` 仍然把后面每张卡都摆完,包括再跑几次全画布点阵扫描。**
   现在它在输掉的那个座位上就停。同一块板 16 卡:**19.7 ms → 7.7 ms**,repair 扫描 **41 → 8**,
   而出货的 placements 逐字节不变。

---

## 1. 先取证:搜索跑过的路径,leftover side 到底脏不脏

在 `card-layout.test.ts` 里临时挂一个探针(已删除),用 R30 `banded` 同一套几何
(宽扁 map `{200,420,1100,160}` + 保护带 `{300,60,1160,880}`,只剩 margin 列可用),
mode = quadrant / radial,卡片数 4–7,逐张比对 `side` 与 `sideOf`:

```
7 quadrant ran solved improved= true bad= 0
   66,435,left | 66,316,top | 66,594,bottom | 66,60,top | 66,850,bottom | 56,212,top | 56,704,bottom
```

`bad`(`side !== sideOf` 的张数)全程为 0。追下去,原因是三个入口本来就都读座位:

| 出货来源 | side 从哪来 |
| --- | --- |
| 候选矩形 | `card-layout-candidates.ts` `railPlacements`:`side: space.sideOf(area)` |
| repair | `repairPlacement` → `containFree`,三个出口(自由快路径 / 点阵扫描 / `stackAtMargin`)各自重推 |
| 收尾 | `optimizedLayout` 末尾 `orderResult`,补位走 `marginSeat`(同样 `sideOf`) |

所以 BRIEF 的第一分支("optimizer 在 containFree 之后又把探针 side 抄回来")**不成立**,
`runOrder` 里 `selected?.placement ?? repairPlacement(...)` 就是 containFree 的返回值本身,没有再包装。
顺带更正了 `card-layout-optimizer.test.ts` 头注里一句过期的话:它写着
"`side === sideOf` 只对 repair 成立,候选保留生成时的 side"——候选**就是**用 `sideOf` 生成的,
这条不变式对 `optimizedLayout` 的全部输出都成立,新测试正是按这个更强的形式断言的。

**但这不等于没有缺陷。** 同一批探针里 7 卡 / 高 110 的板子露出另一件事:

```
7 seeded: ordersRun 2, ordersScored 0, budgetSpent 240144   ← 每个序 2 次 repair,一次都没能计分
7 bare  : ordersRun 8, ordersScored 0, budgetSpent 960548   ← 每个序 2 次 repair,一次都没能计分
```

`ordersScored 0` 说明这些序全被 `validateHard` 丢了,而它们各自还付了**两次** repair
(`REPAIR_COST` 60000/次,是搜索里最贵的单步)。第二次是白付的。

---

## 2. 生产改动:`src/lib/card-layout-optimizer.ts`

### 2.1 判定依据(为什么这是"提前放弃",而不是"改变结果")

候选矩形在 `railPlacements` 就被过滤成 `space.inside(area) && !space.blocked(area)`,
`selectCandidate` 又跳过 `state.placed.hits(...)` 的候选——这**正好**是 `validateHard` 的三条检查。
所以一个插入序只可能因为**一次不得不重叠的 repair** 而不合法;
而只要它已经不合法,后面摆多少张卡都不可能让 `validateHard` 通过。

```ts
/** The hard constraints {@link validateHard} will apply to this seat later. */
function seatIsLegal(seat: CardPlacement, space: LayoutSpace, placed: PlacementIndex): boolean {
  return space.inside(seat) && !space.blocked(seat) && !placed.hits(seat, space.gap);
}
...
const placement = selected?.placement ?? repairPlacement(card, space, state.placed);
if (!selected && !seatIsLegal(placement, space, state.placed)) return { placements: null, repairs };
```

`runOrder` 的返回类型随之从 `CardPlacement[] | null` 变成
`{ placements: CardPlacement[] | null; repairs: number }`,把"这一序实际扫了几次 repair"报回去
(不新增参数)。函数注释补上由此得到的不变式:**`runOrder` 返回非 null 时,结果按构造即合法。**
`optimizedLayout` 里的 `validateHard` 保留为兜底,新测试 `expect(validateHard(placements!, banded)).toBe(true)`
把这条不变式写死。

### 2.2 `ConnectorSearchTrace.repairs`(诊断字段)

```ts
/**
 * Repairs actually scanned, across every order tried. Each one walks a
 * lattice over the free canvas, which is the dearest step in the search.
 */
repairs: number;
```

只加不改,`LayoutDebugRecord.trace` 直接透传;`card-layout.test.ts` 里那处整对象 `toEqual(trace)`
同步补 `repairs: 0`。注意计数口径:撞到 `repairLimit` / `SEARCH_BUDGET` 天花板的那一次**只记账不扫描**,
所以那个提前返回报 `repairs - 1`,字段名与文档一致。

### 2.3 测得的效果(同一块板,加/去 guard 各跑 5 次取中位数)

`banded` 画布 + N 张高 110 的卡(挤爆 margin 列,首次 repair 必然重叠),`seed = null`:

| N | 改前 中位耗时 | 改后 中位耗时 | 改前 repairs | 改后 repairs | 改前 ordersRun / stop | 改后 ordersRun / stop |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
| 7 | 10.7 ms | **6.8 ms** (−36%) | 16 | **8** | 8 / exhausted | 8 / exhausted |
| 16 | 19.7 ms | **7.7 ms** (−61%) | 41 | **8** | 6 / budget | 8 / exhausted |
| 32 | 22.1 ms | **10.6 ms** (−52%) | 41 | **8** | 4 / budget | 8 / exhausted |
| 48 | 23.7 ms | **10.9 ms** (−54%) | 41 | **5** | 3 / budget | 5 / exhausted |

两点值得说明:

- 改前这些板子把 250 万的 `SEARCH_BUDGET` **全烧在注定作废的序上**(`stop: "budget"`,4–6 个序就没了),
  改后同样的板子用不到五分之一预算把 8 个序**全部跑完**。多跑的序只会带来"严格更优或平局"
  (`optimizedLayout` 只接受 `compareScores < 0`),不会带来更差的布局。
- 出货结果不变:7 卡 / 高 90 那块(搜索会赢的板)加 guard 前后 placements 逐字节相同——
  `66,435,left | 66,316,top | 66,594,bottom | 66,60,top | 66,850,bottom | 56,212,top | 56,704,bottom`。

---

## 3. 测试

### 3.1 `src/lib/card-layout.test.ts`(BRIEF 主锁,2 条参数化)

`describe("leftover cards on the facade path")` 内新增
`sides a leftover the connector search repaired for itself`(`quadrant` / `radial`):

- 几何沿用 R30 的 `banded`(宽扁 map + 保护带),卡片 `crowd(7)` 改高 90——高度是关键:
  高 110 时列装不下、repair 只能重叠,搜索赢不了;高 90 时 repair 落在自由座位上,搜索赢下整局。
- `expect({ decision, shipped, repaired }).toEqual({ decision: "ran", shipped: true, repaired: true })`
  ——分别对应"搜索真的跑了"、"出货的是搜索自己的数组而不是打包种子"、"里面确实有 repair"。
- 每张 `side === space.sideOf(placement)`;side 集合 `toEqual(new Set(["top", "left", "bottom"]))`
  ——列从宽扁 map 之北一路排到它左侧再到它南侧,任何单一占位 side 都描述不了它,
  而探针携带的 `"right"` 恰好是这块板上没人坐的那一边。
- x 集合 `toEqual(new Set([66, 56]))`:66 是候选轨(`300 - gap - width`,障碍边),56 是
  `containFree` 自己的 12px 点阵步长。**没有这一条,上面的 side 断言就只覆盖了候选**,
  而候选根本见不到占位 side,测试会变成空转。

### 3.2 `src/lib/card-layout-optimizer.test.ts`(新增 `describe`,2 条)

1. `stops on the seat that lost it instead of scanning again for every card behind`
   ——高 110、`seed = null`(不受 `SEARCH_PATIENCE` 打断)。断言 `placements` 为 null、
   `ordersScored === 0`、且 **`trace.repairs === trace.ordersRun`**:每个序只扫了一次点阵就停。
   配合 `ordersScored === 0`(说明没有任何序跑完)与 `repairLimit = 3`(第一次 repair 不可能触顶),
   这两条合起来唯一的解释就是"每个序都停在它的第一次 repair 上"。
2. `keeps running an order whose repair found a legal seat` ——高 90 的同一列。
   断言 `repairs > 0`、`ordersScored === ordersRun`(合法 repair 不会被误杀)、
   `validateHard(placements!, banded)` 为真(§2.1 的不变式)、id 保持输入序、每张 `side === sideOf`。

---

## 4. 验证证据链(failure → cause → fix → recheck)

1. **BRIEF 指定命令**
   `npx vitest run src/lib/card-layout.test.ts src/lib/card-layout-optimizer.test.ts src/lib/card-layout-pinned.test.ts src/lib/card-layout-pack.test.ts src/lib/card-layout-modes.test.ts`
   → **5 files / 140 tests passed**。

2. **反向变异 A(新 side 锁兜不兜得住)**
   在 `runOrder` 里把 repair 结果改成 `{ ...repairPlacement(...), side: "right" }`
   ——即 BRIEF 描述的"有人把探针 side 抄回来"。
   → `AssertionError: expected 'right' to be 'bottom'`,quadrant / radial **两条全红**。
   **cause**:repair 的 side 不再来自座位。**fix**:改回 `selected?.placement ?? repairPlacement(...)`。
   **recheck**:两条恢复通过。

3. **反向变异 B(新 guard 兜不兜得住)**
   删掉 `if (!selected && !seatIsLegal(...)) return ...` 这一行。
   → `AssertionError: expected 16 to be 8`(`trace.repairs` vs `trace.ordersRun`),1 条红。
   **cause**:注定作废的序仍在继续扫描。**fix**:`cp` 复原。**recheck**:5 files / 140 tests 全绿。

4. **类型检查**
   根 `tsc --noEmit` 是 solution no-op,按 BRIEF 用 `npx tsc --noEmit -p tsconfig.app.json` → **exit 0,无诊断**。

5. **全量回归**
   `npm test`(`scripts/run-heavy.mjs vitest run`)→ **226 files / 2024 tests passed**。
   `trace` 形状变了(多一个字段),已确认全仓只有 `card-layout.test.ts:1055` 一处做整对象 `toEqual`,
   已同步补 `repairs: 0`;其余消费方(`useCardLayoutWorker` / worker protocol / perf bench)只读
   `decision` 与 `trace !== null`,不受影响。

6. **Lint**
   `npx eslint src/lib/card-layout-optimizer.ts src/lib/card-layout-optimizer.test.ts src/lib/card-layout.test.ts --max-warnings 0` → 无输出,exit 0。

---

## 5. 约束核对

| 约束 | 状态 |
| --- | --- |
| `repairPlacement` 的 `side: "right"` 种子 | **未触碰**(变异 A 用完即复原) |
| 第二 margin 列 / `stackAtMargin` y=maxY 堆 | 未触碰 |
| pack.ts 几何(395/400 行) | **完全未改**,仍只从中 import `containFree` / `orderResult` |
| `classifyRightStack` 全判 `"right"` | 未触碰 |
| 禁止加 `containFree` 外的 `sideOf` 空包裹(R28 已判定为 no-op) | **未加**;§1 先证明它是 no-op,才没有加 |
| `mergePinnedCards` 的 `marginSeat(plan.free[cursor], ...)` | **保持原样**。该分支不可达(`orderResult` 保证 `placed.length === plan.free.length`,`slots` 每个 null 恰对一张自由卡),BRIEF 给出的几种写法要么把 `null` 当 `CardPlacement` 断言出去、要么得 `throw`,都比现状差,按 BRIEF 末句"Keep current behavior"处理 |
| ALLOWED PATHS | 只动 `card-layout-optimizer.ts` / `card-layout-optimizer.test.ts` / `card-layout.test.ts` + 本报告 |
| 实现文件 ≤400 行 | `card-layout-optimizer.ts` **376**(原 346) |
| git | 未 commit / stash / push / 新分支;改动留在工作区,仍在 `cursor/agent-sota-polish-cbcd` |

---

## 6. 交付与回滚

- **验收方式**:CI 的 `npm test` + `npm run lint`;本地已跑 BRIEF 指定命令、全量 `npm test`、
  `tsc -p tsconfig.app.json`、目标文件 eslint,外加 §2.3 的加/去 guard 对拍。
- **破坏性面**:`ConnectorSearchTrace` 多一个 `repairs: number` 字段(纯诊断,`interface` 加字段,
  既有读取方不受影响);`placements` / `status` / `mode` 的形状和取值均未变。
  行为上唯一可观察的差异是"预算见底的板子现在能跑完更多插入序",而搜索只接受严格更优的布局,
  所以这只可能让结果不变或更好——2024 条既有用例(含确定性、`never worse than packing alone`、
  预算耗尽板)全绿。
- **回滚方案**:两处互不依赖。
  1. 只回滚提前放弃:删掉 `runOrder` 里 `seatIsLegal` 那一行判断与该函数(`repairs` 字段可留)。
  2. 连 `repairs` 字段一起回滚:`runOrder` 返回类型改回 `CardPlacement[] | null`,
     去掉 `trace.repairs`,并把 `card-layout.test.ts:1055` 的 `repairs: 0` 与
     `card-layout-optimizer.test.ts` 里新增的 `describe` 一并移除。
  §3.1 的 side 锁**可独立保留**:它断言的契约在回滚前后都成立(§1 已证明搜索路径本来就干净),
  回滚后仍会通过。
