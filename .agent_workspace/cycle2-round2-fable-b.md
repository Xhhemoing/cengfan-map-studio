MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 Round 2 — fable-B:destination-card-metrics vs prepared-card-content 残余分叉核查(C2-1 city rowHeight · C2-5 photo +32 / flow 标题)

**分支:** `cursor/canvas-render-display-46a1`(未离开,零 git 操作)｜ **性质:** 纯核查,零 src 改动 ｜ **输入:** cycle2-round1-conclusion.md、cycle2-round1-fable-b.md + 工作树实测。

**快照声明:** 核查期间工作树被并行批次持续推进(同一文件两次读取间行号漂移 20+ 行;`prepared-card-content.ts` 从"引 DestinationCard 类型 + 内联 rowFontSize"演进为"本地定义类型 + 调 metrics 新函数")。本文全部结论以**末次快照**为准,行号即该快照实测;重定位一律以函数/属性锚点名为准。未复活展示框工作台,未引入任何指向它的 import。

---

## 1. C2-1|city-only rowHeight:**语义分叉已闭合,方向与 Round 1 D1 裁决相反——且相反是对的**

### 1.1 现状

并行批次已落地:metrics 侧新增 `destinationCardRowFontSize`(destination-card-metrics.ts:193-198)与 `destinationCardFixedRowHeight`(:201-210,floor 18/20 与 +6 常量化为 `DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT`/`FIXED_ROW_MIN_HEIGHT`/`ROW_LINE_LEADING`);`computePreparedCardMetrics` 改调这两个函数(prepared-card-content.ts:115-120、:127-131)。**采用的是渲染侧语义**:visibleFields 内的 `city` 按全量 fontSize 计入 max,仅 city 标题项以 `cardFieldFontSize("city")`(= `max(9, fontSize−1)`)另行入列——与 PosterCanvas cardStyle 的内联公式逐项等价。

### 1.2 为什么 Round 1 的 D1 裁决是错的(证据链)

Round 1 fable-B §3.3 判"统一到 `cardFieldFontSize` 语义(city 取 `max(9,fs−1)`)",理由是"city 行 glyph 实际渲染字号走同一级联"。**该前提不成立**:

- 普通正文行的 rowField 恒为 `"name"`(`row.cityHeading ? "city" : "name"`,DestinationCard.tsx:229),行 `<text>` 的 paint 字号 = `typography.name ?? fontSize`(全尺寸)。
- city 值在行内只是 `<tspan>`,无 `fieldTypography.city` 覆盖时 `fontSize=undefined` → **继承行字号**(DestinationCard.tsx:258-264),并不走 `resolveDisplayFrameFieldFontSize("city")` 的 −1 级联。
- 只有 city **标题行**(cityHeading)按 −1 语义渲染,而它在新公式里正是独立的 `cityHeadingFontSize` 项。

因此渲染公式才是 glyph-true;按 Round 1 方向统一会 under-reserve 行步进(fs=16 时步进 21 对 16px glyph,吃掉 1px 行距余量)。metrics 侧的 JSDoc(destination-card-metrics.ts:182-192)已把这条裁决连同理由写死在函数头上,后人不会再翻案。核查判定:**裁决正确,登记 Round 1 D1 作废。**

顺带修正 Round 1 的触发阈值:其"fontSize≥10 即受影响"忽略了 floor 吸收。实际两式仅在 `fs+6` 超过 floor 时才分叉:非 compact `fs≥15`、compact `fs≥13`;且条件不止 `visibleFields===["city"]`,而是"city 项决定 max"(其余可见字段被 typography 压小同样触发)。

### 1.3 像素影响与回滚

这是求解侧的窄像素批(等价 Round 1 计划的 B2,方向相反):受影响文档(上述条件)的卡高**变大** `lineCount×Δ×m`,末行不再掉出 bottomPadding;渲染步进不变。回滚 = revert 该 lib 批。测试已锁死新语义:`prepared-card-content.test.ts` "steps a city-only card at the size its rows paint"(:99-112,fs16 → rowFontSize 16 / rowHeight 22 / height 78 三值锁)。

### 1.4 残余(公式仍有三份拷贝,语义已同源)

