MODEL_SLUG: claude-opus-5-thinking-high-fast

# Round 18 — R18-opus-layout: `orderResult` 缺 id 回落落在画布外

## 结果

`orderResult` 对「求解器没给出位置」的卡片回落到 `{ x: 0, y: 0, side: "right" }`。原点在 `margin` 之外（画布内边距内侧才是可用区），`"right"` 是 `packSides` 在卡片还没有位置时盖的占位标签，与座位几何无关——连接线会从背对锚点的一侧出发。

现在缺 id 的卡片坐到边距列顶端（`space.clampX/clampY` 夹取，超大卡片也至少落在 `margin`），`side` 由 `space.sideOf(seat)` 现算，与 `containFree` / `stackAtMargin` / `shelfLayout` 的规则一致。

| 文件 | 变更 |
| --- | --- |
| `src/lib/card-layout-pack.ts` | 新增 `marginSeat` 私有助手；`orderResult` 增加可选 `space?: LayoutSpace`；模块内两处调用点（`sweepPack`、`shelfLayout`）传入 `space`（400 行，未超限） |
| `src/lib/card-layout-pack.test.ts` | 新增 `describe("orderResult")`，6 个用例（394 行） |

## 缺陷定位

```ts
// 修复前
return cards.map((card) => byId.get(card.id)?.shift()
  ?? { ...card, x: 0, y: 0, side: "right" as CardSide });
```

两条性质都不成立：

- `space.inside({ x: 0, y: 0, ... })` 在任何 `margin > 0` 的画布上都是 `false`——同文件其它兜底（`stackAtMargin`、`shelfLayout`、`layoutGrid`）都保证结果留在内边距内。
- `side` 硬编码 `"right"`。`makeSpace()`（900×700 画布、`margin: 20`、地图 `300,220,300,260`）下座位在地图正西，`space.sideOf(seat) === "left"`；把地图换成扁宽的 `100,300,700,100`，同一个左上角座位属于地图的 **top**。硬编码值两种情形都错。

## 修复

```ts
/** Seat for a card no placement came back for; the side follows the seat. */
function marginSeat(card: CardLayoutInput, space: LayoutSpace): CardPlacement {
  const seat = { ...card, x: space.clampX(space.margin, card.width), y: space.clampY(space.margin, card.height) };
  return { ...seat, side: space.sideOf(seat) };
}
```

`space` 做成**可选**参数而不是必填：本轮路径隔离只允许改 `card-layout-pack.ts` 及其测试，而 `card-layout.ts`（3 处）、`card-layout-optimizer.ts`、`card-layout-pinned.ts` 也调用 `orderResult`。必填会让这三个文件编译失败，而它们正被同轮其它代理占用。模块内两个调用点已传 `space`；无 `space` 时保留旧的原点行为并在 doc 注释里写明「有 `space` 就传」。外部三处调用点的收口留给后续轮次（改动只是各加一个已在作用域内的 `space` 实参）。

`stackAtMargin` 的 clamp-to-maxY 饱和堆底未触碰。

## 验证（failure → cause → fix → recheck）

1. **failure**：把回落表达式临时改成 `space && false ? marginSeat(...) : { x: 0, y: 0, side: "right" }`（即旧行为），`npx vitest run src/lib/card-layout-pack.test.ts` → **5 failed | 13 passed**。新用例中 5 个（传 `space` 的）全部失败：`x/y` 收到 `0,0` 而不是 `20,20`，`side` 收到 `"right"` 而不是 `"left"` / `"top"`。第 6 个「无 `space` 时保留原点」用例照常通过，说明旧路径没被误伤。
2. **cause**：回落对象既不参考 `space.margin` 也不参考 `space.sideOf`，见上「缺陷定位」。
3. **fix**：`marginSeat` + 可选 `space` 参数 + 模块内两处调用点传参。
4. **recheck**：
   - `npx vitest run src/lib/card-layout-pack.test.ts` → **18 passed**（原 12 + 新 6）。
   - `npx vitest run src/lib/card-layout` → **9 files / 144 tests passed**（含 `card-layout.test.ts` 门面、optimizer、modes、space、saturation、cache、index）。
   - `npx tsc --noEmit -p tsconfig.app.json` → 干净，确认可选参数没有破坏 `card-layout.ts` / `optimizer` / `pinned` 三个外部调用点。
   - `npx eslint src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts` → 干净。

## 新增用例

| 用例 | 断言 |
| --- | --- |
| 座位在内边距而非原点 | `x === y === space.margin`，`space.inside(dropped)` |
| side 来自座位 | `side === "left"`、`!== "right"`、`=== space.sideOf(dropped)` |
| 扁宽地图 | 同一左上角座位 `side === "top"`，证明不是把 `"right"` 换成硬编码 `"left"` |
| 超大卡片 | 2000×1800 卡片在 900×700 画布上仍夹到 `margin`（`clampX` 的 `max < min` 分支） |
| 只填空缺 | 已有位置原样保留（含 side），重复 id 一一配对，只有第三张走回落 |
| 无 `space` | 保留原点行为，锁住可选签名 |

## 交付与回滚

- **验收方式**：CI（tsc + vitest；本轮 `.github/workflows/ci.yml` 由 R18-gpt-server 追加 eslint）+ 上述本地四项检查。按要求**未 commit / push**，改动留在工作区。
- **破坏性**：无。`orderResult` 新增参数可选，导出形状与既有调用点不变；只有「求解器丢了 id」这一异常路径的坐标与 `side` 变化，正常路径逐字节相同。
- **回滚**：`git checkout -- src/lib/card-layout-pack.ts src/lib/card-layout-pack.test.ts`，或把回落表达式改回 `{ ...card, x: 0, y: 0, side: "right" as CardSide }` 并删去 `marginSeat` 与两处 `space` 实参。
