# Round 2 结论简报 — 拆分、拆线、诚实文案

相对 Round 1：求解器从单文件 2016 行拆成门面 301 行 + 10 个 ≤400 行模块；连接线交叉从「标 fallback」变成几何修复；文档不再承诺「一定不交叉」。

## 演进对比

| 项 | Round 1 | Round 2 |
| --- | --- | --- |
| `card-layout.ts` | 2016 行，ratchet 红 | 301 行门面，allowlist 条目删除，ratchet 绿 |
| modes 测试 | 469 行未登记 | 276 + `modes-extra` 217 |
| columns 24 卡 straight 交叉 | 39 | **5**（修复后；gpt-1 探针曾在拆线落地前测到 39） |
| right-stack / grid 交叉 | 96 / 78 | **6 / 6** |
| proximity | 0 交叉 | 保持 0 |
| chooseLayout | 首个交叉结果立即 fallback | 按交叉数排名；repack 仅作饱和恢复以免抹掉 mode |
| properties 180 种子 | 非 solved 跳过几何（107 覆盖） | 全部检查几何 |
| 用户文案 | 未提交叉上限 | inspector / USER_GUIDE / CHANGELOG 写明「尽力、不保证」 |

父调度器复跑：`scripts/file-size-ratchet.test.ts` + 11 个 layout/inspector 文件 **131 passed**。

## 潜在边界风险

1. **残余交叉**：密集 columns/right-stack/grid 仍可能 5–6 条交叉（共享锚点花束 0 距是允许的；非花束残留是拆线预算用尽）。
2. **mode vs 零交叉**：若把 `repackAll` 纳入交叉排名，24 卡会所有 mode 塌成同一无交叉网格，用户选算法无效。当前故意不把 recovery 当主解。
3. **AI `auto_layout`（agent-session）** 仍用另一套障碍（无装饰/文本、嘉宾高 120），与画布双开关分叉。
4. inspector 第二条 hint 仍写「连接线会避开嘉宾/文本/装饰」——求解器没有这条检测。
5. 48 卡拆线后耗时上升（columns ~7ms / 最坏 ~46ms），仍远低于 200ms 软线。
6. 极端饱和（18+ 卡小画布）fallback 允许卡卡重叠（既有「不丢内容」设计），UI 未提示。

## SOTA 验收差距（Round 3 冲刺）

- 非花束残余交叉再压（拆线预算/换侧顺序），dense columns 目标更接近 0
- `agent-session` 障碍与 PosterCanvas 共用 `collectElementObstacles`
- 纠正连接线-避让-元素的 hint；autoBalance 禁用原因可读
- 版式阶段浏览器手测：双开关、三算法、拖拽让位、刷新
- 交叉测试/性能探针以拆线后数字为基线，禁止再 skip
