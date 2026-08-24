# Cycle 1 Round 1 — opus-fast-A：画布渲染优化（destination card）

分支：`cursor/canvas-render-display-46a1`

## 目标

把标准展示框（standard presentation）的去向卡片渲染从 `PosterCanvas` 拆出为 `memo(DestinationCard)`，
并收窄画布无谓的重渲染范围。要求视觉输出与既有测试断言完全不变。

## 改了什么

### 1. 新增 `src/components/canvas/DestinationCard.tsx`（227 行）

- 迁入标准卡片主体：`data-display-frame-surface` 底板、省份纹理缩略图、ticket/photo 预设装饰、
  自定义展示框元素、标题行、`N 人` 计数、分隔线、正文行（含 `tspan` 分片）。
- 迁入 `renderDisplayFrameItem` / `frameTextAnchor` / `frameTextX`（模块内私有，仓库内无其他引用）。
- 迁入 `CardDisplayRow` / `PreparedCardRow` 类型（`PosterCanvas` 改为从此处导入，避免循环依赖）。
- 组件用 `memo` 包装，props 全部为稳定引用或原始值：
  `style`（`DestinationCardStyle`，整卡共用样式）、`group`、`province`、`rows`、`titleLines`、
  `headerExtra`、`width`、`height`、`provinceTexture`。
- 原 JSX 内的 IIFE（正文行 + 行高计算）改为渲染前的 `bodyLines` 变量，行高由 `style.rowHeight` 传入，
  公式与原先逐字一致。
- 所有 `data-*` 属性（`data-display-frame-surface`/`-mode`、`data-card-province-texture`、
  `data-card-accent`、`data-card-avatar`、`data-card-title-line`、`data-city-section`、
  `data-card-row-line`、`data-display-frame-text`、`data-display-frame-decoration`）原样保留，
  DOM 结构不变（组件返回 Fragment，仍挂在原来的 `<g data-destination-card>` 下）。

### 2. `PosterCanvas.tsx`：收窄重渲染范围（1588 → 1560 行）

- **`displayFrame` useMemo 依赖收窄**：原依赖 `[project.cards]`，任何卡片设置变更（尤其是拖拽提交后的
  `positions`）都会重新 normalize 并让整层卡片重渲染。改为只依赖展示框真正读取的字段
  （`displayFrame`、`visibleFields`、`fontSize`、`textColor`、`background`、`opacity`、`padding`、
  `gap`、`maxWidth`、`fieldTypography`、`fieldFonts`）。normalize 行为未变，仍向
  `deriveFixedDisplayFrameFromCardSettings` 传入完整 `project.cards`。
  该处按仓库既有做法（`App.tsx:608`、`useCollaborationRoom.ts:221`）加了一行
  `react-hooks/exhaustive-deps` 抑制并写明原因；先尝试过 ref 方案，被 v7 新增的
  `react-hooks/refs`（"Cannot access refs during render"）判为 error，故放弃。
- **新增 `cardStyle` useMemo**：把原本每次渲染都重算的 `flowBlocks.slice().sort()`、
  `customFrameItems.filter().slice().sort()`、`flowTitleBlock`/`flowNameBlock`/`flowCityBlock`、
  `flowTitleFontSize`/`flowNameFontSize`/`flowContentStart`、正文行高等集中到一个记忆化对象，
  依赖只列 `project.cards` 的相关字段 + `project.map.edgeColor/activeColor` + `userFonts`。
  memo 因此只需比一次引用。
- **卡片拖拽闭包提取**：原来每张卡片每次渲染都新建 4 个 pointer 闭包。改为
  `handleCardPointerDown/Move/Up/Cancel` 四个 `useCallback`，通过
  `event.currentTarget.getAttribute("data-destination-card")` 在 `cardsByKey`（`useMemo` 的 Map）里
  取回当前卡片。`connectorHidden` 由 `!isInternational && borderless && opacity < 0.9` 推导，与原式
  `connector !== null && ...` 等价（`connector` 仅在 `isInternational` 时为 null）。
- 配套把 `canvasPoint`、`updateCardPreview`、`scheduleCardPreview`、`clearCardPreview`、
  `updateGuestPreview`、`scheduleGuestPreview`、`clearGuestPreview` 改为 `useCallback`，
  卸载清理的 `useEffect` 依赖相应补齐。
- `renderReferenceCardVisual` 分支未做任何改动。
- `CanvasDragPreview.tsx` 未改动，节流语义（rAF / `renderIntervalMs` 定时器合并）原样保留。

### 3. 测试

