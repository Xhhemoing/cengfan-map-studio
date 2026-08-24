# Cycle 1 Round 3 — opus-B:展示框 / 参考卡样式差距收口

**模型:** `claude-opus-5-thinking-high-fast` ｜ **分支:** `cursor/canvas-render-display-46a1` ｜ **性质:** 生产改动 3 文件 + 测试 3 文件,**无 git commit**(按派单要求)。

**认领范围:** Round 2 结论 §4「样式」条与 fable-b 复审 G2 / G3 / G5(部分)。未触碰 `PosterCanvas.tsx`、`App.tsx`、`GuestsLayer`、`useCardLayoutWorker`,未复活死工作台,未加依赖。

---

## 0. 改动清单

| 文件 | 改动 | 对应差距 |
| --- | --- | --- |
| `src/lib/display-frame-style.ts` | `resolvePaint` 增加第四层 `fallback`(卡片级 per-field 涂装);`resolveDisplayFrameItemPaint`/`resolveDisplayFrameBlockPaint` 增加可选 `fallback` 形参;新导出 `resolveDisplayFrameFieldPaint`(无 item/block 的裸字段) | G2 |
| `src/components/canvas/DestinationCard.tsx` | 字段行与标题改由解析层出 fill/fontSize/fontWeight/anchor/opacity/fontId;flow 模式接 align 与 opacity | G2 / G3 |
| `src/components/canvas/ReferenceCardVisual.tsx` | 新增 `lineHeightMultiplier` 可选 prop(默认 1)并乘进行距与 emblem 步进;glass-stat 去掉 0.55–0.9 opacity 钳制 | §2.2 残留 1、G5 |
| `DestinationCard.test.tsx` / `display-frame-style.test.ts` / `ReferenceCardVisual.test.tsx` | 新增 9 条锁定用例(见 §3) | 验收锁 |

**级联定义(本轮确立):** `frame item / flow block style` → `卡片 per-field fallback`(`fieldTypography` / `fieldFonts`) → `frame surface`。三层对 color / fontSize / align / fontWeight / opacity / fontId / fill / strokeWidth 一致生效。

## 1. G2:`resolveDisplayFrameBlockPaint` 与 fieldTypography 接线

采用 fable-b 给的「二选一」中的**扩签名**方案,而非删除导出:解析层现在建模 per-field override,`resolveDisplayFrameBlockPaint` 在 flow 模式下成为**真实生产消费者**(`DestinationCard` 行渲染),`resolveDisplayFrameItemPaint` 在 fixed 模式下带 fallback 服务标题。行渲染不再有手写 `block.style → fieldTypography → cards.*` 链。

**像素等价论证(为什么 stock 模板不变):**

- 行 `fill`:旧 `block?.style?.color ?? fieldTypography[f]?.color ?? cards.textColor`;新 `style?.color ?? fallback.color`,其中 `fallback.color = fieldTypography[f]?.color ?? cards.textColor`。逐项同值。**刻意不让 `surface.color` 兜底**,否则显式 `displayFrame.style.color ≠ cards.textColor` 的老文档会变色;frame 级 `color` 对字段行的级联本轮**不接**(与 `align` 不同,align 是 Round 2 已落地的有意级联)。
- 行 `fontSize`:旧链末端是 `city → max(9, cards.fontSize-1)`、`name → flowNameFontSize`;新 `fallback.fontSize = fieldTypography[f]?.fontSize ?? resolveDisplayFrameFieldFontSize(f, cards.fontSize)`,对 city 即 `max(9, fs-1)`,对 name 即 `fieldTypography.name?.fontSize ?? fs`——与 `flowNameFontSize` 展开式相同(flow 模式下 block 的 fontSize 在更高优先级已命中)。
- 行 `fontWeight`:`fallback.fontWeight = cityHeading ? "bold" : "normal"` 复现旧的 700 / 400 默认,且 flow block 显式 `fontWeight` 仍压过它。
- fixed 行只吃 `frameBodyItem.style` 的 **align 与 opacity 切片**,不吃它的 color/fontSize。理由:`frameBodyItem` 是 `name` 项,若整体参与级联,城市标题行会被染成 name 的颜色/字号(`PosterCanvas.test:783` 场景下 city 会从 `#778899` 变 `#445566`)。切片写在 `fixedRowStyle`,附注释。
- 标题:`fill`/`fontFamily`/`fontWeight`/`anchor` 改走 `titlePaint`。derive 路径下 `frameTitleItem.style` 本就由 `fieldTypography.title` 生成,故同值;显式 frame 且 title 项自带 color/fontId 时**现在会生效**(此前被完全忽略),属与 align 同性质的有意级联。标题 `font-size` **仍渲染 `flowTitleFontSize`**,不取 `titlePaint.fontSize`——卡高是用前者解出来的,取 item 值会让排版与几何脱钩(代码内已注释)。

