# Round 6 — fable-arch: PosterCanvas.tsx 瘦身至 ≤400 行

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 结果

`PosterCanvas.tsx` 从 **563 行 → 336 行**，零行为变更。公开导出（`PosterCanvas`、`PosterCanvasProps`）与 props 形状完全不变。

## 拆分方案

| 新文件 | 行数 | 内容 |
| --- | --- | --- |
| `src/components/canvas/poster-canvas-geometry.ts` | 88 | `usePosterStudentData`（可见学生/省份计数/图钉）、`usePosterMapGeometry`（mercator 投影、省份多边形、地图内容边界、非省份占用区、heat 主题 `mapTheme`）、`usePosterLayoutAreas`（卡片自动布局需避让的区域/多边形） |
| `src/components/canvas/poster-card-placement.ts` | 190 | `usePosterCardPlacement`：`prepareDestinationCards` 测量 memo、`CardLayoutWorkerRequest` 构造、`useCardLayoutWorker` 调用、手动位置覆盖合并、`onCardPositionsResolved` effect |
| `src/components/canvas/poster-svg-chrome.tsx` | 68 | `PosterSvgChrome`：字体 `<defs>`、画布背景填充/图片、编辑器网格（`clampGridSize` 随之内移） |

`PosterCanvas.tsx` 保留组合职责：props、layerBlocks 按 zIndex 排序渲染、选中播报、回调。

## Memoization 不变性（拖拽合并保障）

- 所有 `useMemo`/`useCallback` 依赖数组逐字保留，仅把 `project.map` / `project.cards.*` 等换成语义相同的参数引用（同一对象标识）。
- `MemoizedMapLayer` 等模块级 `memo()` 包装保持原位；`mapTheme` 依赖仍为 `[map.edgeColor]`，拖拽卡片时 MapLayer 不重渲。
- `features = getChinaMapFeatures()` 在新模块内取模块级缓存，与 PosterCanvas 中为同一数组引用，`preparedCards` 依赖数组无需扩充。
- `useCardLayoutWorker` 与 `onCardPositionsResolved` effect 的调用顺序在自定义 hook 内与原文件一致。
- `renderIntervalMs` 传递链路未动（CanvasDragPreview 的本地合并逻辑未触及）。

## 验证（failure → cause → fix → recheck 证据链）

1. `npx vitest run src/components/canvas/PosterCanvas.test.tsx src/components/canvas/PosterCanvas.performance.test.tsx` — **2 文件 52 测试全过**（含指针风暴合并/静态内容不重排的性能断言）。
2. `npx tsc --noEmit -p tsconfig.app.json` — 本次改动的 4 个文件 **0 错误**。全量输出仅剩 `src/lib/useCollaborationRoom.test.ts` 2 个错误：该文件是并行 agent（round6 server 方向）新增的未跟踪文件，只导入协作模块、与 canvas 无关，属其所有权范围，未触碰。
3. 额外保险：`PosterCanvas.card-sizing / reference-styles / ProvinceTexture* / useCardLayoutWorker` 5 个套件 25 测试全过；`npx eslint` 四个文件 0 告警。

## 回滚

无数据/导出格式/API 形状变更；纯内部文件拆分，`git checkout -- src/components/canvas/PosterCanvas.tsx && git clean` 掉三个新文件即可整体回退。未提交（按指令 Do not commit）。
