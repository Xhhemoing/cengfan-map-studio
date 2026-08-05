# AI 调用平台完善进度

## STATUS
最终审查 Important 已完成：预算回执有界 ledger/序列防重放、严格 tool-call 状态机、非法模型调用规范化、update_fact 三层校验、完整工具组压缩、输入/运行时边界和 AI 错误码均已落地。`src/App.tsx` 保持 HEAD 不变。

## CHANGED
- 新增统一 AI 错误分类、脱敏、请求传输、重试和 usage/meta：`server/ai/ai-errors.ts`、`server/ai/ai-transport.ts`。
- 增加 agent 配置优先级、主备路由、实际 route/provider 和本地降级元数据。
- 增加 agent conversation/tool-batch 校验、任务预算、结构化日志、固定窗口限流。
- HTTP 层增加 requestId、agent 输入校验、health agent 配置信息和 AI 限流。
- 前端会话增加 AbortSignal、cancel、防并发、连续会话、metrics 与工具结果压缩。
- 助手界面增加取消状态、本地/备选模型提示和卸载取消。
- 更新 `.env.example` 配置项。

## TESTS
最终目标测试：

```text
19 test files passed, 182 tests passed
```

全量测试：

```text
137 test files passed, 926 tests passed
```

TypeScript：`npx tsc -p tsconfig.node.json --noEmit` 与 `npx tsc -p tsconfig.app.json --noEmit` 已通过。
Lint：`npm run lint` 已通过。
Build：`npm run build` 已通过；Vite 仅报告既有的大 chunk warning。
Diff：`git diff --check` 已通过；Git 仅报告现有文件的换行提示。
App 保护校验：`git diff --quiet -- src/App.tsx` 与 `git diff --quiet -- App.tsx` 均通过。

## TDD_EVIDENCE
- 回执 ledger：先写重复/并发/TTL 测试，观察 `createBudgetReceiptLedger is not a function`，再实现 ledger 并重跑通过。
- tool 状态机、非法模型 calls、update_fact、会话压缩、用户输入和 NaN clamp：均先写行为测试并观察失败，再按失败原因最小修复后重跑通过。
- HTTP JSON 错误码与回执注入：先增加集成测试观察旧行为不满足，再接入 route-aware validation、ledger 注入和序列签发。
- 最终目标测试 19/182 与全量 137/926 均通过，node/app tsc、lint、build、diff-check 均重跑通过。

## REVIEW_RESOLUTIONS
- Important：纯 HMAC 并发重放 -> `BudgetReceiptLedger` 原子 verify-and-consume；ledger 只存 taskId/sequence/digest/usage/rounds/time，支持 `maxEntries`/TTL 和 `createAiServer` 注入。
- Important：tool-call 顺序与重复 ID -> 服务端历史/消息状态机；前端拒绝非法 assistant 不追加孤立 tool，合法 patch rejection 保留合法组。
- Important：update_fact 值约束 -> agent-request、agent-loop、AgentSession 三层统一非空 string、trim 后 <=200。
- Important：压缩孤立 tool -> 仅压缩更早完整组，并至少保留最近四个完整 assistant/tool 组。
- Important：预算/只读/rejection 提前 finish -> route/provider/meta 补齐并写入结构化日志。
- Important：预算回执消费失败后任务卡死 -> ledger 使用 claim/commit/rollback；只有新回执成功写出后才提交旧回执，失败/取消时可安全重试。
- Important：连续 user-only 历史与预取消信号 -> 会话压缩覆盖纯用户历史，调用前已取消时不发起 fetch。
- Important：AI InvalidJson -> AI 路由返回 `AI_VALIDATION_ERROR`，非 AI 路由仍为 `INVALID_JSON`。

## CONCERNS
- `AI_BUDGET_RECEIPT_SECRET` 只保证签名跨重启稳定；ledger 仍是进程内内存，重启丢失续聊状态，多实例必须注入/共享外部 ledger 才能跨实例防重放。
- 限流同样是进程内单实例；没有 SSE token 流、用户级计费或外部 telemetry。
- Vite 仍报告既有大 chunk warning。
- 现有工作区包含用户已有的 App/graphify/学习记录变更，本次未回滚或覆盖。

## 悬浮 AI 助手
### STATUS
已在标准内容工作台和 legacy 编辑器挂载 viewport 固定悬浮助手。legacy 编辑器移除 `.editor-toolbar` 和旧内容 AI 分段入口，仅保留画布图层面板；助手默认右下 launcher，支持对话历史、保守/智能模式、取消、可选写步骤预览、单事务应用和指针拖拽边界约束。

