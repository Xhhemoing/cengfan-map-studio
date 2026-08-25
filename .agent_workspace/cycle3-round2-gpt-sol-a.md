MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 2 — pan / frozen-pan / recolor 基准复测

## 结论

- `npm run perf:canvas` 退出码为 0，29 条指标与行为守卫全部通过。
- 对比 Cycle 3 Round 1：

| 探针 | 卡片数 | Round 1 | Round 2 复测 | 差值 | 变化 |
| --- | ---: | ---: | ---: | ---: | ---: |
| pan | 8 | 9.123ms | 7.368ms | -1.755ms | -19.2% |
| pan | 24 | 7.975ms | 6.338ms | -1.637ms | -20.5% |
| frozen pan | 8 | 4.805ms | 4.799ms | -0.006ms | -0.1% |
| frozen pan | 24 | 5.855ms | 6.059ms | +0.204ms | +3.5% |
| province recolor | 8 | 4.117ms | 4.092ms | -0.025ms | -0.6% |
| province recolor | 24 | 5.294ms | 5.300ms | +0.006ms | +0.1% |

- unfrozen pan 的两档中位数均下降约 20%；frozen pan 与 recolor 基本持平。单进程 7 样本中位数仍只适合判断量级，不能单独证明统计显著性。
- 本次复测时，Cycle 3 Round 2 的 MapLayer 窄 memo 尚未落地。当前 `const MemoizedMapLayer = memo(MapLayer)` 来自更早的提交 `897a2a6`，且早于 Round 1 基线，因此不能把本次 pan 下降归因于本轮 MapLayer 改动。

## `npm run perf:canvas` 输出

```text
name=normalizeDisplayFrame n=1 ms=0.030
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.777
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.159
name=normalizeDisplayFrame n=200 ms=1.547
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.462
name=wrapCardText n=50 ms=0.068
name=wrapCardText n=200 ms=0.249
name=solveCardLayout_1500x1000 n=24 ms=10.937
name=solveCardLayout_2200x1400 n=60 ms=64.200
name=geoMercatorGeoPath n=34 ms=24.372
name=wrapCardTextPreparedContent n=8 ms=0.051
name=posterCanvasMount n=8 ms=68.682
name=posterCanvasUnchangedPropsRerender n=8 ms=0.049
name=posterCanvasSelectedTextRerender n=8 ms=1.018
name=posterCanvasMapPanRerender n=8 ms=7.368
name=posterCanvasFrozenMapPanRerender n=8 ms=4.799
name=posterCanvasProvinceRecolorRerender n=8 ms=4.092
name=posterCanvasCardPositionRerender n=8 ms=1.190
name=wrapCardTextPreparedContent n=24 ms=0.154
name=posterCanvasMount n=24 ms=69.503
name=posterCanvasUnchangedPropsRerender n=24 ms=0.024
name=posterCanvasSelectedTextRerender n=24 ms=0.724
name=posterCanvasMapPanRerender n=24 ms=6.338
name=posterCanvasFrozenMapPanRerender n=24 ms=6.059
name=posterCanvasProvinceRecolorRerender n=24 ms=5.300
name=posterCanvasCardPositionRerender n=24 ms=1.117
name=posterCanvasGuestListSelectionRerender n=24 ms=0.319
name=posterCanvasGuestCardsSelectionRerender n=24 ms=0.310
```

## 边界

- 未修改基准脚本或 metrics。
- 未切换分支，未创建 Git commit。
