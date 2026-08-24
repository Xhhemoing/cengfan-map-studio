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
| 13 | 已完成 | fable ×5 | 达标后继续：全仓剩余缺口复查 |
| 14 | 已完成 | opus ×5 | 按第 13 轮结论落地最高价值切片 |
| 15 | 已完成 | opus ×5 | 健康检查对齐、SSE 断流、parse-data 字段、AI 草稿、设置反馈 |
| 16 | 已完成 | 混编 ×5 | 限流键、parse-data 告知、SSE 重订阅、rail listbox、剩余复查 |
| 17 | 已完成 | 混编 ×5 | 图片降采样、PNG 面积防护、工作台对话框、房间过期广播、复查 |
| 18 | 已完成 | 混编 ×5 | 项目库 CAS、字体上限、删 editor-commands、复查 |
| 19 | 已完成 | opus ×5 | SSE ping/watchdog、tablist 键盘、右栏单挂载、导入体积与对话框、删死 UI |
| 20 | 进行中 | 混编 ×5 | 工作区镜像 CAS、工程包资源预算、Combobox/滑条 a11y、复查 |

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

- 2026-08-24：第 19 轮 SSE ping、tablist、右栏单挂载、导入上限与对话框、死 UI 已合入；启动第 20 轮。
- 2026-08-24：第 18 轮 CAS / 字体上限 / 删 editor-commands 已合入；启动第 19 轮落地。
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
- 2026-08-24：第 13 轮五区复查齐；启动第 14 轮 5 个落地子代理。
- 2026-08-24：第 14 轮落地完成并合入专属分支。启动第 15 轮。
- 2026-08-24：第 15 轮落地完成并合入专属分支。启动第 16 轮。
- 2026-08-24：第 16 轮落地完成并合入专属分支。启动第 17 轮。
- 2026-08-24：第 17 轮落地完成并合入专属分支。启动第 18 轮。

## 第 13 轮结论（5 份只读复查）

1. **协作/API**：`setAccess` 用可伪造 clientId 判房主，受邀者可关房或把房主顶下线；踢人不断 SSE，被踢者仍收全量工程。P0：身份判定改看 role。
2. **导入导出**：非首行表头会变成假学生；带标签 OCR 行被吞成表头且 unparsed 为空；LLM 补认行丢掉向/省份；上送名单无告知。
3. **工作台**：面板宽度 hook/shell 双源，resize 覆写拖拽值；AI 草稿在实例本地，关抽屉即丢；全局设置分支不挂 StatusBar。
4. **画布**：`check_health` 不豁免同锚点花束、AABB 遮挡与 `allowMapOverlap` 冲突；emblem-list 拖拽改写装饰 path；求解 pending 整层卸卡片。
5. **AI**：`rejectedCount` 跨任务毒化续聊；finish 总结不写入会话；预路由见过任何 tool 就永久关闭。

本轮不落地：P2 视觉核对、SSE 重订阅、parse-data 同意框、健康检查语义（避免与 AI 会话测试抢文件）。

## 第 14 轮落地（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 协作身份 | `server/collaboration.ts`、`server/collaboration.test.ts`、`server/index.test.ts`（仅新增伪造 clientId 用例） |
| 导入零静默 | `src/lib/import-data.ts`、`src/lib/binary-import.ts` 及对应测试 |
| AI 续聊三件 | `server/ai/agent-loop.ts`、`src/lib/agent-session.ts`、`server/ai/local-preroute.ts` 及对应测试 |
| 画布拖拽与 pending | `src/components/canvas/PosterCanvas.tsx`、`useCardLayoutWorker.ts` 及对应测试 |
| 面板宽度单源 | `src/lib/use-studio-preferences.ts`、`src/components/StudioEditorShell.tsx`、`src/App.tsx`（仅透传）、对应测试 |

## 第 14 轮已合入

- 协作：`setAccess` 按 role 判房主；join 拒绝同 id 不同角色；自离必须身份与角色一致。
- 导入：任意行表头不得落成学生；OCR 先按原文解析，归一化不守恒进 unparsed。
- AI：拒绝计数按当前任务段；finish 总结写入会话；续聊统计提问可走预路由。
- 画布：拖拽只改连线 path；求解 pending 保留上一帧布局。
- 工作台：面板宽度单一 store，resize 不再覆写拖拽值。

