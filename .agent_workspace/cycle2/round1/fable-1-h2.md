# H2 · 空名单不判健康 — 证据链

MODEL: claude-fable-5-thinking-xhigh

## 范围

仅 H2（REMAINING-BRIEF.md）。未提交/未推送。改动文件：

- `src/lib/stage-overview.ts`（`dataCards`）
- `src/lib/stage-overview.test.ts`（新增测试）
- `src/components/StudioAssistantDrawer.integration.test.tsx`（仅 fixture 文本）

## Failure（先写失败测试）

新增测试 `treats an empty roster as a warning to import, never as healthy`：用 `makeInput({ stage: "data" })` 默认值（`dataHealth.total === 0`）调用 `deriveStageOverviewCards`，断言唯一卡片为 `data-empty` / `warning` / `action: data-diagnostics`，且不含 `data-clean`。

首次运行 `npx vitest run src/lib/stage-overview.test.ts`：**1 failed | 8 passed**。失败输出显示空名单实际得到：

```
+ { "id": "data-clean", "question": "名单数据健康", "severity": "ok" }
```

即 0 人被判为「名单数据健康」。

## Cause（根因）

`dataCards` 只按 `missingRequired/duplicate/unresolved/hidden` 生成问题卡；`total === 0` 时四项计数全为 0，走进兜底分支 `if (cards.length === 0)` 推出 `data-clean`（"0 人 · 无缺失、无重复、全部可定位"）。空名单被当成健康名单。

## Fix（最小修复）

1. `dataCards` **开头**新增：`total === 0` 时推 warning 卡 `{ id: "data-empty", question: "还没有名单", status: "名单为空，先导入或录入毕业去向名单", action: { kind: "data-diagnostics" } }`（文案对齐 `WorkflowGuide.tsx` 的空名单提示）。
2. 兜底分支收紧为 `cards.length === 0 && h.total > 0`，`data-clean` 仅在确有名单时出现。
3. 修正编码了旧 bug 的 fixture：`StudioAssistantDrawer.integration.test.tsx` 中手写的 `data-clean` 卡 status 由 `"0 人 · 无缺失、无重复、全部可定位"` 改为 `"12 人 · …"`（该状态在新逻辑下不可能产生）。仅改文本，未动测试逻辑。

## Recheck（复跑同一检查）

```
npx vitest run src/lib/stage-overview.test.ts src/components/StudioAssistantDrawer.integration.test.tsx
Test Files  2 passed (2)
     Tests  11 passed (11)
```

原有「healthy roster（total: 10）→ 单张 data-clean ok 卡」测试保持通过，行为对非空名单无变化。

## 回滚方案

无数据/导出格式/API 形状变更；回滚即还原上述三个文件（`git checkout -- src/lib/stage-overview.ts src/lib/stage-overview.test.ts src/components/StudioAssistantDrawer.integration.test.tsx`）。
