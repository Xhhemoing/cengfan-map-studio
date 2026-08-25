MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 3 FINAL freeze — MapLayer memo 后性能复测

## 快照确认

- 分支保持为 `cursor/canvas-render-display-46a1`。测量开始时 HEAD 为 `91cc75bd1017b57195c89e9a3e2d5021a3107494`；期间另一并发席位仅提交了 `.agent_workspace/PROGRESS.md`，最终 HEAD 为 `d43631ce127acc4eb6ff29756df701131b0b205c`，未改变被测代码。
- 测量前与结束后执行 `git merge-base --is-ancestor 96a7652 HEAD` 均为退出码 0，确认本次测量发生在 `96a7652` 之后。
- 当前 `MapLayer.tsx` 存在 `MapLayerContent = memo(...)`、`settingsEqualIgnoringOrigin` 与外层 `<MapLayerContent ... />`，确认 inner-content memo 拆层已经落地。
- 未改基准 metric 定义；连续运行两次 `npm run perf:canvas`，均退出码 0。两次 pan@24 相差 0.248ms，未超过 1.5ms，故按规则无需第三次。
- 复测结束后的状态检查发现另一并发席位给 `scripts/perf-canvas-bench.ts` 增加了两行说明注释；只读 diff 确认没有可执行代码或 metric 定义变化，因此不影响两遍结果。

## 两遍结果的中位数

以下取两遍运行值的中位数；两个样本时即排序后两值的中点。

| 指标 | n=8 | n=24 |
| --- | ---: | ---: |
| `posterCanvasMapPanRerender` | **3.656ms** | **3.959ms** |
| `posterCanvasFrozenMapPanRerender` | **2.487ms** | **3.456ms** |
| `posterCanvasProvinceRecolorRerender` | **4.665ms** | **5.128ms** |

其他要求的 @24 中位数：

| 指标 | n=24 中位数 |
| --- | ---: |
| `posterCanvasMount` | **73.738ms** |
| `posterCanvasSelectedTextRerender` | **0.706ms** |
| `posterCanvasCardPositionRerender` | **2.321ms** |

## 验收与 Round 2 对比

| @24 指标 | 本轮中位数 | 验收线 | 余量 | 判定 | Round 2 fable-A 稳定树 | 差值 |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| pan | **3.959ms** | ≤6.0ms | 2.041ms | PASS | ~4.18ms | -0.221ms (-5.3%) |
| frozen pan | **3.456ms** | ≤5.5ms | 2.044ms | PASS | ~3.63ms | -0.174ms (-4.8%) |
| recolor | **5.128ms** | ≤6.5ms | 1.372ms | PASS | ~5.43ms | -0.302ms (-5.6%) |

Round 2 gpt-sol-A 在 memo 落地前测得 pan@24 = 6.338ms；本轮 memo 后为 3.959ms，下降 **2.379ms（37.5%）**。本轮三项 @24 均通过 FINAL freeze 验收线，也与 fable-A 的稳定树量级一致。

## failure → cause → fix → recheck

- **Failure：** 两遍均无退出失败、验收失败或并行负载离群；recolor@24 分别为 5.051ms / 5.204ms，未出现约 17ms 的异常值。
- **Cause 检查：** pan@24 分别为 3.835ms / 4.083ms，差值仅 0.248ms；其余目标指标同样处于稳定量级，无并行负载污染证据。结束时新出现的 bench 脚本工作树 diff 经检查仅为注释，不改变运行语义。
- **Fix：** 无代码或 metric 修改；无运行需要作废。
- **Recheck：** 第二遍完整复测退出码 0，三项 @24 继续全部达线；按“差异 >1.5ms 才跑第三遍”的规则停止。

## 完整 bench stdout

### Run 1

```text

> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.030
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.768
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.152
name=normalizeDisplayFrame n=200 ms=2.632
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.475
name=wrapCardText n=50 ms=0.067
name=wrapCardText n=200 ms=0.211
name=solveCardLayout_1500x1000 n=24 ms=10.987
name=solveCardLayout_2200x1400 n=60 ms=65.221
name=geoMercatorGeoPath n=34 ms=23.333
name=wrapCardTextPreparedContent n=8 ms=0.051
name=posterCanvasMount n=8 ms=65.173
name=posterCanvasUnchangedPropsRerender n=8 ms=0.046
name=posterCanvasSelectedTextRerender n=8 ms=0.935
name=posterCanvasMapPanRerender n=8 ms=3.924
name=posterCanvasFrozenMapPanRerender n=8 ms=2.384
name=posterCanvasProvinceRecolorRerender n=8 ms=4.692
name=posterCanvasCardPositionRerender n=8 ms=1.341
name=wrapCardTextPreparedContent n=24 ms=0.155
name=posterCanvasMount n=24 ms=70.853
name=posterCanvasUnchangedPropsRerender n=24 ms=0.023
name=posterCanvasSelectedTextRerender n=24 ms=0.705
name=posterCanvasMapPanRerender n=24 ms=3.835
name=posterCanvasFrozenMapPanRerender n=24 ms=3.392
name=posterCanvasProvinceRecolorRerender n=24 ms=5.051
name=posterCanvasCardPositionRerender n=24 ms=2.317
name=posterCanvasGuestListSelectionRerender n=24 ms=0.675
name=posterCanvasGuestCardsSelectionRerender n=24 ms=0.675
```

### Run 2

```text

> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.031
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.773
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.147
name=normalizeDisplayFrame n=200 ms=1.844
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.476
name=wrapCardText n=50 ms=0.067
name=wrapCardText n=200 ms=0.243
name=solveCardLayout_1500x1000 n=24 ms=10.709
name=solveCardLayout_2200x1400 n=60 ms=65.286
name=geoMercatorGeoPath n=34 ms=23.660
name=wrapCardTextPreparedContent n=8 ms=0.051
name=posterCanvasMount n=8 ms=70.009
name=posterCanvasUnchangedPropsRerender n=8 ms=0.048
name=posterCanvasSelectedTextRerender n=8 ms=0.980
name=posterCanvasMapPanRerender n=8 ms=3.388
name=posterCanvasFrozenMapPanRerender n=8 ms=2.589
name=posterCanvasProvinceRecolorRerender n=8 ms=4.638
name=posterCanvasCardPositionRerender n=8 ms=1.347
name=wrapCardTextPreparedContent n=24 ms=0.155
name=posterCanvasMount n=24 ms=76.623
name=posterCanvasUnchangedPropsRerender n=24 ms=0.024
name=posterCanvasSelectedTextRerender n=24 ms=0.707
name=posterCanvasMapPanRerender n=24 ms=4.083
name=posterCanvasFrozenMapPanRerender n=24 ms=3.519
name=posterCanvasProvinceRecolorRerender n=24 ms=5.204
name=posterCanvasCardPositionRerender n=24 ms=2.325
name=posterCanvasGuestListSelectionRerender n=24 ms=0.685
name=posterCanvasGuestCardsSelectionRerender n=24 ms=0.670
```

## 边界

- 本席仅新增本报告文件；未修改 `MapLayer.tsx`、UI、bench 脚本或 metric 定义。
- 未 checkout、stash、commit、push 或创建分支。
