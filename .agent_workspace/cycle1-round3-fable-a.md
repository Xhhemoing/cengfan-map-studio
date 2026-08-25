# Cycle 1 Round 3 — fable-A：SOTA 验收（acceptance audit）

- 执行者：fable-A（模型 `claude-fable-5-thinking-xhigh`）
- 验收对象：分支 `cursor/canvas-render-display-46a1`，**已提交 HEAD = `1bd0f8a`**（`ce8f11b` 之后仅 docs 提交，src 与 `ce8f11b` 完全一致；下文"HEAD"均指此口径）
- 范围：只读验收，不改 `src/**`，不做 git 操作
- ⚠️ **并发实况（16:40–16:47 UTC 连续观测）**：工作树被 Round 3 并行 agent 实时写入，五分钟内三次快照状态不同。已定位的在途工作（全部**未提交**）：
  - **gpt-sol-A**（报告已交 `cycle1-round3-gpt-sol-a.md`）：`scripts/perf-canvas-bench.ts` 新增 `posterCanvasUnchangedPropsRerender` 与 `posterCanvasGuest{List,Cards}SelectionRerender` 探针 + `canvas-render-metrics.ts:buildGuestBenchFixture`；在 `1bd0f8a` 上完成两轮基准复测。
  - **gpt-sol-B**（报告已交 `cycle1-round3-gpt-sol-b.md`）：三条契约测试 `export-poster.round3.test.ts`、`DestinationCard.align.round3.test.tsx`、`useCardLayoutWorker.swr-boundary.round3.test.tsx`，零生产改动。
  - **第三方实现 agent**（16:41–16:45 陆续出现，报告未见）：R3-1 `memo(PosterCanvas)`（在途文件 `PosterCanvas.tsx:1136 export const PosterCanvas = memo(PosterCanvasView)`）、R3-2 `GuestsLayer.tsx`（365 行）+ `guest-panel-layout.ts`（164 行），PosterCanvas 1470→1375 行；R3-3 `MapLayer.tsx:projectFeatures`（useMemo 投影 + 每 feature path/bounds/centroid 一次性缓存）；`DestinationCard.tsx`/`display-frame-style.ts` 接入 `resolveDisplayFrameBlockPaint`/新增 `resolveDisplayFrameFieldPaint`（flow align 接线 + `fieldTypography` 进统一级联）；`ReferenceCardVisual.tsx` 增 `lineHeightMultiplier` prop、glass-stat 移除透明度钳制。
  - 本文所有"在途"条目**不计入落地验收**；集成者提交前须按第 5 节验收线全量复核。
- 遵守裁决：不复活 `.display-frame-workspace` 工作台；`margin`/`fieldOrder` 保持 deprecated 不接线。

---

## 1. 验收问 1：`memo(PosterCanvas)` + GuestsLayer 拆分——落地了吗？

**已提交 HEAD 上两项均未落地（OPEN）；两项均已在途（16:43–16:45 UTC 观测到工作树版本）。**

| 项 | HEAD `1bd0f8a` 证据 | 在途证据（未提交） |
|---|---|---|
| R3-1 `memo(PosterCanvas)` | `git show 1bd0f8a:PosterCanvas.tsx` 第 261 行 `export function PosterCanvas({`，无 memo 包装 | 工作树 `PosterCanvas.tsx:1136` `export const PosterCanvas = memo(PosterCanvasView)` |
| R3-2 GuestsLayer 拆分 | 无 `GuestsLayer.tsx`；guests 双模式 JSX 内联于 HEAD `PosterCanvas.tsx:1112-1360`（约 250 行）；文件 1470 行 | `src/components/canvas/GuestsLayer.tsx`（365 行）+ `src/lib/guest-panel-layout.ts`（`computeGuestPanelLayout`/`guestContentTop`/`wrapGuestCustomText`/`truncateGuestText`）；`PosterCanvas.tsx:32` 已改为 import，文件降至 1375 行 |

R3-1 的**前置条件在 HEAD 已全部就绪**（这是 `ce8f11b` 的成果）：`App.tsx:1025 canvasCallbacksRef` latest-ref、`App.tsx:718 captureCardPositions` 为 `useCallback([])`、`App.tsx:1044-1106` 九个 `handleCanvas*` 全稳定；三处挂载点（`App.tsx:1795`/`1941`/`2374`，经 `ContentLayoutWorkspace`/`MapStyleWorkspace`/`DeliveryWorkspace` 与主画布）接线一致。`renderProject` 为 useMemo、`posterRef` 为 ref、其余 props 是标量——memo 的 props 面是干净的。

