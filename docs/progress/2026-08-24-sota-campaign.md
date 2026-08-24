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
| 7 | 已完成 | 混编 ×5 | 导出补省份、digest 分层、续聊 digest 去重、健康检查缓存 |
| 8 | 已完成 | 混编 ×5 | 省份写回、可写白名单、回执过期降级、工作台菜单、OCR |
| 9 | 已完成 | 混编 ×5 | 删死端点、省份映射行、core digest、嘉宾人数口径 |
| 10 | 已完成 | 混编 ×5 | core 层标记、协作冲突补齐、确认列表省份、卡片交互 |
| 11 | 已完成 | 混编 ×5 | 去重后仍保留 core 投影、分组卡片覆盖、确认列表 a11y |
| 12 | 已完成 | 混编 ×5 | 踢人撤令牌、预路由词表、PNG blob、偏好 hook |
| 13 | 进行中 | fable ×5 | 达标后继续：全仓剩余缺口复查 |

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
- 2026-08-24：第 6 轮落地完成并合入专属分支。启动第 7 轮。
- 2026-08-24：第 7 轮落地完成并合入专属分支。启动第 8 轮。
- 2026-08-24：第 8 轮落地完成并合入专属分支。启动第 9 轮。
- 2026-08-24：第 9 轮落地完成并合入专属分支。启动第 10 轮。
- 2026-08-24：第 10 轮落地完成并合入专属分支。
- 2026-08-24：第 11 轮落地完成并合入专属分支。
- 2026-08-24：第 12 轮落地完成并合入专属分支。
- 2026-08-24：第 5 轮复查跟进：Provider 级过期看门狗 + closed 房间 leave。
- 2026-08-24：启动第 13 轮 5 个只读复查（AI / 画布 / 数据 / 协作与 API / 工作台）。

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

## 第 7 轮已合入

- 导入模板/导出增加可选「省份」列；无表头仍按旧 4 列，避免把去向类型吃成省份。
- `buildProjectDigest(project, { layer: "full" | "core" })` + `digestFingerprint`；默认 full 行为不变。
- 续聊回执写入 `historyHash`：digest 未变则 prompt 只发短声明，首轮与变更轮仍全量。
- `layoutHealthIssues` 按几何签名缓存，事务提交不再全量重算健康检查。

## 第 8 轮已合入

- `StudentInput.province` → `buildStudentRecords` / `confirmImportCandidates`：手动省份写入学生并优先于城市推断。
- `SCENE_DOMAIN_PROPS` 抽到 `src/lib/scene-writable-props.ts`：补 `dataPalette` / `shadow` / `mapBoundaryMargin` / `presentation`。
- 回执过期/已用改为 `AI_RECEIPT_EXPIRED`，按钮降级「新开任务」。
- 项目卡菜单：焦点、Esc、外点、方向键。
- OCR 未识别完时升级智能识别，`source: "ocr"`。

## 第 9 轮已合入

- 删除死端点 `/api/ai/propose-edits` 与 `/api/ai/explain`（前端 `ai-client.ts` 只剩 `parse-data`），连带清掉后端实现与 schema。两路径 404，`/api/ai/agent` 与 `/api/ai/parse-data` 不变。
- 识别面板 `columnMappings` 含省份列。
- 续聊请求发 `core` digest，首轮与 `inspect_project` 仍 `full`。
- 嘉宾检查器人数与画布 `visibleGuestPeople` 同源。

回滚：死端点是 API 形状破坏性变更，revert 该提交即可恢复。digest 两处改回无参 `buildProjectDigest`。P2 视觉核对仍不做。

## 第 10 轮已合入

- digest 带 `layer` 与 `layout.cardBlockCount`；客户端另传基于 full 的 `digestFingerprint`，续聊第一轮也能命中短声明。
- 协作 `VERSION_CONFLICT` 先补齐再单次重试；同字段重叠不自动强推。
- 导入确认列表展示省份与去向类型。
- 单击选卡不再写入手动定位；卡片可 Tab / 方向键操作。
- 删除过时的 `MappedStudentColumn`。

## 第 11 轮已合入

- digest 去重命中时仍发送 core 骨架（layer/counts/bounds/topProvinces），不再只剩空指针短句。
- city/university 分组下 `cardBlocks` 按省轮询覆盖多张卡，`cardBlockCount` 仍是求解总数。
- 导入确认勾选框带「第 N 行 + 姓名」aria-label。
- 协作冲突文案改为自动同步失败后再提示可选重进。

## 第 12 轮已合入

- owner 踢人撤销该成员全部 accessRecords；自己离开仍可凭凭证重进；客户端发现不在成员列表时退出。
- 预路由省名走 `china-locations` 目录，测试对齐 `resolveProvinceName`（不能直接 import search-catalog：geojson `?raw` 在 tsx 下会炸）。
- PNG 导出改 `toBlob` + object URL，超时随像素面积缩放。
- 主题/皮肤/面板宽度抽到 `use-studio-preferences`。
- 确认列表 `role="group"` +「待确认导入 N 条」。

P2 视觉核对仍不做。

## 第 5 轮复查跟进

复查确认第 5 轮三项提交态无回归。踢人撤令牌已在第 12 轮落地。剩余：关抽屉后改项目仍回写旧预览——工程指纹改由 Provider + `useAssistantProjectSync` 记账，落地前比对当前工程，过期则归 draft 且不调 `onPreview`。`leave` 对已关闭房间与 `refreshMember` 一样回 `ROOM_CLOSED`。
