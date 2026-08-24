# SOTA 持久优化战役

专属分支：`cursor/sota-campaign-6231`  
起始基线：`cursor/ai-assistant-optimize-6231` @ `5fd5ee1`（AI 低消耗 / 准确理解 / 准确操作）  
日期：2026-08-24

## 目标

把蹭饭地图工作室各部分打磨到 SOTA：AI 对地图的理解与描述、纯 LLM / 多模态适配、编辑器画布、导入导出、工作台体验。多轮持续推进，直到负责人明确停止。

## 已锁定的技术选型（来自地图理解调研）

- **立刻做（P0）**：纯文本真值几何。影子 Agent 的 `groupCards()` / `healthInput()` 使用合成锚点与估高，与 `PosterCanvas` 的投影质心、逐行测高不一致。先抽 `src/lib/render-facts.ts`，再接到 digest / `check_health` / `App` 同源健康检查。
- **下一阶段（P1）**：分层 digest、digest 去重传输、统计类本地预路由。
- **再下一阶段（P2）**：opt-in 单点视觉核对（`review_canvas` + `/api/ai/vision-review`），默认关闭、两级隐私同意。
- **明确不做**：不把 `/api/ai/agent` 主循环改成多模态消息；不把支付/套餐/计费写入本仓库。

## 轮次编制

每轮 5 个子代理并行。调研/复审用 `claude-fable-5-thinking-xhigh`，落地/补测试用 `claude-opus-5-thinking-high-fast`。

| 轮次 | 状态 | 模型 | 主题 |
|---|---|---|---|
| 1 | 进行中 | fable ×5 | 分区只读审计 + 可落地切片 |
| 2 | 待开始 | opus ×5 | 按第 1 轮结论落地最高价值切片 |
| 3 | 待开始 | 视结论混编 | 深化打磨与回归 |
| 4 | 待开始 | 视结论混编 | 继续打磨 |
| 5+ | 待开始 | 视结论混编 | 达标后继续 |

### 第 1 轮工作流（只读）

1. AI 地图几何与描述（render-facts / digest.layout / check_health）
2. AI 模块性价比（路由、预路由、工具面、预算、观测）
3. 画布与排版（PosterCanvas、卡片、连线、健康检查漂移）
4. 学生数据导入导出
5. 编辑器工作台、交互、架构债

## 分支与 PR 策略

- 本文件与战役进度只提交到 `cursor/sota-campaign-6231`。
- 落地切片可另开 `cursor/sota-<slice>-6231`，成熟后并回专属分支。
- 多个 PR 在切片互不冲突、测试全绿后合并，避免长期分叉。

## 进度日志

- 2026-08-24：创建专属分支；启动第 1 轮 5 个只读调研子代理。
