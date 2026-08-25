# Cycle 1 Round 3 — opus-fast-A（R3-1 / R3-2 / R3-3）

模型 slug：`claude-opus-5-thinking-high-fast`，未降级。分支 `cursor/canvas-render-display-46a1`，**未提交**（按指令）。

## 交付概览

| 项 | 状态 | 落点 |
| --- | --- | --- |
| R3-1 `memo(PosterCanvas)` | 完成 | `src/components/canvas/PosterCanvas.tsx` |
| R3-2 抽出 `GuestsLayer` + 纯函数 | 完成 | 新增 `src/components/canvas/GuestsLayer.tsx`、`src/lib/guest-panel-layout.ts` |
| R3-3 MapLayer 投影/path 串缓存 | 完成 | `src/components/canvas/MapLayer.tsx` |

`src/App.tsx` **未改动**：三处挂载点传入的 props 在 Round 2 已全部稳定（`renderProject` 走 `useMemo`、`posterRef` 是 ref、回调走 latest-ref + `useCallback([])`、其余是原始值），memo 直接生效，无需额外稳定化。

## R3-1 `memo(PosterCanvas)`

- `PosterCanvas` 函数体改名为内部 `PosterCanvasView`，具名导出改为 `export const PosterCanvas = memo(PosterCanvasView, arePosterCanvasPropsEqual)`。所有既有 `import { PosterCanvas }` 与 `vi.mock` 照常工作。
- 比较器 = 逐 prop `Object.is` 浅比较 **＋** 「文档是否被原地改写」检查。后者用 `WeakMap<ProjectDocument, slices>` 记录上次绘制时各顶层切片（`cards` / `map` / `guests` / …）的引用，渲染时写入；若同一个 project 对象的某个切片在两次渲染之间被换掉，比较器返回 `false`。

  **为什么需要这一层：** `PosterCanvas.test.tsx` 里多处是 `project.cards = { ...project.cards, preset }` 后用**同一个** `project` 引用重渲染。prop 身份看不见这种改写（prevProps 和 nextProps 指向同一个对象），纯 `memo(PosterCanvasView)` 会直接 bail out。生产路径（App 走不可变编辑命令）永远走「新 project 对象」分支，这段检查只是 15 行的兜底，不影响跳过率。

- 证据（`scripts/perf-canvas-bench.ts`，n=24 卡）：

  | 场景 | 耗时 |
  | --- | --- |
  | `posterCanvasMount` | 80.5 ms |
  | `posterCanvasUnchangedPropsRerender` | **0.024 ms**（memo 完全跳过函数体） |
  | `posterCanvasSelectedTextRerender` | 3.53 ms（prop 变了，函数体必跑；但 Map/Guests/Cards 层全部 memo 命中） |

- 新测试（`PosterCanvas.performance.test.tsx`）：
  - `skips the canvas body entirely when no prop it draws from changed` —— 每次都构造**新的 JSX element**，排除 React 的 element-identity bailout，只有 memo 能让计数不涨。反向验证：去掉 memo 后该断言 `expected 4 to be 2` 失败。
  - `keeps the map and guest layers out of a selection-only re-render` —— 只改 `selectedTextId`，断言函数体跑了 +1 次、而 MapLayer / GuestsLayer 渲染计数不变。
  - GuestsLayer 的 mock 做成「外层普通函数 + 内层 `memo`」，外层计数即「PosterCanvas 函数体是否重跑」的探针，内层计数即「层是否收到新 props」。

## R3-2 GuestsLayer + guest-panel-layout

- `src/lib/guest-panel-layout.ts`（纯函数，164 行）：
  - `truncateGuestText` / `wrapGuestCustomText`（含 `GUEST_CUSTOM_MAX_LINES = 14` 上限与末行省略号）从 `PosterCanvas.tsx` 原样搬迁。
  - `computeGuestPanelLayout(guests, lineHeightMultiplier)` 汇总原本散在组件体里的 ~30 个中间量（字号、头像列宽、行高、卡片列数/宽高/行数、自定义文本块高度、面板总高）。
  - `guestContentTop(guests, layout)` 抽出重复三次的 `padding + 30 + titleFontSize + customHeight`。
  - `DEFAULT_GUEST_PANEL` 从组件体内的字面量提升为模块常量——原来每次渲染都新建一个对象，会击穿 GuestsLayer 的 memo。
