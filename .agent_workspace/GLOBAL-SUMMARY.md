# 三 cycle 全局总结 — 画布渲染 / 展示框样式

**分支:** `cursor/canvas-render-display-46a1`  
**裁决:** Cycle 3 Round 3 **ACCEPT**，优化冻结。

## 1. 数字链

测量：`npm run perf:canvas`，**中位**、≥2 遍、离群作废、与其他负载串行。单遍/均值不可比。

| 阶段 | pan@24 中位 | 主要杠杆 |
| --- | ---: | --- |
| Cycle 1 前 | ~21ms | 单体 PosterCanvas |
| Cycle 1–2 | ~10ms | 拆层、省界仿射、冻结跳求解 |
| Cycle 3 R1 | ~6.2ms | 布局 key 仿射化 |
| Cycle 3 R2–R3 | **~4.0ms** | MapLayer 内容子树跳过 pan |

- MapLayer 单层 pan：2.38 → **0.07ms**
- frozen pan@24：**3.4ms**
- recolor@24：~20+ → **5.2ms**
- mount@24：~75ms（未立项）

**永久验收线（中位 @24）：** pan ≤6.0 / frozen ≤5.5 / recolor ≤6.5 ms。回归超线即 revert 最近 perf 批。禁止为凑线改 bench 指标定义。

**冻结判定：** 无 ≥1ms 可举证杠杆残留（SelectedText ~0.73ms 树 diff 地板 + CardPosition ~2.4ms 卡层必要工作）。后续 perf 立项须先推翻该定性。

## 2. 必须常绿的守卫

| 测试 | 守什么 |
| --- | --- |
| `MapLayer.pan-memo.cycle3` | pan 跳省份子树；比较器不假死 |
| `MapLayer.origin-isolation.cycle3r3` | `MapLayerContent` 禁读 `settings.x/y`（增量 pan ≡ 新挂载） |
| `PosterCanvas.polygon-origin.cycle3r3` | 布局 key 调用方：centered = occupied 平移原点之逆 |
| `card-layout-cache.affine/invariants.cycle3` | key 函数级仿射/碰撞 |
| `destination-card-metrics.test` | flowContentStart 逐字回退 + 反内联 |
| `prepared-card-content.test` city-only | 行高与 paint 语义 |

这些红 = 不变量破，禁止顺手放宽。

## 3. 禁令（带原因）

- 不复活展示框工作台（Stage 走 `ReferenceCardStyleWorkspace`）
- 不 clamp 冻结卡片坐标（地图在卡下滑动）
- 不虚拟化画布 / 不改写渲染器
- 不改 `data-*` 导出钩子
- 不动 `solveCardLayout` 内部
- `MapLayerContent` 子树禁读 `settings.x/y`（违者 pan 静默旧帧）
- `destinationCardFlowContentStart` 禁换 `cardFieldFontSize`（隐性像素批）
- bench prepared-wrap 的 typography 链禁换 flow 回退（改变测量对象）

## 4. 遗留登记簿

**仍会咬用户（特定配置，S5 全批）：** flow 标题 fontSize 叉；flow 求高整体近似；flow 光标不查 typography；行默认 paint 字号盲区。C 若提前做，必须与 `destinationCardFlowContentStart` 喂同一已解析字号。

**窄咬合：** `map-edge-*` 滤镜 id 未按实例 scope；同文档内嵌多份 SVG 才碰撞。

**纯债：** MapLayer/PosterCanvas/MapDataLayer 超 400 行；bench 对 `visibleFields:["city"]` 多降一档；mount 投影模块级缓存。
