MODEL_SLUG: claude-opus-5-thinking-high-fast

# R20-opus-layout — `layoutGrid` 用 `sideOf` 定边

分支 `cursor/agent-sota-polish-cbcd`。**未 commit / 未 stash / 未 push**，改动留在工作区。

## 缺口

`src/lib/card-layout-pack.ts` 的 `layoutGrid` 自己判定 `side`：

```ts
const side: CardSide = x + card.width / 2 >= space.map.x + space.map.width / 2 ? "right" : "left";
const candidate = { ...card, x: clampX(x), y: clampY(y), side };
```

两个问题：

1. 三元式只可能返回 `"left"` / `"right"`，**永远**标不出 `"top"` / `"bottom"`。宽浅地图（例如 `x:100 y:300 w:700 h:100`）上，整个上边距行其实贴的是地图的**上**沿，却按水平中线被劈成左右两半，引线从卡片背对锚点的那条边出去。
2. 判定用的是 clamp **前**的格子坐标；最后一行/最后一列被 `clampX` / `clampY` 拉回画布内时，`side` 说的还是原来那格。

同一函数里的兜底分支 `{ ...card, x: space.margin, y: space.margin, side: "left" }` 是同一个 bug 的第二处：硬写 `"left"`，宽浅地图上同样错。

## 改动

`src/lib/card-layout-pack.ts`（只动 `layoutGrid` + 一行 import）：

- 候选格先 clamp 成 `seat`，再 `side: space.sideOf(seat)`，与 `containFree` / `stackAtMargin` / `shelfLayout` / `repackAll` 的做法一致。
- 兜底分支改用本文件已有的 `marginSeat(card, space)`（`orderResult` 掉卡时走的同一个座位），side 同样由座位几何决定，顺带把超大卡片也 clamp 进画布。
- 删掉因此不再使用的 `type CardSide` import。

`sideOf` → `sideForPlacement` 比较的是卡片中心相对地图中心的**归一化**水平/垂直偏移，取较大的那一维，所以宽浅地图上 |vertical| 压过 |horizontal|，自然得到 `top` / `bottom`。

未触碰 `stackAtMargin` 的 clamp 堆底行为（`git diff` 中该函数零改动）。`card-layout-pack.ts` 从 399 行变为 **400 行**（约束 ≤400）。

## 测试

`src/lib/card-layout-pack.test.ts` 新增 `describe("layoutGrid")`，4 条：

1. 宽浅地图上边距行的 6 个格子全部 `side === "top"`（旧逻辑给出 3 个 left + 3 个 right），且 `=== space.sideOf(placement)`。
2. 同一张图下方那一行全部 `"bottom"`。
3. 高地图（默认 `300,220,300×260`）快乐路径：18 张卡每张 `side === space.sideOf(placement)`，且左右两侧仍分别出现 `"left"` 与 `"right"`。
4. 整块画布被占满 → 走兜底 `marginSeat`，座位在 `(margin, margin)` 且 side 为 `"top"` 而非硬写的 `"left"`。

未改 `card-layout.test.ts`（grid 模式在那边已有硬约束覆盖，本轮不需要额外补）。

## 验证证据链（failure → cause → fix → recheck）

本轮没有既有检查失败，所以证据链走的是「先造出失败」这一向：

1. **failure（构造）**：先把 4 条新测试写在**未修改**的 `layoutGrid` 上。临时还原旧的中线三元式后 `npx vitest run src/lib/card-layout-pack.test.ts` → `3 failed | 18 passed`；再把兜底分支也还原成硬写 `"left"` → `4 failed | 17 passed`。即 4 条测试逐条锁住旧行为，不是空跑。
2. **cause**：`side` 由 clamp 前坐标与一条只分左右的水平中线得出，而不是由卡片最终占据的矩形与 `sideForPlacement` 的双轴比较得出。
3. **fix**：候选与兜底两处都改为由座位几何决定 side（`space.sideOf(seat)` / `marginSeat`）。
4. **recheck**：还原修复后重跑同一命令 → `21 passed`。

完整命令与结果：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run src/lib/card-layout-pack.test.ts` | 21 passed |
| `npx vitest run` 覆盖 pack + card-layout-{,modes,space,saturation,optimizer,cache} 共 7 个文件 | 7 files / **124 passed** |
| `npx vitest run` 覆盖 grid 模式下游（`useCardLayoutWorker`、`CardsInspector`、`scene-document-modules`） | 3 files / 31 passed |
| `npx tsc --noEmit -p tsconfig.app.json` | 通过（`tsconfig.json` 只是 references 壳） |
| `npx eslint src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts` | 0 problems |
| `wc -l src/lib/card-layout-pack.ts` | 400 |

## 交付与回滚

- **验收方式**：`npx vitest run src/lib/card-layout-pack.test.ts src/lib/card-layout.test.ts`；人工验收可在 grid 模式下用一张宽浅地图看上/下边距卡片的引线出边。
- **破坏性面**：`CardPlacement.side` 是导出数据的一部分。grid 模式下同一批卡片现在可能返回 `"top"` / `"bottom"`，坐标 `x` / `y` 完全不变——只有引线出边方向变了，而 `"top"` / `"bottom"` 本就是 `CardSide` 的合法取值，其余四种布局模式一直在产出它们，所以下游无需适配。
- **回滚**：改动集中在 `layoutGrid` 一处，`git checkout -- src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts` 即可整体退回；若只想退行为不退测试，把 `side: space.sideOf(seat)` 换回中线三元式、兜底换回硬写 `"left"`，并恢复 `type CardSide` import。
