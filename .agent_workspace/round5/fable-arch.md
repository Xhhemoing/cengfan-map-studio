# Round 5 — R5-fable-arch: PosterCanvas 拆分报告

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 结果

`PosterCanvas.tsx` 从 **1636 行降至 563 行**（目标 ≤700），公共导出 `PosterCanvas` / `PosterCanvasProps` 完全不变，零行为变更（DOM 结构、data-* 属性、事件语义、memo 依赖数组均逐字保留）。所有新文件 ≤400 行。

## 新文件

| 文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/lib/poster-guest-layout.ts` | 150 | 纯函数：`truncateGuestText`、`wrapGuestCustomText`、`FALLBACK_GUEST_PANEL`、`computeGuestPanelMetrics`（嘉宾面板全部尺寸推导） |
| `src/lib/poster-map-geometry.ts` | 109 | 纯函数：`HEAT_COLORS`、`featureCoordinatePolygons`、`simplifyProjectedRing`、`projectedPolygon`、`computeProvinceAreas`、`computeProvincePolygons`（投影/热力色） |
| `src/lib/poster-card-rows.ts` | 264 | 纯函数：`destinationHeight`、`connectorPathToCenter`、`textLayoutObstacle`、`cardRowsForGroup`、`rowFragments`、`referenceCardColor`、`readableTextColor`、`prepareDestinationCards`（卡片测量与换行）；类型 `PreparedCardRow` / `PreparedDestinationCard` / `PlacedDestinationCard` |
| `src/lib/poster-display-frame.ts` | 49 | `deriveCardFrameLayout`：展示框 fixed/flow 布局推导（`CardFrameLayout`） |
| `src/components/canvas/poster-canvas-pointer.ts` | 25 | `canvasPointFromEvent`：指针事件 → 画布坐标（含 jsdom 回退） |
| `src/components/canvas/poster-card-visuals.tsx` | 263 | 渲染辅助：`renderReferenceCardVisual`（四种 presentation）、`renderStandardCardContent`（标准卡片内容）、私有 `renderDisplayFrameItem` |
| `src/components/canvas/poster-guest-panel.tsx` | 356 | **子组件** `GuestPanel`：嘉宾面板列表/卡片渲染 + 整体拖拽（drag ref、预览调度器内聚） |
| `src/components/canvas/poster-destination-cards.tsx` | 312 | **子组件** `DestinationCardsLayer`：连接线 + 卡片渲染 + 单卡指针拖拽（clamp、连接线跟随预览） |

要求逐条对应：①纯辅助函数（guest 截断/换行、投影、热力色）已移出组件文件；②提取了两个实质子组件（`DestinationCardsLayer` 含卡片拖拽、`GuestPanel` 含面板拖拽）；③公共导出与 props 签名逐字不变；④新文件均 ≤400 行。

## 零行为变更的保障

- 两个大 JSX 层（cards / guests）逐字迁移，仅做 `project.cards.X → cards.X` 这类前缀替换；条件渲染（`length > 0`、`visibility !== false`）改为子组件内 `return null`，DOM 输出一致。
- 拖拽 ref + `createCanvasPreviewScheduler` 迁入各自子组件；卸载清理效果随子组件保留。子组件**不加 memo**，与原内联 JSX 的重渲染节奏一致。
- 所有 `useMemo` 依赖数组保持原有字段级粒度：`prepareDestinationCards` 参数用 `Pick<CardSettings, ...>` 窄类型，调用点仍逐字段访问，`react-hooks/exhaustive-deps` 零警告，memo 灵敏度不变。
- `provinceAreas`/`provincePolygons` 两个 memo 原本就以 `project.map` 整对象为依赖，抽成纯函数后依赖不变。

## 验证（failure → cause → fix → recheck）

1. `npx vitest run PosterCanvas.test.tsx PosterCanvas.performance.test.tsx useCardLayoutWorker.test.tsx` → **3 文件 61 用例全过**（含指针拖拽合帧与布局缓存命中两条性能断言）。
2. `npx vitest run src/components/canvas` → **14 文件 133 用例全过**（card-sizing、reference-styles、province-texture 等间接渲染 PosterCanvas 的套件）。
3. `npx tsc --noEmit -p tsconfig.app.json` → **failure**：2 个错误，均在 `src/lib/studio-journey.test.ts`。**cause**：该文件是本轮其他 agent 的未提交新增文件，对可选的 `cards.positions` 直接 `Object.keys/values`；不导入本次任何模块。**fix**：不在本任务所有权范围（仅 PosterCanvas + poster-*），不予修改。**recheck**：`git stash -u` 后 tsc 退出码 0，证明与已提交代码及本次改动无关；本次 9 个文件在完整 tsc 输出中零错误。
4. `npx eslint <9 个改动/新增文件>` → 退出码 0，零错误零警告。

## 验收与回滚

- 验收：上述目标测试 + 全 canvas 目录测试 + tsc（自有文件）+ eslint 作为证据链；无导出格式 / API 形状变化，属纯内部重构。
- 回滚：还原 `src/components/canvas/PosterCanvas.tsx` 至前一版本并删除 8 个新 `poster-*` 文件即可，无数据迁移。
- 按指令**未执行 git commit**。
