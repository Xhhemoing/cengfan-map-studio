# Round 23 任务简报（进行中）

- **前置**: Round 22 已验证：tsc 绿、eslint --max-warnings 0、217 files / 1898 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `StudioTopbar` 从 `StudioStatusScreens` 进口品牌标（R22），加载/缺失屏与顶栏绑在同一文件。应抽出 `StudioBrand`。
2. `TypographyPanel` 删除字体按钮 Lucide `Trash2` 无 `aria-hidden`（icon-only + aria-label，AT 可能双读）。
3. `packSides` 剩余卡 probe 仍写死 `side: "right"`（`card-layout-modes.ts` ~341）。`containFree`/`stackAtMargin` 会覆盖，但应与 `marginSeat` 对齐。可把 pack.ts 的 `marginSeat` 改成 export（0 行净增）。
4. `CELL_DELIMITERS` 无全角冒号 `：`。`林舟：北京大学：北京市` 不会分列。有 `，` 的「姓名：…，院校：…」行必须仍先信 `，`。不要加 ASCII `:`。import-data.ts ≤400。
5. `X-Real-IP` 若被塞逗号列表，应与 XFF 一样取最右。可将 `clientIp` 抽到 `server/client-ip.ts` 做单测。index.ts ≤400。
6. 禁止 Playwright、支付、CMYK、拆 china-universities。不要改 stackAtMargin clamp 堆底。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R23-fable-arch | 抽出 StudioBrand；改 Topbar / StatusScreens import；测试。禁止 pack。 |
| R23-fable-sota | `TypographyPanel.tsx` + 其测试。删除字体图标 aria-hidden。 |
| R23-opus-layout | `card-layout-modes.ts` + 测试；pack.ts 仅 export `marginSeat`。modes/pack ≤400。 |
| R23-opus-data | `import-data.ts`（≤400）+ 测试。CELL_DELIMITERS 加 `：`。 |
| R23-gpt-perf | bench。无 CI 时限。诚实跳过也可。 |
| R23-gpt-server | `clientIp` 抽出或 X-Real-IP 最右；index.ts ≤400；测试。 |
