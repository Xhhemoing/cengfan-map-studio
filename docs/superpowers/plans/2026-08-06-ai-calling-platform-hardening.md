# AI Calling Platform Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 AI agent、名单解析和遗留单轮调用完善为可配置、可重试、可降级、可观测、受任务预算约束且前端可取消的统一调用平台。

**Architecture:** 保留无状态服务端与浏览器影子工程。新增独立错误/元数据/重试传输层，由 agent 路由决定主模型、备选模型和本地规则；HTTP 层只做输入、限流、requestId 和响应；前端 AgentSession 管理取消、超时、会话指标与预览事务。

**Tech Stack:** TypeScript、Node 22 原生 `fetch`/`http`、React 19、Vitest、OpenAI-compatible chat completions。

## Global Constraints

- 不新增运行时依赖，不修改 lockfile。
- 不修改 `ProjectDocument`、工程包版本、协作 API、排版核心算法或导出格式。
- API key 只存在服务端；日志、health 和响应不得包含密钥或完整 prompt/学生数据。
- 保守模式仍为默认，取消、失败和 local fallback 均不得自动提交工程。
- agent 单回合 `max_tokens` 不低于 4000；任务最多 20 轮。
- `.env.example` 中声明的配置必须被代码消费并由测试覆盖。
- 所有实现遵循 TDD；重型验证串行运行。
- 工作区已有无关改动，不得 reset、checkout、clean 或覆盖它们。

---

## File Structure

**Create**

- `server/ai/ai-errors.ts`：标准错误码、HTTP/upstream 错误分类、可重试判断、脱敏。
- `server/ai/ai-errors.test.ts`：错误分类与脱敏测试。
- `server/ai/ai-transport.ts`：OpenAI-compatible fetch、usage/meta 解析、重试、取消。
- `server/ai/ai-transport.test.ts`：传输、Retry-After、取消与元数据测试。
- `server/ai/ai-observability.ts`：结构化日志事件与脱敏字段。
- `server/ai/ai-observability.test.ts`：日志不泄露正文/密钥测试。
- `server/ai/agent-request.ts`：conversation schema、工具批次冲突校验、预算 schema。
- `server/ai/agent-request.test.ts`：请求协议强化测试。
- `server/ai/rate-limit.ts`：进程内固定窗口 IP 限流。
- `server/ai/rate-limit.test.ts`：窗口、隔离和重置测试。
- `docs/progress/2026-08-06-ai-calling-platform.md`：最终事实进度和验证证据。

**Modify**

- `server/ai/agent-types.ts`：completion meta、usage、route、budget 类型。
- `server/ai/llm-client.ts`：改为复用 transport；单轮接口保留原响应兼容。
- `server/ai/agent-routing.ts`：主备配置优先级、实际 route/provider、fallback reason。
- `server/ai/agent-loop.ts`：工具名/批次校验、budget、usage/meta。
- `server/ai/tool-registry.ts`：结果限制常量和更明确 schema。
- `server/index.ts`：requestId、输入 schema、限流、health、结构化日志。
- `server/index.test.ts`：HTTP 集成覆盖。
- `src/lib/agent-session.ts`：AbortSignal、client timeout、cancel、防并发、metrics、续聊。
- `src/lib/agent-session.test.ts`：会话生命周期测试。
- `src/components/AgentAssistant.tsx`：取消、模型/route/fallback 状态、卸载中止。
- `src/components/AgentAssistant.test.tsx`：UI 生命周期测试。
- `src/lib/ai-client.ts`：统一错误解析和可选 signal/timeout。
- `.env.example`、`README.md`、`function.md`：配置和接口事实更新。

---

### Task 1: Standard AI Error And Completion Contracts

**Files:**
- Create: `server/ai/ai-errors.ts`
- Create: `server/ai/ai-errors.test.ts`
- Modify: `server/ai/agent-types.ts`

**Interfaces:**
- Produces `AiErrorCode`, `AiCallError`, `classifyUpstreamFailure`, `isRetryableAiError`, `sanitizeAiDetail`.
- Produces `AiUsage`, `AiCallMeta`, `AiRoute`, `AgentBudgetState` for later tasks.

