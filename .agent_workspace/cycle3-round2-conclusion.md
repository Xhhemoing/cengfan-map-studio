# Cycle 3 《Round 2 结论简报》

**模型未降级。** 6 席全部完成：fable-A/B、opus-fast-A/B、gpt-sol-A/B。

## 演进对比

| 项 | Round 1 | Round 2 |
| --- | --- | --- |
| 24 卡 pan | ~6.2–8ms | **中位 ~4.2ms**（MapLayer 内容子树跳过 x/y） |
| MapLayer 单层 pan | ~2.38ms（Round 1 曾低估为 1–2ms） | **0.07ms** |
| flowContentStart | PosterCanvas 内联 reduce | `destinationCardFlowContentStart`，回退链逐字保留 |
| 布局 key 不变量 | affine 测试 | 再加碰撞/差异用例 |

MapLayer：外层 wrapper 只承载 `transform`；内层 `MapLayerContent = memo(…, contentPropsEqual)` 用跳过 `settings.x/y` 的逐键浅比较。子树禁止再读这两字段。换色路径不劣化。

`destinationCardFlowContentStart` 回退链保持 `block.style?.fontSize ?? (city ? max(9, fs−1) : fs)`，**未**换成 `cardFieldFontSize` / `fieldTypography`。

## 各席核销

| 席 | 项 | 结论 |
| --- | --- | --- |
| opus-fast-A | C3-R2-1 MapLayer 拆层 memo | 达标落地：单层 −2.31ms；端到端 pan@24 ≈ −2ms |
| fable-A | 门槛核验 + 剩余成本 | 独立复证达标；无 ≥1ms 残留杠杆；优化冻结 |
| opus-fast-B | C3-R2-2 flowContentStart | 逐字搬运 + 对拍测试 + 反内联守卫 |
| fable-B | C3-R2-2 合规核查 | 硬边界全部满足；C 项未被顺手越过 |
| gpt-sol-A | 复测 | 在 memo **落地前**测到 pan@24 6.338ms（−20% vs R1，不可归因本轮 memo） |
| gpt-sol-B | C3-R2-3 | `card-layout-cache.invariants.cycle3.test.ts` 3/3 绿 |

终局数字链（pan@24 中位）：21 → 10 → 6.2 → **4.2ms**。

## 边界风险

- 跨运行 bench 噪声 ±0.5–1.7ms，大于剩余单项；无新的 ≥1ms 杠杆。
- gpt-sol-A 的 6.338ms 与 fable-A 稳定树 4.18ms 不是同一快照；以 memo 落地后中位为准。
- `scripts/perf-canvas-bench.ts` ~185 行的 `preparedFieldFontSize` 走的是 **typography 优先** 的 prepared-wrap 链，不是 flow 游标；Round 3 核对后决定是否动。
- 调用方不变量「centered 多边形必须恰为 occupiedPolygons 平移原点之逆」仍无运行时锁。

## Round 3 冻结（只固化不新增优化）

1. **优化冻结。** 不做 C3-R2-4（其余 defs 跨实例 id）。禁止新 perf 立项。
2. 定向测试 + lint；验收线（中位，24 卡）：**pan ≤6.0 / frozen ≤5.5 / recolor ≤6.5 ms**。
3. bench 若确有 flow 游标副本才与 metrics 对齐；prepared-wrap 链不得误换成无 typography 的 flow 回退。
4. 禁止：复活展示框工作台、clamp 冻结坐标、虚拟化、改 `data-*`、动求解器、`MapLayerContent` 子树读 `settings.x/y`。
5. 父调度器分批提交本轮实现（flowContentStart / 不变量测试 / MapLayer memo / 报告），Cycle 1–3 R1 已在历史上提交，并非「全部零 commit」。
