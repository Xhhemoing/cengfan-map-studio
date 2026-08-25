# Round 10 结论简报

- **时间**: 2026-08-24
- **前置**: Round 9 BRIEF（199 files / 1658 tests）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **集成**: 主调度接线 `fixedPositions` → 生产 `poster-card-placement` + cache key；`tsc` app+node 0 error；全量 vitest **200 files / 1699 tests passed**

## 相对 Round 9

| 代理 | 项 | Round 9 | Round 10 |
| --- | --- | --- | --- |
| R10-fable-arch | 健康输入 | 卡高一律 180、无 connectors | `content-layout-objects.ts`：真实位置 + `prepareDestinationCards` 测高；连接线进 `checkLayoutHealth` |
| R10-fable-sota | 交付预览 | 出血只在文案 | 出血>0 时预览画出出血环与裁切标记；PosterCanvas viewBox 仍是成品框 |
| R10-opus-layout | 同层重叠 / 手拖 | 同 z 直接 continue；求解看不见手摆卡 | 同层仅 card-card 报 occlusion；`card-layout-pinned` + `fixedPositions` |
| R10-opus-data | 导入诚实 | 重复表头丢列；筛选空态称「良好」 | 主列空回落同名副列；质量面板区分筛选空与真健康；残缺映射行不再错位；否定「未出国」 |
| R10-gpt-perf | worker 阈值 | 24，无运输成本对照 | 运输 vs 求解对照；阈值仍 24（运输不是数量级问题） |
| R10-gpt-server | CORS | Allow-Headers 无请求 id | 加入 `X-Request-Id`；预检回归 |

## 主调度接线

opus-layout 的 `fixedPositions` 原先只在库内。已写入：

- `poster-card-placement.ts` 把 `project.cards.positions` 传给求解
- `createCardLayoutCacheKey` 包含固定坐标，避免拖拽命中旧缓存

## 纪律

- 未引入 Playwright / CMYK / ICC。
- 实现文件均 ≤400。
- JSON 415 未放宽。

## 仍未达印刷级 SOTA

- 无真浏览器 E2E；协作锁只保证单机；饱和压盖无法物理消除。
- `agent-session-tools` 健康输入仍可能用 180 / 无连接线（本轮允许路径外）。
- 连接线几何用地图中心作锚点近似，非各省份质心。
- 浏览器 PNG 仍为 sRGB。
