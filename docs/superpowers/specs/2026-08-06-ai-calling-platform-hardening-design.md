# AI 调用平台完善设计

**状态：** 已批准，进入实施

**日期：** 2026-08-06

## 1. 目标

在保留现有“无状态服务端大脑 + 浏览器影子工程执行”架构的前提下，把当前 AI 调用从可工作的首版提升为可配置、可恢复、可观测、可控成本、可安全降级的生产级调用平台。

本阶段覆盖三条现有 AI 链路：

1. `POST /api/ai/agent`：多轮工具调用与画布修改。
2. `POST /api/ai/parse-data`：名单文本智能解析。
3. `POST /api/ai/propose-edits` 与 `POST /api/ai/explain`：遗留单轮建议与解释接口，在兼容期继续维护。

AI 仍是辅助能力。确定性编辑、导入、排版、导出和历史事务在无模型时必须继续可用。

## 2. 当前基线与问题

现有实现已经具备：

- `AgentSession` 影子工程、多轮工具执行、保守/智能落地模式。
- 服务端 tool calling、补丁属性白名单、受保护字段、20 轮上限和本地规则兜底。
- 主模型 `deepseek-v4-flash`、备选 `gpt-5.6-luna` 的初步路由。
- 单次上游请求超时、512KB AI 请求体限制、digest 去 data URL。

需要修正的关键缺口：

- 配置声明与运行行为不一致：`.env.example` 声明 `AI_FALLBACK_MODEL`，实现却写死备选模型；主/备密钥和端点语义混杂。
- `/api/health` 只报告旧单轮后端，不能反映 agent 路由、备选模型及本地降级状态。
- 上游调用没有统一结果元数据，缺少 `requestId`、provider/model、延迟、token usage、fallback 原因和错误分类。
- 所有失败几乎都触发 fallback；未区分 4xx 配置/参数错误、429/5xx/超时等可重试错误。
- 没有每次任务的 token/轮次预算；设计文档中的成本封顶未落地。
- 浏览器请求没有 `AbortController`、客户端超时和取消动作；组件卸载后仍可能写状态。
- 会话每次 `run()` 清空上下文，不支持针对上次结果继续修改；重复点击也缺少明确并发保护协议。
- 服务端对 `messages` 只做数组检查，没有逐项角色、字段、长度、工具调用一致性校验。
- `tool-registry` 的 patch schema 过宽，值类型与约束主要依赖 `normalizeScene`；工具名也未在模型输出后显式拒绝未知值。
- agent 主备路由只在 `kind === failed` 时切换，但 provider 信息固定为初始模型，响应无法说明实际落在哪一层。
- 工具结果可能把较大的布局 placements 全量回传，长期多轮会话会放大上下文。
- AI 日志只有 `console.warn` 文本，不能聚合成功率、降级率、延迟和成本。

## 3. 方案选择

采用“统一调用内核 + 策略化路由 + 任务级预算 + 前端可取消会话”的渐进完善方案。

不引入模型 SDK、数据库、队列或外部可观测平台。继续使用 Node 原生 `fetch` 和 OpenAI 兼容协议，避免扩大依赖与部署面。接口兼容优先，新增元数据使用可选字段。

## 4. 总体架构

```text
AgentAssistant / DataWorkspace
  -> ai-client / AgentSession
     -> requestId + AbortSignal + client timeout
       -> Node AI routes
          -> request schema + conversation validation
          -> AiGateway (OpenAI-compatible transport)
             -> provider policy
                primary -> fallback -> local deterministic fallback
             -> retry policy (only retryable failures)
             -> normalized usage/error/latency metadata
          -> structured AI event logger
       <- outcome + meta
     <- progress / cancellation / actionable error
  -> preview -> explicit transaction -> history/persistence/export
```

边界约束：

- `server/ai/llm-client.ts` 只负责 OpenAI 兼容 HTTP 传输和响应归一化。
- `server/ai/ai-errors.ts` 负责错误分类，不包含路由决策。
- `server/ai/agent-routing.ts` 只负责模型候选配置和 fallback 策略。
- `server/ai/agent-loop.ts` 只负责 agent 回合协议、预算与工具调用校验。
- `server/index.ts` 只负责 HTTP 路由、输入校验、requestId 和响应映射。
- 前端 `AgentSession` 负责会话生命周期、影子工程和工具执行，不持有 API key。

## 5. 配置模型

新增明确的 agent 配置，兼容旧变量：

