# 画布渲染 / 展示框样式性能优化 — 进度文档

**分支:** `cursor/canvas-render-display-46a1`（对应 SOP `agent/canvas-render-display`）  
**目标:** 3 次 × 3 轮多模型并发循环，持续优化画布渲染与展示框样式。前期侧重画布渲染与展示框样式。  
**许可证:** AGPL-3.0-only。不引入支付/套餐。

## 模型配置

| 简称 | 实际 slug | 每轮数量 | 推荐职能 |
| --- | --- | --- | --- |
| fable | `claude-fable-5-thinking-xhigh` | 2 | 架构规划、多维审计、SOTA 标准与验收 |
| opus-fast | `claude-opus-5-thinking-high-fast` | 2 | 核心业务落地、算法攻坚、高覆盖单测 |
| gpt-sol | `gpt-5.6-sol-xhigh-fast` | 2 | 自动化探针/脚本、基准测试、边界探索 |

严禁静默降级。子代理输出首行必须声明实际使用的模型 slug。

## 文件所有权（Cycle 1 Round 2）

| 角色 | 可写路径 | 禁止 |
| --- | --- | --- |
| fable-A | `.agent_workspace/cycle1-round2-fable-a.md` | 生产代码 |
| fable-B | `.agent_workspace/cycle1-round2-fable-b.md` | 生产代码 |
| opus-fast-A | `src/App.tsx`、`src/components/canvas/useCardLayoutWorker.ts*`、`src/lib/card-layout-cache.ts*`、`src/components/canvas/PosterCanvas.tsx` **仅** layout memo 依赖（provincePolygons / preparedCards / layoutRequest）、相关测试 | `DestinationCard.tsx`、`display-frame-style.ts`、`card-templates.ts` |
| opus-fast-B | `DestinationCard.tsx*`、`src/lib/card-templates.ts*`、`src/lib/display-frame-style.ts*`、新建 `ReferenceCardVisual.tsx`、`PosterCanvas.tsx` **仅** 抽出/替换 `renderReferenceCardVisual` | `App.tsx`、`useCardLayoutWorker.ts` |
| gpt-sol-A | `scripts/perf-canvas-bench.ts`、`src/lib/canvas-render-metrics.ts*` | UI 大重构 |
| gpt-sol-B | 新建测试文件 `*.round2.test.ts(x)` | 生产实现 |

## 循环状态

- [x] Cycle 1 Round 1 — 初始构建与基线探索（完成，见 `cycle1-round1-conclusion.md`）
  - fable-A `claude-fable-5-thinking-xhigh` canvas 管线审计 → `bc-b86f76c3-f700-5e6a-b980-b16dfeb529e0`
  - fable-B `claude-fable-5-thinking-xhigh` 展示框样式审计 → `bc-59f43fbd-e6a3-57f4-bdc8-16443fa3e422`
  - opus-fast-A `claude-opus-5-thinking-high-fast` DestinationCard 拆分 → `bc-780913a7-4452-5a24-8207-5eca309d970d`
  - opus-fast-B `claude-opus-5-thinking-high-fast` 展示框 token/子画布 → `bc-835ca65f-3f64-5aa1-a14b-2ecad94e54be`
  - gpt-sol-A `gpt-5.6-sol-xhigh-fast` 画布基准脚本 → `bc-99c96d63-7966-5b5d-b937-90e98d6b50bd`
  - gpt-sol-B `gpt-5.6-sol-xhigh-fast` 边界测试 → `bc-d390ddb4-b179-59da-81e4-21ac391945cf`
- [ ] Cycle 1 Round 2 — 靶向重构与深度优化（派发中）
- [ ] Cycle 1 Round 3 — SOTA 打磨与交叉核验
- [ ] Cycle 2 Round 1
- [ ] Cycle 2 Round 2
- [ ] Cycle 2 Round 3
- [ ] Cycle 3 Round 1
- [ ] Cycle 3 Round 2
- [ ] Cycle 3 Round 3
- [ ] 归档、结构化 PR

## 已知基线（主调度器预研）

- `PosterCanvas.tsx` 约 1588 行（超过 400 行拆分规范），展示框卡片 SVG 内联渲染。
- 已有 `CanvasDragPreview` RAF/interval 调度、`memo` 图层、`useCardLayoutWorker`、`PosterCanvas.performance.test.tsx`（拖拽时地图层不重绘）。
- 展示框：`src/lib/display-frame.ts`、`DisplayFrameSubcanvas`（局部 RAF 预览已落地）、`ReferenceCardStyleWorkspace`、`display-frame-workspace` CSS。
- `npm run perf:layout` 仅覆盖 `solveCardLayout`，尚无画布/展示框渲染基准。

## Round 结论简报

- Cycle 1 Round 1：见 `.agent_workspace/cycle1-round1-conclusion.md`
