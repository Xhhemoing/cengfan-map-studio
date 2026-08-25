# Round 27 任务简报（进行中）

- **前置**: Round 26 已验证：tsc 绿、eslint --max-warnings 0、221 files / 1957 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast
- **注意**: 不要回退 `e7783e1`。不要改 `stackAtMargin` 饱和堆叠。不要改 optimizer `repairPlacement` 的 `side: "right"`。不要加 Playwright / 支付 / CMYK。不要拆 china-universities。

## 真实缺口

1. `inspector/AssetInspector.tsx` 删除/上移/下移/复制 IconButton 的 Lucide 图标未在调用点写 `aria-hidden`。已有 `AssetInspector.test.tsx`。
2. `inspector/TextInspector.tsx` 删除 Trash2、显示/隐藏 Eye/EyeOff 同样未写。已有 `TextInspector.test.tsx`。note 角色可删，title 角色走显隐。
3. `card-layout-saturation.ts` 的 `slotPlacements` 在无 slot 时内联 clamp 边距座位，而 `sweepPack`/`packSides`/`layoutGrid` 已统一走导出的 `marginSeat`。改为 `marginSeat(card, space)`。文件现 382 行，≤400。已有 slotless fallback 测 sideOf；可再钉「等于 marginSeat」。不要改 layeredPack 叠卡策略。
4. 导入：`CELL_DELIMITERS` 已有 `；` 与顿号小写 `﹑`，缺小写分号 `﹔`（U+FE54），CJK 宽字符粘贴会整行无法分列。import-data.ts 已 400 行：加 `"﹔"` 必须靠压缩注释保住 ≤400。不要加 ASCII `;`（已有）。不要改 LIST_MARKER。
5. `clientIp`：Forwarded 会剥 IPv6 方括号；XFF/X-Real-IP 若为 `[2001:db8::1]` 会原样返回。对 hop 做与 Forwarded 相同的 `^[...]$` 剥括号（可带 `:port`）。不要把 IPv6 冒号当端口。不要发明 CF-Connecting-IP。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R27-fable-arch | `src/components/inspector/AssetInspector.tsx` + `AssetInspector.test.tsx`。图标 aria-hidden。 |
| R27-fable-sota | `src/components/inspector/TextInspector.tsx` + `TextInspector.test.tsx`。图标 aria-hidden。 |
| R27-opus-layout | `src/lib/card-layout-saturation.ts` + `card-layout-saturation.test.ts`。slotPlacements 走 marginSeat。≤400。 |
| R27-opus-data | `src/lib/import-data.ts` + `import-data.test.ts`。`﹔` 分隔。≤400。 |
| R27-gpt-perf | 诚实跳过也可。禁止改 stackAtMargin clamp / repairPlacement side。 |
| R27-gpt-server | `server/client-ip.ts` + `server/client-ip.test.ts`。XFF/X-Real-IP 剥 IPv6 方括号。 |
