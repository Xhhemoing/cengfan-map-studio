# R17-opus-layout — `stackAtMargin` 纵向命中判定不含 `gap`

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / 未 stash / 未建分支 / 未 push）
- **改动文件**: `src/lib/card-layout-pack.ts`（+14/−3，389 行）、`src/lib/card-layout-pack.test.ts`（+79/−12，320 行）
- **未碰**: `card-layout-cache.ts`、`card-layout-optimizer.ts`、`card-layout-saturation.ts`（R17-fable-arch 的地盘）、`card-layout-modes.ts`（签名与返回形状都没动，不需要改）

---

## 一、缺口确认（R16 交接项 2）

判定与推进用了两套尺子：

```ts
if (other.y < y + placement.height && other.y + other.height > y) {  // 不含 gap
  y = other.y + other.height + space.gap;                            // 含 gap
}
```

于是有一条**判定盲带**：`y + height ≤ other.y < y + height + gap`。落在这条带里的卡，判定说「在下方、不相干」，直接跳过；游标不动，新卡就坐在列顶，与那张卡之间只剩不到 `gap` 的缝。

这不是像素重合（R16 已经把那个归零了），但**同一个文件里的其它路径都会把它算作碰撞**：`isFree` 走 `placed.hits(card, space.gap)`，`sweepPlace` 走 `placed.blocker(area, space.gap)`，`validateHard` 也是 `index.hits(card, space.gap)`。也就是说 `stackAtMargin` 交出来的座位，喂回 `validateHard` 会被判不合法——兜底路径自己产出的结果通不过全局硬约束检查。

横轴上有**同一个 bug 的镜像**：列筛选写的是 `other.x < space.margin + placement.width`，一张 x 落在 `[margin + width, margin + width + gap)` 的卡（比如新卡右缘外 10px、gap 20）压根不进列，同样只剩不到 gap 的缝。所以这次两轴一起对齐 `hits(..., gap)`，不是只修纵向。

## 二、复现（红在先，不是纸面推演）

先写断言、在**未修的实现**上跑，`npx vitest run src/lib/card-layout-pack.test.ts`：

```
× skips a card whose top sits in the gap band instead of tucking in behind it
    AssertionError: expected +0 to be 230        ← 座位坐在 y=0，应为 110+100+20
× counts a card in the column's side gap as occupancy rather than parked clear
    AssertionError: expected +0 to be 120        ← 横向镜像，同样坐在 y=0
× never seats a card on an occupied row while the column still has room
    AssertionError: expected true to be false
    ❯ expectSeatClear card-layout-pack.test.ts:47:40
        46|     expect(overlaps(seat, other)).toBe(false);        ← 绿（无像素重合）
        47|     expect(overlaps(seat, other, gap)).toBe(false);   ← 红（间距不足 gap）
Tests  3 failed | 9 passed (12)
```

第三条最能说明性质：**46 行绿、47 行红**——旧实现确实没有像素重合（R16 的成果还在），红的只有 gap 净空。

**端到端可达性**（临时探针 `/tmp/stack-probe.ts`，跑完已删）：直接喂 `packSides` 400 盘随机饱和棋盘（900×1600 画布 + 600×1000 地图障碍，10–35 张卡，`margin=16, gap=12`，三种 mode 轮换），统计「**两卡未被 `clampY` 夹底、无像素重合、但间距 < gap**」的卡对：

| 指标（400 盘同一 LCG 种子） | 旧实现 | 新实现 |
| --- | --- | --- |
| 出现 sub-gap 卡对的棋盘 | **66 / 400（16.5%）** | **0** |
| sub-gap 卡对总数 | **98** | **0** |
| 未夹底的像素重合卡对 | 0 | 0 |

第三行两边都是 0，说明这一轮没有把 R16 的成果改坏，也说明这个缺口确实只剩「贴太近」这一种表现。

## 三、修法

判定的两轴都按 `gap` 膨胀，与 `overlaps(a, b, gap)` / `RectIndex.overlapping` 内联的那四项比较逐字一致：

```ts
const gap = space.gap;
const columnRight = space.margin + placement.width;
const column = placed.items
  .filter((other) => other.x < columnRight + gap && other.x + other.width + gap > space.margin)
  .sort((left, right) => left.y - right.y);
let y = space.margin;
for (const other of column) {
  if (other.y < y + placement.height + gap && other.y + other.height + gap > y) {
    y = other.y + other.height + gap;
  }
}
```

列筛选顺手补了 `other.x + other.width + gap > space.margin`：原来缺右缘那一半，一张完全落在边距左侧（画布外）的卡也会被当成列内卡把游标往下推。