`DestinationCardStyle.flowNameFontSize` 现无消费者但保留在接口(`PosterCanvas` 仍传,本轮禁改该文件),已加 JSDoc 说明由 `fieldTypography` 派生。

## 2. G3:flow 模式接 align / opacity

- flow block 无 item 盒,故锚点落在**卡片 padding 盒**:`middle → width/2`、`end → width - horizontalPadding`、`start → horizontalPadding`(`flowAnchorX`)。默认 `align:"left"` 时 x 仍是 `horizontalPadding`,stock 模板零位移。
- 未动 `frameBodyItem.x` 兼任 horizontalPadding / 换行宽的耦合(fable-b §3 提醒),居中仅改锚点,不改 padding 语义。
- 行与标题现在都输出 `opacity`(fixed 取 `frameBodyItem.style.opacity`,flow 取 block `style.opacity`,缺省 1)。

**序列化增量(§5.4 白名单内,像素等价):** 字段行新增 `text-anchor="start"`(flow 此前缺省)与 `opacity="1"`;标题新增 `opacity="1"`。若 Round 4 建 SVG 字符串 golden,须在本轮之后取样。

## 3. 新增锁定测试(9 条)

`DestinationCard.test.tsx`(+4):

1. 强化既有 `align:"center"` fixed 锁:标题 x=102、**两行**行文 x=110 且均 `middle`(锚点在 item 盒内,不移动盒)。
2. item 级 align 压过 frame align:标题 `end`/x=192、行 `start`/x=12,并锁 item `opacity=0.6`。
3. 居中级联下 per-field typography 不丢:city 行 `#778899`/13/700,name 行 `#445566`/15/400。
4. flow 模式:默认左对齐仍 x=12/`start`;frame 居中后标题与 name 行 x=110/`middle`、city block 显式 `right` → x=208/`end`、name block `opacity=0.5` 生效。

`display-frame-style.test.ts`(+4):5. fallback 位于 item 与 surface 之间(三态:仅 fallback / item 压 fallback / 无 fallback 回 surface);6. block 与裸字段共用同一级联;7. align/opacity 由 frame 层主导、`fontWeight` fallback 可托底、裸 city 仍走 −1 字号节奏;8. fontId 优先级 item > card > frame。

`ReferenceCardVisual.test.tsx`(+2,四 presentation 各跑):9. 省略 multiplier == 传 1(锁"当前观感"),1.5 档行距按比例放大,0.8 档缩小;10. glass-stat `fill-opacity` 直出 0.2 / 1,不再被钳。

## 4. `ReferenceCardVisual` 行距与 opacity

- 行距:`Math.max(17, fontSize+5) * lineHeightMultiplier`;emblem-list 步进 `Math.max(22, base+3) * lineHeightMultiplier`(先取 max 再乘,`multiplier=1` 时仍是 22,观感不变;若先乘再 max,1.5 档会退化成 28.5 而非 33,与卡高的 `rowHeight × multiplier` 继续失配)。
- **口径限制:** `PosterCanvas.tsx` 本轮禁改,故它**尚未传** `lineHeightMultiplier`,prop 默认 1 = 现状。§2.2 残留 1(`canvas.lineHeight ≠ 1` 时 reference 卡底溢出/虚高)因此**只完成了组件侧一半**;剩余动作是在 `PosterCanvas.tsx:1067` 的 `<ReferenceCardVisual>` 加一行 `lineHeightMultiplier={lineHeightMultiplier}`(该变量已在作用域内,`:449`)。建议交给持有 PosterCanvas 的 agent 或 Round 4 单独一行落地,落地即视觉变更,需按 §5.5 先扩几何断言(测试 9 已就位)。
- glass-stat 钳制:全仓无测试要求 0.55–0.9,`applyCardTemplate("glass-stat")` 写入 `opacity: 0.78` 落在旧区间内,故**内建模板观感不变**,仅滑杆 <0.55 / >0.9 时不再半失效。P2-1 关闭。
- 硬编码色板(`#1c3154`/`#f1c84b`/`#e24d42`/`#263b78`/白描边 2.5)按派单第 4 条**未改**:它们不是 `textColor`/`accent` 的平凡替换(color-pill 标题色需与胶囊底色做对比度判定,emblem 装饰是插画元素),留给 P2-1 后续。

