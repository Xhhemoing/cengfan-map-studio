# Round 9 — 交付预览标题出血说明与印刷检查定位可访问性

MODEL_SLUG: claude-fable-5-thinking-xhigh

## 改动

1. **预览标题保持成品（trim）尺寸，出血时补媒体框说明**（`DeliveryWorkspace`）：
   - 出血 > 0 时标题显示「成品尺寸 W × H px」，标题下新增一行文字说明：导出将向外扩出 N mm 出血并绘制裁切标记，实际导出更大，精确像素见右侧「导出设置」。
   - 舞台画布不放大：`PosterCanvas` 照旧按成品框渲染（测试断言 viewBox 仍为 `0 0 1500 1000`）。出血为 0 时标题与原来逐字一致，无说明行。
   - 说明行用内联样式 + `<small>`，与右栏既有 `__print-note` 同一手法（CSS 文件不在本轮允许清单内）。

2. **印刷检查定位按钮可访问名（print + layout object-in-bleed）**：既有模式已含严重级别（`定位警告：…`）。补了 `printIssues`（object-in-bleed）路径此前缺失的测试：按钮名含严重级别，点击回调 `kind: "layout"`。

3. **export-resolution（target=`export`）定位是 no-op** 的处理：`resolveDeliveryIssueLocation("export")` 返回 undefined，点击本来静默无效。现在：
   - 仍是真按钮（不设 `disabled`，保持可聚焦）；标记 `aria-disabled="true"` 且不再触发 `onLocate`；
   - 动作文字从「定位」换成「见导出设置」，可访问名为「警告：{detail}，见导出设置」——严重级别保留，可见文字包含于可访问名（WCAG 2.5.3），并解释了去哪里处理，满足「不无解释地禁用」；
   - `USER_GUIDE.md` 印前体检条目补一句：导出参数类提示无画布对象可定位，按钮显示「见导出设置」，在导出设置调倍率或改导 SVG。
   - 判定收在 `issueLocatable()`（print 且 target 为 `export`），未改 `print-preflight.ts` 逻辑。

## 验证（failure → cause → fix → recheck）

- `npx vitest run src/components/workspaces/DeliveryWorkspace.test.tsx`：12/12 通过（新增 3 条：出血预览标题、object-in-bleed 定位、export-resolution 按钮语义），首跑即绿，无失败链。
- `npx tsc -p tsconfig.app.json --noEmit`：0 错误。
- `npx eslint` 两个改动文件：0 问题。
- `DeliveryWorkspace.tsx` 共 249 行（≤400 上限）。

## 文件

- `src/components/workspaces/DeliveryWorkspace.tsx`
- `src/components/workspaces/DeliveryWorkspace.test.tsx`
- `USER_GUIDE.md`（一句话）
- 本文件。未 commit（按指令）。

## 回滚

纯 UI/文档改动，无数据、导出格式或 API 形状变更；回滚即还原上述三个源文件。
