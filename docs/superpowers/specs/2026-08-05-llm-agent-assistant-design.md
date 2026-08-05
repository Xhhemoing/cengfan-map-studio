# LLM 智能助手设计

## 目标

把现有的单轮 AI 建议器升级为能自主规划多步骤修改的智能助手。用户用中文描述需求，助手自行读取工程现状、按需查询能力、规划并执行修改步骤，覆盖编辑器的全部可写能力，同时保证绝不静默破坏用户已有的画布成果。

优先使用低价模型：主 `deepseek-v4-flash`，备 `gpt-5.6-luna`，最终兜底为现有本地规则。

## 现状与问题

现有实现能力面极窄：

- `server/ai/schemas.ts` 只有 7 条白名单命令（`setDataView`、`setTemplate`、`setCardPreset`、`setMapScale`、`setBackgroundColor`、`setVisibleFields`、`moveText`）。
- `server/ai/llm-client.ts` 是单轮 JSON 调用，没有任何规划循环，模型无法先读现状再决策。
- 真实可写面约为其 30 倍：`updateSceneTarget` 已支持 `canvas / map / province / cards / guests / text / asset` 七类目标的任意属性补丁，另有名单、素材、字体、模板、导出等能力。

因此用户稍微复杂或散碎的需求（例如"标题大一点、广东红一点、卡片太挤、水印删掉"）现有实现完全无法完成。

## 实测结论（设计依据）

以下均为对线上接口的真实探查结果，不是推测。

**模型可用性**

| 模型 | 结果 |
|---|---|
| `deepseek-v4-flash` | 可用，原生 tool calling 参数干净，作为主模型 |
| `gpt-5.6-luna` | 当前返回 502 / `model_not_found`，作为备选，恢复后自动生效 |
| `claude-sonnet-5`（tokenfree） | tool calling 参数被代理损坏，返回 `"{}{\"scale\": 1.5}"` 这类非法 JSON，**不用于工具循环** |

**规划质量**：给 flash 一个"太挤了/广东要突出/标题太小"的复合需求，它先调 `inspect_project` 读现状、再调 `describe_capability` 查属性，第二轮才下 3 个精准补丁；缩小地图时主动保持了 800:690 原始宽高比（→640×552），且未触碰 `cards`、配色等无关属性。给广东选 `manual-color` 也正确——`MapDataLayer.tsx:47` 确实让 `manual-color` 优先于热力填充。

**成本**：完整两轮自主任务 = **$0.00078**（约每千次 $0.78）。第二轮输入 1821 token 中 1792 命中缓存。同等任务 sonnet-5 要贵 32 倍。

**必须注意的坑**：输出 token 中思维链占 1592/1971。`max_tokens` 设为 1200 时**只返回思维链、零工具调用**。因此 `max_tokens` 必须 ≥ 4000。

## 架构：无状态大脑 + 前端手眼

```
用户输入
  ↓
前端 AgentSession（持有影子副本 shadowProject）
  ↓ POST /api/ai/agent  { messages, toolResults, projectDigest }
服务端（无状态）：ds-flash → luna → local-fallback
  ↓ 返回 { toolCalls[] } 或 { finish }
前端执行工具 → 在影子副本上跑真实算法 → 结果回传
  ↺ 循环
  ↓ finish
按模式落地：保守模式全预览 / 智能模式风险分级
```

服务端只负责"收下对话与工具结果，返回下一步该调什么工具"，不持有任何工程状态。

选择这个形态的三个硬理由：

1. **API Key 不出服务端**——工程状态全在浏览器（localStorage + IndexedDB），但密钥不能下发到前端。
2. **模型能看到算法真实输出**——`checkLayoutHealth`、`solveCardLayout` 只有前端算得出。模型改完布局能自己验证卡片是否真的不重叠，这对"不破坏画布"是决定性的。
3. **影子副本即预览机制**——保守模式与智能模式共用同一套底层，不必实现两遍。

代价是每轮一次 HTTP 往返，需流式进度提示。

## 状态投影

