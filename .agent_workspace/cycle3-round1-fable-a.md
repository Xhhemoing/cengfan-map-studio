MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 1 — fable-A：P0/P1 规划规范（polygonsKey 仿射化 · 换色不重投影）+ 快照核验

- **性质：** 规划 + 现状核验。零 src 改动、零 git 操作，未离开 `cursor/canvas-render-display-46a1`。
- **快照声明：** 本轮并发推进，工作树在我撰写期间已把 P0/P1 的大部分实现落进去（`card-layout-cache.ts` 的 `polygonOrigin`、`PosterCanvas.tsx` 的 `hiddenProvincesKey`、两个 cycle3 测试、bench 双场景均已在树内）。故本文的「规范」部分是设计基准（供各席对照审计），「核验」部分以约 17:42 的末次快照为准。期间我亲历一次中间保存态：首跑 `tsc` 报 `card-layout-cache.ts` 4 处 TS18048，两分钟后原样复跑 0 错、文件内容与两次读取完全一致——判定为并行席位保存瞬间的假阳性，非代码缺陷（证据链见 §5）。
- **Cycle 3 是最后一个 cycle**：本文除 P0/P1 规范外，给出收官路线（§4），所有优化在 Round 3 前必须停手转入固化。

---

## 1. P0 规范：布局缓存 key 仿射化（centered 几何身份 + origin 不进 JSON）

**问题（Cycle 2 遗留）：** `provincePolygons` 每次 pan 产出新数组身份 → `polygonsKey` 的 WeakMap 必 miss → 全 ring `JSON.stringify`（24 卡约 3–5ms）。ring 坐标随 pan 必变、key 必须变，但**变化只有两个数**。

**设计基准（树内实现与此一致，审计时逐条对照）：**

1. **输入分解：** `createCardLayoutCacheKey` 新增可选 `polygonOrigin: { polygons, originX, originY }`。`polygons` 是 centered（相对地图中心、已含 scale）的碰撞多边形数组——即 `centeredProvincePolygons`，其 memo 依赖不含 `x/y`，整个 pan 手势期间**同一数组实例**。
2. **段格式：** 非空时 `"${originX},${originY}@${rings}"`，其中 `rings` 是 centered 数组经 WeakMap 记忆化的一次性序列化；origin 以模板字面量拼接，**不进 JSON**。pan 的 key 成本从全 ring 序列化降为「查 WeakMap + 拼两个数字」。
3. **空归一：** `polygons.length === 0` 时直接返回 `rings`（即 `"[]"`），不折入 origin——否则 `allowMapOverlap` 地图每次 pan 会平白改变多边形段。
4. **旧格式回退：** 不传 `polygonOrigin` 走原路径（序列化 `bounds.occupiedPolygons`），测试与潜在旧调用方不破。

**正确性定理（key 相等 ⟹ 求解输入相等，无假命中）：**

- 仿射段由 `(centered 序列化, originX, originY)` 唯一确定；`provincePolygons = mapOrigin + point` 是确定性纯浮点运算，同一 `(centered, origin)` 必产出逐字节相同的画布多边形。key 只可能**偏细**（不同分解偶然同和 → 多一次 miss），不可能偏粗。
- **格式不碰撞：** 旧格式段首字符恒为 `[`（JSON 数组），仿射非空段首字符是数字或 `-`；唯一交点是空段 `"[]"`，两义相同（无障碍物）。`|` 与 `@` 均不出现在数字/括号/固定标签中，分隔无歧义。
- **浮点串化单射：** ES 规范的最短往返表示对不同 double 单射；`-0` 串化为 `"0"` 且 `-0 + x === x`，无害。
- **前提（调用方持有的不变量）：** `bounds.occupiedPolygons` 必须恰为 `polygonOrigin.polygons` 平移 origin 的结果。树内两个分支（`allowMapOverlap` → EMPTY/EMPTY；否则 `provincePolygons`/`centeredProvincePolygons`）均成立。**这是 P0 唯一可能变不健全的点**——若未来有人只过滤其一，key 会对不上真实求解输入，产生错误缓存命中。缺口处置见 §4-R1。

**核验：** 树内 `occupiedPolygonsSegment` 与上述 1–4 逐条一致；`card-layout-cache.affine.cycle3.test.ts` 锁「整体 key 平移敏感 + 多边形后缀平移不变 + 单点形变后缀必变」；调用方唯一（PosterCanvas + 测试），无双格式写同一缓存的问题。

## 2. P1 规范：仅换省色不重投影

**问题：** `centeredProvincePolygons` 依赖整个 `project.map.provinceStyles`（visible 过滤在 memo 内），换色替换该对象 → 全量重投影 + 重简化（~18ms 量级），且旧 key 失效。

**设计基准：** 碰撞几何从 `provinceStyles` 只读 `visible`。做两级 memo：`hiddenProvincesKey`（`Object.keys(styles).filter(visible===false).sort().join("\n")`，换色时字符串不变）→ `hiddenProvinces` Set（依赖仅该字符串，**身份跨换色稳定**）→ centered memo 依赖 Set 而非 styles。换色链路随后全程保真：`provincePolygons`/`provinceAreas` 身份稳定 → `cardLayoutBounds` 数值不变 → key **字节一致** → `useCardLayoutWorker` 求解 effect 只依赖 `requestKey`，不重跑；`resolved` memo 走 `cardLayoutCache.get` O(1) 命中。**换色 = 零投影 + 零求解 + 零 worker 往返**，只剩 MapLayer 必要重绘。

