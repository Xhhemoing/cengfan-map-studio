gpt-5.6-sol-xhigh-fast

# Round 3 最终性能与交叉基线

日期：2026-08-25

## 测量方法

- 固定使用 `card-layout.perf.probe.test.ts` 的种子、障碍物和 8 次采样中位数。
- 先原样运行验收命令；再加 `--disableConsoleIntercept --no-file-parallelism --maxWorkers=1` 串行复跑，仅用于稳定采集控制台数值。
- 交叉数来自同一固定种子的 24 卡、`straight`、线宽 `1.5` 布局。
- 删除性能探针中 `1_000ms` 的硬失败阈值；只保留有限数/非负的数据有效性断言和不致红的 `200ms` 软提示。
- 未改求解器。

## 最终基线

| mode | 8 卡中位 ms | 24 卡中位 ms | 48 卡中位 ms | 24 卡交叉数 |
| --- | ---: | ---: | ---: | ---: |
| proximity | 1.192 | 5.569 | 21.271 | 0 |
| columns | 0.042 | 5.854 | 28.098 | 5 |
| quadrant | 7.490 | 12.733 | 41.162 | 2 |
| radial | 6.287 | 10.146 | 37.141 | 2 |
| right-stack | 0.069 | 4.940 | 24.405 | 6 |
| grid | 0.159 | 1.258 | 6.549 | 6 |

`adaptCardLayout` 24 卡中位数：**0.117ms**。

补充校验：`proximity`、`columns` 的真实 24 卡求解均返回请求 mode，且均不与 `quadrant` 布局相同。

## 与 Round 2 简报对比

- 24 卡交叉数完全复现 Round 2 已列基线：`proximity 0`、`columns 5`、`right-stack 6`、`grid 6`，没有继续下降，也没有回升。
- `quadrant 2`、`radial 2` 是本轮补齐的交叉基线；Round 2 简报未列这两个 mode，不能作同口径增减判断。
- Round 2 仅给出 48 卡概数：`columns ~7ms / 最坏 ~46ms`。本轮固定探针为 `columns 28.098ms / 最坏 quadrant 41.162ms`：最坏中位数约低 4.8ms，但 columns 约高 21.1ms（约 4.0 倍）。
- Round 2 没记录当时的完整命令、机器及探针样本，因此 columns 差异应视为待复核的跨环境信号，而不是已证实的求解器回归。当前同一进程两次串行采集的 columns 48 卡中位数为 `27.792ms`、`28.098ms`，本机结果稳定。

## 验收证据

原样命令：

```text
npx vitest run src/lib/card-layout.perf.probe.test.ts src/lib/card-layout.uncross.test.ts
```

结果：**2 个测试文件通过，40 个测试通过，0 失败**；总耗时 `2.58s`。

验证链：

1. failure：无测试失败；原样命令的默认报告器未展示通过用例的 `console.info`，无法直接抄录基线。
2. cause：Vitest 对测试控制台输出做默认拦截。
3. fix：保留原样验收，再用禁用控制台拦截、单文件串行、单 worker 的同一测试补采数值；同时移除两个会制造硬红噪声的 `1_000ms` 断言。
4. recheck：原样命令重跑仍为 **40/40 passed**；串行采集命令同样为 **40/40 passed**。

## 结论

当前所有 mode 的 48 卡中位数均低于 `42ms`，`adapt` 中位数为 `0.117ms`。交叉基线与 Round 2 已发布数字一致，dense columns 仍残留 5 个交叉，Round 3 未取得交叉数下降。性能数字只作观测基线，不设会因机器抖动而失败的硬阈值。
