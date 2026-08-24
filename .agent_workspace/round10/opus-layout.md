# Round 10 — R10-opus-layout：同层叠卡不报 + 手工卡片对求解器不可见

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

修了两个各自独立的洞，都是 Round 9 报告里自己记下来「本轮改不到」的那两条：

| 文件 | 变更 |
| --- | --- |
| `src/lib/layout-health.ts` | 同 z 且**两侧都是 `card`** 时不再 `continue`；相等 z 用输入序（即绘制序）判定前后（263 行） |
| `src/lib/layout-health.test.ts` | +2 用例：同层两张卡报 occlusion；同层文本/素材仍不报 |
| `src/lib/card-layout-types.ts` | `CardLayoutOptions.fixedPositions?: Record<string, CardPoint>` |
| `src/lib/card-layout-pinned.ts` | 新建（101 行）：把手工卡片拆出求解集合、其矩形并入 `occupiedAreas`、解完按输入序织回 |
| `src/lib/card-layout.ts` | `solveCardLayout` 接线（361 行）；两个 back-compat 别名一并透传 `fixedPositions` |
| `src/lib/card-layout.test.ts` | 新增 `describe("hand-placed cards")`，9 个用例 |

---

## 缺陷一：同层重叠不报

`checkLayoutHealth` 遇到 `leftZ === rightZ` 直接 `continue`，而 `listContentLayoutIssues` 给**每一张**卡片同一个 `project.cards.zIndex`。两张卡叠在一起——手工排版最常见的翻车方式——一条都不报。

放开条件收窄到「两边 kind 都是 `card`」，理由是调用方对不同 kind 的高度可信度不一样：卡片高度来自 `cards.positions` 里真实存在的展示框，而文本/素材的 bounds 是估算的，同层互压又往往是有意的（标题压底纹）。全放开会在正常版式上刷假阳性，把真正的叠卡淹掉。不同 z 的判定一行未改。

相等 z 时前后由绘制序决定，就是 `input.objects` 的顺序，所以 `leftZ < rightZ` 改成 `leftZ <= rightZ`——`back:front` 这个 id 格式和既有用例都不变。

**诚实的边界（重要）**：调用方 `listContentLayoutIssues` 仍把每张卡的高度写成常量 `180`。放开检测之后，两张真实高度小于 180 的手工卡片，只要竖直间距落在 (真实高度, 180) 之间就会**误报**。这不是新引入的近似，但确实是这次才变得可见。两点缓冲：

1. 只有出现在 `cards.positions` 里的卡片才会被拆成独立对象，自动排版路径合并成单个 `"cards"` 对象，永远凑不出同层卡片对——所以误报面只覆盖用户手工拖过的卡。
2. 真解法是让输入构造喂真实高度，那是本轮 R10-fable-arch 的 `studio-editor-helpers.ts` / `content-layout-objects.ts`，我不能碰。

连接线那条按简报要求没动：`layout-health.test.ts` 里直接传 `connectors` 的用例保持绿。

---

## 缺陷二：手工拖拽的卡片对求解器不可见

`poster-card-placement.ts` 的顺序是「先 `solveCardLayout` 排全部卡片，再用 `project.cards.positions` 覆盖被拖过的那几张的坐标」。求解器从头到尾不知道手工位置存在，于是：

- 被拖走的卡在自动位置上**留了一块没人用的空地**；
- 它真正落脚的地方**没有任何卡片避让**，下一次求解可以直接压上去。

修法是把手工卡片整个移出求解集合，把它们的矩形并进 `occupiedAreas`，让剩下的卡按同一套 `gap` 规则绕开，解完再按输入序织回去。坐标**原样保留、不做 clamp**——渲染层无论如何都画在保存的坐标上，求解器偷偷挪一下只会让障碍物和画面对不上。

`protectedZones(normalized)` 先算再拼，避免「显式给出 `occupiedAreas`」这个动作本身把地图框兜底吃掉：

```ts
bounds: { ...normalized, occupiedAreas: [...protectedZones(normalized), ...reserved] }
```

一张都没钉住时 `planPinnedCards` 返回 `null`，原路径连 `bounds` 对象都不换，输出逐字节不变。

### 影响量化（800 盘）

400 组种子 × `quadrant`/`radial`，每盘 4–13 张卡、900×700 画布、300×260 障碍，每盘随机拖 1–2 张卡（落点先过 `clampCardPosition`，模拟真实拖拽）。「修复前」= 今天的生产路径：求解全部卡片，再用手工坐标覆盖。

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 有自动卡压在手工卡上的盘 | **510 / 800（63.8%）** | 0 |
| 压卡对数 | 791 | 0 |
| 被压住的手工卡张数 | 630 | 0 |
| `fallback` 盘数 | 0 | 0 |
| 自动卡锚点距离总和 | 539 385 | 523 768（−2.9%） |
| 单盘锚点距离改善 / 恶化 | — | 421 盘改善，307 盘恶化，72 盘持平 |
| 位置发生变化的自动卡 | — | 3 421 / 5 635（60.7%） |

