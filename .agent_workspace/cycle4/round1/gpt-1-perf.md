# 卡片排布性能探针报告

## 探针设置

- 测试文件：`src/lib/card-layout.perf.probe.test.ts`
- 命令：`npx vitest run src/lib/card-layout.perf.probe.test.ts`
- 输入：基于 `card-layout-test-fixtures.ts` 的 `bounds`，加入 3 个确定性的矩形 `occupiedPolygons`
- 卡片：固定种子生成 8 / 24 / 48 张；每组完全相同的输入调用 8 次，记录墙钟时间中位数
- 连接线交叉：固定种子生成 24 张卡，以 `straight` 样式求解后，逐对调用 `connectorGeometriesIntersect`
- 断言只检查耗时有限、非负以及求解不抛错；24 卡中位数超过 200ms 仅打印软告警，不作为 CI 硬门槛

## 本机结果

单位：ms。

| mode | 8 卡中位 | 24 卡中位 | 48 卡中位 | 24 卡 straight 交叉数 |
| --- | ---: | ---: | ---: | ---: |
| `quadrant` | 6.663 | 8.882 | 18.386 | 39 |
| `radial` | 4.320 | 6.362 | 16.423 | 9 |
| `right-stack` | 0.011 | 1.966 | 8.515 | 96 |
| `grid` | 0.006 | 0.018 | 0.041 | 78 |
| `proximity` | SKIP | SKIP | SKIP | SKIP |
| `columns` | SKIP | SKIP | SKIP | SKIP |

`adaptCardLayout`：SKIP；当前 `card-layout.ts` 未导出该函数。

本次 Vitest 汇总：1 个文件通过，16 个测试通过，9 个测试跳过，总测试阶段约 648ms。9 个跳过项由 `proximity` 4 项、`columns` 4 项和 `adaptCardLayout` 1 项组成。

## 观察与瓶颈猜测

1. `quadrant` / `radial` 在有 `occupiedPolygons` 时进入 `optimizedLayout`。候选轨道生成、每候选的连接线几何构造，以及候选与已放置连接线的逐对碰撞评分，是最可能的主要成本；两者明显慢于不走该优化路径的 `grid`。
2. `right-stack` 从 24 卡到 48 卡增幅较大。侧边容量不足后，`containFree` 的细网格扫描和最终合法性/重排检查可能成为主要成本。
3. `grid` 墙钟时间最低，但本输入有 78 个 straight 连接线交叉；当前旧实现尚未把“连接线禁止交叉”作为所有 mode 的硬约束。交叉数在探针中只记录，不以旧行为让 CI 失败。
4. 中位数规避了首次 JIT、缓存建立和系统调度造成的离群值；例如 `quadrant` 8 卡首样本为 29.030ms，但中位数为 6.663ms。

## 可重复性与 SKIP 判定

随机输入使用固定 LCG 种子，矩形环与 bounds 对象在同一进程内复用。mode 先检查 `scene-document.ts` 的 `CARD_LAYOUT_MODES`，再以一次受 `try/catch` 保护的空输入求解确认接受该值；未实现的 mode 用 `it.skipIf` 跳过。后续 `proximity` / `columns` 进入 `CARD_LAYOUT_MODES` 后会自动启用对应探针。`adaptCardLayout` 通过运行时导出检测，函数出现后会自动启用 24 卡、移动 1 张、8 次取中位的探针。
