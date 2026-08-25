# Cycle 2 Round 2 — opus-fast-A

**模型未降级。** slug：`claude-opus-5-thinking-high-fast`。分支 `cursor/canvas-render-display-46a1`，未 commit。

## 1. C2-2：行类型下沉到 lib

`CardDisplayRow` / `PreparedCardRow` 从 `components/canvas/DestinationCard.tsx` 移入 `lib/prepared-card-content.ts`
（构造这两个形状的模块），`prepared-card-content.ts` 不再 `import ... from "../components/..."`，lib→component 反向依赖消失。

`DestinationCard.tsx` 保留 `export type { CardDisplayRow, PreparedCardRow } from "../../lib/prepared-card-content"`，
`ReferenceCardVisual.tsx` 及既有测试的导入点不变（这两个文件不在本轮 ALLOWED 内）。

并行 agent 新增的 `src/lib/prepared-card-content.types.cycle2.test.ts`（断言 lib 不 import components）在本轮改动后通过。

## 2. C2-3：全冻结时跳过 solveCardLayout

**为什么安全。** `destinationCards` 早已把 solver 的 x/y 用 `project.cards.positions[id]` 整个覆盖掉；
solver 结果里唯一还被读的是 `placement.side`，而 `side` 只在 `resolveConnectorPort` 的退化分支
（anchor 恰好落在卡片中心、方向向量为零）里才会被用到——正常卡片的连接线端口完全由
anchor→卡片中心的方向决定。所以「每张卡都有存储位置」时，求解器的输出对渲染是纯开销。

**实现**（`PosterCanvas.tsx`）：

- 新增 `frozenPlacements` memo：`preparedCards` 里每张卡都能在 `project.cards.positions` 命中才返回
  `CardPlacement[]`，缺一张即返回 `null`（部分冻结仍走原求解路径）。
- `layoutRequest` 在 `frozenPlacements` 存在时返回 `null` → `useCardLayoutWorker` 不建 cache key、
  不 postMessage、不 solve。
- `destinationCards` 的 placement 源改为 `frozenPlacements ?? layoutState.result?.placements`。
- `side` 由 `frozenCardSide(box, mapContentBounds)` 给出，规则与 solver 内部 `sideForPlacement` 一致
  （卡片中心相对地图中心的主轴方向）。`card-layout.ts` 本轮禁改，故未导出复用，helper 留在 PosterCanvas 内。

**没有做 clamp，理由记录如下。** 任务描述里的「stored positions + clamp」被刻意省掉：

1. 现路径（`{ ...placement, x: manual.x, y: manual.y }`）本来就不 clamp 手动位置，只在拖拽落点时
   由 `DestinationCardsLayer` 调 `clampDestinationCardPosition` clamp 一次。冻结路径加 clamp 会让
   「全冻结」和「差一张冻结」两种文档渲染出不同坐标，凭空造出一条分叉。
2. 冻结的语义就是「地图动、卡片不动」。pan 时 `mapContentBounds` 跟着走，clamp 会把卡片从地图底下推开，
   等于冻结失效——这是行为倒退而不是优化。
3. clamp 自己也要跑 `rectangleIntersectsPolygon`（约 34 省 × 180 点 × 24 卡），把省下来的时间又吃回去一部分。

因此本改动对渲染输出是 no-op（除上述退化 anchor 的连接线端口），只是省掉求解。

**顺带修好的一点**：以前全冻结文档首帧也要等 worker 回包（`layoutState.result` 为 null → `destinationCards` 为 `[]`），
现在直接用存储位置出图。

**省掉的量**（`solveCardLayout` 实测中位数，与 Round 1 简报的 ~11ms 对齐）：

| 卡数 | 画布 | 每次 pan 省下 |
| --- | --- | --- |
| 24 | 1500×1000 | 11.0 ms |
| 60 | 2200×1400 | 68.4 ms |

这条路径在真实编辑器里是常态：`App.tsx` 的 `freezeCardPositionsForMapChange` 在任何地图编辑前把所有已解位置写进
`cards.positions`，之后每一次 pan 都命中全冻结分支。

