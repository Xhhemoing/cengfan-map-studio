# R2-gpt-server 报告

## 完成内容

- Leave/revoke
  - 成员离开后立即从有效访问记录移除 token；后续读、写、心跳、回填及新建 SSE 均返回 `ROOM_FORBIDDEN`。
  - 保留有界（每房间最多 256 条）的已撤销记录，只用于返回冻结的重复 leave 结果，避免重试破坏幂等性，不恢复任何访问能力。
  - 已建立的 SSE 在对应成员离开时发送 `revoked` 并关闭。
- SSE
  - 保留 20 秒默认 heartbeat，并增加仅供服务配置/测试使用的 `roomEventsHeartbeatMs`。
  - heartbeat 会重新鉴权；token 撤销后关闭连接。
  - SSE 200 响应覆盖 `nosniff`、frameguard、referrer policy、`no-cache, no-transform`；无凭证 SSE 稳定返回带 requestId 的 403 JSON，而非 500。
- AI 路由
  - `parse-data`、`propose-edits`、`explain` 严格拒绝错误字段类型、空消息、负数/非整数 studentCount。
  - agent 拒绝空白历史消息和空 budget receipt。
  - 继续会话必须提供 `taskId`；存在真实历史时还必须提供有效 budget receipt，避免通过只保留 user history 重置预算。
  - 所有上述校验统一返回 `AI_VALIDATION_ERROR` 和 requestId。
- 生产响应头
  - JSON API 与 workspace 204 响应增加 `Cache-Control: no-store`。
  - 保留 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy`。
  - 静态资源原有缓存策略不变，SSE 使用专用 no-cache 策略。
- `server/index.ts` 为 402 行，仍在目标范围内；路由逻辑继续位于拆分模块。

## 验证证据

- `npx vitest run server/index.test.ts server/collaboration.test.ts server/production.test.ts server/styles.test.ts`
  - 4 files passed，98 tests passed。
- `npx tsc --noEmit -p tsconfig.node.json`
  - 通过。
- `npx vitest run server/ai/agent-request.test.ts server/ai/schemas.test.ts`
  - 2 files passed，20 tests passed。
- 修改文件定向 ESLint
  - 通过。
- `git diff --check -- server`
  - 通过。

本轮检查均首次通过，无 failure → cause → fix → recheck 链需要记录。

## 验收与回滚

- 验收：PR/CI 运行上述命令；手动可验证 leave 后旧 token 的 room GET/transaction/SSE 均为 403，SSE 空闲连接可见 heartbeat，API JSON 响应为 `no-store`。
- 回滚：无数据迁移或持久化格式变化；如需回滚，撤销本轮 server 文件改动即可。已撤销 token 记录仅存在进程内。
- 按要求未提交 commit。
