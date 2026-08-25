# Cycle 3 《Round 1 结论简报》

**模型未降级。** 最后一轮循环的基线探索完成。

## 已实现

1. **布局 key 仿射化：** `createCardLayoutCacheKey({ polygonOrigin })` 对中心相对环做 WeakMap，pan 只改 `originX,originY` 前缀。省略 origin 时 key 与旧格式字节相同。
2. **换色不重投影：** `centeredProvincePolygons` 只依赖 `hiddenProvinces` 集合与 `mapImageReplacesProvinces`，不再绑整份 `provinceStyles`。
3. **连接线滤镜 id：** `scopeEdgeStyleFilters` + `useId()`，双 PosterCanvas 不再抢 `connector-edge-soft-glow`。
4. Bench：24 卡 pan ~8ms；冻结 pan ~6ms；换色 ~5ms。

## 遗留 / Round 2

| ID | 项 |
| --- | --- |
| C3-R2-1 | MapLayer 省份子树仍随 pan diff（~1–2ms）。仅当窄 props memo 实测 ≥1ms 才落。 |
| C3-R2-2 | `flowContentStart` 抽到 `destinationCardFlowContentStart`（逐字保留回退链，禁止换成 cardFieldFontSize）。 |
| C3-R2-3 | 布局 key 不变量测试：防单侧过滤造成假命中。 |
| C3-R2-4 | 其他 defs（map-edge、clip）跨实例碰撞登记，有余量再做。 |

禁止：复活展示框工作台、clamp 冻结坐标、为了凑 ≤5ms 破坏碰撞精度。

## 回滚

`polygonOrigin` 可选；滤镜 id 仅运行时 DOM。无持久化格式变更。
