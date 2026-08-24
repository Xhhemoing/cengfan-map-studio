# Round 16 任务简报（进行中）

- **前置**: Round 15 已验证：tsc 绿、206 files / 1796 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `stackAtMargin` 对 `placed.items` 单趟插入序扫描：先被跳过的卡在 y 被推下来后不会重看，饱和末路能造出逐像素重合（与自身 docstring 矛盾）。修：循环到稳定，或按 y 排序再扫。不要把「重心漂到邻象限」当 bug。
2. `LegacyEditorChrome.tsx` 旧皮顶栏撤销/重做没有 live region（R15 只修了 StudioTopbarActions）。
3. `binary-import.ts` 约 168 行仍可能 `row.filter(Boolean)` 用于会再解析的文本；核对是否静默错列。
4. `card-layout-optimizer.ts` 在 containFree 外包了 `sideOf`，R15 之后冗余但无害；可清理或不管。
5. 禁止 Playwright、支付、CMYK、拆 china-universities。不要把 flock 假装成多机锁。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R16-fable-arch | `src/lib/card-layout-optimizer.ts`、对应测试。去掉 containFree 外重复的 sideOf 若确认等价；或拆超 400 的优化器文件。禁止改 pack.ts。 |
| R16-fable-sota | `src/components/studio-editor/LegacyEditorChrome.tsx`、其测试、`USER_GUIDE.md`（≤1 句）。旧皮撤销 live region。禁止 StudioTopbarActions / MapStyle / Delivery / DataUpload。 |
| R16-opus-layout | `src/lib/card-layout-pack.ts`、`src/lib/card-layout-pack.test.ts`、必要时 `card-layout-modes.ts`。修 stackAtMargin 漏扫重合。禁止 cache。 |
| R16-opus-data | `src/lib/binary-import.ts`、测试。若 168 行 filter(Boolean) 仍喂给解析器则修空列；否则找另一处静默错并修。禁止 html-table-parse / import-data（除非测试要 import）。 |
| R16-gpt-perf | `scripts/perf-layout-bench.ts`、测试、`src/lib/layout-perf.ts`。opt-in 形状。无 CI 时限。 |
| R16-gpt-server | `server/**` 或 `.github/workflows/ci.yml`。CI 加 concurrency cancel-in-progress；或修一个真实 server 洞。index.ts ≤400。 |