- [ ] **Step 1: Write failing tests** covering:
  - Abort-like errors -> `AI_ABORTED`, not retryable.
  - timeout -> `AI_TIMEOUT`, retryable.
  - HTTP 429 -> `AI_RATE_LIMITED`, retryable.
  - HTTP 502/503/504 and fetch network errors -> `AI_UPSTREAM_UNAVAILABLE`, retryable.
  - HTTP 400/401/403/404 -> `AI_UPSTREAM_REJECTED`, not retryable.
  - malformed successful response -> `AI_INVALID_RESPONSE`, not same-model retryable.
  - `sanitizeAiDetail("Bearer sk-secret student prompt")` removes bearer/key-looking values and caps length at 200.

- [ ] **Step 2: Run** `npx vitest run server/ai/ai-errors.test.ts` and record the expected missing-module failure.

- [ ] **Step 3: Implement exact public types**:

```ts
export type AiErrorCode =
  | "AI_ABORTED"
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_UPSTREAM_UNAVAILABLE"
  | "AI_UPSTREAM_REJECTED"
  | "AI_INVALID_RESPONSE"
  | "AI_BUDGET_EXCEEDED"
  | "AI_VALIDATION_ERROR";

export class AiCallError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly options: {
      status?: number;
      retryAfterMs?: number;
      detail?: string;
      cause?: unknown;
    } = {},
  ) { super(message); }
}

export function classifyUpstreamFailure(input: {
  status?: number;
  detail?: string;
  cause?: unknown;
}): AiCallError;
export function isRetryableAiError(error: unknown): boolean;
export function sanitizeAiDetail(value: string): string;
```

Add to `agent-types.ts`:

```ts
export type AiRoute = "primary" | "fallback" | "local";
export interface AiUsage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface AiCallMeta {
  requestId: string;
  provider: string;
  model: string;
  route: AiRoute;
  latencyMs: number;
  attempts: number;
  usage?: AiUsage;
  fallbackReason?: string;
}
export interface AgentBudgetState { usedTokens: number; maxTokens: number; rounds: number; maxRounds: number }
```

- [ ] **Step 4: Re-run target test** and require zero failures.

---

### Task 2: Reliable OpenAI-Compatible Transport

**Files:**
- Create: `server/ai/ai-transport.ts`
- Create: `server/ai/ai-transport.test.ts`
- Modify: `server/ai/llm-client.ts`
- Modify: `server/ai/llm-client.test.ts`

**Interfaces:**
- Consumes Task 1 errors/types.
- Produces `requestChatCompletion<T>()` returning `{ value, meta }`.
- Existing `chatWithTools`, `createAiBackend`, parse/propose/explain signatures remain source compatible.

- [ ] **Step 1: Write failing transport tests** for:
  - Request body preserves model/messages/tools/max_tokens.
  - OpenAI usage fields map from `prompt_tokens`, `completion_tokens`, `total_tokens`.
  - Meta includes injected requestId, model, route, elapsed latency and attempts.
  - 503 then success performs exactly two attempts.
  - 400 performs one attempt.
  - 429 respects numeric `Retry-After` but caps delay at 2000ms; use fake timers.
  - AbortSignal aborts fetch or backoff and throws `AI_ABORTED`.
  - Invalid/missing `choices[0].message` throws `AI_INVALID_RESPONSE`.

- [ ] **Step 2: Run** `npx vitest run server/ai/ai-transport.test.ts` and verify RED.

- [ ] **Step 3: Implement**:

```ts
export interface AiTransportConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
}

export async function requestChatCompletion<T>(input: {
  config: AiTransportConfig;
  requestId: string;
  route: AiRoute;
  body: Record<string, unknown>;
  parse(payload: unknown): T;
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<{ value: T; meta: AiCallMeta }>;
```

Use a linked AbortController so external cancellation and `timeoutMs` both stop fetch. Parse usage defensively as non-negative integers. Do not log inside transport.

- [ ] **Step 4: Refactor `chatWithTools` and JSON chat** to call the transport. Add optional request context without breaking callers:

```ts
export interface AiRequestContext {
  requestId?: string;
  route?: AiRoute;
  signal?: AbortSignal;
}
```

`chatWithTools` returns `{ message, meta }`; update direct callers and tests in the same task. Single-turn backend result gains optional `meta`, while existing provider/mode/commands fields remain unchanged.

- [ ] **Step 5: Run** `npx vitest run server/ai/ai-transport.test.ts server/ai/llm-client.test.ts server/ai/agent-types.test.ts`.

---

### Task 3: Configuration And Primary/Fallback/Local Routing

