# Round 9 — R9-opus-layout: 侧边溢出记账错位（幽灵卡片）

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结果

`packSides` 把「被拒绝的卡片」按**下标**回查 `assignment.cards`，但 `placeSide` 是按侧边轴排序后打包的，两个数组顺序不同。于是溢出到邻边的往往不是真正放不下的那张卡，而是同下标的另一张——一张**已经放好**的卡被再打包一次，画布上多出一个占位的幽灵矩形；真正放不下的那张则从未走邻边重排，落进末尾的 `containFree` 兜底。

| 文件 | 变更 |
| --- | --- |
| `src/lib/card-layout-modes.ts` | `placeSide` → `packSideCards`，返回 `{ card, placement }` 配对；`packSides` 按配对取被拒卡片（336 行） |
| `src/lib/card-layout-modes.test.ts` | 新增（114 行，6 个用例） |

## 缺陷定位

```ts
// 修复前：packed 按 primaryKey 排序，assignment.cards 是分类时的输入顺序
const packed = placeSide(assignment, space, placed);
for (let index = 0; index < packed.length; index += 1) {
  const placement = packed[index]!;
  ...
  else { blockBroken = true; rejected.push(assignment.cards[index]!); }  // ← 错位
}
```

`placeSide` 内部 `const sorted = [...cards].sort((a, b) => primaryKey(a, side) - primaryKey(b, side))` 后 `sorted.map(...)`，返回值是**轴序**；`assignment.cards` 是 `classifyQuadrant` / `classifyRadial` 推入时的**输入序**。两者只在偶然情况下一致。

固定复现（`crowdedLeftColumn`，900×700 画布、300×260 障碍、7 张卡）：left 侧分类顺序 `c0,c1,c2,c3`，轴序 `c3,c2,c0,c1`。左列装得下 `c3,c2,c0`，在 `c1` 处断块，于是：

| | 溢出到 top 的卡 | 结果 |
| --- | --- | --- |
| 修复前 | `assignment.cards[3]` = **c3**（已放好） | c3 被放两次（`110,116` 与 `361,35`），c1 走 `containFree` 落到 `536,500` |
| 修复后 | 断块处的 **c1** | 7 张卡各一个位置，c1 落在邻边 top |

后果不是「卡片丢失」——末尾兜底循环保证每个 id 都有位置——而是：幽灵矩形在打包过程中真实占位，把后续卡片推离锚点；被拒卡片拿不到邻边重排，只能拿兜底扫描出来的位置。`orderResult` 按 id 取首个占位，所以重复项在门面层被吞掉，缺陷一直没有暴露成崩溃。

## 影响量化

随机盘 400 组种子 × 2 模式 = 800 盘（4–13 张卡，900×700 画布，300×260 障碍），对比 `packSides` 修复前后：

| 指标 | 修复前 | 修复后 |
| --- | --- | --- |
| 重复占位数 / 出现重复的盘数 | 102 / 95（11.9%） | 0 / 0 |
| 侧边打包结果直接通过 `validateHard` | 340 | 347 |
| 相互重叠的卡片对 | 3369 | 3325 |
| 锚点距离总和 | 1 867 008 | 1 850 674（−0.9%） |
| 单盘距离改善 / 恶化 | — | 99 盘改善，41 盘恶化 |

多出的 7 盘直接采纳侧边打包结果，意味着它们不再掉进 `repackAll` / `sweepPack` 修复梯：修复梯不认侧边语义，出来的版式更像密排而不像「卡片贴着自己那一侧」。

**诚实的边界**：在 `solveCardLayout` 门面上，同样 400 盘的 `fallback` 计数两边都是 108，锚点距离 791 833 → 792 502（+0.08%）。连接线搜索与修复梯把种子层面的差异基本吸收掉了，所以这次修的是**正确性与种子质量**，不是能在门面指标上看见的排版跃升；那 0.08% 属于确定性搜索的结构性噪声（幽灵矩形偶尔碰巧当了隔离带），没有机制上的收益可言。

## 修复方式

不改「断块后整侧顺延拒绝」的语义（那是有意的：一侧要保持连续块），只把「打包结果 → 输入卡片」的映射从下标改成显式配对：

```ts
export interface SidePlacement { card: CardLayoutInput; placement: CardPlacement; }
export function packSideCards(...): SidePlacement[]
```

