# Round 24 任务简报（进行中）

- **前置**: Round 23 已验证：tsc 绿、eslint --max-warnings 0、218 files / 1913 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `LegacyEditorChrome` 顶栏「导出 PNG」`<button className="primary-button" onClick=...>` **没有 `type="button"`**（HTML 默认 submit）。约 255 行。文件 397 行，加 type 即可。
2. `GlobalSettingsDrawer` 关闭钮 `icon={<X size={16} />}` 未在调用点写 aria-hidden（IconButton 会 clone，但调用点与测试应钉住）。
3. `layoutGrid` 返回 `placements`，而 `sweepPack`/`shelfLayout` 走 `orderResult`。应对齐：`return orderResult(cards, placements, space)`。pack.ts ≤400（现 397）。不要改 stackAtMargin clamp。
4. `CELL_DELIMITERS` 无全角斜线 `／`（U+FF0F）。`林舟／北京大学／北京市` 不会分列。不要加 ASCII `/`（日期/路径）。import-data.ts ≤400。有 `，` 的行仍先信 `，`。
5. `trustProxy` 时部分反代（Caddy/Traefik）只发 RFC 7239 `Forwarded`。XFF 与 X-Real-IP 皆空时应解析最后一个 `for=`。`trustProxy: false` 忽略。`server/client-ip.ts` + 单测。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。optimizer `repairPlacement` 的 `side: "right"` **不要改**（现有测试证明 containFree 不读入站 side）。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R24-fable-arch | `LegacyEditorChrome.tsx` + 其测试。PNG 按钮 type=button。禁止 pack。 |
| R24-fable-sota | `GlobalSettingsDrawer.tsx` + 其测试。关闭图标 aria-hidden。 |
| R24-opus-layout | `card-layout-pack.ts` + 测试。layoutGrid 走 orderResult。≤400。 |
| R24-opus-data | `import-data.ts`（≤400）+ 测试。CELL_DELIMITERS 加 `／`。 |
| R24-gpt-perf | 诚实跳过也可。 |
| R24-gpt-server | `server/client-ip.ts` + `server/client-ip.test.ts`（及 index 若必须）。Forwarded for=。 |
