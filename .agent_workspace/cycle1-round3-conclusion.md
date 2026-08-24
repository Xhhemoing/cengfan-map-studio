# Cycle 1 《Round 3 结论简报》

**模型未降级。** slug：`claude-fable-5-thinking-xhigh` ×2、`claude-opus-5-thinking-high-fast` ×2、`gpt-5.6-sol-xhigh-fast` ×2。

Cycle 1 三轮闭环完成。画布渲染与展示框样式达到本轮 SOTA 收敛点；求解器本身未改。

## 本轮落地

- `memo(PosterCanvas)` + 原地切片比较器（兜底测试里 `project.cards =` 的同引用重渲染）。同 props 24 卡重渲染 **3.54ms → ~0.03ms**。
- `GuestsLayer` + `guest-panel-layout` 纯函数；嘉宾选中态重渲染约 **-52%～-77%**。`PosterCanvas` ~1470 → ~1158 行。
- MapLayer 投影/`d` 串按 feature 缓存，每省 path 由每帧 4 次序列化降为 1 次。
- DestinationCard 三级解析级联；flow 接 align/opacity；glass-stat 取消 0.55–0.9 钳制。
- `ReferenceCardVisual` 支持 `lineHeightMultiplier`；挂载点已由主调度器补上。
- 导出契约 / align / SWR 边界测试。

## Cycle 1 相对起点

| | 起点 | Cycle 1 结束 |
| --- | --- | --- |
| 标准卡 | 内联在 PosterCanvas | `DestinationCard` + 解析层 |
| 参考卡 | `textFor` 拍平 | 逐行 + 抽出组件 |
| 拖拽/布局 | 层 memo 被 App 闭包击穿；pending 闪卡 | 稳定回调 + SWR |
| 模板 | 胶囊切回标准仍是 pill | 显式 `presentation:"standard"` |
| 画布 memo | 无顶层 memo | 同 props 跳过函数体 |
| 布局 60 卡 | ~64ms | ~65ms（持平，非本周期目标） |

## Cycle 2 开刀顺序

1. `preparedCards`：文本换行与地图 x/y/scale 解耦（平移不再全量 wrap）。
2. `DestinationCardsLayer`（连接线 + 拖拽宿主）。
3. preset 声明式覆盖表；头部几何魔数纯函数化。
4. `margin`/`fieldOrder` JSDoc deprecated；测试改为不可变 `project` 更新后可删 WeakMap 比较器。
5. 禁止：虚拟化、换渲染器、复活展示框工作台、改 `data-*` 名、求解器增量化（待证明 SWR 下 65ms 仍是体感瓶颈）。
