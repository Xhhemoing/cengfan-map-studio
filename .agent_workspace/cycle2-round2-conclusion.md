# Cycle 2 《Round 2 结论简报》

**模型未降级。** 六路 slug 与配置一致。

## 演进对比

| 项 | Round 1 结束 | Round 2 |
| --- | --- | --- |
| lib→component 类型倒挂 | `prepared-card-content` import DestinationCard | 类型沉到 lib，组件再导出 |
| 全冻结平移 | 仍跑 `solveCardLayout`（结果被 positions 覆盖） | `layoutRequest=null`，立即用冻结坐标 |
| 行高 | solver 对 city 字段 −1，画布正文用全量字号 | 统一为画布语义；city-only fs=16 高度 77→78 |
| photo +32 | 疑似正文漏偏 | 正文不缩进是设计（头像在 body 之上）；真残差是 titleWidth 未减 headerOffset |
| 连接线 ink | 无 seed | `feTurbulence seed="1"` |
| emblem 拖拽 | `:scope > path` | 专项测试绿 |

## 边界风险

- 冻结路径**不 clamp**：map 滑过时卡片相对画布不动，这是 freeze 语义。缺一省坐标则整表回退求解。
- 平移 ~21ms 在 8 卡与 24 卡几乎相同 → 主成本是 **provincePolygons 全量重投影**（~18ms），不是解算（冻结后已跳过）。

## SOTA 差距 → Round 3

1. **P0** 地图基几何仿射缓存：pan 时不要对 34 省重跑 projection。
2. **P1** `PosterCanvas.cardStyle.rowHeight` 内联公式改为调用 metrics；photo `titleWidth` 减 headerOffset（视觉批，需测试）。
3. **P2** flow 标题 lineHeight 求解 vs 渲染分叉（S5）；过时「44 字面量」注释/空转扫描测试清理。
4. 禁止：复活展示框工作台、clamp 冻结坐标、虚拟化。
