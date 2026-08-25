MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 3(冻结轮)— fable-B:展示框/卡片 chrome 相对 main 的漂移终审与合入裁决

**分支:** `cursor/canvas-render-display-46a1`(未离开;仅执行只读 git:`status/log/diff/show/branch`,零 checkout/stash/commit/push/建分支)。**性质:** 纯核查,零生产代码,只写本文件。**输入:** cycle3-round1/round2 结论简报、cycle3-round2-fable-b、PR #13 正文(`gh pr view`,只读)+ 工作树 vs `main`(merge-base `897a2a6`)逐文件对拍 + 定向测试。

**快照声明:** 本席核查时 Round 2 三批已入库(`7cc4fb6`/`e4c0d4c`/`96a7652`);工作树唯一未提交的生产侧改动是 `scripts/perf-canvas-bench.ts` 的**两行纯注释**(:183-184,声明 prepared-wrap 链系 typography 优先、非 flow 游标——恰为冻结规则 3 的书面化,零代码变更),其余均为 R3 并行席新增的测试/报告文件。以下行号即该快照实测;main 侧行号取自 `git show main:` 只读快照。

---

## 1. 问题一:PR 回滚章节相对 main 的漂移清点 —— 六项点名 + 三项同族补漏

PR #13 回滚章节现文:「相对 `main`:`polygonOrigin` 可选;滤镜 id 仅运行时加后缀。视觉:city-only 高度可能 +1px;photo 长标题更早换行。」逐项核对结论:**存在被 PR 漏记的像素/语义漂移,但全部都是历史轮次裁决过、结论简报登记过、测试锁死过的项——没有任何一条是"未裁决的意外漂移"。缺的只是 PR 正文的搬运。**

### 1.1 city-only 高度 —— 已记载,但措辞欠精确(建议改写,非新漂移)

- 漂移本体:main 求解侧把可见 `city` 字段按 `max(9, fs−1)` 计入 `rowFontSize`(main:PosterCanvas:694-695),渲染却按全量字号画——本分支统一为画布语义:可见字段一律 `typography ?? fontSize`,city 仅以 heading 身份单独入集(`prepared-card-content.ts:122-127` / `destination-card-metrics.ts:212-217` 及其 JSDoc)。
- **PR 未记的第二效应:** 非 heading 行的**换行度量**同步从 fs−1 变为 fs(main:729 vs `prepared-card-content.ts:254`),受影响文档(visibleFields ⊆ {city} 且无更大 typography)不止步进每行 +1px×倍率(main:696 vs `destinationCardFixedRowHeight`),**行数也可能增加**,高度差可超 1px。cycle2-round2-conclusion:11 锁的 77→78 是单一夹具值,非上界。
- 处置:保留 bullet,措辞改为「city-only 卡行步进每行 +1px×行距倍率,且正文按全量字号换行、行数可能增加」。

### 1.2 photo titleWidth —— 已记载,准确

`prepared-card-content.ts:144-147` 的 `− headerOffset`(photo=32)vs main:742 无该项;`contentWidth` 不变断言仍在(prepared-card-content.test)。PR「photo 长标题更早换行」成立,可补一句「headerExtra 可能 +1 行」。无缺漏。

### 1.3 flow 标题 lineHeight —— **漂移存在,PR 漏记(本轮最主要缺漏)**

