# Cycle 1 Round 2 — opus-fast-B（P0-3 / P0-4 / P1-1 + 抽出 ReferenceCardVisual）

**模型 slug:** `claude-opus-5-thinking-high-fast`
**分支:** `cursor/canvas-render-display-46a1`（未提交，未推送，无 PR）
**范围:** `card-templates` presentation 复位、参考卡按行渲染、`DestinationCard` 接入解析层、`ReferenceCardVisual` 抽出。未触碰 `App.tsx` / `useCardLayoutWorker.ts`，未复活旧展示框工作台。

## 一、改动清单

### P0-3 模板 presentation 复位（`src/lib/card-templates.ts`）

`applyCardTemplate` 现在返回 `presentation: template.cards.presentation ?? "standard"`。standard / ticket / photo / borderless / compact / academic / city-story 这些模板本身不带 `presentation`，此前 patch 合并后旧的 `color-pill` 会原样留下，画布继续走参考渲染器。

渲染器判定是 `(project.cards.presentation ?? "standard") !== "standard"`（`PosterCanvas.tsx`），所以显式写 `"standard"` 与「不写」等价，但只有显式写才能覆盖旧值——这就是必须补字段而不是删字段的原因。其余 `template.cards` 字段保持原样合并，`templateId` / `displayFrame: undefined` 契约不变。

### P0-4 参考卡按行渲染（`src/components/canvas/ReferenceCardVisual.tsx`）

原实现 `textFor(row) = row.lines.map(...).join(" ")`，把 `wrapCardText` 已经切好的多行拍回一行：宽度必然溢出卡片内容区，而卡片高度是按 `lineCount`（换行后的总行数）算的，于是又虚高。

现在新增 `referenceRowLines(rows)`，把每行展开成 `{ row, start, texts }`（`start` 是该行在整卡正文行里的起始序号），四种参考样式都按「每个换行行一个 `<text>`」渲染，纵向游标用全局行号而不是行索引，因此与高度公式重新对齐。校徽（emblem-list / city-label）仍按 row 画一次，锚在该 row 首行。

新增 `data-card-row-line={row.key}` 钩子（与标准卡一致），既有 `data-card-visual` / `data-card-presentation` 钩子与 DOM 结构（正文 `<text>` 仍是 `g[data-card-visual]` 的直接子节点，color-pill 场景）保持不变。

### P1-1 `DestinationCard` 接入 `display-frame-style` 解析层

- 框面 `rx / fill / fill-opacity / stroke / stroke-width` 改由 `resolveDisplayFrameSurface` 给出。为保持既有观感，先把卡片自己的回落值喂进去再解析：`background: frameStyle.background || cards.background`、`opacity: frameStyle.opacity ?? cards.opacity`、`borderColor: frameStyle.borderColor ?? map.edgeColor`（解析层自身的边框色回落是「框文字色」，与画布历史行为不同，故在入口处保留画布语义）。
- 自定义图层改走 `resolveDisplayFrameItemPaint` + `displayFrameTextX` + `displayFrameTextBaseline`，因此拿到了三项此前画布缺失的能力：对齐继承框级 `align`、字体继承框级 `fontId`、图层 `opacity` 生效。默认框 `align: "left"`、无 `fontId`、`opacity` 缺省 1，**默认工程零视觉变化**。
- 标题字重：`displayFrameFontWeightValue(...)`，默认仍 700，但显式 `normal` → 400、`medium` → 500 会被尊重（fixed 模式读 `frameTitleItem.style`，flow 模式读 `flowTitleBlock.style`）。这正是 Round 1 记下的「画布对标题 `normal` 强制 700」。
- 城市行字号：`resolveDisplayFrameFieldFontSize("city", fontSize)` 取代散落的 `Math.max(9, fontSize - 1)`；城市标题默认仍 700，显式字重同样可覆盖。
- fixed 模式下标题与正文行的 `x` / `text-anchor` 改由 `displayFrameTextX` 决定，关掉「子画布按 align 渲染、画布恒定左对齐」的双端不一致。左对齐时 `displayFrameTextX` 返回 `item.x`，与旧值逐像素相同。

### P1-3（部分）抽出 `ReferenceCardVisual`

`renderReferenceCardVisual` 及其私有工具 `REFERENCE_CARD_COLORS` / `referenceCardColor` / `readableTextColor` 从 `PosterCanvas.tsx` 移到 `src/components/canvas/ReferenceCardVisual.tsx`（kebab 不适用，仓库 canvas 组件文件名统一 PascalCase；组件 `ReferenceCardVisual` 用 `memo` 包裹，与 `DestinationCard` 一致）。`PosterCanvas` 由 1561 → 1470 行，`universityEmblems` 依赖随之移出。调用点从函数调用改成 JSX 元素，props 一一对应，行为除 P0-4 外不变。

## 二、验证（failure → cause → fix → recheck）

唯一一次失败发生在我自己新写的测试上：

1. **failure**：`PosterCanvas.reference-styles.test.tsx` 四个参考样式的换行断言全挂，`expected 168 to be less than or equal to 156`。
2. **cause**：断言用「字符数 × 字号」估算行宽，但 `wrapCardText` 的字宽模型是 CJK 1em、Latin 0.58em、空白 0.35em。含 `" · "` 分隔符的行按 1em/字符会被高估 —— 是测试的度量错了，不是渲染溢出。
3. **fix**：测试里加 `estimateTextWidth`，复用 `card-text-layout` 的同一套字宽比例。
4. **recheck**：同一命令重跑，四例全绿。

