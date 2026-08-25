# 全局总结 — 展示框自动排布重构

**分支:** `cursor/display-frame-layout-d264`
**三轮编排:** 每轮 2×fable + 2×opus-fast + 2×gpt-sol

## 对照用户目标

| 目标 | 结果 |
| --- | --- |
| 禁止遮挡地图、禁止遮挡其他元素 | 两个独立勾选；地图多边形 vs 嘉宾/文本/装饰；画布与 AI `auto_layout` 共用 `collectElementObstacles` |
| 省份近 / 分列整齐 / 四周整齐 | `proximity` / `columns` / `quadrant`；另保留极角环绕、右侧单列、边缘网格 |
| 连接线禁止交叉 | 硬搜索 + 几何拆线 + 轨内重排；有 0 交叉则 solved；否则最少交叉 fallback。文案不保证全算法为零 |
| 速度 + 手动简单自适应 | worker + 缓存；24 卡中位约数毫秒到十几毫秒；`adaptCardLayout` ~0.12ms；松手邻居让位、一步撤销 |

## 关键模块

门面 `src/lib/card-layout.ts`（302 行）+ polygons/collision/pack/optimize/proximity/uncross 等 ≤400 行模块。

## 回滚

还原本分支相对 `main` 的 diff。新字段可选；旧 JSON 缺 `allowElementOverlap` 时仍避让元素。未钉死位置的旧工程重开会按新求解器重排。

## 未合并

父调度器已开 PR；此环境没有 merge 权限，需维护者合入。
