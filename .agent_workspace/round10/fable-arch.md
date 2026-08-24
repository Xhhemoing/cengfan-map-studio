# Round 10 · R10-fable-arch — 排版体检输入诚实化（卡片实测宽高 + 连接线接入）

- **模型**: claude-fable-5-thinking-xhigh
- **分支**: `cursor/agent-sota-polish-cbcd`（未 commit，按要求留给主调度）

## 洞（对应 BRIEF 缺口 1、2 的输入侧）

`listContentLayoutIssues` 喂给 `checkLayoutHealth` 的输入是假的：

1. 每张手工放置卡片的 bounds 写死 `{ x: 0, y: 0, width: maxWidth, height: 180 }`——x/y 靠 `positionKey` 事后解析，高度与真实渲染无关。真实高度随行数从 ~76px 到数百 px 不等：矮卡被 180 伪报出画布，高卡叠置检测不到。
2. 不传 `connectors`，`connector-conflict` 在产品路径永远不可达。

本轮 R10-opus-layout 已在 `layout-health.ts` 放开同层 card-card 遮挡检测（`sameLayerOcclusionMatters`），输入不诚实就会直接变成假阳性洪水——两侧改动互为前提。

## 方案要点

**卡片实测（零公式重复）**：新模块调用产品渲染同一套测量函数 `prepareDestinationCards`（`poster-card-rows.ts`，只读引用），但传 `features: []` 与恒 null 投影。卡片宽高只依赖分组、换行与排版设置，不依赖地理数据，所以结果与画布渲染逐像素一致（含 `destinationHeight`、`wrapCardText`、displayFrame 水平内边距、`canvas.lineHeight` 系数）；而锚点在无 feature 时回落到地图中心（`map.x + width/2`，围绕中心缩放的不动点）——恰好就是任务要的"map bbox center"连接线锚点。**没有解析 geojson，没有墨卡托投影**（`map-data.ts` 只出现在模块图里，`getChinaMapFeatures` 不被调用）。

**连接线**：对每张有手工位置的卡，用 `buildConnectorGeometry`（只读引用，含 straight/elbow/curve 三种真实样式）从卡片矩形连到地图中心锚点。`layout-health.ts` 的线段相交判定包含端点接触，而所有卡共用一个锚点，直接喂会条条互报（Round 9 已预警）。因此喂入前用 `trimSegmentsNearAnchor` 把锚点 24px 豁免圈内的尾段裁掉——与 `connector-geometry.ts` 自身的共锚点花束豁免（`anchorRadius = 24`）同一策略。裁剪后：共锚点会合不报，真正的中段交叉/共线覆盖仍报。`connectorWidth === 0` 时连接线标记不可见。

**诚实性收敛**：positions 中已无对应分组的残留键（学生删除、分组切换）不再产生对象——画布上没有那张卡；pins 视图 / 无可见字段时（与 `poster-card-placement` 同一渲染门槛）不产生卡对象、占位块与连接线。无手工位置时的 `cards.x/y` 汇总占位块保留原样（遗留锚点，高 180，注释声明非实测）。地图 bounds 沿用原来的 `x: map.x` 写法（严格说缩放围绕中心，scale≠1 时略偏，未动——不在本轮授权且会牵动遮挡基线）。

## 文件

| 文件 | 变化 |
| --- | --- |
| `src/lib/content-layout-objects.ts` | **新增 198 行**：`estimateDestinationCardLayouts`（实测卡片）、`trimSegmentsNearAnchor` + `CONNECTOR_ANCHOR_EXEMPT_RADIUS`（共锚点裁剪）、`buildContentLayoutInput`（对象+连接线构造）、`listContentLayoutIssues`（产品入口，含 `connectors` 透传） |
| `src/lib/studio-editor-helpers.ts` | 216 → **186 行门面**：`listContentLayoutIssues` 移出并 re-export，删除本地 `checkLayoutHealth` 依赖。`use-project-health.ts` 的导入路径零改动（测试断言 facade 与新模块同一函数引用） |
| `src/lib/content-layout-objects.test.ts` | **新增 15 测**：实测高度（96/196 ≠ 180）、锚点缩放不变、渲染门槛、裁剪三态（保留/截断/丢弃 + 出圈截断）、真实坐标+残留键剔除+豁免圈断言、宽 0 不可见、占位块、pins；产品路径：connector-conflict 触发（共线覆盖）、共锚点花束不误报、叠卡 occlusion 触发、矮卡不再被 180 伪报出画布 |
| `src/App.debug.test.tsx` | 迁移到 `src/test-utils/app-harness.tsx`（`installAppTestHarness`/`renderLegacyApp`/`click`），49 → 13 行，测试保留未删 |

未触碰：`layout-health.ts`（opus-layout 所有）、DeliveryWorkspace、import-*、server、card-layout*、静态目录。

## 验证链（failure → cause → fix → recheck）

三项检查**首轮即绿**，无失败链（设计阶段已预先排掉两颗雷：geojson `?raw` 在 vitest 可解析但被有意绕开调用；共锚点端点接触会误报、以裁剪抵消）：

1. `npx tsc --noEmit -p tsconfig.app.json` → **0 错误**。
2. `npx vitest run src/lib/content-layout-objects.test.ts src/lib/studio-editor-helpers.test.ts src/App.debug.test.tsx` → **3 文件 / 39 测试全过**（15 新 + 23 门面回归 + 1 debug）。
3. `npx eslint` 4 个触碰文件 → **0 问题**。
4. 波及面：`npx vitest run` 排版链路相邻 7 文件（App.workflow / App.navigation / StudioAssistantRail / ContentLayoutWorkspace / StudioAssistantDrawer.integration / stage-overview / content-layout-contract）→ **59 测试全过**；再跑全量 `src/lib` → **92 文件 / 821 测试全过**（含 opus-layout 进行中的 layout-health 测试，两侧改动兼容已实证）。

## 交付与回滚

- **验收**：上表第 2、4 项即产品路径证据——`listContentLayoutIssues`（`use-project-health` 的同一入口）在不改 `layout-health.ts` 的前提下发出 `connector-conflict` 与叠卡 `occlusion`。
- **行为变化（面向用户）**：手工放置卡片的越界/遮挡按实测宽高判定（矮卡假阳性消失、高卡假阴性消失）；新增连接线冲突告警；残留 positions 键不再产生幽灵告警。无数据/导出格式/API 形状变更。
- **回滚**：还原 `src/lib/studio-editor-helpers.ts` 的三处编辑（恢复内联 `listContentLayoutIssues` 与 `checkLayoutHealth` 导入），删除 `src/lib/content-layout-objects.ts(.test.ts)`；`App.debug.test.tsx` 还原为独立挂载版即可，均为纯前端纯函数层，无持久化迁移。
- **遗留观察**：① 地图 bounds 的 scale≠1 偏移（见上）；② `agent-session-tools.ts` 的 `healthInput` 仍不传 connectors 且用 180 估高，可直接改调 `buildContentLayoutInput` 收敛，但该文件不在本轮授权内。
