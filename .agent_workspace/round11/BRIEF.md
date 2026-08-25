# Round 11 结论简报

- **时间**: 2026-08-24
- **前置**: Round 10 BRIEF（200 files / 1699 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: `tsc` app+node 0 error；全量 vitest **201 files / 1719 tests passed**

## 相对 Round 10

| 代理 | 项 | Round 10 | Round 11 |
| --- | --- | --- | --- |
| R11-fable-arch | Agent 健康 / 自动排版 | 假 180 单卡、无连接线；手摆会被打散 | `listContentLayoutIssues`；`fixedPositions` 钉住 |
| R11-fable-sota | 交付预览 a11y | 出血 overlay 存在 | 不可聚焦；窄屏 minmax 收缩；无动画依赖 |
| R11-opus-layout | 连接锚点 | 共用图心 | 34 省中心 + fitExtent 仿射；同锚花束仍豁免 |
| R11-opus-data | HTML 表 | 嵌套表截断外层行 | 栈式 token 扫描；内表网格可提升为行 |
| R11-gpt-perf | bench | 运输 vs 求解 | 钉扎坐标 cache-key 对照；不改 24 阈值 |
| R11-gpt-server | 协作 | join 无限流 | 公开 join 走房间限流器 |

## 纪律

- 未引入 Playwright / CMYK / ICC。
- `binary-import.ts` 正好 400 行。
- 产品路径不解析 geojson；省中心表由测试对照 geojson 防漂移。

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作锁只保证单机；饱和压盖无法物理消除。
- 连接线穿过其它卡片本体仍可能不报。
- 浏览器 PNG 仍为 sRGB。