AI 端点上限 512KB（`server/index.ts:147`），而 `AssetElement.src`、`ProvinceAppearance.src` 都是内联 data URL，用户上传几张贴图即可达数 MB。因此**绝不发送原始工程**。

`src/lib/project-digest.ts` 构造精简投影：

- **剥离全部 data URL**：`src` 替换为 `"<asset:ast-xxx 120x120>"`，只留 id 与尺寸。
- **名单聚合**：不发明细，发 `{总数, 隐藏数, 省份TOP10及人数, 重复组数, 问题数}`。
- **文本元素**：只发 `{id, role, content 截断 40 字, x, y, fontSize, visibility}`。
- **省份样式**：只发已自定义的省份。

目标体积 < 8KB（实测约 1.5KB），并使 system prompt 与 digest 高度可缓存。

## 工具集（15 个）4 个只读 + 11 个写入）

采用粗粒度 + 自描述 schema：属性名**不写进**工具定义，由模型按需用 `describe_capability` 查询。这使得工具定义小、缓存友好，同时天然覆盖数百个属性——因为补丁直接进 `updateSceneTarget`。

**只读（不进历史）**

| 工具 | 作用 |
|---|---|
| `inspect_project` | 按路径读真实当前值，禁止模型凭空猜测 before |
| `describe_capability` | 查某域可写属性名、取值范围、枚举 |
| `check_health` | 跑 `checkLayoutHealth`，返回出界 / 重叠 / 连线交叉 / 文字不可读 |
| `find_assets` | 按省份或关键词检索系统贴图与用户素材 |

**写入（写进影子副本）**

| 工具 | 映射 |
|---|---|
| `update_canvas` / `update_map` / `update_province` / `update_cards` / `update_guests` / `update_text` / `update_asset` | 全部落到现有 `updateSceneTarget` |
| `set_data_view` | 映射到 `applyDataViewChange`（`catalog-usage.ts`），而非 `update_cards`。`dataView` 字段挂在 `ProjectDocument` 上，不在 `SceneDocument` 七域内，`updateSceneTarget` 触不到它；直接改 `cards.grouping` 会绕过 `applyDataViewChange` 里“保留 positions”的特殊逻辑。取值：`province / pins / heat / city / university` |
| `auto_layout` | `solveCardLayout`；**唯一**允许影响 `cards.positions` 的工具 |
| `manage_students` | 显隐、去重、改写事实字段（见风险分级） |
| `finish` | 交回中文总结 |

`update_province` 额外支持"智能取色"：模型可请求前端调 `extractImageTheme` + `optimizeNeighborThemeColors`，得到与邻省协调的颜色。

## 三层防护

**第 1 层 · 属性白名单**（`server/ai/patch-validator.ts`）

服务端按域校验属性名。未知属性**不静默丢弃**，而是回传结构化错误让模型自我改正：

```json
{"error": "map 域不存在 fontSize 属性", "availableProps": ["scale", "opacity", "landColor", "..."]}
```

实测确认 flash 有能力消化这种反馈。自我改正最多 2 次，仍失败则降级。

**第 2 层 · 受保护字段**

| 字段 | 约束 |
|---|---|
| `cards.positions` | 仅 `auto_layout` 可动，且必须在 summary 声明"将丢弃手工位置" |
| `students[].name / university / city` | 仅 `manage_students`，一律判 `high` 风险并逐条展示新旧对照 |

关于事实字段：`docs/plans/2026-07-24-ai-map-editor-design.md` 规定「AI 不可**静默**更改学生名称、录取院校或城市」。本设计允许该能力，但通过强制的逐条新旧对照与显式确认来落实该原则，并非推翻它。样式改错肉眼可见，而事实改错会正常渲染、可能直到印刷才发现，故不适用自动应用。
| `assetElements[].src`、`provinceStyles[].src` | 只能引用已存在的 assetId，模型不得编造 data URL |

**第 3 层 · normalizeScene 兜底**

所有写入最终过一遍现有 clamp 逻辑（`scale` 收敛至 0.1–3、坐标收敛至画布内）。越界值自动收敛而非崩溃。

## 两种落地模式

