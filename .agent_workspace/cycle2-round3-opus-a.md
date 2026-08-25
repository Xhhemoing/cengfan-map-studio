# Cycle 2 Round 3 — opus-a（P0 地图基几何仿射缓存）

**模型：** claude-opus-5-thinking-high-fast

## 任务

平移地图（x/y 变、scale/size 不变）不得重跑 34 省的地理投影。禁止改动碰撞结果。

## 根因

平移时 `project.map` 对象被替换，两处几何 memo 同时失效：

| memo | 旧依赖 | 平移时的代价 |
| --- | --- | --- |
| `provinceAreas` | `project.map`（整对象） | 34 次 `mapPath.bounds` 流式遍历全部环 |
| `provincePolygons` | 含 `project.map.x / y` | 24 950 次 `projection(coordinate)` + 全量 `simplifyProjectedRing` |

投影本身（`geoMercator().fitExtent`）只依赖 map 宽高与南海折叠，平移不改变它；x/y 只是把同一份几何整体搬到画布的另一处。

## 方案：把平移从投影里剥出去

改动只在 `PosterCanvas.tsx` 的三个 memo（`provinceAreas` / `provincePolygons` / 新增基几何）：

1. `projectedProvinceBounds`：`mapPath.bounds` 的原始投影坐标，依赖 `[mainlandFeatures, mapPath]`。平移与缩放都不再触发流式遍历。
2. `centeredProvincePolygons`：投影 + 缩放后**以地图中心为原点**的偏移量，依赖去掉 x/y，保留 width/height/scale/provinceStyles/renderSource/projection。
3. `provincePolygons`：只做 `originX + point.x` 的平移，`originX = map.x + map.width / 2`。

选「相对地图中心的偏移」而不是「地图局部坐标」是为了逐位复现旧算式：旧式 `map.x + centerX + (p0 - centerX) * scale` 的求值顺序就是 `(map.x + centerX) + dx`，新式 `originX + dx` 与之完全同构，浮点结果一致。简化（`simplifyProjectedRing`）在平移前的坐标系里做，而平移是保距变换，因此保留哪些顶点的判定与旧代码相同。

## 碰撞结果不变的证据

`createCardLayoutCacheKey` 会把每个省每个环的每个点序列化进 key。新增测试用例二对比两条路径的 key：

- 路径 A：先渲染原始 project，再渲染平移后的 project（走仿射缓存）；
- 路径 B：清空布局缓存后，全新挂载平移后的 project（走完整投影）。

两者 key **字符串完全相等**，卡片 transform 也逐一相等。这比数值近似断言更强：任何一个环点的哪怕 1 ulp 漂移都会让断言失败。

## 新增测试

`src/components/canvas/PosterCanvas.pan-projection.cycle2.test.tsx`

用 Proxy 包住 `geoMercator()` 的返回值来计数（d3 的链式 setter 返回投影自身，`geoPath` 又要从 `fitExtent` 的返回值上取 `stream`，所以普通包装函数不够）：`apply` 陷阱数点投影次数，`get` 陷阱在 `stream` 被调用时计数，覆盖 `mapPath.bounds` 背后的环遍历。

- 用例一：`dataView: "pins"`（无卡片，排除 `cardAnchors` 的省心点投影干扰）→ 平移后两个计数器**完全不增**；随后的缩放必须让点投影计数上升，避免测试空转。
- 用例二：上文的 key 等价性 + transform 等价性。

**反向验证：** 临时把 `project.map` / `map.x` / `map.y` 加回依赖，用例一失败并给出 `{ projectPoint: 49900, stream: 68 }` vs `{ projectPoint: 24950, stream: 34 }` —— 恰好翻倍，确认它真的盯住了这条路径。随后已还原。

## 验证（failure → cause → fix → recheck）

1. **failure：** `tsc -p tsconfig.app.json` 报 4 处 `TS18048: 'bounds' is possibly 'undefined'`（PosterCanvas.tsx:313）。
2. **cause：** `CardPolygon.bounds` 在类型上可选；旧代码的 bounds 由 `projectedPolygon` 直接构造，从未在类型层面暴露这个可选性，而新代码解构后直接读取。
3. **fix：** 平移时仅在 `bounds` 存在时展开，缺省则原样省略该字段。
4. **recheck：** `tsc -p tsconfig.app.json` 与 `tsconfig.node.json` 均干净；指定的三份测试 + 新测试 64 passed。

其它检查：

- `npx vitest run PosterCanvas.test.tsx PosterCanvas.pan-wrap.cycle2.test.tsx map-content-bounds.test.ts PosterCanvas.pan-projection.cycle2.test.tsx` → 4 files / 64 tests passed。
- `npx vitest run src/components/canvas src/lib/map-content-bounds.test.ts src/lib/card-layout.test.ts` → 29 files / 237 tests passed。
- `npx eslint` 两个改动文件 → 干净。

## 性能（`npm run perf:canvas`）

同一台机器；用 `geoMercatorGeoPath`（未改动的纯 d3 基线）与 `posterCanvasMount` 校准机器状态，取速度相当的那次对比：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| `geoMercatorGeoPath` n=34（校准基线） | 23.432 | 23.717 |
| `posterCanvasMount` n=8（校准基线） | 66.894 | 67.104 |
| **`posterCanvasMapPanRerender` n=8** | **20.744** | **7.969** |
| **`posterCanvasMapPanRerender` n=24** | **20.389** | **7.849** |

平移约 **−61%**。Round 2 结论里「平移 ~21ms 在 8 卡与 24 卡几乎相同」的那部分固定开销就是这里的重投影。

## 残余开销与下一步线索

平移仍有约 8ms，不再是投影，而是：

1. `createCardLayoutCacheKey` 里 `polygonsKey` 的 `JSON.stringify`——它按数组 identity 记忆化，而平移必然产出新数组，因此每次平移都要把全部环点序列化一遍。若让碰撞侧接受「基几何 + 偏移」，这一步和第 2 点都能一起消掉（需改 `card-layout` / cache，超出本轮允许范围）。
2. `provincePolygons` 的逐点复制（仿射本身），量级远小于投影但非零。
3. `cardAnchors` 仍在平移时对每个有卡片的省调用一次 `projection(feature.center)`（≤34 次，可忽略；且本轮不允许改该 memo）。

未提交（按指令不 git commit）。改动文件：`src/components/canvas/PosterCanvas.tsx`、新增 `src/components/canvas/PosterCanvas.pan-projection.cycle2.test.tsx`、本报告。
