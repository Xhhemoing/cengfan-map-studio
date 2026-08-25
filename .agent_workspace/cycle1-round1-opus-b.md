# Cycle 1 Round 1 — opus-fast-B（展示框样式 token / 子画布保真度）

**模型 slug:** `claude-opus-5-thinking-high-fast`
**分支:** `cursor/canvas-render-display-46a1`
**范围:** 展示框样式 token + 编辑器/子画布视觉保真度。未改动 `src/components/canvas/PosterCanvas.tsx`。

## 一、改动清单

### 1. 新增 `src/lib/display-frame-style.ts`（纯函数样式解析层）

把「展示框有效绘制属性」从组件里抽出来，成为画布与子画布未来共用的唯一事实源。全部为纯函数，无 React / DOM 依赖。

| 导出 | 作用 |
| --- | --- |
| `resolveDisplayFrameSurface(style)` | 展示框自身：`background / opacity / borderColor / borderWidth / borderRadius / padding / margin / color / fontSize / align / fontId`，把所有 optional 字段补成确定值 |
| `resolveDisplayFrameItemPaint(item, surface)` | 固定排版图层的 `color / fill / strokeWidth / fontSize / fontWeight / opacity / align / textAnchor / fontId` |
| `resolveDisplayFrameBlockPaint(block, surface)` | 连续排版块，与固定排版共用同一套默认值 |
| `displayFrameTextX / displayFrameTextBaseline` | 文本锚点与基线几何（与画布一致：`y = item.y + min(item.height, fontSize)`） |
| `displayFrameTextAnchor / displayFrameFontWeightValue / resolveDisplayFrameFieldFontSize` | 细粒度 token 换算 |
| `DISPLAY_FRAME_DEFAULT_BORDER_WIDTH / _RADIUS / _DECORATION_FILL / CITY_MIN_FONT_SIZE` | 默认值常量，替代散落的魔法数 |

**默认值与既有 `normalizeDisplayFrame` / `renderDisplayFrameItem` 保持一致**：边框宽 1、圆角 6、边框色回落到文字色、装饰填充 `transparent`、描边宽 1、文字色回落到框文字色。

**三处经测试记录的刻意视觉修正**（都只影响子画布/编辑器，画布此轮未接入，因此不构成回归）：

1. **标题字重**：字段图层 `title` 默认 700，对齐画布卡片标题（画布 `data-card-title-line` 恒为 700/500）。此前子画布把标题渲染成常规字重，与画布明显不符。与画布不同的是，显式 `fontWeight: "normal"` 会被尊重（画布对标题的 `normal` 仍强制 700，属既有实现问题，记为后续项）。
2. **城市字号**：字段图层 `city` 默认 `max(9, 基准字号 - 1)`，对齐画布行渲染的 `Math.max(9, cards.fontSize - 1)`。
3. **对齐继承**：图层未设置 `align` 时继承框级 `style.align`。此前渲染恒定 `start`，而属性面板显示的却是 `style.align ?? frameStyle.align`，UI 与渲染不一致；默认框对齐为 `left`，因此默认工程零视觉变化。

### 2. `src/lib/display-frame.ts`（向后兼容的字段扩展）

- `DisplayFrameItemStyle` 新增可选 `opacity`，走 `normalizeItemStyle`：非法值 clamp 到 `0..1`，缺省保持 `undefined`（解析层默认 1），并纳入「全空则不落 style 对象」的判定，避免为旧数据凭空写出 `style: {}`。
- 未改动任何既有字段的形状与默认值，schema 向后兼容。

### 3. `DisplayFrameSubcanvas.tsx`（预览保真度）

- 全面改用解析层：框面 `rx / fill / fill-opacity / stroke / stroke-width` 取自 `resolveDisplayFrameSurface`，文字取 `fontSize / fontWeight / fill / textAnchor / x / y / opacity`，装饰取 `fill / stroke / strokeWidth / opacity`。
- 新增 `userFonts?: UserFont[]` 可选入参，通过 `resolveFontFamily` 渲染上传字体，与画布 `fontFamily` 行为对齐（此前子画布完全忽略 `fontId`）。
- 新增内边距参考线（虚线矩形，`data-display-frame-padding-guide`），把 `style.padding` 可视化。
- **修掉一个拖拽预览的真实错位 bug**：原本 RAF 预览写的是 `translate(绝对坐标)`，叠加在图层自身绝对坐标上，拖拽中元素会跑到约两倍偏移的位置；提交时又把该 transform 解析成绝对坐标，所以「落点正确、拖拽过程错位」。现改为 `translate(增量)` 做预览，目标绝对坐标存在 ref 里，`pointerup` 时直接提交。同时删掉原先靠正则解析 transform 的提交路径与那段空的 `if` 死代码——RAF 尚未触发就抬手时，旧路径会整段丢失本次拖拽。
- 本地 RAF 拖拽机制保留，move 期间仍然不做 React state 提交。
- 测试钩子：`data-display-frame-kind`、`data-display-frame-text`、`data-display-frame-decoration`、`data-display-frame-weight`、`data-display-frame-mode`、`data-display-frame-padding-guide`（`data-display-frame-text/decoration` 与画布同名，便于后续做双端一致性断言）。

### 4. `DisplayFrameItemInspector.tsx` / `FlowFrameEditor.tsx`

- 属性面板的字号、颜色、字重、对齐、描边宽默认值改为读解析层结果，所见即所得：选中标题时字重下拉直接显示「粗体」，选中城市时字号显示 11 而不是 12。矩形填充仍用 `style.fill ?? "#ffffff"`（`transparent` 不是合法的 `input[type=color]` 值）。
- 连续排版预览由横向 chip 流改为竖直堆叠，按 `spacing / lineHeight / 解析字号字重颜色` 渲染，并套用框的背景、圆角、内边距、对齐，真实反映连续排版节奏；块加 `data-display-frame-flow-block` 钩子。

