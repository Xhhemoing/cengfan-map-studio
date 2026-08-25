# Round 2 性能复测 / 点亮探针（gpt-sol-1）

## 结论

- 已移除所有过时的 `skipIf`：六种 mode 的 8/24/48 卡性能与 24 卡交叉数探针全部执行，`adaptCardLayout` 直接从 `./card-layout` 导入并执行。
- `proximity`、`columns` 均以真实 24 卡求解结果和 `quadrant` 对照：`resultMode` 分别正确返回 `proximity`、`columns`，且两者 `matchesQuadrant=false`。
- 24 卡六种 mode 中位耗时均低于 200ms；相对 Round 1 有基线的项目没有任何一项变慢超过 2×。
- 24 卡 straight 仍有交叉的 mode：`columns`、`quadrant`、`radial`、`right-stack`、`grid`；只有 `proximity` 为 0。

## 性能结果

单位：ms；每格为 8 次求解的中位数。数字取自带 `--disableConsoleIntercept` 的同一目标探针复跑，以便保留探针日志。

| mode | 8 卡 | 24 卡 | 48 卡 | 24 卡相对 Round 1 |
| --- | ---: | ---: | ---: | --- |
| proximity | 0.977 | 3.101 | 10.070 | 3.8 → 3.101（0.82×，未变慢） |
| columns | 0.036 | 2.620 | 10.119 | 2.6 → 2.620（1.01×，未超过 2×） |
| quadrant | 6.024 | 7.905 | 18.858 | 9.2 → 7.905（0.86×，未变慢） |
| radial | 4.848 | 6.834 | 17.101 | Round 1 简报无基线 |
| right-stack | 0.020 | 2.044 | 8.890 | Round 1 简报无基线 |
| grid | 0.015 | 0.069 | 0.170 | Round 1 简报无基线 |

`adaptCardLayout` 24 卡中位：**0.119ms**；Round 1 为约 0.14ms，本轮为 0.85×，未变慢。

> 变慢超过 2× 的 mode：**无**。

## 24 卡 straight 连接线交叉

| mode | 交叉数 | 是否仍 > 0 |
| --- | ---: | --- |
| proximity | 0 | 否 |
| columns | 39 | **是** |
| quadrant | 39 | **是** |
| radial | 9 | **是** |
| right-stack | 96 | **是** |
| grid | 78 | **是** |

## 验证

执行用户指定命令：

```bash
npx vitest run src/lib/card-layout.perf.probe.test.ts
```

结果：`1 passed`，`28 passed (28)`，无 skip，进程退出码 0。为收集 `console.info` 数值另执行：

```bash
npx vitest run src/lib/card-layout.perf.probe.test.ts --disableConsoleIntercept
```

同样为 `1 passed`、`28 passed (28)`，退出码 0。24 卡 200ms 是报告/告警阈值；断言仅要求中位数有限、非负且 `<1000ms`，避免机器噪声造成硬红。
