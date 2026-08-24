# R15-opus-layout — 剩余卡的 `side` 占位符

- **模型**: claude-opus-5-thinking-high-fast
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit / 未 stash / 未建分支 / 未 push）
- **改动文件**: `src/lib/card-layout-pack.ts`、`src/lib/card-layout-modes.ts`（1 处注释）、`src/lib/card-layout-modes.test.ts`、新增 `src/lib/card-layout-pack.test.ts`
- **未碰**: `card-layout-cache.ts`（简报禁止）、`card-layout-optimizer.ts`（不在允许清单）

---

## 一、缺口确认（R14 遗留项 2）

`packSides` 末尾给每张没被任何一栏收下的卡造探针：

```ts
const probe: CardPlacement = { ...card, x: space.margin, y: space.margin, side: "right" };
const placement = saturated ? stackAtMargin(probe, space, placed) : containFree(probe, space, placed);
```

这个 `"right"` 不是分栏结果——卡还没有位置，谈不上属于哪一栏——它只是个占位符。三条出口里只有一条把它换掉了：

| 出口 | 改前 | 是否正确 |
| --- | --- | --- |
| `containFree` 点阵扫描命中 | `side: space.sideOf(probe)` | ✅ 本来就对 |
| `containFree` 早退（探针本身就空闲） | `return placement`，占位符原样带出 | ❌ |
| `stackAtMargin`（扫描落空 / 已置位 `saturated`） | 只改 `x`/`y`，`side` 不动 | ❌ |

`side` 会喂给 `buildConnectorGeometry` 的 `preferredSide`，所以一张坐在左边距、却标着 `right` 的卡，引线会从卡片**右缘**出发再横穿整张地图绕回西边的锚点。

**没有扩大化**：R14 提醒过用 `space.sideOf(p) !== p.side` 全量扫会报出 1500+ 处，绝大多数是设计如此——`side` 表示「归属哪一栏」，`packSideCards` 里 `resolveObstacles` 沿法线推开后几何重心飘进别的象限是正常的。本轮只动上面两条 fallback 出口，`packSideCards` 的栏位语义一个字没改，`classifyQuadrant` / `classifyRadial` / `neighborSide` 也没动。

## 二、修法

`card-layout-pack.ts`，两处：

```ts
// containFree 早退
if (isFree(placement, space, placed)) return { ...placement, side: space.sideOf(placement) };

// stackAtMargin 返回
const seat: CardArea = {
  x: space.margin,
  y: space.clampY(y, placement.height),
  width: placement.width,
  height: placement.height,
};
return { ...placement, x: seat.x, y: seat.y, side: space.sideOf(seat) };
```

`stackAtMargin` 特意用 `seat` 而不是「反正在左边距就叫 left」：地图若是扁宽形（如 `y=300, height=100` 的横条），左边距顶端在几何上属于 `top`，写死 `left` 会引入第二个错误。测试里有这一格。

两个函数的 docstring 各补一句说明「入参 `side` 是占位符，每条出口自行重算」，`packSides` 的探针处补一句同样的注释，免得下一个人以为那个 `"right"` 有含义。

**调用方影响**：`containFree` / `stackAtMargin` 只有三个调用点，全是兜底路径——`packSides` 的剩余卡循环、`sweepPack` 的 leftovers（探针 `side: "left"`，同样是占位符，顺带一并修正）、以及 `card-layout-optimizer.ts:201`。优化器那处本来就写了 `containFree({ ...probe, side: space.sideOf(probe) })` 又在 202 行 `{ ...repaired, side: space.sideOf(repaired) }` 兜了一道——它是在外面手工绕开同一个 bug。现在该绕法成了冗余（结果完全一致），但优化器不在本轮允许清单里，没动。

## 三、测试

新增 `src/lib/card-layout-pack.test.ts`（7 例）：

- `containFree` 早退路径：探针落在地图以西的空位 → `side` 从 `right` 变 `left`；
- `containFree` 扫描路径：探针压在地图上被挪走 → `side === space.sideOf(结果)`（回归护栏，这条改前也过）；
- `containFree` 落空路径：整块画布被 `occupiedAreas` 罩死 → 穿到 `stackAtMargin`，`side` 仍重算；
- `stackAtMargin` 单卡 → `left`；
- `stackAtMargin` 扁宽地图 → `top`（证明读的是 `sideOf` 不是写死 `left`）；
- `stackAtMargin` 连堆 4 张 → 每张的 `side` 都等于自己座位的 `sideOf`。