| 拷贝 | 位置 | 状态 |
| --- | --- | --- |
| 正源 | `destinationCardRowFontSize`+`destinationCardFixedRowHeight` | solver 已消费 |
| 内联 | PosterCanvas.tsx:372-375 `cardStyle.rowHeight` | **未** import metrics 函数,仍手写 `max(18/20, max(...)+6)×m` |
| 测试复刻 | prepared-card-content.test.ts:44-53 `canvasRowHeight` | 复刻 PosterCanvas 内联式,7 组配置与 metrics 对拍(:82-97) |

漂移防线有两道:上述对拍,加 `destination-card-metrics.test.ts:121-135` 用正则扫 `canvas/*.tsx` 源码把 18/20/+6 字面量对 token 逐值锁。两道都是软锁(正则不匹配即空转、复刻本身可与双方同时漂)。**收尾窄路径(像素不变):** PosterCanvas 改调两个 metrics 函数,随后删除测试复刻与正则扫描锁。改动面一个 useMemo 内三行,依赖数组无需变。

---

## 2. C2-5 前半|photo +32:**正文不缩进已裁决为设计并加不变量锁;真残叉在标题换行宽度**

### 2.1 已关闭:正文行 +32(Round 1 批次 D 作废)

owner 批次在 `destinationCardHeaderOffset` 的 JSDoc(destination-card-metrics.ts:127-139)明确裁决 header-only:头像盘底 = `AVATAR_CENTER_Y(21) + AVATAR_RADIUS(13) = 34 ≤ FIXED_BODY_TOP(42)`,正文带无物可避;而正文换行宽度按整个 padding 盒求解(`contentWidth`),若给正文加 +32,每条已换行的行**末字必然右溢出 padding**。配套:

- 几何前置条件锁:metrics.test:147-152 `AVATAR_CENTER_Y + AVATAR_RADIUS ≤ FIXED_BODY_TOP`(头像一旦长进正文带,裁决前提失效,测试即红)。
- 渲染处注释:DestinationCard.tsx:248-250 正文 `x` 明确"无 preset header offset"并回指该函数。

