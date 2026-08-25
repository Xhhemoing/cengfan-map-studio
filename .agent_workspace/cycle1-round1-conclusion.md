# Cycle 1 《Round 1 结论简报》

**模型未降级。** 六路实际 slug：`claude-fable-5-thinking-xhigh` ×2、`claude-opus-5-thinking-high-fast` ×2、`gpt-5.6-sol-xhigh-fast` ×2。

## 已实现

1. **标准去向卡拆出 `memo(DestinationCard)`**；`displayFrame` / `cardStyle` 依赖收窄；卡片 pointer handler 稳定化。拖拽提交不再让未动卡片重渲染（有反向验证）。
2. **展示框解析层 `display-frame-style.ts`**；子画布改走解析层；RAF 拖拽由错误的绝对 `translate` 改为增量，抬手从 ref 提交。
3. **工作台 CSS** 改 `--editor-*`，暗色可读；参考样式选中/hover 分离。
4. **`npm run perf:canvas` 基线**：`solveCardLayout(60)=64.4ms`，地图投影 24.0ms，200 框 normalize 2.0ms，换行可忽略。
5. **边界测试** 24 省卡、pins/空字段、fixed/flow、极端 normalize、子画布拖拽。

## 遗留缺陷（Round 2 必须打）

| ID | 问题 | 主责 |
| --- | --- | --- |
| P0-1 | `App.tsx` 每次新建 `onSelect`/`onMoveCard` 等闭包，击穿 PosterCanvas 内 MapLayer 等 `memo` | opus-A |
| P0-2 | `useCardLayoutWorker` pending 时 `result: null`，布局期卡片整层闪烁 | opus-A |
| P0-3 | `applyCardTemplate` 不重置 `presentation`，从胶囊切回标准模板画布仍是 pill | opus-B |
| P0-4 | reference `textFor` 把 `wrapCardText` 多行拍成单行 → 宽溢出 + 高虚高 | opus-B |
| P1-1 | `DestinationCard` 尚未消费 `display-frame-style` 解析层（标题字重 / 城市字号 / align 双端不一致） | opus-B |
| P1-2 | 展示框工作台四组件无生产挂载（有意下线）。**Round 2 裁决：不复活旧工作台**；渲染器 + 解析层继续服务 `displayFrame` 数据与参考样式台 | 全员遵守 |
| P1-3 | `PosterCanvas` 仍 ~1560 行；嘉宾层 / reference 视觉仍内联 | Round 2 抽 `ReferenceCardVisual`，嘉宾层 Round 3 |
| P2 | 布局 cache key `JSON.stringify` 全部省多边形；地图配色也会触发序列化 | opus-A 收窄 polygon memo 依赖，勿改求解器语义 |

## 性能瓶颈

- 主热点仍是 `solveCardLayout`（60 卡 64ms）与 geo path（24ms），不是 displayFrame normalize。
- jsdom 24 卡首次渲染约 879ms（测试环境，非浏览器）。
- 拖拽路径（命令式 transform）架构正确，不要改回 React state。

## 下轮攻坚重点

1. 稳定 App→PosterCanvas 回调身份 + 布局 stale-while-revalidate。
2. 模板 `presentation` 复位 + reference 卡按行渲染。
3. DestinationCard 接入解析层；抽出 `ReferenceCardVisual`。
4. 补测试锁住 P0；扩展 canvas bench（选中态/单卡位移的重复提交，勿只测纯函数）。
5. 禁止：虚拟化画布、换渲染器、复活 `.display-frame-workspace` 编辑台、破坏 `data-*` 导出契约。
