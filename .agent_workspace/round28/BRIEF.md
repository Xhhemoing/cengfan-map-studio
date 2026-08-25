# Round 28 任务简报（进行中）

- **前置**: Round 27 已验证：tsc 绿、eslint --max-warnings 0、221 files / 1966 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **注意**: 不要回退 `e7783e1`。不要改 `stackAtMargin` 饱和堆叠。不要改 optimizer `repairPlacement` 的 `side: "right"`。不要加 Playwright / 支付 / CMYK。不要拆 china-universities。

## 真实缺口

1. `inspector/CanvasInspector.tsx`「重置画布」`RotateCcw` 未在调用点写 `aria-hidden`。ImageUp/Trash2 已 hidden。已有 `CanvasInspector.test.tsx`。
2. `inspector/CardsInspector.tsx` 数据框上移/下移/置顶/置底 + 「重置卡片」RotateCcw 均未写 `aria-hidden`。已有 `CardsInspector.test.tsx`。
3. `card-layout.ts` 的 `contain()` 用 `betterLayout` 在若干候选里选一个返回，未再走 `orderResult`。sweep/shelf/packSides 现已保序，但 `layeredPack`/`attempt` 若将来漂移，饱和回落会交出乱序。对 winner 包一层 `orderResult(cards, winner, space)`。文件现 361 行，≤400。补一条饱和路径「id 序 = 输入序」测试（可用 `provablyInfeasible` 的过大卡）。
4. 导入：`CELL_DELIMITERS` 已有 `：` 与小写分号 `﹔`，缺小写冒号 `﹕`（U+FE55）。import-data.ts 已 400：加 `"﹕"` 必须压缩注释保住 ≤400。不要加 ASCII `:`（时间/URL）。`：` 用两格阈值，`﹕` 同样。
5. `clientIp`：Forwarded 会解开带引号的地址；XFF hop 写成 `"203.0.113.9"` 或 `"[2001:db8::1]"` 会把引号留在 IP 里。对 hop 做与 Forwarded 相同的外围引号剥离（含 `\"` 反转义），再走现有 unknown/_/IPv4 端口/方括号规则。不要发明 CF-Connecting-IP。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R28-fable-arch | `src/components/inspector/CanvasInspector.tsx` + `CanvasInspector.test.tsx`。重置图标 aria-hidden。 |
| R28-fable-sota | `src/components/inspector/CardsInspector.tsx` + `CardsInspector.test.tsx`。图层/重置图标 hidden。 |
| R28-opus-layout | `src/lib/card-layout.ts` + `card-layout.test.ts`。contain() 走 orderResult。≤400。 |
| R28-opus-data | `src/lib/import-data.ts` + `import-data.test.ts`。`﹕` 分隔。≤400。 |
| R28-gpt-perf | 诚实跳过也可。禁止改 stackAtMargin clamp / repairPlacement side。 |
| R28-gpt-server | `server/client-ip.ts` + `server/client-ip.test.ts`。XFF/X-Real-IP 剥外围引号。 |
