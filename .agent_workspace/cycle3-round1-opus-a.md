# Cycle 3 Round 1 — opus-a（P0 布局 key 去除 pan 重序列化 / P1 换色不重投影）

**模型：** claude-opus-5-thinking-high-fast

## 任务

Cycle 2 结论第 1、2 条：

1. `polygonsKey` 用 WeakMap 记忆化**平移后**的多边形数组。平移每帧都产出新数组，必然 miss，于是把全部环点重新 `JSON.stringify`。改为对 **centered 几何**（平移时 identity 不变）做 key，origin/offset 以数字单独拼接。碰撞与布局结果必须逐位不变。
2. 仅换省色（`provinceStyles` 颜色字段）不得重建 `centeredProvincePolygons`。

## 根因

### P0：key 记忆化挂错了数组

`createCardLayoutCacheKey` 只拿得到 `bounds.occupiedPolygons`，也就是 `provincePolygons`——已经加过 `originX/originY` 的画布坐标。Cycle 2 把投影从 pan 路径上摘掉了，但平移仍要生成一份新的点对象数组交给求解器，所以 `serializedPolygons.get(polygons)` 每帧都 miss，24 950 个环点每帧重新序列化一遍。

被序列化的内容里，平移唯一改变的是「每个坐标都加同一对常数」。`centeredProvincePolygons` 才是那份跨 pan 稳定的数组。

### P1：`provinceStyles` 整体进了依赖

`centeredProvincePolygons` 只从 `provinceStyles` 里读一个 `visible === false`，但依赖数组写的是整个 `project.map.provinceStyles`。换色会整体替换该 record，于是 34 省全部重投影 + `centeredProvincePolygons` 换 identity，连带 P0 的记忆化也一起失效。`project.map.renderSource` 同理：memo 只读 `kind` 与 `composition` 两个标量。

## 方案

### `src/lib/card-layout-cache.ts`

新增可选入参 `polygonOrigin: { polygons, originX, originY }`，语义是「`bounds.occupiedPolygons` 恰好等于 `polygons` 平移 `(originX, originY)` 的结果」——这条不变量由调用方保证，key 不再回头核对环点。

key 的多边形段变为 `${originX},${originY}@${polygonsKey(centered)}`：

- `polygonsKey` 仍是原来的 WeakMap，只是这次挂在跨 pan 稳定的数组上，pan 变成「命中记忆化 + 拼两个数字」。
- 判别力不弱于旧式：(centered 环点, origin) 唯一确定平移后的几何，因此旧 key 能区分的输入新 key 一定能区分。方向相反的一侧（浮点上 `origin + p` 相等而 (origin, p) 不等）最多是少一次缓存命中，不会把两组不同的碰撞输入映射到同一个 key。
- `polygons.length === 0` 时（`allowMapOverlap` 开启）省掉 origin 段：没有几何可平移，origin 不影响求解输入，带上它会让这类地图每次平移都 miss 缓存。
- 不传 `polygonOrigin` 时行为与旧版逐字节一致，`|` 分隔符仍不歧义（origin 段以数字开头，旧段以 `[` 开头）。

### `src/components/canvas/PosterCanvas.tsx`

- 提出 `mapOriginX / mapOriginY` 两个标量，`provincePolygons` 与 cache key 共用同一份 origin，平移不变量在源码层面只有一个出处。
- 新增 `layoutOccupiedCenteredPolygons`：与 `layoutOccupiedPolygons` 走同一个 `allowMapOverlap` 分支，二者互为「平移前/后」。两侧的空数组都换成模块级常量 `EMPTY_CARD_POLYGONS`，否则关闭省界避让时每次渲染都会新建 `[]` 并 miss 记忆化。
- `hiddenProvincesKey`（排序后的隐藏省名字符串）→ `hiddenProvinces`（Set）。换色让 key 不变，Set identity 不变，`centeredProvincePolygons` 依赖它而非 `provinceStyles`。
- `mapImageReplacesProvinces` 提为组件顶层布尔，替换 `project.map.renderSource` 依赖。

`DestinationCard.tsx` 未改动。

## 结果不变的证据

现成的 `PosterCanvas.pan-projection.cycle2.test.tsx` 用例二仍然通过：平移得到的 key 与「清空缓存后在平移位置全新挂载」得到的 key 字符串完全相等，卡片 transform 也逐一相等。`PosterCanvas.polygon-pan.cycle2.test.tsx` 继续断言求解器收到的每个环点都恰好平移了 delta。求解器的输入 `bounds.occupiedPolygons` 本身一个字节都没动，只有 key 的编码变了。

## 新增测试

**`src/lib/card-layout-cache.test.ts`**（4 例）

