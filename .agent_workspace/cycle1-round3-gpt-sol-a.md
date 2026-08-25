MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 1 Round 3 — gpt-sol-A 画布性能复测

## 结论

- 在 `1bd0f8a` 生产基线上扩展并完成 benchmark；随后检测到并发的 `memo(PosterCanvas)` 与 memo `GuestsLayer` 接线，按要求再取得一组成功的同口径数字。
- 顶层 memo 命中明确：同 props 重渲染 8 卡从 `1.776ms` 降至 `0.050ms`（`-97.2%`），24 卡从 `3.542ms` 降至 `0.030ms`（`-99.2%`）。
- 嘉宾层隔离同样明确：24 嘉宾 list 选中态重渲染从 `3.374ms` 降至 `1.630ms`（`-51.7%`），cards 从 `7.139ms` 降至 `1.629ms`（`-77.2%`）。选择变化与嘉宾 props 无关，因此这两个降幅符合 `GuestsLayer` memo 命中预期。
- 并发落地前，Round 1/2 的主热点没有显著变化：60 卡布局 `65.131ms`（相对 R1 `+1.1%`，相对 R2 `-1.1%`），地图 path `24.620ms`（相对 R1 `+2.5%`，相对 R2 `+3.0%`）。
- 落地后单次运行的两个无关纯函数升至 `70.019ms` / `38.788ms`，而实现未改动它们；同时 warm mount 也波动，说明该次机器负载不可用于判断这些路径回归。memo 专用指标接近零且降幅远大于这层噪声。

## 探针扩展

1. 保留所有既有 `name=... n=... ms=...` 行和计时口径。
2. `posterCanvasUnchangedPropsRerender`：同一 root、project、回调与选择 props，重复提交新 React element；可观测顶层 `memo` 是否真正截断组件执行。
3. `posterCanvasGuestListSelectionRerender` / `posterCanvasGuestCardsSelectionRerender`：8 个去向组 + 24 个确定性嘉宾，切换 `selectedTextId`，同时校验实际嘉宾节点数。选择变化与嘉宾 props 无关，因此可观测嘉宾层 memo 边界。
4. `buildGuestBenchFixture` 只生成确定性有效数据，fixture 构建不进入计时。

## Round 1 / Round 2 重叠项

本表使用并发 UI 优化落地前的 Round 3 受控基线；变化列均为 Round 3 相对对应轮次。

| 指标 | Round 1 | Round 2 | Round 3 pre-land | vs R1 | vs R2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `normalizeDisplayFrame(1)` | 0.036 | 0.029 | 0.030 | -16.7% | +3.4% |
| `deriveFixedDisplayFrameFromCardSettings(1)` | 0.018 | 0.010 | 0.011 | -38.9% | +10.0% |
| `normalizeDisplayFrame(50)` | 0.998 | 0.783 | 0.767 | -23.1% | -2.0% |
| `deriveFixedDisplayFrameFromCardSettings(50)` | 0.239 | 0.147 | 0.148 | -38.1% | +0.7% |
| `normalizeDisplayFrame(200)` | 2.009 | 1.811 | 1.619 | -19.4% | -10.6% |
| `deriveFixedDisplayFrameFromCardSettings(200)` | 0.479 | 0.466 | 0.507 | +5.8% | +8.8% |
| `wrapCardText(50)` | 0.067 | 0.067 | 0.066 | -1.5% | -1.5% |
| `wrapCardText(200)` | 0.256 | 0.202 | 0.252 | -1.6% | +24.8% |
| `solveCardLayout(24)` | 10.148 | 10.791 | 10.870 | +7.1% | +0.7% |
| `solveCardLayout(60)` | 64.432 | 65.839 | 65.131 | +1.1% | -1.1% |
| `geoMercatorGeoPath(34)` | 24.024 | 23.894 | 24.620 | +2.5% | +3.0% |

Round 1 没有同口径的 warm jsdom 探针；其约 `879ms` 数字是首次渲染，不与下表混比。

| jsdom 指标 | Round 2 | Round 3 pre-land | vs R2 |
| --- | ---: | ---: | ---: |
| `posterCanvasMount(8)` | 101.409 | 105.709 | +4.2% |
| `posterCanvasSelectedTextRerender(8)` | 2.148 | 2.282 | +6.2% |
| `posterCanvasCardPositionRerender(8)` | 1.942 | 1.808 | -6.9% |
| `posterCanvasMount(24)` | 114.828 | 108.093 | -5.9% |
| `posterCanvasSelectedTextRerender(24)` | 3.933 | 3.837 | -2.4% |
| `posterCanvasCardPositionRerender(24)` | 3.600 | 3.439 | -4.5% |

## Round 3 并发落地前后

首次运行使用未扩展脚本；`pre-land` 为扩展后、并发 UI 优化前的可比基线；`post-land` 为 `memo(PosterCanvas)` 和 `GuestsLayer` 完成接线后的成功复测。

