# Cycle 2 Round 1 — opus-fast-A

**模型未降级。** slug：`claude-opus-5-thinking-high-fast`。

任务：`preparedCards` 拆分（文本换行与地图 x/y/scale 解耦）＋ `DestinationCardsLayer` 抽出。两项都已落地。

## 1. preparedCards 拆分

原 `preparedCards` 一个 memo 同时算「换行 + 卡片高度」和「锚点」，依赖里带着 `project.map.x / y / scale / width / height` 与 `projection`。地图平移一个像素就会把每张卡的 `wrapCardText`、标题换行、`destinationHeight` 全部重算，并产出全新的 `rows` / `titleLines` 数组，把 `DestinationCard` 的 memo 击穿。

拆成三段：

| memo | 依赖 | 产出 |
| --- | --- | --- |
| `preparedCardContents` | 只有内容与排版（groups / grouping / visibleFields / 表达式模板 / 字号 / maxWidth / padding / 行高 / 画布宽 / safeMargin…） | `rows`（已换行）、`titleLines`、`headerExtra`、`width`、`height` |
| `cardAnchors` | `projection` + `mapPath` + `map.x/y/scale/width/height` | 每卡 `{ anchorX, anchorY }`，按省份 key 去重缓存 |
| `preparedCards` | 上面两个 | `{ ...content, ...anchor }` 浅合并 |

浅合并保留 `rows` / `titleLines` 的对象引用，所以平移之后 `DestinationCard` 拿到的 props 逐项相同，memo 直接跳过。

纯函数移入新文件 `src/lib/prepared-card-content.ts`（270 行）：`buildPreparedCardContents`、`computePreparedCardMetrics`、`cardFieldFontSize`、`destinationCardHeight`、`cardRowsForGroup`、`resolveCardAnchor`。`PosterCanvas` 里原来的 `studentFieldParts` / `rowFragments` / `cardRowsForGroup` / `destinationHeight` 一并搬走。

`resolveCardAnchor(point, map)` 是唯一吃地图变换的纯函数：绕地图中心做 pan/zoom，坐标非有限时回落到地图中心（保持原行为）。

## 2. DestinationCardsLayer 抽出

抽了，没有跳过。`drag.connectorGroup = event.currentTarget.parentElement` 这层耦合之所以安全，是因为**整棵子树一起搬**：连接线 `<path>`、锚点 `<circle>` 与卡片 `<g data-destination-card>` 仍然是同一个 `<g key={group.key}>` 的兄弟节点，`parentElement` 指向的还是原来那个包裹组。拖拽状态（`cardDrag` ref、预览调度器、四个 pointer 回调、`connectorPathToCenter`）整体迁进新组件，`PosterCanvas` 不再持有任何卡片拖拽状态。

props 做了聚合，避免 `memo` 被 `project.cards` 的整体替换击穿：

- `cardsAppearance`（memo）：preset / presentation / connector* / 颜色字号 / provinceStyles / 已解析的 titleFont。
- `cardLayoutBounds`（memo）：自动排版与拖拽钳制共用同一个 bounds 对象，`layoutRequest.bounds` 也改成复用它（缓存 key 内容不变）。
- `selectCards`（useCallback）：替掉原来内联的 `() => onSelect?.({ type: "cards" })`。

`data-cards-layer` / `data-destination-card` / `data-destination-connector` / `data-destination-connector-underlay` / `data-destination-anchor` / `data-connector-edge-filters` / `data-card-preset` / `data-card-presentation` 全部原样保留，新测试逐个断言。

`PosterCanvas.tsx` 1158 → 830 行。

## 3. 验证（failure → cause → fix → recheck）

**failure 1**：`tsc` 报 `Module './scene-document' declares 'VisibleField' locally, but it is not exported`。
**cause**：`VisibleField` 的源头在 `template-document.ts`，`scene-document` 只是 import 后自用。
**fix**：改从 `./template-document` 引入。
**recheck**：`npx tsc -p tsconfig.app.json --noEmit` 通过（连带那条 `student[field]` 隐式 any 的级联报错一并消失）。

**failure 2**：`eslint` 报 `react-refresh/only-export-components`，因为 `DestinationCardsLayer.tsx` 同时导出了组件和 `connectorPathToCenter`。
**cause**：该函数原本就是 `PosterCanvas` 的模块私有函数，没有对外需求。
**fix**：去掉 `export`。
**recheck**：改动文件 eslint 0 warning；`npm run lint` 全仓 0 error / 8 warning（8 条全是既有文件的老警告）。