63.8% 这个数字大到需要解释：随机落点比真人落点更容易撞车，真人一般会往空处拖。所以它是**上界**，不是线上发生率。真正硬的结论是右列的三个 0——压卡从「概率事件」变成「不可能事件」，因为手工矩形现在是 `LayoutSpace` 的一等障碍，和省份 AABB 走同一条 `firstBlocker` 路径，`validateHard` 也认。

锚点距离那 −2.9% **不要当成排版收益**：改善 421 盘、恶化 307 盘，接近对半。机制上说得通（手工卡不再白占一个近锚点的槽位，那个槽位让给了别人；同时它的新落点又挡住了一片），但方向不稳定，属于确定性搜索的结构性噪声。这次修的是正确性，不是美观度。

---

## 交付边界（没接线的部分，说清楚）

库这一层修完了，**生产路径还没有调用方传 `fixedPositions`**，因为接线点在我不能改的文件里。要真正落到用户画布上还差两处，各一行：

1. `src/components/canvas/poster-card-placement.ts`（本轮无人认领）：`options` 里加 `fixedPositions: project.cards.positions`，`useMemo` 依赖数组加 `project.cards.positions`。
2. `src/lib/card-layout-cache.ts`（R10-gpt-perf 所有）：`createCardLayoutCacheKey` 必须把 `fixedPositions` 纳入 key。**不加会出真 bug**——拖动卡片后 bounds/cards/其他 options 全都没变，缓存会返回拖动前的版式。这一条我在 `CardLayoutOptions.fixedPositions` 的注释里写死了。

worker 路径不用改：`isCardLayoutWorkerMessage` 对 `options` 只做 `isRecord` 校验，`fixedPositions` 是纯对象，结构化克隆原样过去。

---

## 验证（failure → cause → fix → recheck）

**缺陷一**

1. **failure**：两张同 z 的卡片完全重叠，`checkLayoutHealth` 返回空。
2. **cause**：`leftZ === rightZ` 无条件 `continue`；`listContentLayoutIssues` 给所有卡片同一个 `cards.zIndex`，所以卡片对永远相等。
3. **fix**：相等 z 时只放行 `card`×`card`，前后按输入序判定。
4. **recheck**：`npx vitest run src/lib/layout-health.test.ts` → 7 passed（原 5 + 新 2）。下游消费方 `studio-editor-helpers` / `stage-overview` / `resource-health` / `StudioAssistantRail` / `StudioAssistantDrawer.integration` / `studio-journey` / `App.cards` → 全绿，没有既有用例因为放开检测而翻车。

**缺陷二**

1. **failure**：800 盘扫描，510 盘出现自动卡压在手工坐标上。
2. **cause**：`solveCardLayout` 收不到 `cards.positions`，手工卡片既按自动位置占位、又在真实落点上不占位。
3. **fix**：`card-layout-pinned.ts` 拆分 + 障碍化 + 织回；`solveCardLayout` 三行接线。
4. **recheck**：
   - `npx vitest run src/lib/card-layout.test.ts` → 70 passed（+9）。
   - **反向验证**：把 `planPinnedCards(inputs, bounds, options.fixedPositions)` 改成传 `undefined`（即回退到修复前语义），同一 describe → **7 failed / 2 passed**（通过的是「无钉住时输出不变」和一个 `grid` 盘，后者本来就不会撞）。用例确实咬住缺陷，不是摆设。
   - 相邻面：`card-layout-modes` / `card-layout-space` / `card-layout-index` / `card-layout-cache` / `destination-layout` / `card-layout-worker-protocol` / `workers` → 9 files / 137 tests passed。

**全局**

- `npx vitest run` 全量 → **199 files / 1673 tests，1 failed**。唯一失败是 `src/lib/import-headers.test.ts > only falls back to a column repeating the same header`，属于 R10-opus-data 本轮正在改的 `import-headers.ts`（`git diff --stat` 可见其未完成改动），与本次改动无交集。
- `npx tsc --noEmit -p tsconfig.app.json` → 我的文件 0 error；剩余报错在 `DeliveryWorkspace.tsx`（R10-fable-sota 在途）与此前一次跑到的 `GlobalDataScreen.tsx`（R10-opus-data 在途），均为 TS6133 未使用声明。
- `npx eslint` 六个改动文件 → 0 问题。
- 无侥幸重跑：唯一一次「先绿后改」是新用例最初把钉住点写成固定坐标 `(1180, 430)`，跑出来是绿的但**不成立**——那个位置无人竞争，等于没测。改成从「不感知钉住的解」里取另一张卡的落点当钉住点（`contestedSpot`），必然有竞争，反向验证才开始失败。

## 回滚

- 缺陷一：`leftZ === rightZ && !sameLayerOcclusionMatters(...)` 改回 `leftZ === rightZ`，删掉那个函数即可。无数据、无导出格式影响。
- 缺陷二：`fixedPositions` 是**纯新增可选字段**，不传时代码路径与返回值逐字节不变（用例 `leaves the solve untouched when no card is pinned` 就是钉这一点）。回滚只需删掉 `card-layout-pinned.ts` 与 `solveCardLayout` 里那三行。工程 schema、导出格式、worker 协议一律未动。
- 验收方式：PR + CI（上述四项检查）。生产可见性需等上面两处接线，接线前本轮改动对用户画布**无行为变化**——这一点请勿在发布说明里当成已交付功能。
