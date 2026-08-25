# Cycle 1 Round 1 — Canvas / Display-frame 性能基线

- 模型：`gpt-5.6-sol-xhigh-fast`
- 环境：Linux x64，Node `v22.14.0`，4 vCPU（Intel Xeon Processor）
- 入口：`npm run perf:canvas`
- 计时口径：fixture 构建不计时；每项先预热 1 次，再取 7 次中位数（layout 与地图取 5 次中位数）。
- 注意：这是同机微基准，适合后续轮次做相对比较，不代表完整 React 提交耗时。

## 基线输出

本轮只执行一次完整 benchmark，原始输出如下：

```text
name=normalizeDisplayFrame n=1 ms=0.036
name=deriveFixedDisplayFrameFromCardSettings n=1 ms=0.018
name=normalizeDisplayFrame n=50 ms=0.998
name=deriveFixedDisplayFrameFromCardSettings n=50 ms=0.239
name=normalizeDisplayFrame n=200 ms=2.009
name=deriveFixedDisplayFrameFromCardSettings n=200 ms=0.479
name=wrapCardText n=50 ms=0.067
name=wrapCardText n=200 ms=0.256
name=solveCardLayout_1500x1000 n=24 ms=10.148
name=solveCardLayout_2200x1400 n=60 ms=64.432
name=geoMercatorGeoPath n=34 ms=24.024
```

`n` 分别表示批量 frame/card settings 数、姓名数、layout 卡片数或地图 feature 数。Layout fixture 包含两个 occupied map area；地图项包含 `geoMercator().fitExtent` 和 34 个 feature 的 `geoPath` 生成，但不包含已缓存的 GeoJSON 解析。

## 观察到的瓶颈

1. `solveCardLayout` 是当前最明显的 CPU 热点：60 卡达到 `64.432ms`，显著超过单帧 `16.7ms` 预算；24 卡也已占 `10.148ms`。两个 case 的画布尺寸不同，不能只归因为卡片数，但结果明确显示 occupied-area 布局在大场景下有较强扩展压力。
2. 每次重建地图 projection 并生成全部 path 需要 `24.024ms`。现有渲染必须继续保证 projection/path memo 边界稳定，避免普通文本、卡片或选中态更新触发重算。
3. 展示框纯数据处理不是首要瓶颈：200 个 frame normalization 为 `2.009ms`，legacy settings 派生为 `0.479ms`。
4. 纯文本换行也较轻：200 个姓名为 `0.256ms`。后续更值得测量的是 React/SVG 节点创建与提交，而不是单独优化该纯函数。

## 下一轮建议探针

- 用 jsdom + React Profiler 测 25/50/100/200 个 destination cards 的首次渲染，以及只改选中态、文本、单卡位置时的重复提交。
- 记录拖拽期间 `PosterCanvas`、地图层、connector 层、destination-card 层的 render/commit 次数，验证 memo 边界而不只看总耗时。
- 把地图 case 拆成 `fitExtent`、path string、bounds/centroid 三项，并增加 `getChinaMapFeatures` 冷启动解析与缓存命中对比。
- 测 layout worker 的序列化、消息往返、cache hit/miss，并分别覆盖 occupied AABB 与 occupied polygon。
- 增加 fixed/flow 展示框的实际 SVG 节点渲染基准，覆盖自定义文字、装饰项、逐字段 typography。

## 验证与故障闭环

- `npx vitest run src/lib/canvas-render-metrics.test.ts src/lib/display-frame.test.ts`：2 files / 11 tests 全部通过。
- `npx eslint src/lib/canvas-render-metrics.ts src/lib/canvas-render-metrics.test.ts`：通过。
- 初次直接用 `tsx` 导入 `map-data.ts` 失败：Node 不识别 `china.geojson?raw` 的 `.geojson` 扩展。根因是该 public lib 依赖 Vite raw-asset 转换；benchmark 改用 Vite SSR loader 解析同一模块。独立复查得到 34 个 feature，随后完整 benchmark 成功。
- 验收：在同类机器运行上述测试命令和 `npm run perf:canvas`；比较机器可读行的同名 `ms`，并确认所有行均存在。