### CHANGED
- `src/lib/agent-session.ts`：保存会话起始工程快照，新增 `transactionForSteps`，按 session step 顺序重放成功写调用并复用既有 client validation。
- `src/components/AgentAssistant.tsx`、`src/styles.css`：改为内存多对话浮窗，支持 launcher、dialog、历史、badge、选择性应用、smart 低风险自动应用、拖拽和响应式样式。
- `src/App.tsx`：标准内容 workspace 与 legacy editor 各挂载助手，移除 `contentView`、旧 AI tab 和 legacy `.editor-toolbar`。
- `src/lib/agent-session.test.ts`、`src/components/AgentAssistant.test.tsx`、`src/App.test.tsx`：增加 selected-step、部分应用、取消、历史、badge、拖拽及 App 集成覆盖。

### TDD_EVIDENCE
- AgentSession：先添加 selected-step 测试并运行，真实失败为 `session.transactionForSteps is not a function`；实现后 targeted selected-step 测试 `2 passed`。
- AgentAssistant：先添加 launcher/dialog 行为测试，真实失败为 launcher/dialog 不存在；实现后组件测试 `5 passed`。
- App：先添加 legacy/standard 集成测试，真实失败分别为 `.editor-toolbar` 仍存在和 standard launcher 不存在；实现后集成测试 `2 passed`。

### TESTS
- focused regression：`npx vitest run src/lib/agent-session.test.ts src/components/AgentAssistant.test.tsx src/App.test.tsx` -> `3 test files passed, 118 tests passed`。
- TypeScript：`npx tsc -p tsconfig.app.json --noEmit`、`npx tsc -p tsconfig.node.json --noEmit` -> exit 0。
- Lint：`npm run lint` -> exit 0。
- Build：`npm run build` -> exit 0；Vite 报告既有 chunk size warning。
- Diff：`git diff --check` -> 无 diff 错误，仅有工作区既有文件换行提示。
- 本次未运行全量 `npm test`，也未做 Playwright/浏览器截图验证。

### REVIEW_RESOLUTIONS
- Partial apply now replays selected successful writes against the `current` project, preserving manual changes made after conversation start.
- Completed conversations use `session.continue`; follow-up writes append to existing steps. Applied conversations are terminal and hide proposal controls.
- Conversation mode is stored on each record, mode changes are draft-only, smart auto-apply reads the record mode, and the optional pending-count callback is wired.
- Legacy toolbar action clusters, fit handler, and grid-only state were removed; the canvas remains rendered. The provider keeps assistant history outside stage conditional returns and unmount cancellation marks running work cancelled.
- Pointer capture uses the current header target, reset-position is keyboard reachable, and launcher labels include pending count with the badge hidden from the accessibility tree.

### FINAL_REVIEW
- 第一轮独立审查发现：partial apply 覆盖会话期间手动修改、completed 会话未续聊、applied 可重复提交、mode 不随对话保存、legacy 横栏残留、stage 切换清空历史、launcher 无障碍名称未包含待应用数、拖拽测试不足。已逐项修复并补充回归测试。
- 修复后最终只读审查：无 Critical/Important。
- 全量测试首次失败：`server/styles.test.ts` 仍断言移动端保留 `.editor-toolbar` / `.editor-toolbar-actions`。根因是删除横栏后的测试契约陈旧；更新为断言旧选择器不存在后，`npx vitest run server/styles.test.ts` 为 `1 test file passed, 11 tests passed`。

### FINAL_VERIFICATION
- focused regression：`npx vitest run src/components/AgentAssistant.test.tsx src/lib/agent-session.test.ts src/App.test.tsx src/components/StudioUi.test.tsx` -> `4 test files passed, 125 tests passed`。
- full suite：`npm test` -> `137 test files passed, 937 tests passed`。
- TypeScript：`npx tsc -p tsconfig.app.json --noEmit`、`npx tsc -p tsconfig.node.json --noEmit` -> exit 0。
- Lint：`npm run lint` -> exit 0。
- Build：`npm run build` -> exit 0；Vite 仅报告既有 >500 kB chunk warning。
- Diff：`git diff --check` -> exit 0；Git 仅报告工作区既有 CRLF 转换提示。
- UI detector：`node C:/Users/86080/.agents/skills/impeccable/scripts/detect.mjs --json src/App.tsx src/components/AgentAssistant.tsx src/styles.css` -> `[]`。

### CONCERNS
- 对话历史仅内存保存，刷新丢失；已应用事务依赖项目现有 undo history。
- 本次工作区原有大量用户修改及生成文件，未回滚、清理或覆盖无关内容。
