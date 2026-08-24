# R4-opus-layout — 拆分超长布局模块

## 结论

`src/lib/card-layout*.ts` 中所有非测试文件现已 ≤400 行，最大 362（`card-layout-saturation.ts`，本轮未动）。
`solveCardLayout` 公开 API、布局质量与确定性均未改变——64 个板面的输出指纹逐字节一致。

| 文件 | 之前 | 之后 |
| --- | --- | --- |
| `card-layout-space.ts` | 761 | 348 |
| `card-layout-optimizer.ts` | 509 | 345 |
| `card-layout.ts` | 411 | 345 |
| `card-layout-modes.ts` | 251 | 322 |
| `card-layout-index.ts`（新） | — | 184 |
| `card-layout-raster.ts`（新） | — | 267 |
| `card-layout-scoring.ts`（新） | — | 198 |

## 拆分依据

沿模块里本来就存在的接缝切，而不是按行数硬切。

**`card-layout-space.ts` → index / raster / space**

- `card-layout-index.ts`：`RectIndex`——所有空间查询共用的均匀网格。它不认识省界、不认识卡片，只按格子分桶矩形，是三个使用方（space 的 zone/polygon/placement 索引、raster 的边索引、manual 的拖拽夹取）唯一的共同依赖。
- `card-layout-raster.ts`：`IndexedPolygon`、`PolygonEdge`、`PolygonRaster`、`buildObstacleIndexes`——只有存在省界多边形时才会构造的那套结构。空间模型本身（画布、边距、间隙）与它无关。
- `card-layout-space.ts`：留下 `LayoutSpace`、`PlacementIndex`、`validateHard`、`normalizeBounds`、`protectedZones`，即求解器实际调用的那层查询接口。

**`card-layout-optimizer.ts` → scoring / optimizer**（即任务要求的 search vs scoring）

- `card-layout-scoring.ts`：`scoreLayout`（整版布局排序）与 `selectCandidate`（单卡候选排序），外加二者共用的 `OrderState`、`Budget`、`ClusterMap`、`anchorClusters`。两者都是纯函数，不放置也不淘汰任何卡片。
- `card-layout-optimizer.ts`：预算常量、插入序生成、`runOrder`、`optimizedLayout`——即搜索驱动本身。

**`card-layout.ts` → 门面**

`packSides` 移入 `card-layout-modes.ts`。该模块的职责本就是「卡片归属哪一侧 + 一侧内如何排」，而 `packSides` 正是四侧轮排、溢出到邻侧的驱动。门面现在只剩组合逻辑。
`card-layout-modes.ts` 中原有的私有常量 `SIDE_PACK_ORDER`（`["left","right","top","bottom"]`，用于生成 assignment 列表顺序）与移入的同名常量（`["right","left","top","bottom"]`，打包顺序）撞名，前者改名为 `ASSIGNMENT_ORDER`，顺序未变。

无循环依赖：`modes → pack` 单向（`pack` 不引用 `modes`）；`raster → index` 单向；`space → index, raster` 单向。

## 保留的行为

- 隐藏卡策略：`packSides` 末尾的饱和降级（一次 `containFree` 扫描落空后改用 `stackAtMargin`）原样搬运，卡片一张不丢。
- 搜索提前退出：`SEARCH_PATIENCE`、`SEARCH_BUDGET`、`REPAIR_COST`、`REPAIR_SHARE`、`MIN_REPAIRS_PER_ORDER` 及其使用点全部未改。
- grid / right-stack 仍绕过 optimizer（`searchPlan` 未动）。

## 验证（failure → cause → fix → recheck）

**指纹比对（最强证据）**

`.agent_workspace/round4/golden-fingerprint.mts` 跑 64 个板面（4 种 mode × 5 档卡数 × 3 种障碍形态，外加饱和、退化几何、`allowMapOverlap`），共 1565 个 placement，输出每张卡的坐标、side、`__layoutDebug` 的 decision / improved / trace，取 SHA-256。

拆分前后同为 `20382966e6d60a4acf587fdcc072a5907509e4dcf728ebc3e948a55ae525d191`。覆盖到 5 种 decision（`ran` / `skipped-mode` / `skipped-infeasible` / `skipped-no-legal-layout` / `skipped-no-geography`）与 2 种 stop（`no-gain` / `exhausted`），solved 31 / fallback 33。

**测试**

指定的 7 个文件 + 新增 `card-layout-index.test.ts`：8 files / 111 tests 全绿（基线为 7 files / 97 tests）。
`npx eslint`（改动的 10 个文件）0 问题。`npx tsc -b --noEmit` 对布局模块 0 报错（`src/lib/import-data.ts` 的两个 TS6133 是他人在途改动，非本轮引入）。

**四步链：一次真实失败**

1. **failure**：新增的「省界穿越计数与测量顺序无关」用例，在我人为把 `LayoutSpace.pointInside` 的记忆键从 `(x, y)` 改成只比 `x` 之后，**仍然通过**——用例没有起到守护作用。
2. **cause**：该用例的锚点由 `420 + (index*149)%660` 生成，序列里相邻锚点的 x 各不相同，因此单槽记忆永远不会命中，y 比较被不比较也看不出来。
3. **fix**：锚点改为按列排布（`x = 420 + (index%8)*90`），使连续调用反复以「同 x、不同 y」提问；另加一个最小用例：同一条竖线上取一个在多边形内、一个在多边形外的锚点，各自穿越同一条轮廓。
4. **recheck**：同样的变异下两个用例都失败；还原后全绿。另对 `RectIndex.overlapping` 去掉 `this.stamp += 1`（破坏逐查询去重）做了第二次变异，3 个测试文件共 25 个用例失败，说明新拆出的 index 模块确有覆盖。

## 新增测试

- `src/lib/card-layout-index.test.ts`（9 例）：`RectIndex` 此前只被间接覆盖。含超大条目旁路（超过每项格子上限后不入桶、改为每次查询扫描）、跨格去重、谓词短路、非有限几何、退化 cell 尺寸、零尺寸点查询。
- `card-layout.test.ts` 新增 `solver state isolation`（5 例）：拆分把若干可变状态搬进了新模块（网格的查询戳、省界的单槽射线记忆、占用栅格）。单板自比无法发现串板泄漏，所以这组用例改为让板面互相验证——轮转交错求解 3 轮、正反序探测同一个复用的 `LayoutSpace`、并与全新构造的 `LayoutSpace` 对齐。同时断言每块板卡片一张不丢。

## 交付与回滚

- 验收方式：CI 跑上述 8 个测试文件 + `npm run lint`；人工验收可重跑指纹脚本比对 digest。
- 破坏性变更：无。公开 API（`solveCardLayout` / `layoutCards` / `clampCardPosition` / 遗留 `Destination*` 别名）与导出形状完全未变；数据与导出格式未涉及。
- 回滚方案：纯代码搬运，`git revert` 单个提交即可，无数据或格式迁移。