- `PosterCanvas.performance.test.tsx`：新增用例
  "keeps destination cards out of renders driven by unrelated canvas state"。
  用 `memo` 计数桩替换 `DestinationCard`，断言两张卡片在
  （a）切换 `showGrid` + `selectedTextId`、（b）提交某张卡片的 `positions`
  之后都不再重渲染，同时被拖动卡片的 `transform` 正确更新为 `translate(40 60)`。
  原有 "keeps the map layer out of destination-card preview renders" 用例保持不变。
- 新增 `DestinationCard.test.tsx`：3 个用例，覆盖底板/标题/计数/正文行 y 坐标（42、62）、
  自定义展示框文字与装饰 + borderless 预设去边框、以及 props 引用不变时不重渲染的 memo 边界。

## 验证（failure → cause → fix → recheck）

指定命令：

```
npx vitest run src/components/canvas/PosterCanvas.test.tsx \
  src/components/canvas/PosterCanvas.performance.test.tsx \
  src/components/canvas/PosterCanvas.reference-styles.test.tsx \
  src/components/canvas/PosterCanvas.card-sizing.test.tsx \
  src/components/canvas/CanvasDragPreview.test.tsx \
  src/components/canvas/DestinationCard.test.tsx
```

→ **6 files / 65 tests passed**。

全量：`npm test` → **170 files / 1291 tests passed**。
`npx eslint src/components/canvas/` → 0 error 0 warning。
`npx tsc -p tsconfig.app.json --noEmit` → 无输出。

过程中的三次失败与处置：

| 失败 | 根因 | 最小修复 | 复检 |
| --- | --- | --- | --- |
| `eslint` 报 `react-hooks/refs`：Cannot access refs during render（3 处） | 为收窄 `displayFrame` 依赖用了「render 期写 ref 读最新 `project.cards`」的写法，被 plugin v7 新规则禁止 | 改回直接引用 `project.cards`，依赖数组只列相关字段，加一行 `exhaustive-deps` 抑制并注明原因（同仓库既有做法） | 重跑 `npx eslint src/components/canvas/` → 通过 |
| `DestinationCard.test.tsx` memo 用例断言 `#1c3154` 实得 `#ff0000` | 测试自身把 `titleLines` 写成 JSX 内联数组字面量，每次渲染都是新引用，memo 正确地判定 props 变了 | 把 `titleLines` 提升为模块级常量 | 重跑该文件 → 3 passed |
| `tsc` 报 `Type '"classic"' is not assignable to type 'CardPreset'` | 测试夹具里 preset 写错，合法值是 `standard\|compact\|ticket\|photo\|borderless` | 改为 `"standard"` | 重跑 `tsc` + 该测试文件 → 通过 |

另做了一次**反向验证**确认新用例非空转：临时把 `displayFrame` 依赖改回 `[project.cards]`，
`PosterCanvas.performance.test.tsx` 立刻失败（`expected 4 to be 2`——两张卡片各多渲染一次），
恢复后通过。

## 交付与回滚

- 验收方式：CI 跑 `npm test` + `npm run lint`；上面的定向 vitest 命令可单独复现。
- 无破坏性变更：未改数据结构、导出格式或 API 形状；DOM 结构与 `data-*` 选择器保持不变，
  导出（`exportMode`）路径走同一套渲染代码。
- 回滚方案：本分支两个提交（`44312ea` 重构、`72dce16` 测试），`git revert` 任一或两个即可，
  无迁移、无持久化状态依赖。

## 遗留问题

1. `PosterCanvas.tsx` 仍有 1560 行，远超 AGENTS.md 的 400 行建议。本轮只拆了 destination card；
   嘉宾面板（`data-guests-layer`，约 260 行 JSX，含列表/卡片两种排布与头像裁剪）和
   `renderReferenceCardVisual`（4 种 reference presentation）是下一批明显的拆分候选。
2. 连接线（`strokeNodes`）与锚点圆仍在 `PosterCanvas` 内逐卡片构建，拖拽提交后整层会重建这部分节点。
   可以再抽一个 `memo(DestinationConnector)`，但要小心：拖拽预览是直接对
   `drag.connectorGroup` 下的 `<path>` 调 `setAttribute("d", …)` 的命令式更新，抽组件时必须保证
   `parentElement` 关系不变。
3. `cardStyle` 依赖里含 `project.cards.fieldTypography` / `fieldFonts` 等对象引用。若上游某次
   `commitProject` 无谓地重建了这些对象，memo 会失效。目前未见此类路径，但没有测试兜住。
4. 稳定化后的拖拽 handler 依赖 `cardsByKey`（随 `destinationCards` 变化）。布局结果每次变化时
   handler 身份仍会更新——这只影响宿主 `<g>` 的 prop diff，不触发卡片重渲染，属可接受成本。
