MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 Round 3 — fable-A：Cycle 2 收官审计（仿射缓存落地核验 · 剩余平移成本 · Cycle 3 起点）

- **性质：** 纯审计，零 src 改动、零 git 操作，未离开 `cursor/canvas-render-display-46a1`。
- **快照声明：** 本轮六路并发，工作树在审计期间持续被推进——`PosterCanvas.tsx` 在我两次读取之间从「无仿射缓存」变为「已落地」（约 17:26–17:28 之间入树）。本文全部结论以**末次快照**（约 17:32，tsc 0 错、pan 四测试文件 12 用例全绿的那一份）为准；同轮 gpt-sol-A 的 20ms 量测是落地**前**的数字，与我的 10ms 不矛盾，是时间线两端。
- **输入：** `cycle2-round2-conclusion.md` + 同轮报告（gpt-sol-a/b、opus-b）+ 工作树逐行复核 + 实测（`npm run perf:canvas`、`tsc`、目标 vitest）。

---

## 1. 多边形仿射缓存落地了吗？——**落地了（工作树内，未 commit）**

Round 2 结论的 P0（基几何以 projection 为键缓存、pan 只做仿射）已由 opus-fast-A 按规划实现，结构与 Round 2 fable-A §5-P0 的「字节保真论证」一致：

| 层 | 现状（末次快照锚点） | 依赖 |
| --- | --- | --- |
| `projectedProvinceBounds` | `mapPath.bounds` 全 ring 流式计算，**脱离 pan 路径** | 仅 `[mainlandFeatures, mapPath]` |
| `centeredProvincePolygons` | 投影 + `simplifyProjectedRing` 在「中心偏移 × scale」空间做一次 | 含 `scale`（简化阈值是画布空间，缩放必须重简化——正确），**不含 `x/y`** |
| `provincePolygons` / `provinceAreas` | 纯仿射平移（`origin + point`），每次 pan 只有 O(点数) 的加法与对象分配 | 含 `x/y` |

**落地证据链（我方复测）：**

1. **测试锁齐备且绿：** `PosterCanvas.pan-projection.cycle2.test.tsx`（仅 x/y 变化时投影调用计数零增量 + zoom 时必须重投影的反向哨兵）、`PosterCanvas.polygon-pan.cycle2.test.tsx`（gpt-sol-B：经 solver mock 缝观测，全部 ring 点与 bounds 精确平移 (73,−41)，宽高不变）、`pan-wrap.cycle2`、`performance.test`——4 文件 12 用例全绿。
2. **类型收口确认：** opus-b 中途报告的 4 处 TS18048（`centeredProvincePolygons` 仿射映射 `bounds` possibly undefined）在末次快照 `tsc -p tsconfig.app.json --noEmit` 已 **0 错**，即并行 P0 批次已自行修复。
3. **实测（末次快照 `npm run perf:canvas`）：**

```
posterCanvasMapPanRerender  n=8   8.733ms   （Round 2 基线 20.845ms）
posterCanvasMapPanRerender  n=24  10.203ms  （Round 2 基线 20.197ms，-49.5%）
posterCanvasCardPositionRerender n=24 2.518ms（持平，必要工作）
posterCanvasMount           n=24  82.748ms
geoMercatorGeoPath          n=34  24.694ms  （一次性投影成本，不变）
```

8/24 卡差值出现（8.7 vs 10.2ms）——Round 2 验收线要求的「卡数相关成本显形」达成；但 **24 卡 ≤5ms 的验收线未达**（见 §2）。

**同轮其余落地（顺带核销）：** `cardStyle.rowHeight` 改调 `destinationCardFixedRowHeight`/`destinationCardRowFontSize`（Round 2 P1 前半，公式三拷贝归一）；photo `titleWidth` 减 `headerOffset`（`PreparedCardContentOptions.headerOffset` 可选入参 + PosterCanvas 传 `destinationCardHeaderOffset(preset)`，photo 标题 154→122 锁）；flow 标题行高渲染侧统一取画布 multiplier（S5 前半，**视觉批**）。全冻结跳解算（`frozenPlacements` + `layoutRequest=null` + `frozenCardSide` 事后分类）是 Round 2 已落地项，本轮维持绿。

**风险登记：** 以上全部为**未 commit 的工作树状态**（各席报告均声明未 commit，git 状态快照亦证实）。Cycle 2 的收官动作是把这套多路改动作为一个可回滚批提交并重跑全量——落地的最后一步在调度器手里，不在任何子代理报告里。

---

## 2. 剩余平移成本：24 卡 ~10.2ms，构成已换血

Round 2 的 ~20ms 里 ~17.9ms 是重投影；现在那块归零，剩余 ~10ms 是**另一批东西**：