- `src/components/canvas/GuestsLayer.tsx`：`export const GuestsLayer = memo(GuestsLayerView)`。拖拽 ref、`createCanvasPreviewScheduler`、卸载清理一并迁入，PosterCanvas 侧的 `guestDrag` / `guestPreviewScheduler` / `updateGuestPreview` / `scheduleGuestPreview` / `clearGuestPreview` 全部删除。
- **不变量已保留：** `data-guests-layer`、`data-guest-title`、`data-guest-custom-text`、`data-guest-card`、`data-guest-row`、`data-guest-avatar`、`data-guest-avatar-initial`、`data-guest-person`、`data-guest-note`，以及 clipPath id `guest-avatar-clip-<id>`（list / cards 两种模式都测了）。拖拽预览仍是「pointermove → 调度器节流 → 直接写 DOM `transform`，pointerup 才 commit，pointercancel 回原位」。
- 新测试：`GuestsLayer.test.tsx`（10 例，含节流预览 / 取消回滚 / 导出模式去掉 role+tabIndex+拖拽）、`guest-panel-layout.test.ts`（11 例，含行高倍数缩放、note 行追加、卡片网格列数与总高、自定义文本块下推）。
- `PosterCanvas.tsx` 1470 → **1158 行**。

## R3-3 MapLayer 投影缓存

- 新增 `projectFeatures(features, extent)`：一次 `geoMercator().fitExtent` + `geoPath`，并用三个 `Map<MapFeature, …>` 惰性缓存 `d` 串、`bounds`、`centroid`。返回 `{ projection, path, bounds, center, rawCentroid }`。
- `MapLayer` / `SouthSeaInset` 各自 `useMemo` 持有一份，依赖分别是 `[mainlandFeatures, settings.width, settings.height]` 与 `[insetFeatures, frame.width, frame.height]`（`mainlandFeatures` 由既有 `splitCache` WeakMap 保证引用稳定）。
- 收益：同一个 feature 的 `d` 串原先每帧要序列化 4 次（fills、borders、image clip、hit target），现在整帧 1 次，且投影本身不再每次渲染重算。
- 南海折叠行为不变：`getFeatureSplit` 与 `collapse && <SouthSeaInset>` 原样；`SouthSeaInset` 的 `insetFeatures.length === 0` 早退移到 `useMemo` 之后以守住 hooks 规则。视觉输出未变（`MapLayer.test.tsx` 全绿）。

## 验证纪律（failure → cause → fix → recheck）

1. **failure** —— 加上 `memo` 后 `PosterCanvas.test.tsx` 2/47 失败：`renders a distinct card treatment for each configured preset`（拿到 `photo` 而非 `borderless`）、`runs borderless connectors…`（连接线为 null）。
2. **cause** —— 两例都在同一个 `project` 对象上**原地**改 `project.cards` 后重渲染。把 memo 换回裸函数导出 → 47/47 全过，确认根因是 memo bail out 而非 guests/MapLayer 重构。只有这两例连改 ≥2 次：mount 后 `useCardLayoutWorker` 的 setState 会「顺带救回」第一次更新，第二次没有待处理更新可搭便车，于是暴露。
3. **fix** —— 比较器加 `documentChangedInPlace`（上文 R3-1）。未改动 `PosterCanvas.test.tsx`（不在 ALLOWED 内）。
4. **recheck** —— 同一条命令重跑：`PosterCanvas.test.tsx` 47/47、`PosterCanvas.performance.test.tsx` 4/4、`MapLayer.test.tsx` 14/14。

另一处 failure→fix：`guest-panel-layout.test.ts` 的 note 行断言最初拿 1 人面板对比 2 人面板，算错了基线（`expected 128 to be 106`）；改成同为 2 人、只差 note，复测通过。