**Files:**
- Modify: `server/ai/llm-client.ts`
- Modify: `server/ai/agent-routing.ts`
- Modify: `server/ai/agent-routing.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces `AgentRuntimeConfig` with primary/fallback/retry/budget limits.
- `AgentLoopBackend.runTurn(request, context)` returns an outcome with actual `meta`.

- [ ] **Step 1: Add failing tests** for exact precedence:
  - `AI_PRIMARY_*` overrides `AI_*`.
  - Legacy `AI_*` remains supported.
  - `AI_FALLBACK_MODEL` is consumed rather than a hard-coded value.
  - Fallback key may reuse primary only when fallback endpoint equals primary endpoint.
  - Invalid max rounds clamps to 1..20; invalid attempts clamps to 1..3; agent max tokens clamps to >=4000.
  - Same model+endpoint fallback candidate is disabled.
  - Primary success reports `route: primary` and actual model.
  - Retry-exhausted primary then fallback success reports `route: fallback` and `fallbackReason`.
  - Both remote candidates fail -> local result reports `route: local`.
  - External abort never invokes fallback/local.

- [ ] **Step 2: Run** `npx vitest run server/ai/agent-routing.test.ts` and verify failures match missing behavior.

- [ ] **Step 3: Implement config**:

```ts
export interface AgentRuntimeConfig {
  primary?: AiConfig;
  fallback?: AiConfig;
  maxRounds: number;
  tokenBudget: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}
