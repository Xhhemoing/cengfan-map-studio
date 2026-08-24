# R16-opus-layout — `stackAtMargin` 单趟插入序扫描漏卡

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / 未 stash / 未建分支 / 未 push）
- **改动文件**: `src/lib/card-layout-pack.ts`（+10/-2）、`src/lib/card-layout-pack.test.ts`（+101）
- **未碰**: `src/lib/card-layout-modes.ts`（本轮不需要改：函数签名与返回形状都没动）、`card-layout-cache.ts`（简报禁止）、`card-layout-optimizer.ts`（R16-fable-arch 的地盘）

---

## 一、缺口确认（R14 遗留项 1 / R15 交接项）

`stackAtMargin` 对 `placed.items` **只按插入顺序扫一趟**：

```ts
let y = space.margin;
for (const other of placed.items) {
  if (other.x < space.margin + placement.width && other.y < y + placement.height && other.y + other.height > y) {
    y = other.y + other.height + space.gap;
  }
}
```

游标 `y` 只会往下走，但扫描顺序跟 `y` 无关。一张一开始落在 `y` 下方、因而被 `other.y < y + placement.height` 判为「不相干」而跳过的卡，在后续卡把 `y` 推下来之后**不会被再看一眼**——游标可以正好推到它头上。

它自己的 docstring 写的是「skipping past cards already there so nothing fully coincides」，所以这是违背自身契约；而且 `layoutQuality` 把「完全重合」排在比「部分重叠」更差的位置（重合的卡不可读、不可点选），这条路径恰恰能造出它。

## 二、复现（不是纸面推演）

`src/lib/card-layout-pack.test.ts` 里的 `clears a card it already scanned past…`：`margin=0, gap=0`，新卡 120×100，列里三张同尺寸卡按 **y=200 → y=0 → y=100** 的顺序插入：

| 扫到 | 判定 | 游标 y |
| --- | --- | --- |
| (0,200) | `200 < 0+100` 不成立 → 跳过（在下方） | 0 |
| (0,0) | 命中 → `y = 0+100` | 100 |
| (0,100) | 命中 → `y = 100+100` | 200 |

结果坐到 **(0,200)**，与第一张 **逐像素重合**（x/y/宽/高四项全等），而 y=300 往下一直到 y=600 全是空的。把修复临时撤掉跑了一遍确认：`expected 200 to be 300`。

**端到端可达性**也验过（临时探针，已删）：直接喂 `packSides` 400 盘随机饱和棋盘（900×1600 画布 + 大地图障碍，10–35 张卡，三种 mode 轮换），`stackAtMargin` 被调用 **2607** 次，其中 **1332 次**（51%）在**画布还有余量、座位没被 `clampY` 夹回来**的情况下就压在了已放置的卡上。触发条件是 `packSides` 的四轮溢出：第 1 轮 bottom 侧的卡（y 大）先入索引，第 2 轮 left 侧的卡（y 小）后入，正好构成「先跳过、后被推上去」的插入序。

## 三、修法

按 y 升序扫，顺便把 x 列筛选提到循环外：

```ts
const column = placed.items
  .filter((other) => other.x < space.margin + placement.width)
  .sort((left, right) => left.y - right.y);
let y = space.margin;
for (const other of column) {
  if (other.y < y + placement.height && other.y + other.height > y) {
    y = other.y + other.height + space.gap;
  }
}
```

**为什么升序单趟就够（不需要循环到稳定）**：游标 `y` 单调不减。设卡 j 在被扫到时因「在下方」被跳过，即 `y_j ≥ y + h`；之后任何还能推动游标的卡 k 必须满足 `y_k < y + h`，但升序保证 `y_k ≥ y_j ≥ y + h`，矛盾。所以升序下「被跳过的卡永远保持被跳过」，一趟即为不动点。被判为「在上方」的卡同理（`y` 只增不减，只会离得更远）。

选排序而不是「循环到稳定」是代价考虑：排序 O(n log n)，循环到稳定最坏 O(n²)，而 `packSides` / `sweepPack` 的兜底循环本身就会对每张剩余卡各调一次。`filter` 先把列外的卡剔掉，实测列长中位数远小于 `placed.items`。

保留 R15 的 `side: space.sideOf(seat)`（座位定 side），一个字没动。`clampY`、`gap` 语义、x 列筛选谓词都保持原样。

## 四、测试（`src/lib/card-layout-pack.test.ts`，+3 例 → 共 10 例）

1. **`clears a card it already scanned past…`** — 上面那个 fixture。断言座位 `y === 300`、与列内三张卡 `overlaps` 全 false、`side === space.sideOf(结果)`（R15 护栏）。
2. **`finds a free seat whatever order the column was inserted in`** — 同一列（y = 0/100/200/300/400）的 **全部 120 种插入排列**，每种都必须坐到 `y = 500`。「堆到哪」是几何性质，不该是插入顺序的函数。
3. **`never seats a card on an occupied row while the column still has room`** — 种子固定的 LCG 模糊测试，300 轮 × 12 张随机高度、随机洗牌插入的列（900×4000 画布，`margin=12, gap=10`）。断言座位在画布内且与列内每张卡都不重叠。这条正是把上面那个 51% 的探针结论钉成了断言。
4. **`ignores cards parked clear of the margin column`** — 反向护栏：x 在新卡右缘之外的卡不参与争座，座位仍在 `margin`（防止有人把 filter 谓词写宽）。