- `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`：旧单轮链路与默认主模型配置。
- `AI_PRIMARY_API_KEY` / `AI_PRIMARY_BASE_URL` / `AI_PRIMARY_MODEL`：agent 主模型，未设置时回退到旧变量，再回退到 DeepSeek 默认。
- `AI_FALLBACK_API_KEY` / `AI_FALLBACK_BASE_URL` / `AI_FALLBACK_MODEL`：agent 备选模型；没有备选密钥时允许复用主密钥，但仅当端点相同。
- `AI_TIMEOUT_MS`：单次上游请求超时，默认 60000。
- `AI_MAX_TOKENS`：单回合输出上限，agent 最低 4000。
- `AI_AGENT_MAX_ROUNDS`：任务最大回合数，默认 20，范围 1..20。
- `AI_AGENT_TOKEN_BUDGET`：任务累计 total tokens 上限，默认 60000；上游不返回 usage 时只执行轮次预算。
- `AI_RETRY_MAX_ATTEMPTS`：每个模型单回合最大尝试数，默认 2，范围 1..3。
- `AI_RETRY_BASE_DELAY_MS`：退避基数，默认 250ms。

启动与 health 只能暴露模型名、配置状态和限制，绝不暴露密钥或完整上游错误体。

## 6. 统一调用结果与错误

OpenAI 兼容传输返回：

```ts
interface AiCompletion<T> {
  value: T;
  meta: {
    requestId: string;
    provider: string;
    model: string;
    latencyMs: number;
    attempts: number;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  };
}
```

标准错误码：

- `AI_ABORTED`：调用方取消，不重试、不 fallback。
- `AI_TIMEOUT`：可重试，可 fallback。
- `AI_RATE_LIMITED`：可重试，可 fallback。
- `AI_UPSTREAM_UNAVAILABLE`：网络、502/503/504，可重试，可 fallback。
- `AI_UPSTREAM_REJECTED`：其他 4xx，不重试；配置错误可 fallback，但必须在 meta 标明原因。
- `AI_INVALID_RESPONSE`：响应缺字段、JSON/tool arguments 非法；单模型不盲重试，允许 fallback。
- `AI_BUDGET_EXCEEDED`：任务预算到达，停止远程调用，保留影子工程已有步骤并返回部分完成。
- `AI_VALIDATION_ERROR`：本地请求或工具参数校验失败。

对用户的错误文案保持简洁；详细上游错误仅写脱敏结构化日志，最多保留 200 字且清除可能的 bearer/key 模式。

## 7. 重试、降级和预算

重试只发生在 `AI_TIMEOUT`、`AI_RATE_LIMITED`、`AI_UPSTREAM_UNAVAILABLE`。

- 第一次失败后按 `baseDelay + jitter` 等待。
- 尊重上游 `Retry-After`，但等待不超过 2000ms。
- 取消信号立即中止等待和 fetch。
- 参数错误、认证错误、模型不存在、非法响应不在同一模型重复调用。

agent 路由顺序：

1. 主模型。
2. 备选模型，仅当已配置且与主模型不是完全相同的端点/模型组合。
3. 本地确定性规则。

每个回合响应带 `meta.route`：`primary | fallback | local`，并带 `fallbackReason`（若发生）。`provider` 必须反映实际执行层，不能固定为主模型。

任务累计 usage 由前端在每轮请求中回传 `budget` 状态，服务端基于可信上限重新计算本轮是否允许远程调用。服务端只信任非负整数并限制最大值；达到预算后返回 `finish`，summary 明确“已达到 AI 任务预算，保留当前预览结果”。

## 8. Agent 协议强化

`messages` 校验包括：

- 最多 80 条消息；单条 content 最多 32KB；整个请求仍受 512KB 限制。
- role 仅允许 `system/user/assistant/tool`。
- assistant 的 `tool_calls` 必须包含非空 id、`type:function`、已注册工具名、字符串 arguments。
- tool 必须带 `tool_call_id` 和字符串 content。
- 不接受客户端额外 system prompt；服务端始终移除客户端 system 消息并注入唯一受控系统消息。
- 模型返回未知工具名时生成 `tool-rejected`，不交给前端执行。
- 同一批并行调用若写同一域或引用相同目标，则拒绝冲突批次，要求模型串行重试。
- `finish` 与其他工具同时出现时拒绝混合调用，避免漏执行。

工具结果压缩：

- `auto_layout` 只回传 placement 数量、状态、警告和最多 10 个异常样例，不回传全部坐标。
- `check_health` 限制问题数量并附总数。
- `find_assets` 限制最多 20 条。
- tool content 单条上限 16KB，超出时结构化截断。

## 9. 前端会话生命周期

`AgentSession.run(message, options?)` 支持 `AbortSignal`，并增加：

- 客户端每轮超时（默认 70 秒，略高于服务端上游超时）。
- `cancel()`：中止当前 fetch；返回 `kind: cancelled`，保留已执行的影子步骤但不自动提交。
- 防并发：同一 session 同时只允许一个 run；重复调用返回明确错误。
- 连续对话：成功结束后可调用 `continue(message)`，保留受控历史和当前 shadow；新任务则创建新 session。
- 上下文压缩：仅保留最近必要的 assistant/tool 对和一条滚动摘要，不超过服务端消息限制。
- 响应 meta 累积到 session metrics，UI 显示实际模型、回合、降级状态；不展示 token 单价或思维链。

