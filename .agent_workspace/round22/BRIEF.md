# Round 22 任务简报（进行中）

- **前置**: Round 21 已验证：tsc 绿、eslint --max-warnings 0、216 files / 1886 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. 品牌标 `MapPinned` 仍对 AT 可见：`StudioBrand`、`StudioTopbar` 内联 brand（与 StudioBrand 重复）、`ProjectMissingScreen` / `AppErrorBoundary` 的 `workbench-brand-mark`。工作台顶栏已 hidden，这里漏了。
2. `layoutGrid` 无格可坐时把每张剩余卡放到**同一个** `marginSeat`，互相重叠。`sweepPack` 已走 `stackAtMargin(marginSeat(...))`。应对齐，不要开第二列，不要改 clamp 堆底。
3. `CELL_DELIMITERS` 有 ASCII `|` 没有全角 `｜`。粘贴 `林舟｜北京大学｜北京市` 不会分列。`import-data.ts` 必须保持 ≤400。
4. `trustProxy` 且 XFF 为空时只看 socket（反代 IP），所有用户进同一个限流桶。单层 nginx 常只设 `X-Real-IP`。有 XFF 仍取最右；无 XFF 再读 `X-Real-IP`；`trustProxy: false` 忽略两者。
5. 禁止 Playwright、支付、CMYK、拆 china-universities。实现文件 ≤400。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R22-fable-arch | `src/components/studio-editor/StudioStatusScreens.tsx`、`src/components/StudioTopbar.tsx`、测试。品牌标 hidden；顶栏尽量复用 StudioBrand。禁止 pack。 |
| R22-fable-sota | `src/components/AppErrorBoundary.tsx` + 其测试。错误壳品牌标 aria-hidden。 |
| R22-opus-layout | `src/lib/card-layout-pack.ts` + 测试。layoutGrid 剩余卡 stackAtMargin。pack.ts ≤400。 |
| R22-opus-data | `src/lib/import-data.ts`（≤400）+ 测试。CELL_DELIMITERS 加 `｜`。 |
| R22-gpt-perf | bench。无 CI 时限。诚实跳过也可。 |
| R22-gpt-server | `server/index.ts`（≤400）+ `server/security.test.ts`。trustProxy 时 X-Real-IP 回落。 |
