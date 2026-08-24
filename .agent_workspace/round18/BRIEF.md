# Round 18 任务简报（进行中）

- **前置**: Round 17 已验证：tsc 绿、210 files / 1831 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `src/lib/card-layout-pack.ts` `orderResult`：找不到 id 时回落 `{ x: 0, y: 0, side: "right" }`。原点不在边距内，side 与座位无关。应夹到 `space.margin` 并用 `space.sideOf(seat)`。若函数没有 `space` 参数，只改能安全改的签名调用点，或在调用处传入 space。
2. `HistoryControls.tsx` 为导出 hook 写了 `eslint-disable react-refresh/only-export-components`。把 `useHistoryAnnouncement` 抽到独立文件，去掉 disable。
3. `GlobalSettingsScreen` 没有跳到主内容的 skip-link（工作室壳有）。设置页头钮在 `main` 之前抢焦点。
4. CI 仍只跑 tsc+vitest，不跑 eslint。
5. 禁止 Playwright、支付、CMYK、拆 china-universities。实现文件 ≤400 行。不要改 `stackAtMargin` 的 clamp 堆底。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R18-fable-arch | `src/components/HistoryControls.tsx`、新建 `src/components/use-history-announcement.ts`（名称以 git ls-files 为准）、对应测试、`GlobalSettingsScreen.tsx` 仅改 import。禁止改 pack。 |
| R18-fable-sota | `src/components/studio-editor/SkipToStageLink.tsx`（或等价）、`GlobalSettingsScreen.tsx`、测试、`USER_GUIDE.md` ≤1 句。设置页 skip-link。禁止 LegacyEditorChrome 大改。 |
| R18-opus-layout | `src/lib/card-layout-pack.ts` + 测试。修 `orderResult` 回落。禁止 cache / saturation。 |
| R18-opus-data | `src/lib/import-data.ts` / `binary-import.ts` 找另一处静默错列或日期序列化；没有就诚实跳过并在报告写明搜过什么。禁止 html-table-parse 除非必要。 |
| R18-gpt-perf | bench / layout-perf。无 CI 时限。诚实跳过也可。 |
| R18-gpt-server | `.github/workflows/ci.yml` 串行加 eslint；不要 `run-heavy` 与 vitest 并行。index.ts ≤400。 |