底层共用同一个影子副本，仅最终落地方式不同。

**保守模式（默认）**

所有改动一律进预览：画布实时呈现 + 逐条勾选，用户点确认前工程零改动。设为默认，避免用户首次使用就被自动改动惊吓。

**智能模式（可选开关）**

按风险分级：

| 风险 | 范围 | 行为 |
|---|---|---|
| `low` | 颜色、字号、单属性、显隐 | 直接应用，事后可撤销 |
| `medium` | 地图缩放、分组切换、字段增减 | 应用，并在摘要中高亮标注 |
| `high` | `auto_layout` 丢弃手工位置、套用模板整体覆盖 `cards`、删除元素、**改写学生事实字段** | 暂停，必须显式确认 |

`high` 判定依据两项已核实的代码事实：

- `applyDataViewChange`（`catalog-usage.ts:131`）**保留** `positions`，故切换分组不算 high。
- `applyCustomTemplateToProject`（`template-store.ts:279`）以 `structuredClone` 整体覆盖 `cards`，手工位置连带丢失，故套用模板判为 high。

两模式最终都走 `applyEditorCommands` → `applyTransaction`：**一个任务 = 一个历史事务**，一次 Ctrl+Z 全撤销。

## 循环控制

- 轮次上限 **20**（散碎需求常含 5 个以上独立动作，6 轮不够）。
- 同类改动模型会在**一轮内并行下多个工具调用**（实测一轮下 3 个补丁），故 5 个动作通常 2–3 轮完成，20 轮是复杂任务的余量。
- **双重刹车防跑飞**：
  - 无进展检测：连续 3 轮只读不写 → 强制收尾。
  - 成本封顶：累计 token 超阈值 → 提示"任务较复杂，已完成前 N 步"并交回。
- 满 20 轮成本上界约 $0.008。

## 模型路由

```
deepseek-v4-flash（主）→ gpt-5.6-luna（备）→ local-fallback（兜底，永不硬失败）
```

- `AI_MAX_TOKENS` 必须 ≥ 4000（思维链占比高）。
- 校验失败最多自我改正 2 次。
- `claude-sonnet-5` 不进入工具循环（代理损坏 tool 参数）。

## 文件改动

**新增**

```
server/ai/agent-loop.ts            无状态循环端点逻辑
server/ai/tool-registry.ts         工具定义 + 按域属性白名单
server/ai/patch-validator.ts       属性校验、受保护字段、错误反馈
src/lib/agent-session.ts           前端循环、影子副本、工具执行
src/lib/project-digest.ts          状态投影（剥离 data URL）
src/lib/agent-risk.ts              风险分级
src/components/AgentAssistant.tsx  对话式 UI、进度、模式开关
```

**修改**

```
server/index.ts              新增 POST /api/ai/agent（复用 512KB 限制）
src/lib/editor-commands.ts   扩展承载场景补丁命令，保留现有 7 类以兼容
src/App.tsx                  接入 AgentAssistant，替换现有 AiAssistant 挂载点
.env.example                 AI_MODEL=deepseek-v4-flash、AI_FALLBACK_MODEL、AI_MAX_TOKENS=4000
```

**不改动**：`ProjectDocument` 结构、工程包版本、资源包格式、协作 API、地图渲染与自动布局算法语义。与 `function.md` 实施边界一致。

## 测试策略

| 测试 | 验证内容 |
|---|---|
| `patch-validator.test.ts` | 未知属性被拒并返回可用属性列表；受保护字段被拦截 |
| `agent-loop.test.ts` | mock LLM 响应下的多轮循环、校验失败重试、降级链、无进展刹车 |
| `project-digest.test.ts` | data URL 被剥离；digest < 8KB |
| `agent-risk.test.ts` | 有手工位置时 `auto_layout` 判 high；改写事实字段判 high |
| `AgentAssistant.test.tsx` | 保守模式确认前工程零改动；智能模式 high 风险暂停 |

## 首版不包含

任意 SVG 代码生成、联网搜图、自动上传素材、跨班级批量处理、模型直接写文件或调用后端存储。