`card-layout-modes.test.ts` 加 2 例（端到端走 `packSides`）：

- **单卡走 `containFree`**：东墙 `{600,20,280,660}` + 底墙 `{20,480,580,200}` 挡死。锚点在东侧的卡被分到 `right`，四轮溢出在 right ↔ bottom 之间来回（`neighborSide` 这两侧互为邻边）全部被拒，落进剩余卡循环；探针 `(20,20)` 本身空闲 → 命中早退路径。断言 `x < map.x` 且 `side === "left"`。
- **三卡走 `stackAtMargin`**：整块画布 `occupiedAreas` 罩死 → 第一张扫描落空堆到边距、置位 `saturated`，后两张直接堆叠。断言三张的 `side` 都等于 `space.sideOf` 且都不是 `"right"`。

## 四、验证链（failure → cause → fix → recheck）

1. **failure**：新写的 7 条断言在原实现下红——`expected 'right' to be 'left'` ×6、`expected 'right' to be 'top'` ×1（我把两处实现临时改回旧版跑了一遍确认，不是纸面推演）；`containFree` 扫描路径那条绿，与「只有两条出口漏修」的判断吻合。
2. **cause**：`containFree` 的 `return placement` 与 `stackAtMargin` 的 `{ ...placement, x, y }` 都保留了调用方传进来的占位 `side`，而该占位值在剩余卡场景下从未被赋过真实含义。
3. **fix**：两处出口在返回前用 `space.sideOf` 按实际座位重算。
4. **recheck**：恢复实现后同一组命令重跑 —— `card-layout-pack.test.ts` + `card-layout-modes.test.ts` **19/19 绿**；七个布局套件（`card-layout{,-modes,-pack,-space,-index,-cache,-worker-protocol}`）**125/125 绿**；`npx vitest run` 全量 **206 files / 1795 tests 全绿**（含同轮其他代理改动，无 unhandled error）；`npx tsc -p tsconfig.app.json --noEmit` 0 错；`npx eslint` 四个文件 0 问题。
5. `git status` 确认我只碰了 `card-layout-pack.ts` / `card-layout-modes.ts` / 两个测试文件（其余 diff 属同轮其他代理），无临时探针残留。行数：pack 370、modes 348、pack.test 160、modes.test 277，全部 ≤400。

## 五、交付与回滚

- **验收方式**：PR + CI（`npm test` / `tsc` / `eslint`，上面四项已本地全绿）。手工验收：把画布东侧和南侧用 `occupiedAreas` 占满、再放一张锚点在东侧的卡 → 卡会被挤到左边距；改动前它的引线从卡片右缘出发向西横穿地图，改动后从左缘出发。
- **用户可见变化**：只有走兜底路径的卡的引线出边会变，坐标一个像素没动。
- **不是破坏性变更**：`CardPlacement` / `CardLayoutResult` 形状未变，`solved` / `fallback` 判据未变，导出格式与 API 形状未变。`side` 的取值域仍是同一个 `CardSide`。
- **回滚**：`containFree` 早退改回 `return placement;`、`stackAtMargin` 改回 `return { ...placement, x: space.margin, y: space.clampY(y, placement.height) };`，并删除 `src/lib/card-layout-pack.test.ts` + `card-layout-modes.test.ts` 里那两条新用例（否则 9 条断言会红）。实现与测试必须一起回滚。
- **风险**：低。只影响 fallback 出口的一个枚举字段；若有人对兜底布局的 `side` 做过快照断言会受影响，全量 1795 条里没有这类断言。

## 六、顺带留给下一轮（未修）

R14 记的 `stackAtMargin` 单趟扫描漏卡问题**依然存在**：它对 `placed.items` 只按插入顺序扫一趟，一张一开始在 `y` 下方被跳过的卡，在后续卡把 `y` 推下来之后不会被重看，能造出逐像素重合的两张卡（与它自己 docstring 里「nothing fully coincides」的承诺相悖）。本轮改的是 `side` 字段，没动 `y` 的求解逻辑，触发条件仍是饱和画布。修法很小（先按 `y` 排序，或循环到稳定），但属于坐标行为变更，超出本轮「重算 side」的范围。