三条新例在**旧实现下全红**（`expected 200 to be 300`、`expected 400 to be 500`、模糊测试的 overlap 断言），修复后全绿；原有 7 条（R15 的 side 用例）改前改后都绿——说明我没顺手改坏 side 语义。

## 五、验证链（failure → cause → fix → recheck）

1. **failure**：新写的 3 条断言在原实现下红。手法是把 `.sort(...)` 临时删掉重跑同一组命令，不是靠推理：`Tests 3 failed | 7 passed (10)`。
2. **cause**：扫描顺序与游标推进方向解耦——游标单调下移，但 `placed.items` 是插入序，于是「先被判为在下方而跳过」的卡在游标越过它之后没有第二次机会。契约（docstring 的 nothing fully coincides）由此被打破。
3. **fix**：列内卡按 `y` 升序排序后再单趟扫（证明见第三节），其余逻辑不动。
4. **recheck**：恢复实现后同一组命令重跑 —— `card-layout-pack.test.ts` **10/10 绿**；八个布局套件（`src/lib/card-layout*`）**132/132 绿**；`npm test` 全量 **208 files / 1808 tests 全绿**（含同轮其他代理的改动，无 unhandled error）；`npx tsc -b --force` 0 错；`npx eslint` 两个改动文件 0 问题。
5. `git status` 确认我只碰了 `card-layout-pack.ts` / `card-layout-pack.test.ts`（其余 diff 属同轮其他代理），临时探针与 `card-layout-scratch.test.ts` 已删干净（`git diff --stat` 只剩两个文件）。行数：pack **378**、pack.test **261**、modes 348（未改），全部 ≤400。

## 六、量化：修了什么、代价是什么

同一套 400 盘饱和棋盘，两种实现的对照（探针已删，数据留档）：

| 指标 | 插入序（旧） | 按 y 升序（新） |
| --- | --- | --- |
| `stackAtMargin` 调用 | 2607 | 2607 |
| **未被 clamp 却压在别人身上**（真 bug） | **1332** | **0** |
| 被 `clampY` 夹回画布内（真饱和） | 989 | 2200 |
| 全盘 overlap 对数 | 5251 | 7421 |

第二行是这次要修的东西：归零。

**代价要讲清楚**：第四行的 overlap 对数**升了 41%**，全部来自第三行。旧实现少推游标 → 卡散落在列中间，看着「摊开了」，实则是**在还有空位时就悄悄压卡**；新实现老老实实把列填满，填满之后溢出的卡才撞上 `clampY`，于是一起堆在 `y = maxY` 那一行。也就是说：**有空间时新实现严格更好（0 vs 1332），没空间时两者都难看**，而「没空间」正是 docstring 里写明允许的饱和情形（`any overlap here means the canvas is saturated`）。

试过一个缓解方案——溢出时不夹到底边、而是对可用高度取模绕回列顶继续堆——实测 overlap 对数 **8595**，比夹底更差（绕回去会撞上整列而不只是底边那一撮），已放弃，代码没留。

## 七、交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc -b` / `eslint`，三项已本地全绿）。手工验收：把画布东侧和南侧用 `occupiedAreas` 占满、给一批锚点在东侧的卡触发 `packSides` 的四轮溢出 → 改动前左边距会出现两张**完全重叠**的卡（下方明明还空着），改动后它们顺着左边距依次往下排。
- **用户可见变化**：只有走 `stackAtMargin` 兜底的卡的 **y 坐标**会变（往下移到真正空的位置）。`x` 恒为 `space.margin`（未变），`side` 仍按座位重算（R15 行为未变）。
- **不是破坏性变更**：`CardPlacement` / `CardLayoutResult` 形状未变，`solved` / `fallback` 判据未变，导出格式与 API 形状未变，`stackAtMargin` 签名未变（所以 `card-layout-modes.ts` 不用改）。
- **回滚**：把 `card-layout-pack.ts` 的 `column` 常量删掉、循环改回 `for (const other of placed.items)` 并把 x 谓词挪回 `if` 里，同时删掉 `card-layout-pack.test.ts` 里那 3 条新例和 `seededRandom` / `permutations` / `plainSpace` / `columnCard` / `probeAtMargin` 辅助函数（否则会红 + 报未使用）。实现与测试必须一起回滚。
- **风险**：低。只影响兜底路径的 y 坐标；全量 1808 条里没有对兜底布局坐标做快照断言的用例。唯一的性能面：每次调用多一次 `filter` + `sort`（列内元素，实测最长 19），只发生在饱和兜底路径上。

## 八、留给下一轮（未修）

1. **饱和溢出全堆在 `y = maxY`**：见第六节。真正的解法不是在 `stackAtMargin` 里绕，而是让它在第一列填满后开第二列（`x += width + gap`）——但那会让「stack at **margin**」名不副实，且 `containFree` 的现有测试断言 `x === space.margin`，属于概念级改动，需要单独一轮和一份 side 语义复核。
2. **纵向命中判定不算 `gap`**：`other.y < y + h && other.y + other.height > y` 不含 gap，但推的时候加了 `+ space.gap`。于是「被判为在下方」的卡与新卡之间可能只剩不足 gap 的间隙（不是重叠，只是贴太近）。改成 gap 一致会动到既有座位坐标，本轮没做——它不违反 docstring 的重合契约，属于观感问题。
