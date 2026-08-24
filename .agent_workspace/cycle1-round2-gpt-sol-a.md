# Cycle 1 Round 2 — gpt-sol-A 性能探针报告

## 实现

- 保留 Round 1 全部 `name=... n=... ms=...` 行格式与既有探针。
- 新增确定性 PosterCanvas fixture：每个省 1 名可见学生，因此 N=8/24 时学生数与去向分组数都严格等于 N。
- 通过 Vite SSR loader 加载 `PosterCanvas` 与 `project-document`，`china.geojson?raw` 沿应用的 Vite 路径解析，没有从普通 Node/tsx 模块图错误导入 GeoJSON。
- jsdom 探针实际挂载完整 PosterCanvas：
  - `posterCanvasMount`：预热后 3 次挂载中位数，只计 `root.render`/React flush，不计校验与卸载。
  - `posterCanvasSelectedTextRerender`：保持同一 root/project/callback，只在 `null` 与 `text-title` 间切换 `selectedTextId`，预热后 7 次中位数。
  - `posterCanvasCardPositionRerender`：保持同一 root，其余数据不变，只切换北京市卡片位置，预热后 7 次中位数。
- 每次挂载校验实际 `data-destination-card` 数量；位置提交额外校验目标卡 transform 为 `translate(40 60)`。

## 与 Round 1 重叠项比较

| 指标 | Round 1 | Round 2 | 变化 |
| --- | ---: | ---: | ---: |
| `solveCardLayout(60)` | 64.4 ms | 65.839 ms | +2.2% |
| `geoMercatorGeoPath(34)` | 24.0 ms | 23.894 ms | -0.4% |
| `normalizeDisplayFrame(200)` | 2.0 ms | 1.811 ms | -9.5% |
| jsdom 24 卡渲染 | 首次约 879 ms | 预热挂载中位数 114.828 ms | -86.9% / 约 7.7× |

最后一项不是严格同口径：Round 1 记录的是首次渲染，本轮 `posterCanvasMount` 有一次不计时预热并复用布局缓存，因此只能作为 warm-cache 挂载基线，不能据此宣称渲染器本身提升 7.7×。本轮新增的同口径后续基线为：24 组仅选中态变更 3.933 ms，单卡位置变更 3.600 ms。

## `npm run perf:canvas` 最终成功输出

```text
> cengfan-map-studio@0.1.0 perf:canvas
> tsx scripts/perf-canvas-bench.ts

name=normalizeDisplayFrame n=1 ms=0.029
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.010
name=normalizeDisplayFrame n=50 ms=0.783
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.147
name=normalizeDisplayFrame n=200 ms=1.811
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.466
name=wrapCardText n=50 ms=0.067
name=wrapCardText n=200 ms=0.202
name=solveCardLayout_1500x1000 n=24 ms=10.791
name=solveCardLayout_2200x1400 n=60 ms=65.839
name=geoMercatorGeoPath n=34 ms=23.894
name=posterCanvasMount n=8 ms=101.409
name=posterCanvasSelectedTextRerender n=8 ms=2.148
name=posterCanvasCardPositionRerender n=8 ms=1.942
name=posterCanvasMount n=24 ms=114.828
name=posterCanvasSelectedTextRerender n=24 ms=3.933
name=posterCanvasCardPositionRerender n=24 ms=3.600
```

## 验证与故障证据链

1. 首次 benchmark 失败：Node 报 `.geojson` unknown extension。
2. 根因：fixture helper 从普通 tsx 模块图运行时导入 `project-document`，其迁移/搜索依赖最终到达 `map-data`。
3. 最小修复：helper 只构造静态学生数据；`project-document` 改由已有 Vite SSR server 加载。随后所有指标打印完成，但 React 卸载后的 scheduler 回调晚于 jsdom 全局还原，进程报 `window is not defined`。
4. 最小修复：在所有计时结束后等待一个 `setImmediate`，让 scheduler 回调在 jsdom 全局仍存在时排空。重跑同一 benchmark 后退出码为 0。

聚焦测试：

```text
 RUN  v4.1.10 /workspace

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  625ms (transform 95ms, setup 0ms, import 136ms, tests 7ms, environment 390ms)
```

验收命令：

```sh
npm run perf:canvas
npx vitest run src/lib/canvas-render-metrics.test.ts
```