最终检查（全部 exit 0）：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.app.json` | 通过 |
| `npx vitest run src/lib/card-templates.test.ts src/components/canvas/DestinationCard.test.tsx src/components/canvas/PosterCanvas.reference-styles.test.tsx src/components/canvas/PosterCanvas.test.tsx src/lib/display-frame-style.test.ts` | 5 文件 / 78 用例（改动前基线）→ 扩测后同命令仍全绿 |
| `npx vitest run src/components/canvas src/lib/card-templates*.test.ts src/lib/display-frame-style.test.ts` | 22 文件 / 189 用例 |
| `npx vitest run src/App.test.tsx` | 114 用例 |
| `npm test`（全量，经 `scripts/run-heavy.mjs`） | 175 文件 / 1324 用例 |
| `npx eslint`（改动文件） | 0 error；`ReferenceCardVisual.tsx` 3 条 `react-refresh/only-export-components` warning（与 `app-initialization.tsx` / `GlobalDataNavigation.tsx` 同类，仓库既有惯例） |

全量跑时工作区里同时有 opus-A / gpt-sol 两路 Round 2 的未提交改动，1324 用例包含他们的新测试，一并绿。

### 新增测试

- `src/lib/card-templates.test.ts`：从 `presentation: "color-pill"` 出发，standard / ticket / compact 均得到 `"standard"`；切到 glass-stat 仍得到 `"glass-stat"`；ticket 的其余 payload（preset / connectorDash / templateId）不受影响。
- `src/components/canvas/ReferenceCardVisual.test.tsx`：四样式各自把三条换行行渲染成三个 `<text>`，基线单调递增且互不相同；`data-card-visual` 钩子与标题文本保留；城市标题只在 glass-stat 出现且字号小一档；`referenceRowLines` 的全局行号；`referenceCardColor` 稳定性与 `readableTextColor` 明暗判定。
- `src/components/canvas/PosterCanvas.reference-styles.test.tsx`：经真实画布渲染的长文本卡，四样式的每条行都独立成行、基线互异、行宽不超过内容区；以及「color-pill 应用 standard 模板后画布回到标准卡」（`data-card-presentation="standard"`、无 `data-card-visual`、有 `data-display-frame-surface`）。
- `src/components/canvas/DestinationCard.test.tsx`：框面回落到卡片背景/边框色；自定义图层继承框级对齐与字号、显式覆盖 align/opacity/color 生效；fixed 模式标题与正文行按框级 align 锚定；标题默认 700 而显式 `normal` → 400、`medium` → 500；城市行 11 号、极小字号夹到 9。

同一轮里 gpt-sol 先写了两份规格测试 `ReferenceCardVisual.round2.test.tsx`（color-pill 正文 `<text>` 数量与内容需与 `wrapCardText` 输出逐行相等）和 `card-templates.presentation.test.ts`（所有无 presentation 的内置模板都要复位成 standard）——本实现直接满足，未改动这两份文件。

## 三、验收与回滚

- **验收方式:** CI 跑 `npm test` + `npm run lint`；人工验收路径为「展示框样式台选彩色胶囊 → 卡片检查器切回标准毕业去向表 → 画布应立刻回到标准卡」，以及「把某个学生的学校名改长到需要换行 → 参考样式卡应逐行展示且不出卡片宽度」。
- **破坏性评估:** 无数据/导出格式/API 形状变更。`applyCardTemplate` 的返回多了一个 `presentation` 键，属于 `Partial<CardSettings>` 既有字段，`scene-document` 的 `normalizeCardPresentation` 已能处理。DOM 契约只增不减（新增 `data-card-row-line` 于参考卡）。
- **回滚方案:** 三处相互独立，可单独 revert。①P0-3 删掉 `card-templates.ts` 里那一行 `presentation:` 即回到旧行为；②P0-4/P1-3 把 `ReferenceCardVisual.tsx` 删除并还原 `PosterCanvas.tsx` 里的内联 `renderReferenceCardVisual`（同一 commit 的反向 patch，无外部依赖）；③P1-1 还原 `DestinationCard.tsx` 单文件即可，解析层 `display-frame-style.ts` 本轮未改动，回滚不影响子画布。

## 四、遗留

1. **参考卡行高与卡片高度公式仍未统一。** 高度来自 `destinationHeight(lineCount, rowHeight, ...)`（`rowHeight = max(18|20, rowFontSize+6) × lineHeight 倍数`），参考视觉自己用 `max(17, fontSize+5)`，emblem-list 还额外用 `max(22, lineHeight+3)`。本轮只保证「行数一致」，没有动步长，因此长名单在 emblem-list 下仍可能顶到卡片下沿。要修就得让参考样式共享 `rowHeight`，属于会改观感的变更，应先扩像素级测试。
2. **`noWrapFields` 的超宽片段仍会单行溢出。** `wrapCardText` 对 preserve 字段「整段不拆」，注释里写的「单段超宽仍按字符换行」并未实现。参考卡照样溢出，标准卡同理，是 `card-text-layout.ts` 的问题，不在本轮授权文件内。
3. **glass-stat 的 `fillOpacity` 仍被夹在 0.55–0.9**，检查器滑杆大半区间无效（Round 1 fable-B 记录）；`rx=4` 与标准卡 6 不一致。属观感决策，未动。
4. **fixed 模式正文行不消费图层字重。** 本轮只让 flow block 与标题字重走解析层；fixed 模式下 `frameBodyItem.style.fontWeight` 仍被忽略（与改动前一致）。要接需要决定城市标题 700 与图层字重的优先级。
5. **`PosterCanvas` 仍 1470 行**，嘉宾层按 Round 1 裁决留给 Round 3。
6. 未提交、未推送（任务要求）；`.agent_workspace` 中同时存在 opus-A / gpt-sol 的未提交改动，合并时注意 `PosterCanvas.tsx` 与 `card-templates.test.ts` 的交叉。
