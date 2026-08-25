# Cycle 2 《Round 1 结论简报》

**模型未降级。** slug：`claude-fable-5-thinking-xhigh` ×2、`claude-opus-5-thinking-high-fast` ×2、`gpt-5.6-sol-xhigh-fast` ×2。

## 已实现

1. **preparedCards 拆成 contents / anchors**：`wrapCardText` 不再依赖 `map.x/y/scale`。浅合并保留 `rows`/`titleLines` 引用，pan 后 DestinationCard memo 仍命中。
2. **`memo(DestinationCardsLayer)`**：拖拽宿主+连接线抽出；`PosterCanvas` ~1158 → ~830 行。24 卡 map-x 重渲染约 27.7ms → 21.7ms（残差主要是布局重解）。
3. **`destination-card-metrics`**：header/preset 装饰几何 token + `destinationCardSurfaceChrome`；`margin`/`fieldOrder` JSDoc deprecated。
4. 主调度器收口：连接线预览改为 `:scope > path`（避免 emblem-list 卡内 `<path>` 被写成连接线）；`destinationCardHeight` 共用 `DESTINATION_CARD_HEADER_HEIGHT`。

## 遗留 / Round 2 攻坚

| ID | 问题 |
| --- | --- |
| C2-1 | 两套几何：`destination-card-metrics`（绘制）vs `prepared-card-content`（求解高度/行高）。高度 44 已对齐；city-only `rowHeight` 公式仍可能分叉。 |
| C2-2 | `prepared-card-content` 从 `DestinationCard.tsx` 引类型（lib→component）。把类型下沉到 lib。 |
| C2-3 | pan 仍触发 `solveCardLayout`（24 卡 ~11ms）。锚点变了布局必须重算；可考虑只平移已冻结 positions 的卡、跳过求解。 |
| C2-4 | connector `feTurbulence` 无 seed；defs id 无实例前缀。 |
| C2-5 | photo 正文 +32 与 title 不一致；flow 标题 lineHeight 渲染/求高分叉。 |

禁止：复活展示框工作台、虚拟化、改 `data-*` 名、求解器大改（除非 C2-3 有明确「已冻结 positions 跳过求解」的窄路径）。