核查判定:**Round 1 把 P2-4 当缺陷、计划批次 D 给正文加 +32 是错的**——那会把视觉缺陷从"标题与正文缩进不一致"换成"正文右溢",更糟。现裁决(won't-fix + 不变量锁)成立,C2-5 前半关闭。

### 2.2 仍开放:标题换行宽度不知道 +32(本轮核查新登记)

- 绘制:`titleX = anchorX + headerOffset(32) [+ texture 36]`(destinationCardTitleX,DestinationCard.tsx:201-205)。
- 求解:`titleWidth = contentWidth − max(42, titleFs×3) − texture36`(prepared-card-content.ts:136)——**无 headerOffset 项**;且 `PreparedCardContentOptions` 根本没有 preset 入参,solver 对 photo 完全不可见。
- 后果:photo 卡长标题按未缩进宽度换行、起笔又右移 32,最宽行可侵入计数徽章保留区 ≤32px。保留区 ≥42 故不出卡右缘,但可与 "N 人"(右锚 `width−hp`,基线 22)碰撞——标题首行基线约 28(fs12),其 glyph 带与 count 的 y∈[10,22] 实际交叠,碰撞真实可发生。贴图项无此问题(titleX 的 +36 与 titleWidth 的 −36 对称;仅"文档开贴图但该卡无贴图"时保守偏窄,安全方向)。
- **修法窄路径(视觉批,单独交付):** options 增一项已解析的 `titleIndent`(PosterCanvas 传 `destinationCardHeaderOffset(preset)`),`titleWidth` 再减之。像素变化仅 photo + 长标题文档(标题更早折行、headerExtra 可能 +1 行);先加"photo 标题最宽行 ≤ contentWidth − countReserve − 32"断言再改,回滚 revert 单批。

### 2.3 卫生(零像素)

prepared-card-content.ts:124 贴图宽仍是字面量 `36`,未 import `DESTINATION_CARD_TEXTURE_HEADER_WIDTH`(:58);且该常量注释还写"`PosterCanvas` subtracts the same width"——消费点已搬进 prepared-card-content,注释过时。换 import + 改注释即可。

---

## 3. C2-5 后半 / D2|flow 标题 lineHeight:**原样开放,无人违规顺手改(合规)**

两个子叉逐项复核,均与 Round 1 登记一致地保留:

1. **multiplier 叉:** 渲染标题步进 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`(DestinationCard.tsx:301-306);求解 `titleLineHeight = max(16, titleFs+4) × lineHeightMultiplier`(prepared-card-content.ts:133,恒画布倍率)。derive 与 createDefault 的流块 `lineHeight` 恒为 1.2(display-frame.ts:223/:264),故**任何 flow 文档只要标题折行必分叉**(渲染 ×1.2 vs 求解 ×1,默认值下即触发):headerExtra 推 divider/bodyTop/height 用求解步进,标题 glyph 却按 1.2 步进下坠。
2. **fontSize 叉:** 求解 `titleFontSize = typography.title ?? fontSize`(:121,对流块 style 不可见);渲染 `flowTitleFontSize = flowTitleBlock?.style?.fontSize ?? typography.title ?? fontSize`(PosterCanvas.tsx:390)。流块设了字号时,换行宽度与行数均按求解字号算,glyph 按块字号画 → 可右溢。fixed 模式两侧严格一致(flowBlocks 为空数组)。

同族背景:flow 正文渲染已收编为 `destinationCardBodyRowHeight`(mode 分派,flow → 每块 `destinationCardFlowRowHeight`,fallback `DESTINATION_CARD_FLOW_LINE_HEIGHT=1.2`;DestinationCard.tsx:235-240),但求高仍对所有模式用 fixed rowHeight + `HEADER_HEIGHT 44`——flow 高度整体是近似,布局侧感知方案归 S5 批,维持 Round 1 "只登记不改"裁决。另:PosterCanvas.tsx:392-394 的 `flowContentStart` 仍内联 `12` 起点与 city `max(9, fs−1)`,属同一 S5 批的收编面。

**可白捡(零像素):** prepared-card-content.ts:133 是 `destinationCardTitleLineHeight`(metrics:152-154)的内联复刻,数值等价,改调函数即消一份拷贝——不动 multiplier 语义,与 S5 不冲突。

---

## 4. 顺手核销与新发现

- **C2-2 已解决:** `CardDisplayRow`/`PreparedCardRow` 已下沉至 prepared-card-content.ts(:22-35),DestinationCard.tsx:47 re-export 兼容旧 import(ReferenceCardVisual 等仍走组件路径,无环)。lib→component 倒挂消除。
- **metrics 过时注释 + 空转测试:** destination-card-metrics.ts:17-18 仍称"`destinationHeight()` in `PosterCanvas` still inlines this literal"——该函数已不存在,solver 高度是 `prepared-card-content.destinationCardHeight`(:104-111)且直接 import 了 `DESTINATION_CARD_HEADER_HEIGHT`。配套的 44 字面量正则扫描(metrics.test:48-59)只扫 `canvas/*.tsx`,公式已搬进 lib → 永久空转。防漂移已由 import 保证,注释与该测试应一并清理(零像素)。
- **共同盲区(非模块间分叉,登记):** rowFontSize 的 max 只扫 visibleFields,而正文行 `<text>` 的 paint 字号走 name 级联(`typography.name ?? fontSize`)。当 `name ∉ visibleFields` 且 `typography.name` 设了更大值时,glyph 大于两侧一致算出的步进。两侧一致地盲,修复需同批动双方,优先级低。
- **换行器背景:** `wrapCardText` 全程按传入的单一 fontSize 度量(card-text-layout.ts:43-54),正文按 rowFontSize(max)换行属保守方向;上述标题字号叉之所以能右溢,正因换行度量字号与绘制字号分属两源。

## 5. Round 2 剩余动作清单(按优先级)

| # | 动作 | 像素 | 依据 |
| --- | --- | --- | --- |
| 1 | PosterCanvas `cardStyle.rowHeight` 改调 `destinationCardRowFontSize`+`destinationCardFixedRowHeight`,删测试复刻与正则锁 | 无 | §1.4 |
| 2 | 清理 metrics 过时 JSDoc 与空转 44 扫描测试;贴图 36 换 import | 无 | §4/§2.3 |
| 3 | prepared-card-content:133 改调 `destinationCardTitleLineHeight` | 无 | §3 |
| 4 | photo 标题换行宽度感知 headerOffset(先断言后改,单独视觉批) | 有(photo 长标题) | §2.2 |
| 5 | flow 标题/正文求高感知(S5 批,含 multiplier 与块字号两叉) | 有(flow 文档) | §3 |

禁令复述:不复活展示框工作台、不改 `data-*` 锚点、C2-3(pan 触发求解)与 C2-4(feTurbulence seed)不属本席核查面,未触碰。