**为什么升序单趟仍然够（R16 的证明在含 gap 后依然成立）**：

1. *游标严格单调*：命中条件里含 `other.y + other.height + gap > y`，所以每次推进后的 `y_new = other.y + other.height + gap > y_old`。判定与推进现在共用同一个 `gap`，这一条才立得住——旧代码两边不一致，正是这个耦合被打断的地方。
2. *判为「在上方」的卡*（`c.y + c.height + gap ≤ y`）：`y` 只增不减，只会离得更远，不会回头命中。
3. *判为「在下方」的卡*（`c.y ≥ y + h + gap`）：升序保证其后每张卡 `d.y ≥ c.y ≥ y + h + gap`，都不满足命中条件 `d.y < y + h + gap`，所以**游标此后再也不动**，`c` 永远保持在下方。

三条合起来：一趟即不动点，且 `y*` 是 ≥ `margin` 的**最小可行值**（每次推进都是被迫的——被 `c` 命中时任何 `y' ≥ y_old` 都满足 `c.y < y' + h + gap`，绕不到 `c` 上方去，只能落到 `c` 下方）。

**没动的东西**：`space.clampY(y, placement.height)` 原样保留——列真填满时溢出的卡照旧夹在 `y = maxY` 堆着（docstring 写明的饱和语义）；没有开第二列；R15 的 `side: space.sideOf(seat)` 一个字没动；函数签名未变。

## 四、测试（`src/lib/card-layout-pack.test.ts`，10 例 → 12 例）

新增两条 fixture：

1. **`skips a card whose top sits in the gap band instead of tucking in behind it`** — `margin=0, gap=20`，新卡 120×100，列里一张卡在 `y=110`：`110 ≥ 0+100`（旧判定判「在下方」）但 `110 < 0+100+20`（在盲带里）。断言座位 `y === other.y + other.height + gap === 230`，且 `expectSeatClear`、`side === space.sideOf(结果)`。
2. **`counts a card in the column's side gap as occupancy rather than parked clear`** — 横向镜像：卡在 `x=130`，新卡右缘 120、gap 20，无像素重合但净空只有 10。断言它进列、座位落到 `y=120`。

强化了 R16 的三条（都是 `overlaps()` 不带 gap 的旧断言）：

- 抽出 `expectSeatClear(seat, placed, gap)`，对列内每张卡断言**两条**：`overlaps(seat, other)` 为 false（无像素重合）**且** `overlaps(seat, other, gap)` 为 false（净空够 gap）。第二条严格更强，但两条都留着——失败时能一眼看出踩的是哪一种（第二节第三条的红就是这么读出来的）。
- **排列测试**加了一组带 gap 的列（`gap=20`，y = 0/120/240，全排列 6 种，座位恒为 360），原来那组 `gap=0` 的 120 种排列保留。
- **模糊测试**的行距从 `random()*60` 放宽到 `random()*130`：探针卡高 100、gap 10，原来的行距上限 59 < 100，永远够不到盲带 `[100, 110)`，所以旧实现能蒙混过关；放宽后 3600 次抽样里约 7.7% 落进盲带，这条才真的有鉴别力（上面它确实红了）。放宽后最坏列高 `12 + 12×(129+159) = 3468`，座位 `≤ 3578`，画布 `maxY = 3888`，不会被夹底——`expect(space.inside(stacked)).toBe(true)` 仍然成立且仍在测真东西。

`ignores cards parked clear of the margin column`（x=200，远在 gap 之外）原样保留，是防止 filter 谓词被放得过宽的反向护栏。

## 五、验证链（failure → cause → fix → recheck）

1. **failure**：新写的 2 条 fixture + 放宽后的模糊测试，在**未修实现**上 `Tests 3 failed | 9 passed (12)`（原文见第二节）。另跑探针，400 盘里 66 盘出现 sub-gap 卡对。
2. **cause**：命中判定与游标推进对 `gap` 的处理不一致——推进按 `bottom + gap`，判定按裸像素。夹在两者之间的 `[y+h, y+h+gap)` 这条带里的卡被判为「在下方」而跳过，座位因此落得比 `placed.hits(card, space.gap)` 允许的更挤。横轴列筛选是同一个错误的镜像。
3. **fix**：判定两轴都加 `gap`（与 `overlaps(a, b, gap)` 四项比较对齐），列筛选补上右缘项；`clampY`、`sideOf`、排序、签名均不动。
4. **recheck**：同一组命令重跑 —— `card-layout-pack.test.ts` **12/12 绿**；`npx vitest run src/lib/card-layout*` **9 files / 138 tests 全绿**；`npm test` 全量 **210 files / 1824 tests 全绿**（含同轮其他代理的改动）；`npx tsc -b` 退出码 0；`npx eslint` 两个改动文件 0 问题。探针在修复后同样 400 盘：sub-gap 卡对 **98 → 0**。

