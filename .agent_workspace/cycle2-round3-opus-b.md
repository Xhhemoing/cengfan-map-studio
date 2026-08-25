# Cycle 2 Round 3 — opus-b（卡片度量收口）

范围：`destination-card-metrics.ts*`、`prepared-card-content.ts`（titleWidth / flow 标题行高）、
`DestinationCard.tsx`、`PosterCanvas.tsx` 的 `cardStyle.rowHeight` 表达式与
`preparedCardContents` 调用参数。**未触碰** `DestinationCardsLayer.tsx`、`provincePolygons` 及任何
投影记忆化；**未 commit**。

## 1. `cardStyle.rowHeight` 改调共享度量（Round 2 P1）

`PosterCanvas` 原地内联 `Math.max(compactLayout ? 18 : 20, max(字段字号…, 城市标题字号) + 6) * lineHeight`，
与 `computePreparedCardMetrics` 解算卡片高度用的步进是两份同义算式。现改为：

```
rowHeight: destinationCardFixedRowHeight({
  rowFontSize: destinationCardRowFontSize({ visibleFieldFontSizes, cityHeadingFontSize }),
  compactLayout,
  lineHeightMultiplier,
})
```

数值完全不变（`prepared-card-content.test.ts` 中 `canvasRowHeight` 这份手写算式仍逐配置对拍，7 组配置全绿），
差别只是渲染步进与解算步进从此不可能各自漂移。

## 2. photo 预设 `titleWidth` 减 32

`PreparedCardContentOptions` 新增**一个**可选字段 `headerOffset?: number`（默认 0，旧调用方不受影响，
非破坏性），`computePreparedCardMetrics` 在 `titleWidth` 上再减这一段；`contentWidth` 保持整幅内边距框。

调用侧只改 `PosterCanvas` 的 `preparedCardContents`：`headerOffset: destinationCardHeaderOffset(project.cards.preset)`。
`project.cards.preset` 本就在该 memo 依赖表内，无新增依赖、无新增重算。

这正是 Round 2 定位的真残差：正文不缩进是设计（头像 21+13=34 < 首行基线 42，正文按整幅宽度换行，缩进反而会顶破右内边距），
而标题确实从 `anchorX + headerOffset` 起画，此前却按不减偏移的宽度换行 —— 长标题会画进右内边距。

顺带把 `titleWidth` 里的字面量 `36` 换成 `DESTINATION_CARD_TEXTURE_HEADER_WIDTH`，
`titleLineHeight` 改调 `destinationCardTitleLineHeight`（同式，去掉第三份 `Math.max(16, fs + 4)`）。

## 3. flow 标题行高分叉收口（Round 2 P2 / S5）

解算侧 `headerExtra = (标题行数 - 1) * titleLineHeight` 用的是文档级 `lineHeightMultiplier`；
渲染侧却用 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`（默认块声明 1.2）。
flow 模式下标题一旦折行，第二行按 1.2 步进就会掉出按 1.0 预留的头部带。

现渲染侧统一取 `lineHeightMultiplier`。既有测试没有锁 1.2 的标题基线（`DestinationCard.test.tsx`、
`DestinationCard.align.round3.test.tsx` 只断言 x/anchor/weight），故按指令选画布倍率。

## 4. 测试改动

- `destination-card-metrics.test.ts`：两处「找到才断言」的空转扫描（44 字面量、`compactLayout ? 18 : 20`）
  已失去被扫描对象，改为**反向**断言 —— 任一画布源文件都不得再内联这两条公式，且 `PosterCanvas.tsx`
  必须引用 `destinationCardFixedRowHeight` / `destinationCardRowFontSize`；
  另补 `destinationCardFixedRowHeight` 与三个下限/行距常量的绑定断言（原先只有裸数字）。
- `prepared-card-content.test.ts`：新增 headerOffset 只减标题宽（含与省份缩略图叠加 −68、极窄卡不低于一个字宽的下限）、
  以及长标题在 photo 下多折一行且卡高按 `headerExtra` 增量增长。
- `DestinationCard.test.tsx`：`renderCard` 支持传入多行标题；新增 flow 双行标题基线断言
  （multiplier 1 → `28/44`；1.5 → `36/60`，均非块 1.2 的 `31.2/50.4`）。

## 5. 验证（failure → cause → fix → recheck）

1. `npx vitest run src/lib/destination-card-metrics.test.ts src/lib/prepared-card-content.test.ts src/components/canvas/DestinationCard.test.tsx`
   首轮 47 passed / 1 failed：新加的「photo 下标题多折一行」断言 `expected 2 to be greater than 2`。
2. 根因：取的标题只有 14 字，标准宽 154px 与 photo 宽 122px 在 13px 字号下都折成 2 行，样本没跨过换行阈值，
   是测试取样问题而非实现问题（`titleWidth` 相减本身由同一文件另一条断言 154→122 覆盖）。
3. 修复：标题加长到 20 字（`…一共{count}位同学`），跨过 122px 的第三行阈值。
4. 重跑同一命令：**3 files / 48 tests 全绿**。追加 `src/lib/prepared-card-content.photo-title.cycle2.test.ts`
   （同轮另一路写的 photo 标题宽测试，恰好按同一 `headerOffset` 字段名断言）与
   `PosterCanvas.card-sizing.test.tsx` 一并跑，5 files / 56 tests 全绿。

其它检查：

- `npx eslint`（七个改动文件）无输出。
- `npx vitest run src/components/canvas src/lib`：113/114 文件通过。唯一失败为
  `PosterCanvas.pan-projection.cycle2.test.tsx`「pan 时不重投影」，属本轮 P0 地图仿射缓存尚未落地的红灯，
  代码位于 `provincePolygons`（本任务禁改区），与本次改动无关。
- `npx tsc -p tsconfig.app.json --noEmit`：4 处 `TS18048 'bounds' is possibly 'undefined'`，
  全部落在 `PosterCanvas.tsx:313` 的 `centeredProvincePolygons` 仿射映射，即上述并行 P0 工作正在改的代码块；
  本次改动涉及的行无类型错误。

## 6. 交付与回滚

- 验收方式：上列 vitest 命令 + `npx eslint`；视觉上验收点为 photo 预设长标题不再压到右内边距、
  flow 模式折行标题不再溢出头部带。
- 破坏性评估：`headerOffset` 为可选字段，`PreparedCardContentOptions` 旧构造仍合法；导出格式、API 形状、
  数据结构均未变。
- 回滚：三处独立，可单独 revert —— (1) `cardStyle.rowHeight` 改回内联算式（数值等价，纯重构）；
  (2) 删 `headerOffset` 字段与 `PosterCanvas` 调用参数（标题恢复不减偏移，卡高随折行数回退）；
  (3) `DestinationCard` 标题行高改回 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`。