组件行为：

- 运行中显示“取消”按钮。
- 取消后显示“已取消，预览未应用”；若已有可写步骤，允许用户审查并手动应用。
- 发生 local fallback 时显示“已使用本地规则”，避免用户误以为远程模型完成了复杂推理。
- 对 429、超时、配置错误显示可行动文案。
- 组件卸载时取消请求，禁止卸载后 setState。

## 10. 安全与隐私

- 保持 digest 无 data URL，服务端二次拒绝请求中出现超长 `data:` 内容。
- 日志不记录用户完整 prompt、学生姓名、工具结果正文或 API key。
- 日志只记录 promptBytes、messageCount、toolNames、错误码、usage 和延迟。
- API 暂不增加账户认证，因为现有产品没有账号体系；增加进程内 IP 速率限制作为滥用护栏：agent 默认每 IP 每分钟 30 请求，其他 AI 路由每 IP 每分钟 20 请求。超过返回 429 `AI_RATE_LIMITED`。
- `TRUST_PROXY` 继续决定是否读取 `x-forwarded-for`。
- 速率限制为内存实现，单实例语义；多实例部署需要外部网关限流，记录为已知边界。

## 11. 健康检查与观测

`GET /api/health` 扩展为：

```json
{
  "ok": true,
  "ai": {
    "singleTurn": { "configured": true, "model": "..." },
    "agent": {
      "primary": { "configured": true, "model": "..." },
      "fallback": { "configured": true, "model": "..." },
      "localFallback": true,
      "limits": { "maxRounds": 20, "tokenBudget": 60000 }
    }
  }
}
```

保留旧顶层 `provider`、`aiEnabled` 字段一个兼容周期。

结构化日志事件：

- `ai.request.started`
- `ai.request.completed`
- `ai.request.failed`
- `ai.route.fallback`
- `ai.agent.finished`
- `ai.agent.cancelled`
- `ai.rate_limited`

日志一行 JSON，包含 `requestId`、route、model、latencyMs、attempts、usage、errorCode；不包含敏感正文。

## 12. 测试策略

单元测试：

- 配置优先级、fallback model/env 生效、无效数值收敛。
- 错误分类、重试条件、Retry-After、取消中止。
- usage 解析与元数据。
- message schema、未知工具、冲突并行调用、finish 混合调用。
- 任务轮次/token 预算。
- 日志脱敏和不记录 prompt。
- 工具结果截断。
- IP 速率限制窗口。

集成测试：

- `/api/ai/agent` 主模型成功、主失败备选成功、双失败本地降级。
- 实际 provider/meta 与路由一致。
- `/api/health` 报告 agent 配置但不泄露密钥。
- 无效 conversation 返回 400，不进入模型。
- 429 状态和错误体。

前端测试：

- AbortSignal 传入 fetch，取消后不提交。
- 组件运行中可取消，卸载自动取消。
- local fallback / fallback model 状态可见。
- 连续会话不重置 shadow，新任务重置。
- 客户端超时产生明确错误。

回归验证按仓库纪律串行运行：目标 Vitest -> AI 相关测试 -> 全量测试 -> TypeScript -> lint -> build -> `git diff --check`。

## 13. 实施边界

本阶段不包含：

- SSE token 流式输出（当前 agent 主要消费工具调用，流式收益有限）。
- 数据库账单、用户级配额或付费系统。
- 外部 telemetry/Sentry/Prometheus SDK。
- 向量检索、长期记忆、联网搜索或模型直接写文件。
- 迁移到 Anthropic/OpenAI 官方 SDK。
- 修改 `ProjectDocument`、工程包版本、协作协议或导出格式。

## 14. 验收标准

1. `.env.example` 中每个 AI 配置均被实现消费且有测试。
2. 主/备/本地三层路由返回实际 provider、route、fallback 原因。
3. 可重试错误最多按配置尝试；取消、4xx 参数错误不重试。
4. 每个 agent 任务受轮次和 token 双预算控制。
5. 前端可以取消请求，取消和卸载不产生提交或迟到状态写入。
6. 不合法 conversation、未知工具和冲突工具批次在执行前被拒绝。
7. 日志包含 requestId/延迟/usage/错误码，不包含 prompt、学生数据或密钥。
8. health 可准确说明 agent 主备配置和限制，同时保留旧字段兼容。
9. AI 不可用时本地规则与全部非 AI 编辑能力保持可用。
10. 新鲜目标测试、全量测试、类型、lint、build 均有记录；若存在既有警告，进度记录必须如实列出。
