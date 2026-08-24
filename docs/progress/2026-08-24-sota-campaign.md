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
| 1 | 已完成 | fable ×5 | 分区只读审计 + 可落地切片 |
| 2 | 已完成 | opus ×5 | 按第 1 轮结论落地最高价值切片 |
| 3 | 已完成 | 混编 ×5 | 深化打磨与回归 |
| 4 | 已完成 | opus ×5 | 复查 P0 与导入/兜底收紧 |
| 5 | 已完成 | 混编 ×5 | 达标后继续 |
| 6 | 已完成 | 混编 ×5 | 续聊闭环与死代码清理 |
| 7 | 进行中 | 混编 ×5 | 导出补省份、digest 分层、续聊 HTTP 验收 |

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

## 第 1 轮结论（5 份只读审计）

1. **地图几何**：影子端合成锚点/估高、缩放按左上角锚定、`grouping` 的 positions key 与渲染层失配、`check_health` 不传 connectors。P0：`src/lib/render-facts.ts` 同源纯函数。
2. **AI 性价比**：预算按毛 token 累加，60k 实际约 7–9 轮；只读 streak 误杀翻页；观测无 taskId。P0：增量计量、日志串联、streak 改重复签名。视觉核对维持 P2。
3. **画布排版**：用户面板 / Agent / 渲染三套几何；连线冲突检测是生产死代码；纹理拖拽每帧 React 重渲染。与几何同源；独立切片是 MapLayer 性能。
4. **导入导出**：Excel 缺格静默丢行、缺列回退会串列、无名单导出、主流程藏了模板入口。P0：解析层零静默 + 统一别名词表。
5. **工作台**：默认六阶段看不到 `statusMessage`；AI 栏桌面/抽屉双挂载；`requestAiProposal` 前端死代码。P0：状态条、摘死代码、rail a11y。

## 第 2 轮落地（文件所有权互斥，避免撞车）

| 切片 | 允许改动的路径 |
|---|---|
| render-facts | `src/lib/render-facts.ts`（新）、`src/lib/agent-session.ts`、`src/components/canvas/PosterCanvas.tsx`（仅改 import） |
| AI 预算/观测/闸门 | `server/ai/*`、`server/index.ts` |
| 地图纹理性能 | `src/components/canvas/MapDataLayer.tsx`、`MapLayer.tsx` |
| 导入零静默 | `src/lib/binary-import.ts`、`src/lib/import-data.ts` 及对应测试 |
| 工作台反馈与死代码 | `src/App.tsx`、`StudioLayoutTemplate.tsx`、`StudioAssistantRail.tsx`、`AgentAssistant.tsx`、`src/lib/ai-client.ts`、新 `StatusBar.tsx` |

本轮不改 digest 协议、不接视觉模型、不删 `/api/ai/propose-edits` 服务端端点、不删 legacy 编辑器。

## 进度日志

- 2026-08-24：创建专属分支；启动第 1 轮 5 个只读调研子代理。
- 2026-08-24：第 1 轮 5 份审计齐；启动第 2 轮 5 个落地子代理。
- 2026-08-24：第 2 轮落地完成并合入专属分支。目标测试 12 文件 164 + 续跑 19 文件 284 通过。启动第 3 轮。

## 第 2 轮已合入

- `render-geometry` / `render-facts` / `render-health`：Agent 与画布同源几何；city/university 分组 positions 用真实 group.key。
- AI 预算按增量计量、观测带 taskId、只读闸门按重复签名。
- 纹理拖拽改为 DOM 预览；MapLayer projection/path 缓存。
- 导入别名统一；Excel 缺格进 unparsed；缺列不再串列回退。
- 默认六阶段 StatusBar；去掉 `requestAiProposal` 与浮窗助手；rail 用 `useId` + 方向键。

## 第 3 轮已合入

- App `contentLayoutIssues` 已接 `buildHealthInput`（与 Agent 同源）。
- 导入结果「成功 N · 跳过 M」+ 明细；名单 xlsx 导出与模板表头同源。
- digest 增加 `layout` 节（mapContentBounds + cardBlocks）。
- 高置信只读统计预路由（`local-preroute.ts`），写意图不命中。

## 第 4 轮已合入

- 客户端 `usedTokens`/`rounds` 镜像服务端预算，长会话快照不再因毛计量破 100k。
- 文本/无表头 Excel 空列保留槽位，不再串列。
- borderless+低透明度时 check_health 不报幽灵连线。
- DATA 主流程出现「下载 XLSX 模板」。
- `runLocalAgentTurn` 不再把「把城市字号调大」切成城市视图。

## 第 5 轮已合入

- App 健康检查用 `useDeferredValue`，编辑先出画布再结算排版问题。
- Agent 进行中会话挂在 Provider 上，关抽屉不再 abort。
- `leave`/`refreshMember` 不能靠自报 clientId 踢别人。
- DEVELOPER.md / AGENTS / 导入技能路径已对齐；预路由在 `server/ai/local-preroute.ts`。

**复查 P1（第 6 轮）：** 恢复的会话点「继续对话」可能 400（快照无 taskId/budgetReceipt）。客户端请求体仍发已被忽略的 budget。

## 第 6 轮已合入

- 快照升 `schemaVersion: 3`，导出 `taskId` + `budgetReceipt`；恢复后 `continue()` 带同一回执。
- v2 无回执快照仍可打开，但 `canContinue === false`：按钮改成「新开任务」，不会对服务端发会 400 的续聊。
- 客户端不再发送已被服务端忽略的 `budget`；`localStorage` 必须保留回执，否则重载等于新开任务。
- `parseDelimitedTable` 已删除（仅测试引用，解析语义走 `parseStudentText`）。
- `render-facts.test.ts` 补上 `connectors!`，消除 TS2532。
- DATA 折叠态也能下载模板；空名单默认展开导入区。

回滚：把 `AGENT_SNAPSHOT_SCHEMA_VERSION` 改回 2 并去掉回执字段；校验仍接受 2/3，已写入的 v3 退化为只读恢复。导入区改动是纯 UI。

**第 7 轮候选：** 导出名单补省份列（round-trip 丢手动覆盖）；digest 分层/去重（P1）；恢复续聊的真 HTTP 集成测试；大名单健康检查仍在主线程求解；`/api/ai/propose-edits` 服务端仍保留。P2 视觉核对仍不做。
