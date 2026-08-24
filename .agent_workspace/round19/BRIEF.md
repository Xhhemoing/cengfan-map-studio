# Round 19 任务简报（进行中）

- **前置**: Round 18 已验证：tsc 绿、eslint 0 error（5 条既有 react-refresh 警告）、210 files / 1846 tests
- **分支**: `cursor/agent-sota-polish-cbcd`（禁止 commit/stash/新分支）
- **模型**: 2× claude-fable-5-thinking-xhigh · 2× claude-opus-5-thinking-high-fast · 2× gpt-5.6-sol-xhigh-fast

## 真实缺口

1. `npx eslint .` 仍有 5 条 `react-refresh/only-export-components` 警告：`StudioMuiProvider.tsx` 导出 `studioTheme`；`GlobalDataNavigation.tsx` 导出 `globalDataViewLabel`；`app-initialization.tsx` 导出 `createInitialProject` / `loadInitialProject` / `loadBrowserValue` 与组件 `WorkbenchBackButton` 同文件。抽文件，清掉警告。
2. `orderResult` 的 `space` 仍可选，无 space 时回落 `(0,0)/right`。产品调用已全部传入 space。改为必填并删掉原点分支。
3. 无表头空白分隔 `1 林舟 北京大学 北京市`：leading 纯数字 token 仍当姓名。只在 unlabeled 空白切分上丢掉「整段都是数字」的前导 token；不要动 tab/CSV 表头路径。
4. `LegacyEditorChrome` / `StudioTopbarActions` 的 Undo2 图标没有 `aria-hidden`（按钮已有 label）。
5. 禁止 Playwright、支付、CMYK、拆 china-universities。实现文件 ≤400。不要改 stackAtMargin clamp 堆底。

## 路径隔离

| 代理 | 允许 |
| --- | --- |
| R19-fable-arch | `src/lib/app-initialization.tsx`、新建 sibling ts/tsx、`src/components/StudioMuiProvider.tsx`、`src/components/global-data/GlobalDataNavigation.tsx`、对应测试与 import 更新。清 react-refresh 警告。 |
| R19-fable-sota | `src/components/studio-editor/LegacyEditorChrome.tsx`、`StudioTopbarActions.tsx`、测试。装饰图标 `aria-hidden`。禁止改 live region 逻辑。 |
| R19-opus-layout | `src/lib/card-layout-pack.ts` + 测试 + 其它已有 `orderResult` 调用点若签名变必填。`space` 必填。禁止 cache。 |
| R19-opus-data | `src/lib/import-data.ts`（保持 ≤400）+ 测试。leading 数字 token。禁止 html-table-parse。 |
| R19-gpt-perf | bench。无 CI 时限。诚实跳过也可。 |
| R19-gpt-server | CI 在警告清零后加 `--max-warnings 0`；若警告还在则不要加（会红）。或修一个真实 server 洞。index.ts ≤400。 |
