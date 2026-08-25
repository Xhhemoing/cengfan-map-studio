# R30 gpt-server 报告

## 结论

已修复一个真实的 loopback Host 误拒绝：`Host: [::FFFF:127.0.0.1]` 在回环监听器上原先返回 421，现在返回 200。

## failure → cause → fix → recheck

1. **Failure**：先只增加集成测试并运行
   `npx vitest run server/security.test.ts -t "allows loopback Host header"`；
   新用例失败，期望 200、实际 421。
2. **Cause**：`new URL("http://[::FFFF:127.0.0.1]")` 将 hostname 规范化为
   `[::ffff:7f00:1]`。原实现只识别 `::ffff:` 后的点分 IPv4，因此漏掉 URL
   规范化后的两个十六进制组。
3. **Fix**：
   - `::ffff:` 前缀匹配改为显式大小写不敏感，并在 lowercasing 前移除；
   - 保留严格的点分 `127/8` 校验；
   - 仅对确有 `::ffff:` 前缀的两个十六进制组识别 `7f00`–`7fff`，不放宽公共地址；
   - 增加 `[::FFFF:128.0.0.1]` 仍返回 421 的反向测试。
4. **Recheck**：
   - `npx vitest run server/security.test.ts`：1 file、48 tests 全部通过；
   - `npx tsc --noEmit -p tsconfig.node.json`：通过。

## 其他候选

- Node WHATWG URL 对 `[::1%eth0]`、`[::1%25eth0]` 均报 `Invalid URL`。zone id
  用于区分有作用域的接口地址，而 `::1` 是节点本地回环地址，不需要 zone id；
  未为这一非必要形式放宽 Host 解析。
- `[::ffff:127.0.0.1.]`、双重方括号和未加方括号的 IPv6 Host 也被 URL 解析器作为
  无效 authority 拒绝，没有发现应接受却误拒绝的额外形式。

未执行 git commit、stash、push 或切换/创建分支。