**验收动作移交集成者**（在途落地提交时执行）：
1. `npm run perf:canvas`：`posterCanvasUnchangedPropsRerender`（HEAD 现值 8 卡 1.776ms / 24 卡 3.542ms，gpt-sol-A 探针）应收敛到近零；`posterCanvasGuestListSelectionRerender 3.374ms` / `GuestCards 7.139ms` 同理收敛。
2. `PosterCanvas.card-sizing.test.tsx` 续绿（`guestHeight` 数值等价是 GuestsLayer 拆分的唯一硬约束——`layoutOccupiedAreas` 消费它）。
3. 9 个 `data-guest-*` 契约名核对（本文第 2 节已抽查通过，提交前复核最终版）。

---

## 2. 验收问 2：导出 DOM 契约是否完好？——**完好（HEAD 核对通过），且首次有测试锁**

导出链 `export-poster.ts:1-21 serializePosterSvg`：克隆后剥除 `[data-selection-overlay]、[data-map-selection-overlay]、[data-asset-selection]、[data-editor-grid]`，透明导出时另剥 `[data-canvas-background]、[data-background-image]`。逐一核对发射点：

- **剥除侧全命中**：`TextLayer.tsx:111`（data-selection-overlay）、`MapLayer.tsx:323`（data-map-selection-overlay）、`DecorationLayer.tsx:179` + `RegionalAssetLayer.tsx:222/273`（data-asset-selection）、HEAD `PosterCanvas.tsx:1442`（data-editor-grid）。
- **保留侧全量清单（HEAD PosterCanvas 实测枚举）**：`data-cards-layer`、`data-destination-card`、`data-destination-connector`、`data-destination-anchor`、`data-connector-style/-dash`、`data-connector-edge-filters`、`data-card-preset`、`data-card-presentation`、`data-card-row-line`（DestinationCard/ReferenceCardVisual 双端）、`data-guests-layer` + `data-guest-{title,custom-text,card,row,avatar,avatar-initial,person,note}`、`data-map-layer`、`data-font-faces`、`data-template-preview/-id`。
- **更正 Round 2 报告口径**：连接线契约实名是 `data-destination-connector`（HEAD `PosterCanvas.tsx:1036`）与 `data-destination-anchor`（`1054`），R2 文中写的 "data-card-connector/-anchor" 系笔误，以本文为准。
- **在途 GuestsLayer 迁移零漂移**：对在途 `PosterCanvas.tsx` diff 枚举 data 属性增删——只有 9 个 `data-guest-*` 的删除侧，无新增/改名；`GuestsLayer.tsx` grep 计数与 HEAD 内联版逐一对应（含 cards/list 双模式各自的 avatar/person/note 双份）。
- **测试锁**：在途 `export-poster.round3.test.ts`（gpt-sol-B）锁"剥四类保 destination/guests"——注意它仍是**合成 DOM**，真实 PosterCanvas 渲染→serialize 的集成测试（R2 报告 1.3-G / R3-6 全量口径）**仍缺**，遗留至第 3 节。

**在途改动的字节级注意（不破契约但改导出字节）**：① 在途 `DestinationCard.tsx` 给 body 行新增 `opacity={paint.opacity}` 属性——与 R2 的 `font-weight="400"` 显式化同类，视觉等价、禁止 golden 整段比对；② flow 模式 align 首次接线（`resolveDisplayFrameBlockPaint` 终于有了生产消费者）——存量 flow 文档若 block 上写过 `align` 会**改像素**，`DestinationCard.align.round3.test.tsx` 只锁了 fixed center 用例，**flow align 用例需集成者补一条**再提交；③ glass-stat 移除 `Math.min(0.9, Math.max(0.55, opacity))` 钳制——用户 opacity 设置首次如实生效，属 R2 结论点名的样式修正，同样是存量像素变化，交付说明需记录。

---

## 3. 验收问 3：对标 Figma 级编辑器、仍在本 SVG 海报范围内的 SOTA 差距

前提：假设第 0 节在途工作如实提交且全绿。仍开放的（按影响排序）：