export function resolveAgentRuntimeConfig(env?: NodeJS.ProcessEnv): AgentRuntimeConfig;
```

Keep `resolveAgentConfig` as a compatibility wrapper if tests/callers require it. Read all variables documented in the design. Never emit a credential in returned public health config.

- [ ] **Step 4: Implement route behavior**. Only route on errors/outcomes classified as remote failures. `AI_ABORTED` propagates as cancelled. Local fallback must receive the same request but no fabricated remote usage.

- [ ] **Step 5: Update `.env.example`** so every variable has a concise comment and no obsolete declaration remains.

- [ ] **Step 6: Run** routing, transport and llm-client tests together.

---

### Task 4: Agent Request Validation, Tool Batch Safety And Budgets

**Files:**
- Create: `server/ai/agent-request.ts`
- Create: `server/ai/agent-request.test.ts`
- Modify: `server/ai/agent-loop.ts`
- Modify: `server/ai/agent-loop.test.ts`
- Modify: `server/ai/tool-registry.ts`

**Interfaces:**
- Produces `parseAgentRequest(value)` and `validateAgentToolBatch(calls)`.
- Extends `AgentLoopRequest` with budget and request context.
- Agent outcomes include optional `meta` and normalized `budget`.

- [ ] **Step 1: Write request-schema failing tests**:
  - Reject >80 messages, >32KB content, unknown roles, malformed tool_calls and tool message without `tool_call_id`.
  - Strip all client system messages; system prompt is server-owned.
  - Reject digest values containing a `data:` string longer than 256 characters.
  - Normalize non-negative integer budget fields and clamp max limits to server values.

- [ ] **Step 2: Write tool-batch failing tests**:
  - Unknown tool name -> `tool-rejected`.
  - `finish` mixed with another call -> rejected.
  - Two calls writing the same domain in one batch -> rejected.
  - Two `update_text` calls with different ids are allowed; same id conflicts.
  - Read-only calls may be parallel.
  - `auto_layout` conflicts with `update_cards` in one batch.

- [ ] **Step 3: Run** `npx vitest run server/ai/agent-request.test.ts server/ai/agent-loop.test.ts` and verify RED.

- [ ] **Step 4: Implement schema and batch validator** with explicit tool names from `ALL_TOOL_NAMES`. Return structured validation data, not thrown generic strings.

- [ ] **Step 5: Implement budget control**:
  - Before remote call: if rounds >= maxRounds or usedTokens >= maxTokens, return finish with `AI_BUDGET_EXCEEDED` semantics.
  - After call: add `meta.usage.totalTokens` when present and increment rounds exactly once per remote model completion.
  - Preserve existing read-only streak and rejection brakes.
  - If upstream omits usage, enforce round limit only.

- [ ] **Step 6: Add tool-result limits constants** to registry: `MAX_TOOL_RESULT_BYTES=16*1024`, `MAX_HEALTH_ISSUES=20`, `MAX_ASSET_RESULTS=20`, `MAX_LAYOUT_SAMPLES=10`. Export helpers needed by the frontend, or mirror constants in a shared client module if importing server code would cross the browser boundary.

- [ ] **Step 7: Run** all server AI target tests.

---

### Task 5: HTTP Request IDs, Rate Limits, Health And Structured Logs

**Files:**
- Create: `server/ai/rate-limit.ts`
- Create: `server/ai/rate-limit.test.ts`
- Create: `server/ai/ai-observability.ts`
- Create: `server/ai/ai-observability.test.ts`
- Modify: `server/index.ts`
- Modify: `server/index.test.ts`

**Interfaces:**
- Produces fixed-window `createRateLimiter({limit, windowMs, now})`.
- Produces `createAiLogger(write)` with fixed event names and allowlisted fields.
- HTTP responses include `requestId`; AI agent response consumes Task 4 parser.

- [ ] **Step 1: Write failing rate-limit tests** for per-key isolation, exact limit boundary, reset after window and bounded stale-key cleanup.

- [ ] **Step 2: Write failing logger tests** confirming JSON-line output contains allowlisted metadata and excludes prompt, messages, API key, Authorization and tool content.

- [ ] **Step 3: Add HTTP integration failing tests**:
  - Invalid conversation returns 400 `AI_VALIDATION_ERROR` without upstream fetch.
  - Agent limit 31st request in a fixed window returns 429.
  - Parse-data limit is independent.
  - Every AI response and error includes requestId.
  - Health exposes primary/fallback configured/model and limits, while preserving top-level `provider`/`aiEnabled`.
  - Serialized health does not contain configured key strings.
  - Route/meta in agent response reflects actual fallback/local result.

- [ ] **Step 4: Implement limiter and logger**, then wire them into `createAiServer` through injectable options so tests use deterministic clocks and writers. Defaults: agent 30/IP/minute, other AI endpoints 20/IP/minute.

- [ ] **Step 5: Route integration**:
  - Generate or accept valid `x-request-id` capped at 128 safe characters.
  - Parse pathname rather than comparing raw URL with query strings.
  - Call `parseAgentRequest` before `agent.runTurn`.
  - Map validation/rate errors to 400/429; remote degradation remains a 200 agent outcome when local fallback succeeds.
  - Start/complete/fail/fallback log events with no user content.

- [ ] **Step 6: Run** `npx vitest run server/ai/rate-limit.test.ts server/ai/ai-observability.test.ts server/index.test.ts`.

---

### Task 6: Frontend Cancellation, Timeout, Metrics And Compact Tool Results

**Files:**
- Modify: `src/lib/agent-session.ts`
- Modify: `src/lib/agent-session.test.ts`
- Modify: `src/lib/ai-client.ts`

**Interfaces:**
- `AgentSession.run(message, { signal? }?)` returns `finish | failed | cancelled | tool-rejected`.
- Produces `cancel()`, `metrics`, `canContinue`, and `continue(message)`.
- `requestAiProposal`/`requestAiParseData` accept optional signal and parse structured server errors.

- [ ] **Step 1: Write failing AgentSession tests**:
  - Fetch receives an AbortSignal.
  - `cancel()` aborts current fetch and returns cancelled.
  - Abort after one tool call keeps shadow/steps but does not create an automatic commit.
  - Simultaneous `run()` calls reject the second call.
  - A per-round client timeout aborts a hung fetch; use fake timers.
  - Meta is accumulated into `{rounds, usedTokens, route, provider, fallbackReason}` and sent back as budget state next round.
  - `continue()` retains shadow state and bounded conversation; a new AgentSession starts clean.
  - More than the message cap compacts older assistant/tool pairs into one plain summary message.

- [ ] **Step 2: Write failing compact-result tests**:
  - auto_layout tool content omits full placements and returns count/warnings/samples <=10.
  - health issues <=20 with total count.
  - asset results <=20.
  - any tool content <=16KB and valid JSON after truncation.

- [ ] **Step 3: Run** `npx vitest run src/lib/agent-session.test.ts` and verify RED.

- [ ] **Step 4: Implement linked cancellation and timeout**. Do not use a timeout that survives after fetch completion. Normalize DOM AbortError and server `AI_ABORTED` to `kind:"cancelled"`.

- [ ] **Step 5: Implement metrics/budget and continuation**. Expose readonly snapshots. Never store or expose reasoning content in UI metrics.

- [ ] **Step 6: Add optional signal/context to `ai-client.ts`** and centralize error body parsing so user-facing errors distinguish rate limit, timeout, disabled/configuration and generic backend failures.

- [ ] **Step 7: Run** agent-session, ai-client consumers and data workspace target tests.

---

### Task 7: Assistant UI Lifecycle And Status

**Files:**
- Modify: `src/components/AgentAssistant.tsx`
- Modify: `src/components/AgentAssistant.test.tsx`
- Modify: `src/styles.css` only if existing classes cannot support the states.

**Interfaces:**
- Consumes Task 6 `cancel`, outcome and metrics.
- Existing component props remain unchanged.

- [ ] **Step 1: Write failing UI tests**:
  - Running state has a named “取消” button; clicking invokes abort and shows “已取消，预览未应用”.
  - Cancelled session never calls `onCommit`.
  - If steps existed before cancel, review remains available for explicit manual commit.
  - Unmount while running aborts and causes no React state-update warning.
  - Fallback route shows actual model or “本地规则”; it never claims remote AI completed when route is local.
  - Rate limit and timeout messages contain actionable Chinese copy.
  - Smart mode still auto-commits only successful non-high-risk remote or local steps after a normal finish, never after cancel/failure.

- [ ] **Step 2: Run** `npx vitest run src/components/AgentAssistant.test.tsx` and verify RED.

- [ ] **Step 3: Implement** with an icon button where an existing lucide cancel/stop icon is available, plus accessible name and tooltip. Track mounted state/ref, call `session.cancel()` during cleanup, and preserve conservative confirmation behavior.

- [ ] **Step 4: Run** component and App AI target tests. Check that labels used by existing tests remain stable unless tests are intentionally updated for the new behavior.

---

### Task 8: Compatibility Documentation, Review, Verification And Progress Record

**Files:**
- Modify: `README.md`
- Modify: `function.md`
- Create: `docs/progress/2026-08-06-ai-calling-platform.md`

**Interfaces:**
- Produces factual operator documentation and final evidence only; no new runtime behavior.

- [ ] **Step 1: Update docs**:
  - README setup lists primary/fallback variables, local fallback and health check.
  - `function.md` API table includes `/api/ai/agent`, cancellation/fallback semantics and corrected statement that external LLM is supported when configured.
  - Do not publish a real key, internal upstream error body or token pricing claim.

- [ ] **Step 2: Run focused AI suite serially**:

```bash
npx vitest run server/ai server/index.test.ts src/lib/agent-session.test.ts src/lib/agent-risk.test.ts src/lib/project-digest.test.ts src/components/AgentAssistant.test.tsx src/components/DataWorkspace.test.tsx
```

Record failure -> cause -> fix -> recheck for every failure. Do not merely rerun a flaky failure.

- [ ] **Step 3: Run full verification serially**:

```bash
npm test
npx tsc -p tsconfig.app.json --noEmit
npm run lint
npm run build
git diff --check
```

- [ ] **Step 4: Perform final code review** against the approved design and this plan. Findings lead, ordered by severity with file/line references. Fix all Critical/Important issues and rerun the exact affected checks.

- [ ] **Step 5: Write progress record** with:
  - implemented architecture and changed files;
  - exact test file/test counts from fresh output;
  - type/lint/build/diff-check results;
  - failure -> cause -> fix -> recheck evidence;
  - review findings and resolutions;
  - known limitations (in-memory limiter is single-instance; no SSE/user billing/external telemetry);
  - rollback: unset primary/fallback keys to force local fallback; code rollback does not require data migration because no persisted schema changed.

- [ ] **Step 6: Re-run any check affected by documentation/review edits** and ensure the progress record matches final evidence.

---

## Plan Self-Review

- **Spec coverage:** configuration, transport, retry/fallback, budget, request validation, tool safety, result compression, rate limiting, observability, health, frontend cancellation/continuation, docs, review and progress evidence each map to a task.
- **Scope:** no database, SDK migration, streaming, billing, persistent schema or unrelated UI redesign.
- **Type consistency:** `AiCallMeta`, `AiUsage`, `AgentBudgetState`, route values and cancellation outcomes are defined before consumers.
- **Compatibility:** existing single-turn result fields and health top-level fields remain; new metadata is additive.
- **No placeholders:** every task identifies files, exact behavior, target commands and public interfaces.
