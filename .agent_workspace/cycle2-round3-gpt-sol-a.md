MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 2 Round 3 — gpt-sol-A 地图平移性能复测

## 结论

- `npm run perf:canvas` 退出码为 0；本轮没有修改基准或生产代码。
- `posterCanvasMapPanRerender` 为 `20.133ms`（8 卡）和 `20.201ms`（24 卡）。
- 相对约 `21ms`，分别减少 `0.867ms`（`-4.1%`）和 `0.799ms`（`-3.8%`）；仍属于约 20–21ms 的同一量级，不能据单次进程内中位数认定显著加速。
- 相对 Cycle 2 Round 2 的 `20.697ms` / `21.011ms`，分别为 `-2.7%` / `-3.9%`。
- 本次运行时 HEAD 为 Round 3 调度提交 `a25991d`。`provincePolygons` 仍以 `project.map.x` / `project.map.y` 为 memo 依赖，并在每次平移时逐环调用投影与简化；尚未发现目标 polygon 仿射缓存落地，因此未执行 post-cache 二次复测。

## `npm run perf:canvas` 输出

```text
name=normalizeDisplayFrame n=1 ms=0.029
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.009
name=normalizeDisplayFrame n=50 ms=0.775
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.147
name=normalizeDisplayFrame n=200 ms=1.786
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.484
name=wrapCardText n=50 ms=0.068
name=wrapCardText n=200 ms=0.268
name=solveCardLayout_1500x1000 n=24 ms=10.664
name=solveCardLayout_2200x1400 n=60 ms=65.798
name=geoMercatorGeoPath n=34 ms=23.917
name=wrapCardTextPreparedContent n=8 ms=0.051
name=posterCanvasMount n=8 ms=67.533
name=posterCanvasUnchangedPropsRerender n=8 ms=0.049
name=posterCanvasSelectedTextRerender n=8 ms=0.902
name=posterCanvasMapPanRerender n=8 ms=20.133
name=posterCanvasCardPositionRerender n=8 ms=1.296
name=wrapCardTextPreparedContent n=24 ms=0.157
name=posterCanvasMount n=24 ms=77.743
name=posterCanvasUnchangedPropsRerender n=24 ms=0.023
name=posterCanvasSelectedTextRerender n=24 ms=0.720
name=posterCanvasMapPanRerender n=24 ms=20.201
name=posterCanvasCardPositionRerender n=24 ms=2.682
name=posterCanvasGuestListSelectionRerender n=24 ms=0.679
name=posterCanvasGuestCardsSelectionRerender n=24 ms=0.698
```

## 验收

- 命令：`npm run perf:canvas`
- 结果：成功，25 条指标均输出。
- 未创建 Git commit。