### 5. `ReferenceCardStyleWorkspace.tsx`

- 选项按钮新增 `data-reference-card-style` 与 `data-reference-card-style-selected`，选中态可被稳定断言。

### 6. `src/styles.css`（仅展示框 / 参考卡片样式相关规则）

- 硬编码颜色改为 `var(--editor-*, 原值)`：工作台、图层列表、子画布、属性面板此前是写死的浅色，暗色主题与 atelier 暗色下会「白板 + 浅字」。全部规则保持单类选择器，未加 `!important`，atelier 皮肤覆盖（`.app-shell[data-editor-skin="atelier"] …`，特异性更高）依旧生效。
- 层级更清晰：面板标题统一 12px/700 + 细分隔线，副标题 10px 弱化色，图层名 600、层级数字 tabular-nums。
- 选中态更明确：图层项与模式切换用 `color-mix` 的强调色浅底 + 强调色描边 + 3px 内嵌色条；`.reference-card-style-option` 把 hover 与 selected 拆开（此前两者样式完全相同，选中态不可辨），选中态加内描边 + 浅底 + 标题强调色，并补 `:focus-visible` 轮廓。
- 细线（hairline）：面板 1px 边框 + 极轻投影；子画布选框、聚焦环、缩放手柄补 `vector-effect: non-scaling-stroke`，viewBox 缩放时线宽不再变形。

## 二、测试

新增 `src/lib/display-frame-style.test.ts`（14 例）：框面 token 默认与回落、归一化后的显式覆盖、图层继承、标题字重、城市字号、对齐继承、装饰填充/描边分离、`opacity` token 经归一化 clamp、字体优先级、文本锚点与基线几何、连续排版块共用默认值。

扩充 `DisplayFrameSubcanvas.test.tsx`（+5 例）：拖拽在 `pointerup` 只提交一次且落点正确、框面 token 渲染（`rx`/描边/`fill-opacity`/`data-display-frame-mode`/内边距参考线）、字段文本的字重与字号层级、图层对齐与上传字体与 `opacity`、装饰的独立填充描边。

扩充 `ReferenceCardStyleWorkspace.test.tsx`（+1 例）：选中态唯一且 `data-*`/`aria-pressed`/class 三者一致。

验证记录（failure → cause → fix → recheck）：本轮目标命令**一次通过**，无失败-修复循环。

```
npx vitest run src/lib/display-frame.test.ts src/lib/display-frame-style.test.ts \
  src/components/workspaces/DisplayFrameSubcanvas.test.tsx \
  src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx
→ 4 files / 30 tests passed

# 与并发子代理（gpt-sol-B 边界测试、opus-fast-A 的 PosterCanvas 拆分）合流后复跑
npx vitest run src/lib/display-frame.test.ts src/lib/display-frame-style.test.ts \
  src/lib/display-frame.boundary.test.ts \
  src/components/workspaces/DisplayFrameSubcanvas.test.tsx \
  src/components/workspaces/DisplayFrameSubcanvas.boundary.test.tsx \
  src/components/workspaces/ReferenceCardStyleWorkspace.test.tsx
→ 6 files / 35 tests passed

npx tsc -p tsconfig.app.json --noEmit                 → 0 error
npx eslint <本轮改动文件>                              → 0 problem
node scripts/run-heavy.mjs npx vitest run             → 169 files / 1288 tests passed
```

## 三、遗留缺口

1. **画布尚未接入解析层。** `PosterCanvas.tsx` 仍保留自己的 `frameTextAnchor / frameTextX / renderDisplayFrameItem`，本轮按分工禁止改动。Round 2 由 canvas 侧改用 `resolveDisplayFrameItemPaint` 后，标题字重、城市字号、对齐继承三项修正才会在画布与导出中同步生效；在此之前，子画布对这三项的呈现比画布更接近设计意图，属于**已知的刻意差异**。
2. **`style.opacity` 未开放到 UI。** 字段已定义并归一化、子画布已渲染，但属性面板故意不暴露——画布还不认这个字段，提前暴露会让用户在编辑器里做出画布/导出看不到的效果。等画布接入后再加控件。
3. **画布对标题 `fontWeight: "normal"` 仍强制 700**（`PosterCanvas.tsx` 的 `flowTitleBlock?.style?.fontWeight === "medium" ? 500 : 700`），解析层已尊重显式 `normal`，接入时需一并处理。
4. **子画布是等比缩放的示意预览**，用固定 240×160 viewBox，不等于真实卡片尺寸；行文本换行、`headerExtra`、`ticket/photo/borderless` 预设装饰都未在子画布体现。若要做到像素级一致，需要把画布的卡片测量逻辑也抽成纯函数。
5. **CSS 未做视觉回归防护。** 本轮样式改动靠人工审阅 + 类名/`data-*` 断言，没有截图基线；`color-mix` 需要 Chrome 111+ / Safari 16.2+（仓库既有代码已在用，未新增下限）。
6. **交付方式:** 本轮按指令不执行 git commit / push / PR。改动已被并发子代理 opus-fast-A 的提交 `44312ea` 一并纳入分支（共享工作区），验收以上述命令在该提交后的复跑结果为准。**回滚方案:** 本轮无数据/导出格式/API 形状破坏性变更；`display-frame-style.ts` 为纯新增模块，`display-frame.ts` 仅新增一个可选字段，回滚只需还原上述文件即可，历史工程 JSON 不受影响。