1. **`preparedCards` 文本排版与地图变换耦合**（R3-4，无人认领）：工作树 `PosterCanvas.tsx:677-707` memo 依赖仍含 `project.map.x/y/scale/width/height` + `projection`——地图平移/缩放每帧全量重跑 `wrapCardText` 并换布局 key 触发重解算。SWR 落地后这正是重解算最高频的入口，是剩余差距里唯一"交互路径上的持续 CPU 税"。
2. **DestinationCardsLayer 未抽取**（R3-5）：cards 层 JSX + `cardDrag`/`cardsByKey` 仍内联；每卡 `buildConnectorGeometry` 在 `memo(PosterCanvas)` 落地后已被顶层挡住（无关 state 不再重算），但卡内编辑仍全层重跑。抽取时打包解决：`connectorPathToCenter` 归位 `connector-geometry.ts`、拖拽预览 `PosterCanvas.tsx:336 connectorGroup.querySelectorAll("path")` 换缓存引用（1.3-K）、pointerup 悬挂预览属性强制复位（1.3-H）。
3. **导出集成测试半成**：round3 版仍合成 DOM；缺"真实渲染（含 reference 卡、guests、grid、选中态）→ `serializePosterSvg` → 断言剥除命中数与保留节点"的端到端。
4. **connector ink 滤镜非确定**：工作树 `PosterCanvas.tsx:984 feTurbulence` 仍无 `seed` 属性（`MapDataLayer.tsx` 已固定），同文档两次导出 ink 连接线字节不同——一行修复。
5. **defs id 无实例前缀**（1.3-I）：`guest-avatar-clip-*` 随 GuestsLayer 迁移后仍无前缀、`map-image-clip`、connector filter id 全局裸奔；同页多 PosterCanvas 实例（编辑器 + 模板预览）时互相污染。
6. **纹理拖拽不走统一调度**（1.3-E）：`MapDataLayer.tsx:427-435` 每 pointermove 直接 setState，绕过 `CanvasDragPreview` 调度器。
7. **TextLayer 拖拽无实时预览**（1.3-F）：main 分支 `96d3302` 已修，**cherry-pick 对齐优先于重写**（避免未来合并冲突）。
8. **`onCardPositionsResolved` pending 语义**：工作树 `PosterCanvas.tsx:769-772` 仍无 pending 守卫。R2 已裁定"冻结所见即所得"非 bug；在途 `useCardLayoutWorker.swr-boundary.round3.test.tsx` 已在 hook 层注记"新省份 pending 期缺席"边界，effect 层语义保持现状即可，不再列为改动项。
9. **求解器 65ms 纯计算热点**：三轮持平（R1 64.4 → R3 65.1/65.7ms @60 卡），仍是最大单点，但已被 worker + SWR 隔离出主线程感知路径。维持后置：Cycle 2 若有真实用户口径证明 pending 时长可感，再立项增量化。

**明确不做**（三轮裁决延续，验收确认无人越界）：虚拟化、canvas2d/WebGL 重写、复活展示框工作台、`data-*` 改名、布局 key 短哈希（R2 1.3-D 已论证收益消失）、`margin`/`fieldOrder` 接线。

---

## 4. 验收问 4：Cycle 2 从哪个遗留开刀？

**裁决：从 `preparedCards` 拆分（R3-4）开刀，DestinationCardsLayer（R3-5）第二刀；MapLayer path 缓存不再是候选**——它已在途（本轮 R3-3，`MapLayer.tsx:projectFeatures`），Cycle 2 开工前先确认其已提交且 `MapLayer.test.tsx` 全绿；若流产则 R3-3 自动升回第一刀。

排序理由：

1. **R3-4 收益频次最高**：memo(PosterCanvas) 挡住的是"无关 state"，而地图平移/缩放是**相关** state——每帧穿透所有 memo 直达 `wrapCardText` 全量重跑 + 布局 key 变化。拆法照 R2 报告 R3-4：文本排版 memo 去掉 `map.x/y/scale` 依赖，锚点投影单独 memo。纯依赖收窄、不动 DOM、低风险。
2. **R3-5 依赖 R3-4 先行**：cards 层抽取要搬 `preparedCards`/`destinationCards` 的消费面，若排版/投影已解耦，抽出的层 props 面才干净；且其打包项（1.3-H/K、connectorPathToCenter 归位）都在同一片代码，一次进场。
3. **Cycle 2 序列建议**：R3-4 → R3-5 → 真实渲染导出集成测试收网（给 R3-5 兜底）→ 长尾一次清扫（connector seed 一行、defs 前缀、纹理拖拽调度、TextLayer cherry-pick `96d3302`）。

---

## 5. 验收问 5：画布性能验收 Pass/Fail 清单

判定口径：**已提交 HEAD `1bd0f8a`**。在途项一律判 OPEN 并附验收线。

### PASS（8 项）

