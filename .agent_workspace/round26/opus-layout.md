# R26 opus-layout — packSides 归一到 `orderResult`

MODEL_SLUG: claude-opus-5-thinking-high-fast

## 结论

`packSides` 是最后一个没有走 canonical 出口的布局模式：`sweepPack`、`layoutGrid`、`shelfLayout`、`repackAll` 都以
`orderResult(cards, placements, space)` 收尾，只有它 `return placed.items`，把**打包顺序**当成结果顺序交给调用方。
现在它也走 `orderResult`，并且新增的测试证明这一步是必需的，而不是形式上的对齐。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/lib/card-layout-modes.ts` | import 增加 `orderResult`；`packSides` 结尾 `return placed.items` → `return orderResult(cards, placed.items, space)` |
| `src/lib/card-layout-modes.test.ts` | import 增加 `validateHard`；新增 `packSides` 顺序契约测试 |

未触碰 `card-layout-pack.ts`（工作区里它的 `M` 状态来自本轮其它 agent，不是本次改动，`git diff` 已核对）；
未改 `stackAtMargin` 的 clamp / 第二列行为；未改 optimizer `repairPlacement` 的 `side: "right"` 种子。

`src/lib/card-layout-modes.ts` 行数 **352**（≤400，原 349，+3 为三行注释）。

## 为什么 `[...placed.items]` 不够

`placed.items` 的顺序由两层重排叠加而成，两层都不是入参顺序：

1. **边的打包顺序**：`SIDE_PACK_ORDER = ["right", "left", "top", "bottom"]`，右列整体排在左列前面。
2. **边内的主轴顺序**：`packSideCards` 对 `cards` 按 `primaryKey` 排序（左/右列按 `anchorY`），
   所以左列的输出是 c3, c2, c0, c1，而 assignment 顺序是 c0, c1, c2, c3。

用现成的 `leftColumnBoard`（输入 c0…c6）在宽松画布上跑，`placed.items` 出来是
`["c4","c5","c6","c3","c2","c0","c1"]`。这不是"偶尔不一致"，是**必然**不一致。

现有 `packSides` 测试全部按 id 查（`new Map(placements.map(p => [p.id, p]))`），所以它们对顺序不敏感，
改完照常通过——这正说明旧测试覆盖不到这条契约，需要新测试兜住。

## 新增测试

`packSides > hands back the caller's order even though sides pack on their own axis`

- `expect(placements.map(p => p.id)).toEqual(leftColumnBoard.map(c => c.id))` —— 顺序契约本体。
- `expect(validateHard(placements, space)).toBe(true)` —— 重排没有动几何，仍是合法棋盘（在界内、不压障碍、互不重叠）。
- 逐位校验 `width`/`height` 与同下标入参一致 —— 保证是"按下标对齐"，不只是集合相等。
- 边标签仍在原卡上：c0–c3 = `left`，c4–c6 = `right`。

**负向验证（测试确实吃劲）**：把返回值临时改回 `[...placed.items]`，该测试立即失败，diff 就是上面那条
`["c4","c5","c6","c3","c2","c0","c1"]` vs `["c0"…"c6"]`。也就是说 `orderResult` 是必需的，
浅拷贝 `placed.items` 通不过——按任务要求在此明确记录。

## 验证链（failure → cause → fix → recheck）

第一版测试里我多写了一条 `expect(placement.side).toBe(space.sideOf(placement))`，它挂了。

1. **failure**：`AssertionError: expected 'left' to be 'bottom'`，位置 `card-layout-modes.test.ts:228`。
2. **cause**：这是我断言写过头了，跟本次改动无关。侧边打包出来的卡片刻意保留**分配到的边**（`side: "left"`），
   而 `space.sideOf` 是纯几何反推——左列最下面那张卡的盒子越过了 map 下边缘，几何上读作 `"bottom"`。
   仓库里既有的 `side === space.sideOf(...)` 断言只出现在 leftover / 兜底座位那几条用例上
   （`containFree` / `stackAtMargin` 两条路径本来就"由落点反推边"），从不施加于正常侧边打包结果。
3. **fix**：删掉这条越界断言，改为断言**分配边标签未被重排打乱**（c0–c3 仍 `left`，c4–c6 仍 `right`），
   几何合法性交给 `validateHard`。
4. **recheck**：重跑同一条命令，48/48 通过。

## 跑过的检查

| 命令 | 结果 |
| --- | --- |
| `npx vitest run src/lib/card-layout-modes.test.ts src/lib/card-layout-pack.test.ts` | 2 files / **48 passed** |
| `npm test`（全量 Vitest，经 `scripts/run-heavy.mjs`） | 221 files / **1957 passed**，81.6s |
| `npx eslint src/lib/card-layout-modes.ts src/lib/card-layout-modes.test.ts` | 无输出 |
| `npx tsc --noEmit` | 无输出 |
| `wc -l src/lib/card-layout-modes.ts` | 352 |

全量套件是关键一环：`packSides` 由 `card-layout.ts` 的求解器调用，下游还有 optimizer 与若干组件级用例。
1957 条全绿说明没有任何调用方依赖旧的打包顺序。

## 交付与回滚

- **验收方式**：CI 上跑 `npm run lint` + `npm test`；上面四项本地已过。
- **行为变化**：`packSides` 返回数组的**顺序**变了（打包顺序 → 入参顺序）。集合、几何、`side` 标签均不变，
  按 id 查询的调用方完全无感。这不是导出格式或 API 形状的破坏性变更。
- **回滚方案**：单点回退——把 `card-layout-modes.ts` 结尾改回 `return placed.items;` 并删除 import 里的
  `orderResult`，同时删掉新增测试。改动只有 2 个文件、7 行（含 3 行注释），无数据迁移、无持久化格式牵连。
