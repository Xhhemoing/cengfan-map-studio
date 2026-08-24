MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 2 Round 1 — gpt-sol-A 画布平移性能探针

## 结论

- 新增 `wrapCardTextPreparedContent`：按默认省份卡的实际宽度、字段字号，预构造每卡 3 批文本（标题、城市标题、学校/姓名正文），计时只覆盖 `wrapCardText`。
- 新增 `posterCanvasMapPanRerender`：同一 React root 在原项目与仅 `map.x + 16` 的项目间切换，计时后校验地图 transform 和卡片数。
- 8 卡时，prepared-content wrap 为 `0.053ms`，map-x-only 重渲染为 `21.372ms`，后者是前者的 `403.2x`；24 卡时为 `0.162ms` 对 `25.725ms`，即 `158.8x`。
- 对应 wrap 只占完整 warm 平移重渲染的约 `0.25%` / `0.63%`。因此当前数据不支持“`wrapCardText` 是平移主耗时”的判断；解耦仍可避免无效分配，但不能单凭这项预期消除 20–26ms 的主成本。
- 该比例只隔离换行工作，不等同于整个 `preparedCards` memo（分组、表达式格式化、锚点计算和对象分配未包含）。平移指标在正式样本前已预热两个 layout key，因此也不包含首次求解；它表示缓存命中后的同步 React/jsdom 重渲染成本。

## 新探针对比

| 卡片数 | prepared-content wrap | map.x-only 重渲染 | map / wrap | wrap 占比 |
| ---: | ---: | ---: | ---: | ---: |
| 8 | 0.053ms | 21.372ms | 403.2x | 0.25% |
| 24 | 0.162ms | 25.725ms | 158.8x | 0.63% |

同轮选择态重渲染为 `2.146ms` / `3.395ms`；map.x-only 分别约为其 `10.0x` / `7.6x`，说明平移路径确实是独立热点，但热点远大于纯文本换行。

## 与 Cycle 1 Round 3 比较

下表以 Round 3 最终 post-land 数字为主。Round 3 报告已指出该次 `wrapCardText(200)`、60 卡求解和地图 path 存在机器负载离群，因此同时列出其 pre-land 受控值。

| 指标 | R3 pre-land | R3 post-land | C2 R1 | C2 vs post |
| --- | ---: | ---: | ---: | ---: |
| `wrapCardText(50)` | 0.066 | 0.067 | 0.068 | +1.5% |
| `wrapCardText(200)` | 0.252 | 0.180 | 0.262 | +45.6% |
| `solveCardLayout(24)` | 10.870 | 11.547 | 10.940 | -5.3% |
| `solveCardLayout(60)` | 65.131 | 70.019 | 64.396 | -8.0% |
| `geoMercatorGeoPath(34)` | 24.620 | 38.788 | 24.340 | -37.3% |
| `posterCanvasMount(8)` | 105.709 | 148.367 | 68.878 | -53.6% |
| `posterCanvasUnchangedPropsRerender(8)` | 1.776 | 0.050 | 0.049 | -2.0% |
| `posterCanvasSelectedTextRerender(8)` | 2.282 | 2.200 | 2.146 | -2.5% |
| `posterCanvasCardPositionRerender(8)` | 1.808 | 2.954 | 1.392 | -52.9% |
| `posterCanvasMount(24)` | 108.093 | 114.323 | 74.931 | -34.5% |
| `posterCanvasUnchangedPropsRerender(24)` | 3.542 | 0.030 | 0.024 | -20.0% |
| `posterCanvasSelectedTextRerender(24)` | 3.837 | 3.504 | 3.395 | -3.1% |
| `posterCanvasCardPositionRerender(24)` | 3.439 | 3.202 | 3.090 | -3.5% |
| `posterCanvasGuestListSelectionRerender(24)` | 3.374 | 1.630 | 1.679 | +3.0% |
| `posterCanvasGuestCardsSelectionRerender(24)` | 7.139 | 1.629 | 1.608 | -1.3% |

相对更可信的 R3 pre-land，当前 `wrapCardText(200)` 为 `+4.0%`、60 卡求解为 `-1.1%`、地图 path 为 `-1.1%`，均可视为持平。顶层 memo 与嘉宾层 memo 指标也保持在 Round 3 post-land 水平。mount 和 8 卡位置更新降幅较大，但单轮 jsdom wall time 不足以将其归因于某项实现。

## `npm run perf:canvas` 成功输出

```text
> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.030
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.778
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.160
name=normalizeDisplayFrame n=200 ms=1.567
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.488
name=wrapCardText n=50 ms=0.068
name=wrapCardText n=200 ms=0.262
name=solveCardLayout_1500x1000 n=24 ms=10.940
name=solveCardLayout_2200x1400 n=60 ms=64.396
name=geoMercatorGeoPath n=34 ms=24.340
name=wrapCardTextPreparedContent n=8 ms=0.053
name=posterCanvasMount n=8 ms=68.878
name=posterCanvasUnchangedPropsRerender n=8 ms=0.049
name=posterCanvasSelectedTextRerender n=8 ms=2.146
name=posterCanvasMapPanRerender n=8 ms=21.372
name=posterCanvasCardPositionRerender n=8 ms=1.392
name=wrapCardTextPreparedContent n=24 ms=0.162
name=posterCanvasMount n=24 ms=74.931
name=posterCanvasUnchangedPropsRerender n=24 ms=0.024
name=posterCanvasSelectedTextRerender n=24 ms=3.395
name=posterCanvasMapPanRerender n=24 ms=25.725
name=posterCanvasCardPositionRerender n=24 ms=3.090
name=posterCanvasGuestListSelectionRerender n=24 ms=1.679
name=posterCanvasGuestCardsSelectionRerender n=24 ms=1.608
```

## 验证与交付

- `git diff --check -- scripts/perf-canvas-bench.ts`：通过。
- `npm run perf:canvas`：退出码 0，新增及既有 23 条指标全部输出。
- 验收命令：`npm run perf:canvas`。
- 未改 UI/生产画布实现，未新增依赖，未创建 Git commit。