- *re-keys a pan from the origin alone*：先取一次 key，再**原地篡改** centered 环点后换 origin 取第二次 key。记忆化的环段看不见这次篡改，重新遍历环点的实现则会看见——这就把「pan 未重新序列化」变成了可断言的事实。
- *keys geometry carried across a pan the same as geometry projected fresh*：跨 pan 复用的数组与全新数组在同一 origin 下 key 相同。
- *separates two pans of the same geometry*：origin 差 1px 必须换 key。
- *ignores the origin when no polygon is protected*：空几何时 origin 不进 key，且与不传 `polygonOrigin` 的 key 相同。

**`src/components/canvas/PosterCanvas.recolor-projection.cycle3.test.tsx`**（2 例）

沿用 pan-projection 的 `geoMercator` Proxy 计数与 key 捕获：

- 只改 `provinceStyles[省].fill` → 投影计数与布局 key 都完全不变。
- 隐藏一个省 → 投影计数必须上升、key 必须改变，防止上一条因为别的原因空转。

**反向验证：**

- 把 `project.map.provinceStyles` 加回 `centeredProvincePolygons` 依赖 → 换色用例失败，`projectPoint` 由 24 953 翻倍到 49 903。已还原。
- 让 `occupiedPolygonsSegment` 忽略 `polygonOrigin` → *re-keys a pan* 失败，第二次 key 里出现被篡改的 `10789`。已还原。

## 验证（failure → cause → fix → recheck）

本轮实现未出现测试/类型/构建失败，四步链条走在上面两条**反向验证**上：先构造失败（临时还原旧依赖 / 旧 key 路径），确认失败信息指向的正是该根因（投影次数翻倍、环段被重新序列化），再恢复修复，最后重跑同一条命令转绿。

检查记录：

- 指定命令 `npx vitest run src/lib/card-layout-cache.test.ts PosterCanvas.pan-projection.cycle2 PosterCanvas.polygon-pan.cycle2 PosterCanvas.pan-wrap.cycle2` → 4 files / 10 tests passed；加上新测试 → 5 files / 16 tests passed。
- `npx vitest run src/lib/card-layout-cache.test.ts src/components/canvas src/lib/card-layout.test.ts` → 31 files / 237 tests passed。
- `npx tsc --noEmit -p tsconfig.app.json` → 干净。
- `npx eslint` 四个改动/新增文件 → 干净。

## 性能（`npm run perf:canvas`，同机连续两次）

对比方式：把改动文件备份到 `/tmp` 后，用两处最小反向补丁（key 忽略 `polygonOrigin`、依赖加回 `provinceStyles`）跑基线，再从备份还原跑改后。`posterCanvasMount` 作为机器状态校准基线。

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| `posterCanvasMount` n=24（校准基线） | 71.402 | 72.070 |
| **`posterCanvasMapPanRerender` n=8** | 9.829 | **7.316** |
| **`posterCanvasMapPanRerender` n=24** | 7.814 | **6.343** |
| **`posterCanvasProvinceRecolorRerender` n=8** | 11.715 | **4.172** |
| **`posterCanvasProvinceRecolorRerender` n=24** | 11.939 | **5.216** |
| `posterCanvasFrozenMapPanRerender` n=24 | 5.737 | 5.834（噪声内） |

平移约 **−20%**，换色约 **−60%**。换色收益更大是因为它同时吃掉了重投影与重序列化两笔；平移在 Cycle 2 已无重投影，本轮只摘掉序列化那 1.5–2.5ms。冻结平移不走求解器也不建 key，如预期无变化。

## 残余开销与下一步线索

平移仍有约 6–7ms，已不含投影，也不含环序列化：

1. `provincePolygons` 的逐点仿射复制——24 950 个点对象每帧新建。要消掉得让 `card-layout` 的碰撞侧直接接受「基几何 + 偏移」，即把 offset 下推进求解器（Cycle 2 结论 P2「几何下沉 `src/lib`」的自然延伸）。
2. `mapContentBounds` / `mapOccupiedAreas` 仍依赖整个 `project.map`，换色时会重算（数值不变，故 key 不变、不触发求解）。想让换色再降一档可比照本轮拆依赖。
3. `cardAnchors` 平移时仍对每个有卡片的省调用一次 `projection(feature.center)`（≤34 次）。

## 交付

未提交（按指令不 git commit）。改动文件：

- `src/lib/card-layout-cache.ts`、`src/lib/card-layout-cache.test.ts`
- `src/components/canvas/PosterCanvas.tsx`
- 新增 `src/components/canvas/PosterCanvas.recolor-projection.cycle3.test.tsx`
- 本报告

**验收方式：** 上述 vitest / eslint / tsc 命令 + `npm run perf:canvas` 的 pan、recolor 两项。

**回滚方案：** 无数据、导出格式或 API 形状变更。`polygonOrigin` 是可选入参，不传即回到旧 key 编码；布局缓存是纯内存 LRU，key 编码变化不会读到旧格式的持久数据。回滚只需还原上述文件。