## 验收方式

- 目标命令：`npx vitest run src/components/canvas/PosterCanvas.test.tsx src/components/canvas/PosterCanvas.performance.test.tsx src/components/canvas/MapLayer.test.tsx` → 3 files / 65 tests 全过。
- 扩展集（含新测试 + App 回调身份 + 三个 PosterCanvas 边界套件）：9 files / 114 tests 全过。
- `npm test`：180 files / **1363 tests 全过**（含其他 agent 同期在树上的改动）。
- `npm run lint`：0 error / 8 warning，全部是既有 `react-refresh/only-export-components`，我改的文件一个都没新增。
- `npx tsc --noEmit -p tsconfig.app.json`：我改/新增的文件 0 报错；仅剩 `DestinationCard.test.tsx` 里 6 条 `TS2304`（`centeredFrameStyle` / `flowBlocks` 未定义），属他人在编辑的 FORBIDDEN 文件，未触碰。
- `npm run perf:canvas`：见上表。

## 回滚方案

三项彼此独立，可分别回退，都不涉及数据、导出格式或 API 形状：

1. **R3-1** —— 把 `export const PosterCanvas = memo(PosterCanvasView, arePosterCanvasPropsEqual)` 换回 `export function PosterCanvas(...)`，并删掉 `paintedSlices` / `documentChangedInPlace` / `shallowEqualProps` / `arePosterCanvasPropsEqual` 与 `PosterCanvas.performance.test.tsx` 里新增的两例。无外部契约变化。
2. **R3-2** —— 删除 `GuestsLayer.tsx` + `guest-panel-layout.ts` 及其测试，把 guests JSX 与度量搬回 `PosterCanvas.tsx`。DOM 契约（`data-*`、clipPath id）本轮未变，导出 SVG 字节不受影响，故回滚不会产生像素差。
3. **R3-3** —— `projectFeatures` 换回内联 `geoMercator/geoPath` 与 `featureBounds/featureCenter` 两个局部函数。缓存只影响调用次数，不影响 `d` 串内容。

## 遗留 / 未做（交给下一轮）

- **`documentChangedInPlace` 是为测试写法兜的底。** 更干净的收敛是把 `PosterCanvas.test.tsx` 里 5 处 `project.cards = {...}` 改成不可变 `project = { ...project, cards: {...} }`，然后删掉这段比较器。本轮该文件不在 ALLOWED 内，未动。
- **`posterCanvasSelectedTextRerender` 仍要 3.5 ms。** memo 只挡住「props 全等」的重渲染；选中态一变，1161 行函数体照跑（`preparedCards` / `destinationCards` / connector 几何都有 useMemo，剩下的是 JSX 构造）。要再降只能把 cards 层也抽成 `memo(DestinationCardsLayer)`——这是 Round 2 结论里排在 guests 之后的 connectors 项，本轮未做。
- **`PosterCanvas.tsx` 仍 1158 行**，远超 AGENTS.md 的 400 行阈值。下一刀建议切 cards 层（含 connector filters defs 与拖拽 handlers）。
- **未做（沿用 Round 2「明确不做」）：** 虚拟化、换渲染器、复活展示框工作台、改 `data-*` 名、布局短哈希、求解器增量化。
- **未碰（FORBIDDEN）：** `DestinationCard.tsx`、`ReferenceCardVisual.tsx`、`card-templates.ts`、`display-frame-style.ts`。Round 2 结论第 4 条的样式项（glass-stat 透明度钳制、reference 行距、硬编码色板、flow 模式 align）与第 5 条导出契约测试均不在本轮范围。
- **环境噪音（非本轮引入）：** `npm test` 全量跑时有 1 条 unhandled `ReferenceError: window is not defined`，来自 `StudioAssistantRail.test.tsx` 之后的 react-dom scheduler 拆环境竞态；该文件与画布依赖图无交集，单跑 5/5 通过，1363 条测试无失败。