**failure 3**：`tsc` 报新测试里 `preset: "classic"` 不属于 `CardPreset`。
**cause**：写测试夹具时凭印象取值，`CardPreset` 实际是 `standard | compact | ticket | photo | borderless`。
**fix**：改为 `"standard"`。
**recheck**：`tsc` 通过。

### 变异验证（证明新测试不是摆设）

- 把 `project.map.x / scale` 加回 `preparedCardContents` 的依赖数组 → `keeps destination cards out of a map pan and zoom` 失败（`expected 4 to be 2`，卡体多渲染了一轮）。还原后通过。
- 把 `export const DestinationCardsLayer = memo(...)` 改成不带 memo → `skips its own body when every prop is unchanged` 失败（`expected 3 to be 1`）。还原后通过。

### 测试结果

- 指定命令 `npx vitest run PosterCanvas.test.tsx PosterCanvas.performance.test.tsx PosterCanvas.boundary.test.tsx` ＋ 新增的 `DestinationCardsLayer.test.tsx`、`prepared-card-content.test.ts`、以及并发同伴写的 `PosterCanvas.pan-wrap.cycle2.test.tsx`：**6 文件 / 84 用例全过**。
- `npm test` 全量：**184 文件 / 1403 用例全过**。
- `npm run lint`：0 error。

新增用例：`prepared-card-content.test.ts` 13 条（字号回落、卡宽钳制与标题预留、行高乘子、高度公式、换行行数与高度一致、长标题溢出计入 headerExtra、noWrapFields 保持整行、城市小节、姓名格式 + 行表达式、海外组、锚点 pan/zoom/非有限回落）；`DestinationCardsLayer.test.tsx` 10 条（data-* 契约、空列表、海外组无连接线与锚点、滤镜 defs、节流拖拽预览 + 提交、取消还原、导出模式禁用、点击选中、非标准 presentation 走参考卡、memo 跳过）；`PosterCanvas.performance.test.tsx` +1 条（平移缩放不重绘卡体）。

## 4. 收益

`npm run perf:canvas` 的 `posterCanvasMapPanRerender`（同伴本轮加的场景），各取 3 次中位数：

| 卡数 | 拆分前（把 map 变换加回内容 memo） | 拆分后 |
| --- | --- | --- |
| 8 | 24.4ms | 21.1ms（−14%） |
| 24 | 27.7ms | 21.7ms（−22%） |

剩下的 ~21ms 是平移固有的：锚点变了就必须重解排版（`solveCardLayout` 24 卡本身约 11ms）并重画连接线。换行那部分已经彻底从平移路径上消失——`renderCounts.card` 在平移前后不变，卡体一次都没重渲染。

其余场景无回归：`posterCanvasUnchangedPropsRerender` 24 卡 0.022ms，`posterCanvasSelectedTextRerender` 0.74ms，`posterCanvasMount` 77ms（与拆分前 78ms 持平）。

## 5. 交付与回滚

- 未提交（按调度要求）。改动范围：`PosterCanvas.tsx`、新增 `DestinationCardsLayer.tsx(+test)`、新增 `prepared-card-content.ts(+test)`、`PosterCanvas.performance.test.tsx` 追加 1 条用例。未触碰 `DestinationCard.tsx` / `display-frame-style.ts` / `App.tsx`。
- 验收方式：上面的 vitest 指定命令 + `npm test` + `npm run lint`；视觉上以 `data-*` 契约测试与既有 PosterCanvas 快照类断言为准。
- 非破坏性：文档结构、导出格式、API 形状均未变；`data-*` 名称冻结未动。回滚只需 revert 这几个文件——`PosterCanvas.tsx` 恢复单个 `preparedCards` memo 与内联卡片层即可，两个新文件删除后无残留引用。

## 6. 给下一轮的提醒

- 并发同伴本轮新建了 `src/lib/destination-card-metrics.ts`，与本文件的 `computePreparedCardMetrics` / `cardFieldFontSize` 存在职责重叠，合并时需要择一，别留两套卡片几何真源。
- `cardAnchors` 目前每次平移都重跑 `findProvinceFeature` + `projection`（已按省份去重）。若之后 60 卡平移仍吃紧，下一步是把「省份 → 投影原始点」也缓存起来，只让 pan/zoom 的仿射部分随变换重算。