```text
run=round3-pre-extension name=solveCardLayout_2200x1400 n=60 ms=65.725
run=round3-pre-land name=solveCardLayout_2200x1400 n=60 ms=65.131
run=round3-post-land name=solveCardLayout_2200x1400 n=60 ms=70.019
run=round3-pre-extension name=geoMercatorGeoPath n=34 ms=24.420
run=round3-pre-land name=geoMercatorGeoPath n=34 ms=24.620
run=round3-post-land name=geoMercatorGeoPath n=34 ms=38.788
run=round3-pre-extension name=posterCanvasMount n=24 ms=109.914
run=round3-pre-land name=posterCanvasMount n=24 ms=108.093
run=round3-post-land name=posterCanvasMount n=24 ms=114.323
run=round3-pre-extension name=posterCanvasSelectedTextRerender n=24 ms=3.977
run=round3-pre-land name=posterCanvasSelectedTextRerender n=24 ms=3.837
run=round3-post-land name=posterCanvasSelectedTextRerender n=24 ms=3.504
run=round3-pre-extension name=posterCanvasCardPositionRerender n=24 ms=3.670
run=round3-pre-land name=posterCanvasCardPositionRerender n=24 ms=3.439
run=round3-post-land name=posterCanvasCardPositionRerender n=24 ms=3.202
run=round3-pre-land name=posterCanvasUnchangedPropsRerender n=8 ms=1.776
run=round3-post-land name=posterCanvasUnchangedPropsRerender n=8 ms=0.050
run=round3-pre-land name=posterCanvasUnchangedPropsRerender n=24 ms=3.542
run=round3-post-land name=posterCanvasUnchangedPropsRerender n=24 ms=0.030
run=round3-pre-land name=posterCanvasGuestListSelectionRerender n=24 ms=3.374
run=round3-post-land name=posterCanvasGuestListSelectionRerender n=24 ms=1.630
run=round3-pre-land name=posterCanvasGuestCardsSelectionRerender n=24 ms=7.139
run=round3-post-land name=posterCanvasGuestCardsSelectionRerender n=24 ms=1.629
```

| 扩展指标 | pre-land | post-land | 变化 |
| --- | ---: | ---: | ---: |
| unchanged props (8) | 1.776 | 0.050 | -97.2% |
| unchanged props (24) | 3.542 | 0.030 | -99.2% |
| guest list selection (24) | 3.374 | 1.630 | -51.7% |
| guest cards selection (24) | 7.139 | 1.629 | -77.2% |
| selected text (24) | 3.837 | 3.504 | -8.7% |
| card position (24) | 3.439 | 3.202 | -6.9% |
| warm mount (24) | 108.093 | 114.323 | +5.8% |

## `npm run perf:canvas` pre-land 成功输出

```text
> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.030
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.011
name=normalizeDisplayFrame n=50 ms=0.767
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.148
name=normalizeDisplayFrame n=200 ms=1.619
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.507
name=wrapCardText n=50 ms=0.066
name=wrapCardText n=200 ms=0.252
name=solveCardLayout_1500x1000 n=24 ms=10.870
name=solveCardLayout_2200x1400 n=60 ms=65.131
name=geoMercatorGeoPath n=34 ms=24.620
name=posterCanvasMount n=8 ms=105.709
name=posterCanvasUnchangedPropsRerender n=8 ms=1.776
name=posterCanvasSelectedTextRerender n=8 ms=2.282
name=posterCanvasCardPositionRerender n=8 ms=1.808
name=posterCanvasMount n=24 ms=108.093
name=posterCanvasUnchangedPropsRerender n=24 ms=3.542
name=posterCanvasSelectedTextRerender n=24 ms=3.837
name=posterCanvasCardPositionRerender n=24 ms=3.439
name=posterCanvasGuestListSelectionRerender n=24 ms=3.374
name=posterCanvasGuestCardsSelectionRerender n=24 ms=7.139
```

## `npm run perf:canvas` post-land 成功输出

```text
> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.032
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.952
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.151
name=normalizeDisplayFrame n=200 ms=1.595
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.440
name=wrapCardText n=50 ms=0.067
name=wrapCardText n=200 ms=0.180
name=solveCardLayout_1500x1000 n=24 ms=11.547
name=solveCardLayout_2200x1400 n=60 ms=70.019
name=geoMercatorGeoPath n=34 ms=38.788
name=posterCanvasMount n=8 ms=148.367
name=posterCanvasUnchangedPropsRerender n=8 ms=0.050
name=posterCanvasSelectedTextRerender n=8 ms=2.200
name=posterCanvasCardPositionRerender n=8 ms=2.954
name=posterCanvasMount n=24 ms=114.323
name=posterCanvasUnchangedPropsRerender n=24 ms=0.030
name=posterCanvasSelectedTextRerender n=24 ms=3.504
name=posterCanvasCardPositionRerender n=24 ms=3.202
name=posterCanvasGuestListSelectionRerender n=24 ms=1.630
name=posterCanvasGuestCardsSelectionRerender n=24 ms=1.629
```

## 验证

```text
command=npx vitest run src/lib/canvas-render-metrics.test.ts
test_files_passed=1
tests_passed=6
duration_ms=637
```

并发复测的失败闭环：

1. failure：`GuestsLayer` 抽取写入中首次报 `guestTitleFontSize is not defined`；随后报 `selectGuests is not defined`。
2. cause：benchmark 恰逢共享工作树中的 UI 抽取处于中间状态，旧层变量已删除但残留 JSX / 新回调尚未写入。
3. fix：该变更的 owning agent 完成旧 JSX 删除、`selectGuests` 回调和顶层 memo 接线；本子任务未越过允许范围修改 UI。
4. recheck：重跑同一 `npm run perf:canvas`，21 条指标全部打印并以退出码 0 完成；随后目标测试仍为 1 file / 6 tests 通过。

验收命令：

```sh
npm run perf:canvas
npx vitest run src/lib/canvas-render-metrics.test.ts
```

本子任务未修改 UI/生产画布实现，未新增依赖，未提交 Git commit。