> 中途 `card-layout-saturation.test.ts` 报过 3 条红（`expected 'right' to be 'left'`）。核对过不是我引起的：那是 R17-fable-arch 的 side 回落改到一半的中间态（`stackAtMargin` 不被 `saturation.ts` 调用，全仓只有 `card-layout-modes.ts:342` 和 `pack.ts` 内部两处调用点）。等对方存盘后重跑即 4/4 绿，全量也绿。

`git status` 确认我的足迹只有 `card-layout-pack.ts` / `card-layout-pack.test.ts`（其余 diff 属同轮其他代理），临时探针已删。行数 pack **389**、pack.test **320**，均 ≤400。

## 六、代价：饱和堆底会更早触发

同一批探针里，**至少一张卡被 `clampY` 夹底**的像素重合卡对从 **3063 → 3238（+5.7%）**；未夹底的像素重合两边都是 **0**。原因和 R16 那次一样：占用面积变大（每张卡多算一圈 gap）→ 列填得更快 → 溢出的卡更早撞上 `clampY`，一起堆在 `y = maxY`。

按简报要求**没有动堆底语义**：那是 docstring 写明允许的饱和情形（`any overlap here means the canvas is saturated`），真正的解法是填满第一列后开第二列，属于「stack at **margin**」的概念级改动（且 `containFree` 现有测试断言 `x === space.margin`），不在本轮范围。

结论仍然是：**有余量时新实现严格更好（sub-gap 98 → 0，像素重合 0 → 0），没余量时两者都难看**。

## 七、交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc -b` / `eslint` 三项已本地全绿）。手工验收：用 `occupiedAreas` 把画布东侧和南侧占满，喂一批锚点在东侧的卡触发 `packSides` 的多轮溢出 → 改动前左边距会出现两张缝隙明显小于 `gap`（12px 设定下只剩几像素）的卡，改动后它们之间恒为整 `gap`。
- **用户可见变化**：只有走 `stackAtMargin` 兜底的卡的 **y 坐标**会变（往下移到留足 gap 的位置）；`x` 恒为 `space.margin`，`side` 仍按座位重算（R15 行为未变）。
- **不是破坏性变更**：`CardPlacement` / `CardLayoutResult` 形状未变，`solved` / `fallback` 判据未变，导出格式与 API 形状未变，函数签名未变。
- **回滚**：`card-layout-pack.ts` 里把命中条件改回 `other.y < y + placement.height && other.y + other.height > y`、列筛选改回 `other.x < space.margin + placement.width`，并删掉新加的 docstring 段落；同时删 `card-layout-pack.test.ts` 的 2 条新例 + `gappedSpace` / `expectSeatClear` 两个辅助函数，把 3 条 R16 用例的断言改回 `for (const other of placed.items) expect(overlaps(stacked, other)).toBe(false);`、模糊测试行距改回 `random() * 60`、排列测试改回单组 `plainSpace`。**实现与测试必须一起回滚**（只回滚实现会留下 3 条红）。
- **风险**：低。只影响兜底路径的 y 坐标；全量 1824 条里没有对兜底布局坐标做快照断言的用例。性能面无变化（还是一次 `filter` + `sort`，列内元素）。

## 八、留给下一轮（未修）

1. **饱和溢出全堆在 `y = maxY`**：见第六节，R16 也记过。要修就是「第一列填满后开第二列」，得连 `containFree` 的 `x === space.margin` 断言与 side 语义一起复核，单开一轮。
2. **`containFree` 的 `CONTAIN_STEP = 12` 栅格与 `gap` 无关**：格距小于 gap 时只是白扫，大于 gap 时可能跳过唯一合法的窄槽而直接掉进 `stackAtMargin`。判定本身是对的（走 `isFree`），属于搜索完备性问题，不是正确性问题。
3. **`shelfLayout` 用 `clampX`/`clampY` 夹完就直接 push，不查 `isFree`**：它在阶梯最底层，设计上就允许重叠，但它和 `stackAtMargin` 现在对「重叠」的口径不一致（一个夹完就交，一个先留足 gap 再夹）。要统一得先决定阶梯末端到底承诺什么。