- main 渲染侧 flow 模式标题基线按 `(index+1) × max(16, fs+4) × (flowTitleBlock?.lineHeight ?? m)` 步进(main:1164),块派生默认 `lineHeight: 1.2`(`display-frame.ts:223/264`);求解侧 headerExtra 却按文档倍率 `m`(main:701/744)。本分支渲染统一取 `lineHeightMultiplier`(`DestinationCard.tsx:301-309`,注释明言 solver 以该倍率收 headerExtra)。
- 像素面:**仅 flow 模式**(fixed 模式 main 的 `flowTitleBlock` 恒 undefined,main:676-678,回退即 m,无变化)。因基线含 `(index+1)`,**单行标题的首行基线也移动**:fs12、m=1(`project.canvas.lineHeight ?? 1`,PosterCanvas.tsx:348)时 31.2→28,上移 3.2px;第 k 行累计 3.2×(k+1)。
- 出处:这是 cycle2-round3-conclusion:20 视觉批三连中的第三条「flow 多行标题行距随文档倍率」——PR 只搬运了前两条,第三条**整条丢失**。回滚方式历史已写明(cycle2-round3-opus-b §回滚 (3)):渲染改回 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`。

### 1.4 presentation:"standard" —— **语义漂移存在,PR 漏记**

`card-templates.ts:132-135` 新增 `presentation: template.cards.presentation ?? "standard"`:main 上 `applyCardTemplate` 不含该行,套用自身无 presentation 的模板(standard/ticket/compact)时旧 presentation 泄漏——「胶囊切回标准仍是 pill」。本分支显式重置,画布据 `(presentation ?? "standard") !== "standard"` 离开参考渲染器(PosterCanvas.tsx:715 的 gate 本身与 main:1116 同义,无漂移)。cycle1-round3-conclusion 表:23 已登记为修复;`card-templates.presentation.test.ts` + `card-templates.test.ts:80-89` 双文件锁死。PR 须补一条语义 bullet(回滚 = revert card-templates.ts 一行 + 两测试)。

### 1.5 可选 style.opacity —— **语义漂移存在,PR 漏记(连带 align / fontWeight:"normal" 同族)**

- main 的 `DisplayFrameItemStyle` 无 `opacity`,`normalizeItemStyle` 直接丢弃该键;本分支归一化保留(`display-frame.ts:38/:138-148`,clamp 0–1)并全链渲染:级联解析 `display-frame-style.ts:115`,消费点 `DestinationCard.tsx:129/:137/:140`(fixed 自定义项)、`:256`(正文行)、`:317`(标题)、`FlowFrameEditor.tsx:19/:27`(工作台预览)。未设时解析为 1,与 main 无属性视觉等价;**携带 raw `style.opacity` 的文档(导入 JSON / AI agent 写入)在 main 上渲染不透明且保存即被剥离,本分支渲染半透明且持久化保留**——归一化 guard(:139)现在让仅含 opacity 的 style 对象存活,属文档形状变化。DisplayFrameItemInspector 无设置入口(grep 无 opacity),入口仅文档层。
- **同一「三级解析级联」批还带进两处 PR 未记的观感差:** ① flow 块与 fixed body item 的 `align` 现映射 `textAnchor`(`display-frame-style.ts:106/:117`、`DestinationCard.tsx:188-213`),main 的卡内标题/正文恒 start;② 标题显式 `fontWeight:"normal"` 现按 400 画(`display-frame-style.ts:18/:63-65/:114`),main 只识别 medium→500、其余一律 700(main:1165)。三者同出 cycle1-round3-conclusion:12「DestinationCard 三级解析级联;flow 接 align/opacity」,应合并为一条 bullet。

### 1.6 filter ids —— 已记载,准确;map-edge 侧确认零漂移

- 接线实测:`DestinationCardsLayer.tsx:108-111` `useId()` + `scopeEdgeStyleFilters`(`edge-styles.ts:71-97`,sanitize 后缀 `-token`);PR「仅运行时加后缀」属实,补充精确化:**单画布 DOM 与导出 SVG 里的 id 也带后缀**(export-poster.round3.test 锁定 XML 合法性),文档不持久化任何 id。
- `MapDataLayer.tsx` 与 main **逐字节一致**(不在 `git diff main` 文件清单;`map-edge` 前缀、soft-glow/ink 滤镜、`seed="3"` 均为 main 既有)——C3-R2-4 未做是"保留与 main 相同的既有 defs 碰撞",非本分支漂移,PR 无须记。
- **附带发现一处 PR 未记的微观像素差:** ink **连接线**的 `feTurbulence` 由 main 无 seed(main:974,渲染器缺省)改为固定 `seed="1"`(`DestinationCardsLayer.tsx:241`,注释:导出与编辑器逐像素一致)。噪点图案与 main 不同。cycle2-round2-conclusion:13 已登记。

### 1.7 checklist 之外的同族补漏(参考卡三连,均有结论简报出处)

1. **glass-stat 表面透明度去钳制:** main:344 `fillOpacity=min(0.9, max(0.55, opacity))` → `ReferenceCardVisual.tsx:156` 直取 `opacity`。`cards.opacity ∉ [0.55, 0.9]` 的 glass-stat 文档观感变(0 → 全透明,main 上是 0.55)。cycle1-round3-conclusion:12。
2. **参考卡换行行逐行绘制:** main 用 `textFor` 把 wrapped lines 拼接回单行(main:298,长行溢出卡右缘),本分支 `referenceRowLines` 每行独立基线(`ReferenceCardVisual.tsx:39-47`,四种 presentation 全部)。cycle1-round3-conclusion 表:21。
3. **参考卡行距乘画布倍率:** `ReferenceCardVisual.tsx:87-88/:114` 行距与 emblem 步进乘 `lineHeightMultiplier`(挂载点已传),main:299/:320 无倍率。`canvas.lineHeight ≠ 1` 的参考卡文档像素变。cycle1-round3-conclusion:13。

**标准卡 chrome 其余对拍结论:** divider(30+headerExtra)、count 基线 22、texture 盒(hp+offset, 3, 30×30)、ticket(rx12/accent8/punch 18-7-0.2)、photo 头像(hp+13, 21, r13, 基线 25, fs11, w700)、表面 rect 回退链(`background||`、`opacity??`、borderless 三态)——与 main 字面等值,零漂移;D 族 flow 求高失配按指令未动、未修。

## 2. 问题二:C 项(flow 标题 fontSize vs fieldTypography)—— 仍有意未修,边界完好

- **分叉双侧原样:** `PosterCanvas.tsx:449-450` 的 `flowTitleFontSize`/`flowNameFontSize` 仍首查 `fieldTypography`;三行之下 `:451-453` 的 `flowContentStart` 喂纯 `project.cards.fontSize` 给 `destinationCardFlowContentStart`。函数侧(`destination-card-metrics.ts:176-183`)签名 `(blocks, fontSize)` 结构性排除 typography,JSDoc(:168-174)明文「deliberately **not** to fieldTypography」并归档 D 族。
- **Round 2/3 无意外统一:** R2 落地批经 R2-fable-B 核查后,R3 期间唯一触碰该语义面的改动是 bench 的两行注释(§快照声明)——内容恰是**声明**两条链不同、禁止误换,与冻结规则 3 同向;`cardFieldFontSize`(`prepared-card-content.ts:101-108`)与 flow 游标链均未被改写。
- **测试双向锁在位并全绿:** metrics.test:54 逐字符复刻 `inlinedFlowContentStart` + :151 对拍;:157 「never at a typography size」直接值断言;:166 反内联硬锁(画布文件禁 `cursor + block.spacing`)。
- **边界界定不变:** 触发面仍是「flow + 块显式 `style.fontSize`」(glyph 溢出)与「设 `fieldTypography.title` 而块无字号」(游标欠保留,R1 §3.2 子观察);将来重开必须与 `destinationCardFlowContentStart` 喂同一已解析字号(C 排 B 后前提,R1 §2.2 联动边界),S5 全批立项时核销。**裁决:C 项维持有意未修,冻结通过。**

## 3. 问题三:展示框冻结合入裁决 —— **接受(附一项 PR 文本条件)**

**接受理由:** ① 相对 main 的全部像素/语义漂移(§1 共 10 类)逐条溯源到历史轮次的显式裁决与结论简报登记,无一条未裁决意外漂移;② 每条均有测试锁(本席定向复跑 **15 文件 135/135 绿**,3.78s:metrics、prepared-card-content×3、display-frame×3、card-templates×2、edge-styles、export-poster.round3、DestinationCard、DestinationCardsLayer、ReferenceCardVisual×2);③ 渲染器 + `display-frame-style.ts` 保留、Stage 走 ReferenceCardStyleWorkspace、死工作台未复活(零新增 import);④ 冻结纪律未破(R3 生产侧仅两行注释)。**条件:** PR 回滚章节按下表补齐——这是交付纪律(破坏性/视觉变更须记录回滚)的收口,不是代码工作。

**父调度器须发布的回滚 bullets(相对 `main`,替换 PR 现有「视觉:」一句):**

1. **city-only 卡(可见字段仅 city 且无更大 typography):** 行步进每行 +1px×行距倍率,正文改按全量字号换行、行数可能增加。回滚:revert prepared-card-content 的 rowFontSize 语义批(锁:prepared-card-content.test「city-only」用例)。
2. **photo 预设长标题:** titleWidth −32,更早换行,headerExtra 可能 +1 行;正文宽度不变。
3. **flow 模式标题行距:** 基线按文档 `canvas.lineHeight` 倍率步进,不再按块默认 1.2(fs12/倍率 1 时首行上移 3.2px)。回滚:DestinationCard 标题行高改回 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier`。
4. **模板语义:** 套用无 presentation 的模板显式重置 `presentation:"standard"`,参考卡观感不再泄漏到标准模板。回滚:revert `card-templates.ts` 单行。
5. **展示框 item/块级联:** 新增可选 `style.opacity`(归一化保留并渲染,main 上剥离;文档形状变化)、`align` 映射 textAnchor、显式 `fontWeight:"normal"` 标题 700→400。
6. **glass-stat:** 表面透明度不再钳制 0.55–0.9,按 `cards.opacity` 原值渲染。
7. **参考卡四式:** 换行行逐行绘制(不再拼接单行溢出);行距与 emblem 步进乘 `canvas.lineHeight`。
8. **ink 连接线:** `feTurbulence` 固定 `seed="1"`,噪点图案与 main 不同,换取编辑器/导出逐像素一致。
9. **(非视觉)** 连接线滤镜 id 运行时加实例后缀,含导出 SVG;文档零持久化;map-edge defs 与 main 一致。`polygonOrigin` 可选(已在 PR)。

## 4. 验证链与合规

- **验证:** 无失败,failure→cause→fix→recheck 链无触发点;定向 15 文件 135/135 一次性绿。
- **合规:** 未离开分支;git 仅只读命令;零生产代码、零测试新增,只写本文件;未 remount DisplayFrameSubcanvas/死工作台,未引入任何指向它的 import;D 族 flow 求高失配按指令只登记不修。

**收束陈述:** 展示框/卡片 chrome 相对 main 的漂移全景已终审:六项点名中 flow 标题行距(§1.3)、presentation 重置(§1.4)、style.opacity 及其级联同族(§1.5)三项确为 PR 回滚章节缺漏,另补 glass-stat 去钳制、参考卡逐行+倍率、ink seed 三条同族(§1.6-1.7),city-only 措辞需精确化——但每一条都有历史裁决、结论简报出处与在位测试锁,无未裁决意外漂移;C 项分叉双侧原样、JSDoc 与双向测试锁完好、R2/R3 无顺手统一,维持有意未修;裁决**接受展示框冻结合入**,唯一条件是父调度器把 §3 的九条回滚 bullets 发布进 PR 正文。15 文件 135/135 绿,冻结纪律未破,本席核销。