没有用 `Map<id, card>` 回查，因为输入允许重复 id（`sanitizeCards` 不去重，`orderResult` 按桶 `shift()` 容忍重复），按 id 归并会把两张同 id 的卡塌成一张。配对由打包函数自己产出，天然不会漂移。

原 `placeSide` 变成一行包装后已无任何调用方（全仓 `rg` 只剩定义本身），故一并删除，避免留一个「按下标用就出错」的导出继续诱导调用方。

## 验证（failure → cause → fix → recheck）

1. **failure**：随机盘扫描 800 盘，95 盘的 `packSides` 输出里出现重复 id。
2. **cause**：`placeSide` 返回轴序、`assignment.cards` 是输入序，`rejected.push(assignment.cards[index])` 跨序取值。
3. **fix**：`packSideCards` 返回 `{ card, placement }` 配对，`packSides` 改为解构取 `card`。
4. **recheck**：
   - `npx vitest run src/lib/card-layout-modes.test.ts` → 6 passed；**回退修复后同一文件 3 failed**（重复占位、溢出对象、随机盘去重三条），确认用例真的咬住缺陷。
   - 相关面：`npx vitest run` card-layout / destination-layout / card-layout-space / card-layout-index / card-layout-cache / worker-protocol / worker / layout-health / studio-journey → **10 files / 127 tests passed**。
   - 全量 `npm test` → **191 files / 1677 tests passed**（Round 7 记录为 184/1600；本轮新增 1 文件 6 用例）。
   - `npx tsc --noEmit -p tsconfig.app.json` → 0 error；`npx eslint` 两个改动文件 → 0 问题。
   - 无侥幸重跑：唯一一次「预期外」是最小复现盘（3 张卡）没能触发重复——因为幽灵卡的第二次打包正好被 `placed.hits` 挡回。改用扫描器吐出的真实 7 卡盘后稳定复现，用例即以该盘为准。

## 交付方式与回滚

- 验收：PR + CI（上述四项检查）。
- **非破坏性**：`packSides` 的签名与返回类型不变，`card-layout.ts` 一行不改；导出格式、工程 schema、worker 协议均无变化。唯一的公开面变化是内部模块 `card-layout-modes.ts` 删掉了零调用方的 `placeSide`，新增 `packSideCards` / `SidePlacement`。
- 回滚：把 `packSides` 里的解构改回 `assignment.cards[index]`、`packSideCards` 改回只返回 `placement`（或直接还原本文件与其测试）即可，无数据迁移、无存量工程受影响。

## 与本轮其他方向的边界

- 没有碰 `print-preflight.ts` / `resource-health.ts`（Round 8 的地盘，且本轮 FORBIDDEN），也没有再动 `object-in-bleed`：`listContentLayoutIssues` 已经把 `printBleedMm` 透传给 `checkLayoutHealth`，那条链是通的。

## 记录：查到但本轮没修的洞（都在 ALLOWED 之外或需跨文件接线）

1. **手工拖拽位置对求解器不可见**。`poster-card-placement.ts` 在 `solveCardLayout` **之后**才用 `project.cards.positions` 覆盖坐标，求解器仍按自动位置占位。于是被拖走的卡留下一块「预留但没人用」的空地，而它的新落点没有被任何自动卡片避让，可以直接压上去。要修得给 `CardLayoutBounds` 加「已钉住的矩形」概念并在 `poster-card-placement.ts` 接线（本轮不可改）。
2. **`checkLayoutHealth` 的连接线检查在生产里走不到**。两个调用方（`listContentLayoutIssues`、`agent-session-tools.healthInput`）都不传 `connectors`。而且 `layout-health.ts` 自带一份 `segmentsIntersect`，缺 `connector-geometry.ts` 里那条「共锚点花束不算交叉」的豁免——一旦接上连接线，同省多卡会条条报冲突。修之前要先决定连接线由谁喂给体检。
3. **同层重叠不报**。`checkLayoutHealth` 在 `zIndex` 相等时直接 `continue`，而 `listContentLayoutIssues` 给所有卡片同一个 `cards.zIndex`、所有文本同一个 40，所以「两张卡叠在一起」这个最常见的手工翻车场景一条都不报。但不能只改 `layout-health.ts` 就放开：该调用方用 `height: 180` 近似所有卡片高度（真实高度随行数变化），放开同层检测会在正常版式上刷出大量假阳性。要修得先让调用方喂真实卡片高度（`studio-editor-helpers.ts`，本轮不可改）。