**核验：** 树内实现与此一致，且更进一步——`renderSource` 依赖收窄为派生布尔 `mapImageReplacesProvinces`（换图不换合成模式也不再重投影）。`PosterCanvas.recolor.cycle3.test.tsx` 锁「换色后投影调用零增量」+ 反向哨兵「隐藏省份必须重投影」（防止把可见性错当样式）。**残余（可接受）：** 签名遍历的是 styles 全部键而非 mainlandFeatures 交集，隐藏一个非大陆区域会触发一次多余重投影——只发生在可见性切换，本就是几何事件，不修。

## 3. 实测快照（本席复测，约 17:42）

`tsc` 0 错；5 个目标测试文件 12 用例全绿（cycle3 两新锁 + cycle2 pan 回归 + key 单测）。`npm run perf:canvas`：

| 指标（n=24） | Cycle 2 末 | 本快照 | 判定 |
| --- | --- | --- | --- |
| posterCanvasMapPanRerender | 10.203ms | **6.235ms**（n=8: 6.479） | key 重建已出 pan 路径；成本与卡数基本无关 |
| posterCanvasFrozenMapPanRerender | （无此指标） | **6.251ms**（n=8: 4.791） | P1b 补位完成，真实稳态首次可举证 |
| posterCanvasProvinceRecolorRerender | （无此指标；估 ~20ms+） | **5.151ms** | 重投影已出换色路径 |
| posterCanvasCardPositionRerender | 2.518ms | 1.138ms | 必要工作，顺带受益 |
| posterCanvasMount | 82.7ms | 73.0ms | 未动，见 §4-R2 |

**对 Round 2 验收线（unfrozen pan ≤5ms）的判定：未达，差 ~1.2ms。** 剩余构成已定性：MapLayer 的 path `d` **不随 pan 重算**（`projectFeatures` memo 依赖仅 `[mainlandFeatures, width, height]`，pan 由外层 `transform` 承载）——剩的是 `settings={project.map}` 身份变化导致的 ~34 省 JSX 重建与 diff（~2–3ms）+ 仿射平移对象分配 + anchors/连接线 + React 提交。frozen 与 unfrozen 在 24 卡已并齐（6.25 vs 6.24），旁证 key/求解成本归零。

## 4. 剩余缺口与收官路线（最后一个 cycle）

- **R1 收尾（本轮内小补）：** ① P0 不变量防线——推荐在 `occupiedPolygonsSegment` 非空分支加 O(1) 首点抽查断言（`occupiedPolygons[0].rings[0][0] === origin + polygons[0].rings[0][0]`，DEV-only），或等价地在 PosterCanvas 测试缝锁「key 缝多边形平移后 === 求解缝多边形」；二选一即可，成本可忽略，防的是未来单侧过滤造成的假命中。② 换色零求解目前靠 `useCardLayoutWorker` 的 key 去重间接成立，可在 recolor 测试补一个 `solveCardLayout` 调用计数锁（可选加固）。
- **R2（唯一允许的新优化 + 拆文件）：** ① MapLayer 内层窄 props memo（把省份 path/label 子树抽成不接收 `x/y` 的 memo 组件）是触及 ≤5ms 的**唯一剩余杠杆**；只在 bench 增益 ≥1ms 时落，否则放弃。② 几何下沉：`featureCoordinatePolygons`/`simplifyProjectedRing`/`projectedPolygon` 仍是 PosterCanvas（已 947 行）的模块私有函数，平移为 `src/lib` 纯函数 + 直接单测，行为零变化；模块级投影缓存（mount 73ms 里 ~24.7ms）只在多实例场景可举证时做。
- **R3（固化，不再有下一轮兜底）：** 全量 `npm test` + lint；SOTA 验收线按实测重定为 frozen/unfrozen/recolor 三指标（建议 6.5 / 6.5 / 5.5 ms @24 卡，若 R2-① 落地则相应收紧）；终局结论简报记录 Cycle 1→3 全程数字（pan 21 → 10 → 6.2ms）。**交付纪律红线：** 全部改动至今未 commit（含 Cycle 2 遗留），调度器必须在收官时分批提交推送——本仓库规矩，本地绿 + 口头完成不是交付证据；视觉批（city +1px、photo 换行、flow 行距）单批可回滚。
- **禁区照旧：** 不复活展示框工作台、不 clamp 冻结坐标、不虚拟化、不改 `data-*`、不动求解器内部。

## 5. 验证纪律（failure → cause → fix → recheck）

- **失败：** 首跑 `tsc -p tsconfig.app.json --noEmit` 报 `card-layout-cache.ts` 64/67/68 行 4 处 TS18048（`polygonOrigin` possibly undefined）。
- **根因假设：** 该处有 `if (!polygonOrigin) return` 守卫，收窄在语言层必然成立；两次 Read（tsc 前后）内容一致且正确 → 判定 tsc 撞上并行席位的文件保存中间态，非代码缺陷。
- **修复：** 无需修复（非我方、非代码问题）。
- **复检：** 原样复跑 `tsc` 0 错；随后 12 用例全绿、`perf:canvas` 全量跑通（§3 数字）。本席自身无失败项残留。
