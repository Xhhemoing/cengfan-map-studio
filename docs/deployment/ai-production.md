# AI 生产部署

本服务的 AI 运行时状态使用版本化 JSON 文件保存预算回执 ledger 和固定窗口限流。当前部署契约是单实例：多个进程或副本不能同时写入同一个状态文件。

只提供编辑器、不提供 AI/协作时，用静态托管即可，不必启动本服务。见 [public-demo.md](public-demo.md)。

## 启动

```bash
npm ci
npm run build
NODE_ENV=production npm run start
```

生产环境必须设置 `AI_BUDGET_RECEIPT_SECRET`，且至少 32 个字符。配置远程模型时，必须设置 `WORKSPACE_API_TOKEN`，或明确设置 `AI_PUBLIC_ACCESS=1`。建议通过 `DATA_DIR` 将 `.data` 挂载到持久卷；默认状态文件为 `DATA_DIR/ai-runtime-state.json`，也可用 `AI_STATE_FILE` 指定。

`TRUST_PROXY` 只接受 `0` 或 `1`。只有服务确实位于可信反向代理之后时才设置为 `1`。`SHUTDOWN_TIMEOUT_MS` 控制优雅停机的最大等待时间，默认 10000 毫秒。

## 探针

- `GET /api/live`：进程能够处理 HTTP 请求时返回 200。
- `GET /api/ready`：配置有效、AI 状态已加载、服务未进入 draining 时返回 200，否则返回 503。
- `GET /api/health`：兼容健康摘要，不包含密钥、prompt 或上游响应正文。

反向代理或编排系统应使用 `/api/live` 作为 liveness，使用 `/api/ready` 作为 readiness。停机时服务先把 readiness 置为 503，再停止接收连接并 flush 状态。

## 验收

1. 使用生产环境变量启动，确认 `/api/live` 和 `/api/ready` 返回 200。
2. 发起一次 agent 请求，记录返回的 `budgetReceipt`；flush 后重启同一实例，确认续聊可以继续，重复提交同一回执会被拒绝。
3. 触发限流并重启，确认窗口在过期前仍然有效。
4. 发送 `SIGTERM`，确认 `/api/ready` 先返回 503，进程在 flush 或超时后退出。
5. 检查状态文件只包含计数、摘要和时间字段，不包含 prompt、学生数据、API key 或工具结果。

## 回滚与边界

回滚前停止服务并备份 `AI_STATE_FILE`。如果旧版本无法读取该文件，可以回退到进程内状态模式；这会放弃重启后的回执防重放和限流恢复，但不会改变本地工程、项目导出或协作房间数据。

状态文件只支持一个写实例。多实例部署需要共享且具备原子更新能力的 `AiStateStore`，并在网关实施全局限流。当前实现不包含账户审计、计费、token 流式输出或外部 telemetry。
