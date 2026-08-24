# Cycle 1 《Round 2 结论简报》

**模型未降级。** slug：`claude-fable-5-thinking-xhigh` ×2、`claude-opus-5-thinking-high-fast` ×2、`gpt-5.6-sol-xhigh-fast` ×2。

相对 Round 1：P0-1～P0-4 与 P1-1 已在 `ce8f11b` 落地；布局求解耗时几乎不变（60 卡 ~66ms）；jsdom 选中态重渲染 ~3.9ms、单卡位移 ~3.6ms。

## 演进对比

| 项 | Round 1 | Round 2 |
| --- | --- | --- |
| App→画布回调 | 每次新闭包，击穿层 memo | latest-ref + `useCallback([])`，三处 PosterCanvas 挂载点 |
| 布局 pending | `result: null`，卡片闪没 | stale-while-revalidate，保留上一帧 |
| 模板切回标准 | `presentation` 残留 pill | `applyCardTemplate` 显式 `"standard"` |
| 参考卡长文本 | `textFor` 拍成单行 | `ReferenceCardVisual` 逐行 `<text>` |
| DestinationCard 绘制 | 私有三元 | 接入 `display-frame-style` 解析层 |
| PosterCanvas 行数 | ~1560 | ~1470（抽出 reference） |

## 潜在边界风险

- SWR pending 期：新省份卡暂缺席；旧 placement 尺寸与新 rows 可能短暂错位；`onCardPositionsResolved` 上报所见布局（冻结语义，需注记测试）。
- 导出 SVG 字节变化：`font-weight="400"`、`opacity="1"` 等显式化；reference 卡 `<text>` 增多。像素应等价，禁止 golden 整段 SVG。
- frame 级 `align` 现级联到 fixed 字段行：老文档若存 `align:"center"` 会改像素——Round 3 补锁定测试并写进交付说明。
- `memo(PosterCanvas)` 仍未做：回调稳定后 1470 行组件体与每卡 connector 仍随 App 重跑。

## SOTA 验收差距（Round 3）

1. **R3-1** `memo(PosterCanvas)` + 集成渲染计数（无关 state 不重跑画布）。
2. **R3-2** 抽出 `GuestsLayer` + `guest-panel-layout` 纯函数（优先于 connectors）。
3. **R3-3** MapLayer 投影/path 串缓存。
4. **样式** glass-stat 透明度钳制；reference 行距不乘 canvas `lineHeight`；硬编码色板；flow 模式未接 align；`resolveDisplayFrameBlockPaint` 无生产消费者。
5. **导出契约测试**：serializePosterSvg 剥除 grid/选中，保留 destination/guest/`data-*`。
6. **明确不做**：虚拟化、换渲染器、复活展示框工作台、改 `data-*` 名、布局短哈希、求解器增量化。

`margin`/`fieldOrder` 保持 schema + deprecated，禁止接线。