| # | 项 | 证据 |
|---|---|---|
| 1 | P0-1 回调稳定化 | `App.tsx:1025 canvasCallbacksRef` + `718 captureCardPositions useCallback([])` + 九个 `handleCanvas*`；三挂载点接线核对一致 |
| 2 | P0-2 布局 SWR 保旧帧 | `useCardLayoutWorker.ts` 三分支保 `previous.result`；`useCardLayoutWorker.stale.test.tsx` 绿 |
| 3 | P0-3 模板切回 standard | `card-templates.ts:applyCardTemplate` 显式写 `presentation`；`card-templates.presentation.test.ts` 绿 |
| 4 | P0-4 reference 逐行渲染 | `ReferenceCardVisual.tsx` 逐行 `<text data-card-row-line>`；`ReferenceCardVisual.round2.test.tsx` 绿 |
| 5 | P1-1 DestinationCard 接解析层（fixed 路径） | `DestinationCard.tsx` 消费 `resolveDisplayFrameSurface/ItemPaint`；flow 级联为在途增量（见第 2 节③风险） |
| 6 | 导出 DOM 契约完整 | 第 2 节逐属性核对：剥除四类全命中、保留清单无缺失、无改名 |
| 7 | 画布域测试全绿 | 干净 worktree @`1bd0f8a`（隔离并行写入），`npx vitest run src/components/canvas + 9 个 lib 测试文件` → **28 文件 / 241 测试全过**（16:44 UTC，10.3s） |
| 8 | 性能无回归（R2→R3 持平） | 本文独立复跑与 gpt-sol-A 双口径互证（差异均在噪声内）：`solveCardLayout(60)` 65.656 / 65.131ms；`geoMercatorGeoPath(34)` 24.793 / 24.620ms；`posterCanvasSelectedTextRerender(24)` 3.965 / 3.837ms；`posterCanvasMount(24)` 120.3 / 108.1ms（本文数值受并行 agent CPU 争用偏高，方向一致） |

### OPEN（判 FAIL-at-HEAD，6 项，其中 3 项在途）

| # | 项 | 状态 | 集成验收线 |
|---|---|---|---|
| 9 | R3-1 `memo(PosterCanvas)` | ⚠️在途（`PosterCanvas.tsx:1136`） | `posterCanvasUnchangedPropsRerender` 从 1.776/3.542ms（8/24 卡）收敛近零；`PosterCanvas.performance.test.tsx` 续绿 |
| 10 | R3-2 GuestsLayer + `guest-panel-layout` | ⚠️在途（365+164 行新文件） | guests 选中重渲染探针收敛；`card-sizing` 测试续绿（guestHeight 等价）；9 个 `data-guest-*` 复核 |
| 11 | R3-3 MapLayer 投影/path 缓存 | ⚠️在途（`MapLayer.tsx:projectFeatures`） | `MapLayer.test.tsx` 全绿；确认 fills/borders/clip/hit 四处消费同一缓存串 |
| 12 | R3-4 preparedCards 与地图变换解耦 | OPEN，无人认领 | → Cycle 2 第一刀（第 4 节） |
| 13 | R3-5 DestinationCardsLayer（含 1.3-H/K 打包） | OPEN | → Cycle 2 第二刀 |
| 14 | 长尾：真实渲染导出集成测试、connector seed、defs 前缀、纹理拖拽调度、TextLayer cherry-pick | OPEN（导出契约已有合成 DOM 半锁） | → Cycle 2 收网批次 |

### 给集成者的合并纪律（延续 R2 实证教训）

`PosterCanvas.tsx`/`DestinationCard.tsx`/`display-frame-style.ts`/`perf-canvas-bench.ts` 本轮被 ≥2 个 agent 同时改写。提交前必须在**静止工作树**上一次性跑全量 vitest + `perf:canvas`，生产修复与其锁测试同 commit；flow align / glass-stat 钳制两处存量像素变化写入交付说明（回滚方案：两者均为渲染端纯函数改动，revert 对应 commit 即回旧像素，不触数据形状）。

---

## 附：取证链（只读轮，记命令与时刻）

1. 16:40 首次快照：`git log`/`git status` 干净 → HEAD `1bd0f8a`；随后 Grep 命中未提交的 `export-poster.round3.test.ts`，识破工作树正被并行写入。
2. 16:41 / 16:43 / 16:45 三次 `git status --short` + 目标 diff：逐步观测到 gpt-sol 测试与 bench、GuestsLayer、memo(PosterCanvas)、MapLayer 缓存、DestinationCard 级联依次出现；归属经两份已交报告 + diff 内容交叉确认。
3. HEAD 隔离取证：`git worktree add /tmp/r3-acc 1bd0f8a` + symlink node_modules → 241 测试全绿（16:44）→ `npm run perf:canvas` 复跑（16:45）→ worktree 已清理（16:47）。
4. 契约枚举：`git show 1bd0f8a:PosterCanvas.tsx` 全量 `data-*` 清单 + 在途 diff 增删面比对 + `GuestsLayer.tsx` grep 计数。
5. 行号声明：HEAD 行号锚定 `1bd0f8a`；"在途"行号为观测时刻工作树，提交后必然漂移，引用以 symbol 为准。
