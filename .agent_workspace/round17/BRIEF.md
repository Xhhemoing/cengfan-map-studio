# Round 17 任务简报（进行中）

- **前置**: Round 16 已验证：tsc 绿、208 files / 1808 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `stackAtMargin` 纵向命中不含 `space.gap`：推进时加了 gap，判定重叠时没加。两张卡之间可以只剩不足 gap 的缝（不是像素重合，但是比 pack 其它路径的 `hits(..., gap)` 更挤）。修判定，不要改饱和 clamp 堆底语义。
2. `layeredPack` / `slotPlacements` 缺槽回落仍写死 `side: "right"`，座位在左边距。应 `space.sideOf(area)`。
3. `GlobalSettingsScreen`（以及闲置的 `HistoryControls`）撤销/重做没有礼貌 live region；R15/R16 只修了顶栏和经典皮。
4. `import-data.ts` 无分隔符回落 `splitParts` 仍 `.filter(Boolean)`，且正则把 `-` 当分隔符：`玛丽-克莱尔 巴黎高师 巴黎` 会被切错列。`、` / `|` / `；` 不在 `CELL_DELIMITERS` 里，空列会被丢掉。
5. 禁止 Playwright、支付、CMYK、拆 china-universities。不要把 flock 假装成多机锁。实现文件 ≤400 行。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R17-fable-arch | `src/lib/card-layout-saturation.ts`、对应测试。缺槽回落用 `sideOf`。禁止改 pack.ts。 |
| R17-fable-sota | `src/components/GlobalSettingsScreen.tsx`、`src/components/HistoryControls.tsx`、对应测试、`USER_GUIDE.md`（≤1 句）。禁止 LegacyEditorChrome / StudioTopbarActions。 |
| R17-opus-layout | `src/lib/card-layout-pack.ts`、`src/lib/card-layout-pack.test.ts`。纵向命中含 gap。禁止 cache。不要改 clamp 堆底。 |
| R17-opus-data | `src/lib/import-data.ts`、测试。修 unlabeled 切分：不要用 `-` 切姓名；空列对齐。禁止 html-table-parse / binary-import（除非测试要 import）。 |
| R17-gpt-perf | `scripts/perf-layout-bench.ts`、测试、`src/lib/layout-perf.ts`。opt-in 形状。无 CI 时限。诚实跳过也可。 |
| R17-gpt-server | `server/**` 或 `.github/workflows/ci.yml`。CI 串行加 eslint；或修 `Accept-Encoding: *` / identity 与 gzip;q=0 的交互。index.ts ≤400。 |
