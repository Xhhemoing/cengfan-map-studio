MODEL: gpt-5.6-sol-xhigh-fast

# Cycle 3 Round 1 — frozen-pan / recolor 基准补位

## 结论

- `scripts/perf-canvas-bench.ts` 新增两个同 root 重渲染探针：
  - `posterCanvasFrozenMapPanRerender`：先通过 `onCardPositionsResolved` 捕获实际求解位置，再在全部卡片已冻结的项目与其 `map.x + 16` 版本间切换；计时外校验地图位移生效且卡片 transform 完全不动。
  - `posterCanvasProvinceRecolorRerender`：仅将北京市切换为 `manual-color`；计时外校验目标省份 fill 生效且卡片数不变。
- 最终 `npm run perf:canvas` 成功，新增探针为：
  - frozen pan：`4.805ms`（8 卡）/ `5.855ms`（24 卡）。
  - province recolor：`4.117ms`（8 卡）/ `5.294ms`（24 卡）。
- unfrozen pan 为 `9.123ms`（8 卡）/ `7.975ms`（24 卡）。对 Cycle 2 Round 3 的 `8.733ms` / `10.203ms`，8 卡 `+0.390ms`（`+4.5%`，同量级），24 卡 `-2.228ms`（`-21.8%`）。
- 同轮并发生产改动在首次运行后落地，因此首次运行只是中间快照：recolor 曾为 `11.180ms` / `12.435ms`，最终为 `4.117ms` / `5.294ms`（分别 `-63.2%` / `-57.4%`）。这与 `centeredProvincePolygons` 从整个 `provinceStyles` 依赖改为派生可见性依赖一致。
- 单进程 7 样本中位数只能用于量级比较，不能单独证明统计显著性。

## 最终 `npm run perf:canvas` 输出

```text
name=normalizeDisplayFrame n=1 ms=0.030
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.813
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.193
name=normalizeDisplayFrame n=200 ms=1.769
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.536
name=wrapCardText n=50 ms=0.066
name=wrapCardText n=200 ms=0.238
name=solveCardLayout_1500x1000 n=24 ms=10.607
name=solveCardLayout_2200x1400 n=60 ms=65.033
name=geoMercatorGeoPath n=34 ms=24.437
name=wrapCardTextPreparedContent n=8 ms=0.055
name=posterCanvasMount n=8 ms=76.089
name=posterCanvasUnchangedPropsRerender n=8 ms=0.047
name=posterCanvasSelectedTextRerender n=8 ms=0.979
name=posterCanvasMapPanRerender n=8 ms=9.123
name=posterCanvasFrozenMapPanRerender n=8 ms=4.805
name=posterCanvasProvinceRecolorRerender n=8 ms=4.117
name=posterCanvasCardPositionRerender n=8 ms=1.215
name=wrapCardTextPreparedContent n=24 ms=0.159
name=posterCanvasMount n=24 ms=73.965
name=posterCanvasUnchangedPropsRerender n=24 ms=0.024
name=posterCanvasSelectedTextRerender n=24 ms=0.694
name=posterCanvasMapPanRerender n=24 ms=7.975
name=posterCanvasFrozenMapPanRerender n=24 ms=5.855
name=posterCanvasProvinceRecolorRerender n=24 ms=5.294
name=posterCanvasCardPositionRerender n=24 ms=1.182
name=posterCanvasGuestListSelectionRerender n=24 ms=0.332
name=posterCanvasGuestCardsSelectionRerender n=24 ms=0.320
```

## 验收与边界

- `npm run perf:canvas`：退出码 0，29 条指标输出；两个新增探针的行为守卫均通过。
- `git diff --check`：通过。
- 定向 ESLint 返回退出码 0，但提示该脚本不在 ESLint 配置匹配范围内，不能作为 lint 覆盖证据。
- 未修改 `canvas-render-metrics*`；探针可直接复用现有项目 fixture，无需扩展公共 fixture API。
- 未切换分支，未创建 Git commit。
