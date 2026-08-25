MODEL_SLUG: gpt-5.6-sol-xhigh-fast

# R20-gpt-server

发现并修复一个真实缺口：顶层 API 异常处理把 `error.message` 原样返回给客户端。对工作区存储制造 `ENOTDIR` 后，500 响应会暴露错误类型和完整内部路径（如 `/tmp/.../workspace.json`）。

改动：
- `server/index.ts`：未知 500 错误统一返回 `服务器内部错误`，保留稳定的 `INTERNAL_ERROR` 和 `requestId`，不再泄漏内部异常细节。
- `server/security.test.ts`：增加真实 HTTP 回归测试，验证状态码、稳定错误信封及路径/错误码不泄漏。

验证证据链：
1. failure：新回归测试失败，实际响应包含 `ENOTDIR: ... stat '/tmp/.../workspace.json'`。
2. cause：`server/index.ts` 顶层 catch 直接使用 `error.message` 作为公开响应。
3. fix：仅将未知 500 的公开消息替换为固定通用文本；预期的 `RequestBodyError` 仍保留可操作消息。
4. recheck：`npx vitest run server/security.test.ts` → 1 file / 39 tests passed；`npx tsc -p tsconfig.node.json` → 通过。

`server/index.ts` 保持 400 行以内。按要求未创建 git commit。
