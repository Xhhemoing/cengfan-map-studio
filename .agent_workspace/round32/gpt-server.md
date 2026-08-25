# R32-gpt-server 报告

## 结果

- 新增 `server/ipv4-mapped.ts`，集中实现 IPv4-mapped IPv6 的 dotted/双十六进制组归一化。
- `clientIp` 与 `isLoopbackAddress` 现在调用同一个 `normalizeIpv4MappedAddress`。
- Host 测试新增 WHATWG 序列化形式 `[::ffff:7f00:1]`，确认 loopback listener 返回 200。
- 保留 `[::FFFF:128.0.0.1]` 用例，确认仍返回 421。
- 未改 X-Forwarded-For hop 顺序，未添加 CF-Connecting-IP。

## Evidence chain

1. **Failure / gap**：代码检查确认 `client-ip.ts` 与 `host-validation.ts` 分别解析 `::ffff:H:L`；后者另有仅供 loopback 判断的十六进制首组检查，存在行为漂移风险。
2. **Cause**：IPv4-mapped IPv6 归一化没有共享所有权，Host 校验在移除 `::ffff:` 后自行解释十六进制组。
3. **Fix**：将原 client IP 归一化实现移入共享小模块；Host 先调用该实现，再只执行原有精确 `::1` 与合法 127/8 dotted IPv4 判断。新增 mapped loopback Host 验收数据。
4. **Recheck**：
   - `npx vitest run server/client-ip.test.ts server/security.test.ts`：2 files / 88 tests passed。
   - `npx tsc --noEmit -p tsconfig.node.json`：通过。
   - `git diff --check`：通过。

## 验收

本地 focused Vitest 已覆盖允许 mapped 127/8 和拒绝 mapped 128/8；合入时由父任务提交并以 CI 同组测试复验。