## 3. C2-4（一半）：`feTurbulence` seed

`DestinationCardsLayer` 的 ink 连接线滤镜补 `seed="1"`。未加实例前缀（defs id 归 `resolveEdgeStyle` 的
`filterPrefix` 管，不在本轮 ALLOWED 内），C2-4 的 id 前缀部分留给后续。

## 验证（failure → cause → fix → recheck）

指定命令：

```
npx vitest run src/lib/prepared-card-content.test.ts \
  src/components/canvas/DestinationCardsLayer.test.tsx \
  src/components/canvas/PosterCanvas.test.tsx \
  src/components/canvas/PosterCanvas.pan-wrap.cycle2.test.tsx
```

→ 4 files / 76 tests passed。另跑 `npx vitest run src/components/canvas src/App.test.tsx …` 27 files / 311 tests passed，
全量 `npx vitest run` 186 files / 1415 tests passed，`npx tsc --noEmit -p tsconfig.app.json` 与 `npm run lint`（0 error，
8 条既有 react-refresh warning，均不在本轮文件）通过。

**一次失败的完整链条：**

- **failure**：新加的 “still solves when one card is left to auto-layout” 断言 `solveCalls.count > 0`，实测 0。
- **cause**：不是跳过逻辑出错——夹具渲染（用来拿到 auto-layout 位置）已经把同一个 layout key 写进了
  `cardLayoutCache`，部分冻结那次渲染的 cards/bounds/options 完全一致，于是命中缓存而不是求解。
- **fix**：在夹具函数末尾 `cardLayoutCache.clear()` 并归零计数器，让后续任何 solve 只可能来自真实请求。
- **recheck**：同一条命令重跑，4 files / 74（后为 76）tests 全绿。

同时说明第一条 pan 测试的证明力不受缓存干扰：pan 改变了 anchors 与 bounds，key 必然不同、缓存必然 miss，
所以 pan 之后 `solveCalls.count === 0` 只能由跳过分支解释。

## 新增测试

`PosterCanvas.pan-wrap.cycle2.test.tsx` 增 `PosterCanvas frozen card positions` 三例（对 `lib/card-layout` 做
`importOriginal` 部分 mock，只在 `solveCardLayout` 上计数）：

1. 全冻结后 pan：`solveCardLayout` 零调用，卡片 transform 逐字不变，anchor 照常跟着地图走。
2. 抽掉一张卡的位置：仍会求解，且三张卡都渲染出来。
3. 冻结位置压在地图上：坐标原样落盘（`translate(map.x+40 map.y+40)`），证明没有偷偷 clamp。

## 交付方式与回滚

验收走 PR + CI（全量 vitest + lint）。非破坏性：不改文档 schema、导出格式、API 形状、`data-*` 名。
回滚粒度＝三处独立改动，各自可单独 revert：

- 类型下沉：把两个 interface 移回 `DestinationCard.tsx`、恢复 `prepared-card-content.ts` 首行 import 即可。
- 跳过求解：删 `frozenPlacements` memo 与 `frozenCardSide`，`layoutRequest` 去掉 `frozenPlacements ||`，
  `destinationCards` 恢复 `if (!layoutRequest || !layoutState.result) return []`。
- seed：删 `seed="1"`。

## 留给 Round 3

- **C2-1**（两套几何 city-only `rowHeight`）、**C2-5**（photo 正文 +32 / flow 标题 lineHeight 分叉）未动。
- **C2-4 余项**：defs id 无实例前缀，需要改 `resolveEdgeStyle` 的 `filterPrefix` 调用方。
- **C2-3 余项**：pan 时真正剩下的大头是 `provincePolygons` 重投影 + `cardLayoutBounds` 重建
  （它们只为 dragBounds 服务，全冻结时也在每帧重算）。这是下一个值得啃的窄路径。
- `scripts/perf-canvas-bench.ts` 的 `posterCanvasMapPanRerender` 用的是**未冻结**文档，量不到这次的收益；
  想在 bench 里体现，需要补一个 positions 全填的 pan 用例（该文件本轮不在 ALLOWED 内，未改）。
