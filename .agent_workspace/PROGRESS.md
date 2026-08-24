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

## 文件所有权（Cycle 3 Round 3 · 冻结轮）

| 角色 | 可写路径 | 禁止 |
| --- | --- | --- |
| fable-A | `.agent_workspace/cycle3-round3-fable-a.md` | 生产代码 |
| fable-B | `.agent_workspace/cycle3-round3-fable-b.md` | 生产代码 |
| opus-fast-A | 仅测试/注释；无新结构。可补调用方不变量或 MapLayer 注释缺口 | 大重构、新 perf |
| opus-fast-B | `scripts/perf-canvas-bench.ts` 仅当确有 **flow 游标** 副本时与 metrics 对齐 | MapLayer.tsx；不得把 prepared-wrap 的 typography 链改成 flow 回退 |
| gpt-sol-A | `.agent_workspace/cycle3-round3-gpt-sol-a.md` 终局 `perf:canvas` 数字；bench 只读除非修坏掉的脚本 | UI 重构 |
| gpt-sol-B | 新建测试仅当验收缺口 | 生产实现 |

## 循环状态

- [x] Cycle 1 Round 1 — 初始构建与基线探索（完成，见 `cycle1-round1-conclusion.md`）
  - fable-A `claude-fable-5-thinking-xhigh` canvas 管线审计 → `bc-b86f76c3-f700-5e6a-b980-b16dfeb529e0`
  - fable-B `claude-fable-5-thinking-xhigh` 展示框样式审计 → `bc-59f43fbd-e6a3-57f4-bdc8-16443fa3e422`
  - opus-fast-A `claude-opus-5-thinking-high-fast` DestinationCard 拆分 → `bc-780913a7-4452-5a24-8207-5eca309d970d`
  - opus-fast-B `claude-opus-5-thinking-high-fast` 展示框 token/子画布 → `bc-835ca65f-3f64-5aa1-a14b-2ecad94e54be`
  - gpt-sol-A `gpt-5.6-sol-xhigh-fast` 画布基准脚本 → `bc-99c96d63-7966-5b5d-b937-90e98d6b50bd`
  - gpt-sol-B `gpt-5.6-sol-xhigh-fast` 边界测试 → `bc-d390ddb4-b179-59da-81e4-21ac391945cf`
- [x] Cycle 1 Round 2 — 靶向重构与深度优化（完成，见 `cycle1-round2-conclusion.md`）
  - fable-A → `bc-4cfb2913-f556-5f00-b797-1dd50941e21e`
  - fable-B → `bc-1a45644a-e9e4-52ce-bc9f-71da5e3b21ff`
  - opus-fast-A → `bc-02056c3d-d4dd-5c18-91ad-ea64bdfa539e`
  - opus-fast-B → `bc-42165287-40ae-53a9-ab03-be92cc120dc0`
  - gpt-sol-A → `bc-f4e8c95d-f6e1-5205-9eca-12545f81f39d`
  - gpt-sol-B → `bc-7e13aad9-37bd-55ad-9958-4d2031d69a8c`
- [x] Cycle 1 Round 3 — SOTA 打磨与交叉核验（完成，见 `cycle1-round3-conclusion.md`）
  - fable-A → `bc-61e49b2a-cf96-5bd2-8fc2-8ad354cd8b6b`
  - fable-B → `bc-2567d2e8-caa9-5038-84bb-a101e9a57de4`
  - opus-fast-A → `bc-39a39282-18d4-5b09-b0e1-a38652ba6b58`
  - opus-fast-B → `bc-fadea826-74a2-5368-9667-5431fcf9b1c7`
  - gpt-sol-A → `bc-b425589d-0230-58c2-94b8-fd136cbe474b`
  - gpt-sol-B → `bc-d2683e3c-52ea-50e8-b527-85e5fd822ff8`
- [x] Cycle 2 Round 1 — 文本排版与卡片层拆分（完成，见 `cycle2-round1-conclusion.md`）
  - fable-A → `bc-34ecb457-b92f-5d9f-9221-2ff2423e45b2`
  - fable-B → `bc-ebb983fe-da5f-5b77-9935-f50c2d6ac9d9`
  - opus-fast-A → `bc-ea47ec65-a3c7-503d-85c2-744d057a26ce`
  - opus-fast-B → `bc-398927a7-b6e9-5f44-8e86-ad251dd54bc9`
  - gpt-sol-A → `bc-06159e11-c8f6-5bba-ba71-c2b50e05f3e3`
  - gpt-sol-B → `bc-33c43960-3655-5ee6-959b-ebbc50f075f4`
- [x] Cycle 2 Round 2 — 几何真源合一与连接线预览（完成，见 `cycle2-round2-conclusion.md`）
  - fable-A → `bc-af7afc4a-12d6-559f-b5ac-022b0ffe8ef6`
  - fable-B → `bc-a1b331fd-bfc6-5c19-8ede-d7a2a3bc66fd`
  - opus-fast-A → `bc-733c666d-cd91-582b-b177-a6f3ee17f863`
  - opus-fast-B → `bc-1385e303-e7c3-53d1-930d-69fd30b0ff01`
  - gpt-sol-A → `bc-514033cc-1496-5354-a5d2-b165f21b071c`
  - gpt-sol-B → `bc-cdfd55cc-82ab-59d5-9531-9d88b287a8a2`
