# R3-gpt-server

## 结果

- 静态文件：保留编码路径越界检查，并新增 `realpath` 边界校验；静态目录中的符号链接不能再读取目录外文件，SPA fallback 也执行相同校验。
- HTTP 方法：已知 API/静态资源使用不支持的方法时返回 `405 METHOD_NOT_ALLOWED` 和 `Allow`；未知 API 路径仍按语义返回 404。
- JSON：请求体使用 fatal UTF-8 解码，非法字节与语法错误统一进入既有 4xx envelope。
- 限制：流式字节计数保持不变；无效/NaN 的 body-limit 配置回退到安全默认值，不能关闭 AI 的 512 KiB 上限。既有 AI 与房间 rate-limit 回归测试继续通过。
- 模块：方法表与处理逻辑放入独立的 `route-methods.ts`；`server/index.ts` 为 400 行。

## failure → cause → fix → recheck

1. 新增定向测试首次为 7 failures / 11 tests：
   - 外部符号链接返回 200：只校验词法路径，未校验文件真实路径。
   - 错误方法返回 404：路由只匹配正确方法，没有资源级方法判定。
   - 非法 UTF-8 返回 201/200：`Buffer.toString("utf8")` 将坏字节替换为 U+FFFD，替换后的 JSON 仍可解析。
2. 分别增加真实路径边界、集中式 405 判定、fatal UTF-8 解码，并补充无效 body-limit 配置保护。
3. 定向复查：`server/security.test.ts` 12/12 passed。
4. 最终复查：
   - `npx vitest run server`：19 files、207 tests 全部通过。
   - `npx tsc --noEmit -p tsconfig.node.json`：通过。
   - `git diff --check`：通过。

## 验收

运行上述两条 Required 命令即可验收；安全回归集中在 `server/security.test.ts`。按要求未创建 commit。

## 剩余风险

- 协作房间和房间创建限流仍是单进程内存状态；重启会丢失，多实例之间不共享。
- 静态文件检查与打开之间仍存在很窄的 TOCTOU 窗口；当前部署应把静态目录视为只读。若要抵御能并发改写静态目录的本机攻击者，需要基于目录文件描述符/no-follow 的打开方式。
- 允许方法表与路由声明是两处静态定义；新增 API 路径时需同步更新并添加 405 回归用例。