## 第 15 轮落地（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 健康检查对齐 | `src/lib/layout-health.ts`、`src/lib/render-health.ts`、`src/lib/connector-geometry.ts` 及对应测试 |
| SSE 踢人断流 | `server/collaboration.ts`、`server/index.ts`（events handler）、`src/lib/collaboration-client.ts` 及对应测试 |
| parse-data 字段 | `server/ai/llm-client.ts`、`server/ai/llm-client.test.ts`、`src/lib/ai-client.ts` |
| AI 草稿提升 | `src/components/AgentAssistant.tsx`、`src/components/StudioAssistantRail.tsx`、`src/styles.css` 及对应测试 |
| 设置屏 StatusBar | `src/App.tsx`（全局设置分支）、`src/components/StatusBar.tsx`（若必须）、`src/App.test.tsx` |

## 第 15 轮已合入

- parse-data：LLM 补认行带可选 locationScope/province，非法值只丢字段。
- 协作：踢人广播 `kicked` 并掐断被踢者 SSE。
- 助手：草稿与 rail tab 提到 Provider，关抽屉不丢输入。
- 设置：全局设置挂 StatusBar；模板保存改为可取消对话框。
- 健康检查：同锚点花束豁免；`allowMapOverlap` 不报卡片压图；map 可用省份多边形精判。

## 第 16 轮（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 限流与 ticket 池 | `server/index.ts`（clientIp、events-ticket）、`server/ai/ai-observability.ts`、对应测试 |
| parse-data 上送告知 | `src/components/DataImportPanel.tsx` 及测试；必要时 `use-studio-preferences.ts` |
| SSE 客户端重订阅 | `src/lib/collaboration-client.ts`、`src/lib/useCollaborationRoom.ts` 及测试 |
| rail listbox a11y | `src/components/StudioAssistantRail.tsx` 及测试 |
| 剩余缺口复查 | 只读，不改文件 |

## 第 16 轮已合入

- rail 元素 listbox：roving tabindex，方向键/Home/End。
- SSE：非终局断流后换新 ticket 重建；kicked/closed 不重连。
- 限流：XFF 末跳；ticket 按 IP 与房间分池；429 带 Retry-After；房间生命周期打点。
- 导入：parse-data 上送前一次性告知，拒绝保持本地结果。

## 第 16 轮复查结论

前几轮清单已落地。剩余高价值缺口在图片资产与导出防护：原图 data URL 直灌工程/协作/撤销；大画布 ×3 PNG 超引擎面积上限；工作台仍用 prompt/confirm。

## 第 17 轮（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 图片降采样 | `src/lib/image-downscale.ts`（新）、AssetPanel 与四个 inspector 上传入口及测试 |
| PNG 面积防护 | `src/lib/export-poster.ts`、`usePosterExport.ts`、`DeliveryWorkspace.tsx` 及测试 |
| 工作台对话框 | `src/components/ProjectWorkbench.tsx`、`src/components/workbench/*`、对应测试 |
| 房间过期广播 closed | `server/collaboration.ts`、`server/index.ts`（仅过期清理路径）、对应测试 |
| 剩余复查 | 只读，不改文件 |

## 第 17 轮已合入

- 工作台：重命名/删除自绘对话框，不再用 prompt/confirm。
- 协作：房间 TTL 过期广播 closed。
- 导出：PNG 按 64MP 禁用超限倍率。
- 资源：五个图片入口降采样后再写入工程。

## 第 17 轮复查结论

剩余高价值：本地项目库 last-write-wins（多标签页静默覆盖）；字体上传无上限会卡死 8MB 协作事务；`editor-commands.ts` 死代码层。

## 第 18 轮（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 项目库 CAS | `src/lib/project-store.ts`、`src/App.tsx`（仅 saveLocal）、对应测试 |
| 字体上限与去重 | `src/lib/fonts.ts`、`TypographyPanel.tsx`、`resource-health.ts`、`resource-pack.ts` 及测试 |
| 删除 editor-commands | 仅删除 `src/lib/editor-commands.ts`、`editor-commands.test.ts`、`style-commands.test.ts` |
| 剩余复查 A | 只读 |
| 剩余复查 B | 只读 |

## 第 18 轮已合入

- 项目库：`ProjectStore.put` 支持 `expectedUpdatedAt` CAS，冲突抛 `ProjectStoreConflictError`；`saveLocal` 锁存并提示重新加载。工作台省略 expected，仍 last-write-wins。
- 字体：单文件 5MB 硬上限、≥2MB 资源健康告警、按字节去重复用 id。
- 删除无引用的 `editor-commands.ts` 及测试。