## 5. 验证纪律(failure → cause → fix → recheck)

工作树是活靶:并行 agent 同期在改 `PosterCanvas.tsx`(GuestsLayer 抽取 + `memo(PosterCanvas)`)、`canvas-render-metrics.ts` 等。

1. **failure(基线前):** 目标 5 文件 39/39 绿,作为改动前基线。
2. **failure(改动后,共享工作树):** `npx vitest run src/components/canvas ...` → `PosterCanvas.test.tsx` 2 红:「renders a distinct card treatment for each configured preset」(期望 `borderless` 得 `photo`)、「runs borderless connectors ...」(连接线为 null)。
3. **cause:** 两条用例都是**原地改 `project.cards` 后用同一 `project` 对象重渲染**;并行 agent 新加的 `export const PosterCanvas = memo(PosterCanvasView)`(`PosterCanvas.tsx:1136`)在 props 引用不变时 bail out,DOM 停在上一帧。与本轮三文件无关。
4. **fix:** 不在我的可改文件内(`PosterCanvas.tsx` 属禁改 + R3-1 归属他人),故不修改,改为**隔离归因**:`git worktree add /tmp/r3check HEAD --detach` + 仅覆盖本轮 6 个文件。
5. **recheck:** 隔离树 `tsc --noEmit -p tsconfig.app.json` 干净;`vitest run src/components/canvas src/lib` **737/737 绿**(含上述 2 条);全量 `vitest run` **175 文件 / 1336 用例全绿**。共享工作树上派单指定的验收命令(5 文件 + `DestinationCard.align.round3.test.tsx`)**52/52 绿**。`eslint` 目标 6 文件 0 error(3 条 `react-refresh/only-export-components` warning 为 `ReferenceCardVisual.tsx` 既有导出,非本轮引入)。

> **提醒主调度器:** 共享工作树当前 `tsc` 另有 3 条报错(`PosterCanvas.tsx` 的 `guestX`/`guestY` 未使用、`selectGuests` 未定义),属 GuestsLayer 抽取进行中的中间态,同样不在本轮域内;`memo(PosterCanvas)` 落地方需要同批修那 2 条同引用重渲染用例(改为每次构造新 `project` 对象,或让 memo 的比较函数按 `cards` 分片),否则合入即红。

## 6. 验收方式与回滚

- **验收:** 派单命令 `npx vitest run src/components/canvas/DestinationCard.test.tsx src/components/canvas/ReferenceCardVisual.test.tsx src/components/canvas/ReferenceCardVisual.round2.test.tsx src/lib/display-frame-style.test.ts src/components/canvas/PosterCanvas.reference-styles.test.tsx`(本轮 52/52,含并行 agent 的 `DestinationCard.align.round3.test.tsx`)。人工核验建议:①显式 `displayFrame.style.align:"center"` 的老文档,fixed 与 flow 两模式各看一遍标题/行居中;②glass-stat 模板把不透明度滑到 0.2 与 1.0,确认玻璃底真的跟随。
- **破坏性面:** 无持久化 schema 变化、无 API 形状变化、无导出格式变化。像素变化仅三处:显式 frame 的 title item `color`/`fontId` 现在生效;flow 模式非 left 对齐现在生效;glass-stat 超出 0.55–0.9 的不透明度现在生效。
- **回滚:** 三份生产改动互相独立,可单文件 revert。`display-frame-style.ts` 的 `fallback` 形参是**可选**的,老调用点(死工作台组件)不传即行为不变;`ReferenceCardVisual` 的 `lineHeightMultiplier` 同为可选且默认 1,删 prop 即回旧观感。

## 7. 仍未关闭(移交 Round 4)

- **G1** preset 覆盖(ticket rx=12 / borderless rx=0+stroke none)仍是内联三元,解析层无 preset 概念。
- **G4** 装饰魔数(44/30+headerExtra/22/8/13/32/36)与 `destinationHeight` 常量未感知 frame 起点。
- **§2.2 残留 2/3/4**:emblem 长名单溢出(本轮行距按比例缩放后仍与 `rowHeight` 基数 22 vs 20 不齐)、非 glass presentation 丢 cityHeading 行但卡高计入、行内 fragments 的 fieldTypography 仍被 `join("")` 拍平。
- **G5 剩余** 硬编码色板;**G6** 死工作台 CSS。
- `ReferenceCardVisual` 的 `lineHeightMultiplier` **待 `PosterCanvas` 接线**(§4)。