- [x] Cycle 2 Round 3 — 地图仿射缓存与样式收口（完成，见 `cycle2-round3-conclusion.md`）
  - fable-A → `bc-573c88a4-fca3-50dd-8f0f-d4de0f935314`
  - fable-B → `bc-85a81ade-cede-5e8e-8edc-ac3ecd4fcecc`
  - opus-fast-A → `bc-83fb2d76-fefb-57f1-83f8-ef5db74f81aa`
  - opus-fast-B → `bc-752451d8-bb08-5f68-9cb2-5522a210a4ae`
  - gpt-sol-A → `bc-49618dfe-d37f-52b4-afbb-c62e96a1066f`
  - gpt-sol-B → `bc-c0dee1a4-ec7d-5615-88bc-249e1b45b565`
- [x] Cycle 3 Round 1 — 布局 key 仿射化与换色不重投影（完成，见 `cycle3-round1-conclusion.md`）
  - fable-A → `bc-ad996d45-1dde-501d-a298-66d61583d559`
  - fable-B → `bc-89b0e384-3e37-5598-bfab-65d63f3ac25a`
  - opus-fast-A → `bc-070c866f-1f9f-5b29-a6b5-5a826e248032`
  - opus-fast-B → `bc-0d3b0b7c-4b6e-5255-9751-0c589bd648fb`
  - gpt-sol-A → `bc-b79716f9-795d-5ac6-bdd6-29e78093b0fb`
  - gpt-sol-B → `bc-5bef0d4c-2fc9-5e92-bbbf-bb3593ef2db0`
- [x] Cycle 3 Round 2 — MapLayer 窄 memo 与 flowContentStart（完成，见 `cycle3-round2-conclusion.md`）
  - fable-A → `bc-6dee4c66-0734-540d-9b14-5d77ad5ff9f9`
  - fable-B → `bc-616124f9-0e1d-5b54-a47a-1d203ce35af5`
  - opus-fast-A → `bc-d0af3d1e-1e78-5e6f-ab91-a86649465288`
  - opus-fast-B → `bc-5acd7e1d-a4c5-5c29-b4af-5c7c0ddcb809`
  - gpt-sol-A → `bc-54f88c0d-52e3-52e5-8fe0-fa32260cfa87`
  - gpt-sol-B → `bc-37734dd9-fe43-5135-8ab2-b5837f4070a1`
- [ ] Cycle 3 Round 3 — 固化与交叉核验（冻结：无新优化，6 子代理并发）
  - fable-A → `bc-19a0d90d-6eb5-5129-8d97-ec47a8785c4c`
  - fable-B → `bc-7d9f8066-dc5c-56da-978d-70dcfb40a2d3`
  - opus-fast-A → `bc-555ddf52-3dc8-548d-9aba-ef05f58eae1a`
  - opus-fast-B → `bc-4f3c62ca-2de9-5146-8f12-469ef8ad2e8d`
  - gpt-sol-A → `bc-a1068140-3f21-5e87-bd50-64bec7878c58`
  - gpt-sol-B → `bc-fccb3488-b7c2-5b1c-aef6-14bee96ba2b3`
- [ ] 归档、结构化 PR

## 已知基线（主调度器预研）

- `PosterCanvas.tsx` 约 1588 行（超过 400 行拆分规范），展示框卡片 SVG 内联渲染。
- 已有 `CanvasDragPreview` RAF/interval 调度、`memo` 图层、`useCardLayoutWorker`、`PosterCanvas.performance.test.tsx`（拖拽时地图层不重绘）。
- 展示框：`src/lib/display-frame.ts`、`DisplayFrameSubcanvas`（局部 RAF 预览已落地）、`ReferenceCardStyleWorkspace`、`display-frame-workspace` CSS。
- `npm run perf:layout` 仅覆盖 `solveCardLayout`，尚无画布/展示框渲染基准。

## Round 结论简报

- Cycle 1 Round 1：`.agent_workspace/cycle1-round1-conclusion.md`
- Cycle 1 Round 2：`.agent_workspace/cycle1-round2-conclusion.md`
- Cycle 1 Round 3：`.agent_workspace/cycle1-round3-conclusion.md`
- Cycle 2 Round 1：`.agent_workspace/cycle2-round1-conclusion.md`
- Cycle 2 Round 2：`.agent_workspace/cycle2-round2-conclusion.md`
- Cycle 2 Round 3：`.agent_workspace/cycle2-round3-conclusion.md`
- Cycle 3 Round 1：`.agent_workspace/cycle3-round1-conclusion.md`
- Cycle 3 Round 2：`.agent_workspace/cycle3-round2-conclusion.md`（pan@24 中位 ~4.2ms；MapLayer 单层 0.07ms）