## 第 18 轮复查结论

1. **协作 SSE**：服务端心跳是注释行，`EventSource` 看不见；退避约 15.5s 后永久放弃，但 UI 仍写「浏览器会自动尝试重连」。应发 `event: ping`、客户端 watchdog、退避耗尽转长间隔或明确断开。
2. **导入入口**：Excel/CSV/`arrayBuffer` 与工程包 `readAsText` 无体积上限；工程包导入仍用 `window.confirm`；`AssetPanel` / `DataWorkspace` 默认 confirm 残留。`App.tsx` 两处 confirm 可在本轮一并换掉。
3. **存储死写路径**：`saveCustomTemplates` / `saveUserAssets` 生产零调用，仅测试引用。
4. **键盘与双挂载**：`GlobalDataNavigation` 无键盘；`GlobalSettingsScreen` 只有左右键；`StudioEditorShell` 桌面/抽屉双挂载导致重复 id。
5. **死 UI**：`WorkflowGuide` / `HistoryControls` / `GlobalSettingsDrawer` 及未使用的 `WorkspaceNav` / `SegmentedNav`。保留 `/prototype` 与 `WorkflowStepper`。

## 第 19 轮（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| SSE ping + watchdog | `server/index.ts`（仅 events 心跳）、`src/lib/collaboration-client.ts`、`src/lib/useCollaborationRoom.ts` 及测试 |
| 数据/设置 tablist 键盘 | `src/components/global-data/GlobalDataNavigation.tsx`、`src/components/GlobalSettingsScreen.tsx` 及测试 |
| 右栏单挂载 | `src/components/StudioEditorShell.tsx` 及测试 |
| 导入体积与对话框 | `DataImportPanel.tsx`、`usePosterExport.ts`、`DeliveryWorkspace.tsx`、`AssetPanel.tsx`、`DataWorkspace.tsx`、`App.tsx`（仅 confirm 两处）及测试；可新增对话框组件 |
| 删死 UI 与死写路径 | 删除 `WorkflowGuide.tsx`/`HistoryControls.tsx`/`GlobalSettingsDrawer.tsx` 及测试；`StudioUi.tsx` 去掉未用 nav；`template-store.ts` / `assets.ts` 去掉死写函数及测试 |

本轮不改 P2 视觉核对、不计费、不把 `/api/ai/agent` 改成多模态。工程包图片/字体预算复用可在导入切片用第 18 轮已合入的常量，但不要改 `fonts.ts`。

## 第 19 轮已合入

- 协作：SSE 心跳改为 `event: ping`；客户端 40s watchdog 换 ticket 重建；退避耗尽后 20s 长间隔继续；文案改为「正在自动重连」。
- a11y：数据导航与设置页 tablist 支持方向键与 Home/End；右栏按 760px 只挂载 aside 或 Drawer 一份。
- 导入：表格 12MB、工程包 24MB 硬上限；工程包/删素材/删学生/刷新框/新建项目改自绘 `ConfirmDialog`。
- 删除 WorkflowGuide、HistoryControls、GlobalSettingsDrawer、WorkspaceNav/SegmentedNav，以及 `saveCustomTemplates` / `saveUserAssets` 死写路径。

## 第 20 轮（文件所有权互斥）

| 切片 | 允许改动的路径 |
|---|---|
| 工作区镜像 CAS | `src/lib/browser-workspace-store.ts`、`src/lib/local-workspace-entry.ts` 及测试。对齐第 18 轮项目库 `expectedUpdatedAt`，避免多标签镜像互覆盖。不要改 `project-store.ts` / `App.tsx`。 |
| 工程包资源预算 | `src/lib/project-package.ts` 及测试。解析时丢掉超 `MAX_USER_FONT_BYTES` 的字体、过大素材；复用已有常量，不改 `fonts.ts`。 |
| SearchCombobox a11y | `src/components/SearchCombobox.tsx` 及测试。`aria-expanded` 必须与是否渲染 listbox 一致（现在用 `options` 而显示用 `displayOptions`）。 |
| RangeNumberControl 提交 | `src/components/RangeNumberControl.tsx` 及测试。滑条键盘/拖动应提交，不能只靠 blur。 |
| 剩余复查 | 只读。避开本轮落地文件与 `App.tsx` / `collaboration-client.ts` / `fonts.ts`。 |

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
