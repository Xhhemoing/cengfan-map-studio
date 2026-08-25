MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 28 — CardsInspector 图标 aria-hidden

## Files changed
- `src/components/inspector/CardsInspector.tsx` — 给 5 个 IconButton 的 Lucide 图标显式加上 `aria-hidden`（调用点直接书写，与 `decorativeIcon` 兜底克隆的约定一致）:
  - 数据框上移 `<ArrowUp size={14} aria-hidden />`
  - 数据框下移 `<ArrowDown size={14} aria-hidden />`
  - 数据框置顶 `<ChevronsUp size={14} aria-hidden />`
  - 数据框置底 `<ChevronsDown size={14} aria-hidden />`
  - 重置卡片 `<RotateCcw size={15} aria-hidden />`
- `src/components/inspector/CardsInspector.test.tsx` — 新增用例 "keeps IconButton Lucide icons aria-hidden while buttons keep their accessible names"：沿用既有 `createRoot` + `flushSync` 渲染模式，遍历 5 个 `aria-label`，断言按钮存在、可访问名称保持不变、且按钮内 `svg` 的 `aria-hidden` 为 `"true"`；结束时 `root.unmount()`。

## Tests run
- `npx vitest run src/components/inspector/CardsInspector.test.tsx`
- 结果：1 个测试文件通过，15/15 用例通过（含新增 1 例），耗时 1.24s，退出码 0。

## Evidence chain（failure → cause → fix → recheck）
- Failure：无。首次运行即全绿，未出现测试/类型失败。
- Cause / Fix：改动前 CardsInspector 是 inspector 目录中少数未在调用点写 `aria-hidden` 的组件（AssetInspector、TextInspector、GuestsInspector 均已显式书写并有对应断言）；本次按同一模式补齐调用点属性并加断言防回归。
- Recheck：全量重跑目标测试文件，15/15 通过。

## 约束遵守
- 仅修改 `CardsInspector.tsx` 与 `CardsInspector.test.tsx`（工作树中其余改动为共享分支上他人已有改动，本次未触碰）。
- 未执行 git commit/stash/checkout/push/建分支；未引入 Playwright 或支付相关内容。
