# Cycle 2 《Round 3 结论简报》

**模型未降级。** Cycle 2 三轮闭环完成。

## 本轮落地

- **省界仿射缓存：** 投影+简化相对地图中心做一次；pan 只加 `originX/Y`。碰撞 key 字节级一致。24 卡平移 **~20.2ms → ~10.2ms（约 -50%）**，投影调用在 pan 上为零。
- **行高：** `cardStyle.rowHeight` 走 `destinationCardFixedRowHeight`；禁止 canvas 重内联公式。
- **photo 标题宽** 减 `headerOffset`；正文宽度不变。
- **flow 标题** 行距用画布 `lineHeight` 倍率。

## Cycle 2 相对 Cycle 1

| | Cycle 1 末 | Cycle 2 末 |
| --- | --- | --- |
| 平移重渲染 | ~21ms（含求解+重投影） | ~10ms（冻结则跳求解；投影归零） |
| wrap 与 pan | 已解耦 | 保持 |
| PosterCanvas | ~830–1158 行 | ~912 行（仿射 memo 略增） |

视觉批（须可回滚）：city-only 高度可能 +1px；photo 长标题更早换行；flow 多行标题行距随文档倍率。

## Cycle 3 开刀

1. **P0** 布局 `polygonsKey`：pan 产生新数组导致 WeakMap miss、全 ring stringify（3–5ms）。应对 centered 几何做 key、offset 不进 JSON。
2. **P1** 仅换省色不要重投影；bench 补 frozen-pan / 换色场景。
3. **P2** 几何下沉 `src/lib`；`filterPrefix`；flow 块字号叉（已接受可不做）。
4. 禁止：复活展示框工作台、clamp 冻结坐标、虚拟化。