| 排名 | 成本 | 量级（估） | 定位 | 性质 |
| --- | --- | --- | --- | --- |
| 1 | 非冻结路径的布局 key 重建 | ~3–5ms | `provincePolygons` 仿射层每次 pan 产出**新数组身份** → `polygonsKey` WeakMap 必 miss → 全 ring `JSON.stringify`（`card-layout-cache.ts:34`）。bench 的 pan 样本无全量 positions，走的正是这条 | **可消**：ring 坐标随 pan 必变、key 必须变，但 key 可由「centered 基 key（WeakMap 缓存一次）+ origin 后缀」组合，免去逐点序列化 |
| 2 | MapLayer 子树重渲染 | ~2–3ms | `settings={project.map}` 身份变 → memo miss；地图动了必须重画，但其内部 path `d` 是否随 pan 重算未审计 | 待 Cycle 3 定性 |
| 3 | cards 层连接线重建 | ~2.5ms | 锚点动了连接线必须重画 | 必要工作 |
| 4 | 仿射平移本身 + React 提交 | ~1–2ms | O(34 省 × ≤180 点) 对象分配 | 接近理论下限 |

两条重要限定：

- **bench 没有冻结场景。** 真实稳态（App.tsx 首次地图编辑后全卡永久冻结）下 `layoutRequest=null`，第 1 项整块消失——真实编辑延迟大概率已在 ~5–7ms。但这只是推断，`posterCanvasFrozenMapPanRerender` 指标不存在，无法举证。
- **重着色仍重投影。** `centeredProvincePolygons` 依赖含整个 `project.map.provinceStyles`（visible 过滤在贵 memo 内部），省份**仅换色**也会全量重投影+重简化。Round 2 验收线「重着色不重投影」既无实现也无锁，是本轮 P0 的未竟半句。

---

## 3. Cycle 3 应从哪里开始

**第 0 步（开场即做，先于一切优化）：固化 Cycle 2。** 提交/推送本轮全部工作树改动（含三个视觉批：city rowHeight 77→78、photo 标题换行变窄、flow 标题行高统一——交付说明须逐一记录受影响文档条件与单批回滚），重跑 `npm test` 全量 + `perf:canvas` 定新基线。六路并发的工作树没有一个人看到过「全部落齐」的状态，我的末次快照最接近但不是证明。

之后按「实测收益 × 侵入度」：

1. **P0 — 补完 pan 路径的最后两块：** (a) 布局 key 仿射化（§2 排名 1 的窄修法，`createCardLayoutCacheKey` 接受基 key + origin 分解，不动 solver 语义）；(b) 重着色不重投影——visible 过滤挪出 centered memo 或以可见性签名入依赖，并补锁。两者合并后 unfrozen-pan 应能触及 Round 2 定的 ≤5ms 线。
2. **P1 — 基准补位：** `posterCanvasFrozenMapPanRerender`（真实稳态）与「仅换色重渲染」两个场景入 bench；SOTA 验收线改写为 frozen/unfrozen 双指标。没有这两个指标，1 的收益无法举证。
3. **P1 — 几何下沉 lib + 多实例/mount 成本：** `PosterCanvas.tsx` 已 912 行（仿射缓存又加了 ~80 行，离 400 行规范更远）。把 projection/centered 几何抽成 `src/lib` 纯函数并做模块级缓存（键：collapse/width/height/scale），一石三鸟：拆文件、mount 的 24.7ms 投影在编辑器+模板预览多实例间共享、export 路径同收益。
4. **P2 — 样式收口余项：** connector 滤镜 `filterPrefix` 仍固定 `"connector-edge"` 而非实例前缀（同页多画布串滤镜，C2-4 残项）；S5 后半（flow 标题**块字号**叉：求解对 `flowTitleBlock.style.fontSize` 不可见可致右溢；flow 高度整体近似）；`connectorHidden` 双份表达式（Round 1 风险榜 #5，两轮未消）。
5. **禁区照旧：** 不复活展示框工作台、不 clamp 冻结坐标、不虚拟化、不改 `data-*`、不动求解器内部。

---

## 4. 验证纪律（failure → cause → fix → recheck，跨席证据链）

- **失败：** pan-projection 测试在 P0 落地前红（opus-b 全量跑记录在案）；opus-b 同时记录并行代码 4 处 TS18048。
- **根因：** 前者即「仿射缓存未落地」本身；后者是 P0 中间态 `bounds` 可选类型未收窄。
- **修复：** opus-fast-A 落地缓存并收窄类型（非我方改动，跨席协作）。
- **复检（我方）：** 末次快照 `tsc` 0 错；4 测试文件 12 用例全绿；`perf:canvas` 全量跑通，pan 20.2→10.2ms。本席自身无失败项。
