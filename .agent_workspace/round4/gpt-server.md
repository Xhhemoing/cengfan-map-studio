# R4-gpt-server

## 结果

- 现有 API 的 `HEAD` 统一返回 `405 METHOD_NOT_ALLOWED`；CORS `OPTIONS` 继续返回 204。
- 四个 AI 路由只接受 `POST`（另允许 `OPTIONS` 预检）；其余方法返回 405，并带 `Allow: POST, OPTIONS`。
- HTTP 解析器显式限制请求头/请求目标为 16 KiB，并要求 HTTP/1.1 `Host`；超长请求目标返回 431，缺失 `Host` 返回 400。
- API 命名空间判断改用已解析的 `pathname`。absolute-form 请求目标即使携带不一致的 `Host`，未知 `/api/*` 也不会落入静态 SPA。
- 未增加数据库；`server/index.ts` 最后一个非空行仍为第 400 行。

## failure → cause → fix → recheck

1. Round 3 定向基线：`server/security.test.ts` 12/12 passed。
2. 代码审查发现 absolute-form 请求目标的 API 路由使用解析后 pathname，但最终 404 分支使用原始 URL；未知 API 因此可能落入静态 SPA。
3. 将 API 命名空间判断统一为 pathname，并显式固定 Node HTTP parser 的 Host 与 16 KiB 上限；新增 AI 方法矩阵、HEAD/OPTIONS、absolute-form、缺失 Host、超长 URL 测试。
4. 定向复查：`server/security.test.ts` 23/23 passed。
5. 最终复查：
   - `npx vitest run server`：19 files、218 tests 全部通过。
   - `npx tsc --noEmit -p tsconfig.node.json`：通过。
   - `git diff --check`：通过。

## 验收

运行上述两条 Required 命令即可验收；HTTP 边界回归集中在 `server/security.test.ts`。按要求未创建 commit。
