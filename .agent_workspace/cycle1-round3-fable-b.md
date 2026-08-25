# Cycle 1 Round 3 — fable-B:7 条渲染路径 SOTA 视觉验收

**模型:** `claude-fable-5-thinking-xhigh` ｜ **分支:** `cursor/canvas-render-display-46a1` ｜ **性质:** 只读验收,零生产改动,无 git 写操作(仅 `git stash create` 证据钉)。

## 0. 快照声明与裁决遵守

- **HEAD 基线:** `1bd0f8a`(dispatch Round 3)。工作树仍是活靶:复审 70 分钟内四次演进,证据钉序列(悬挂提交,gc 前可 `git show` 复核):16:43 `ef05abf`(gpt-sol 测试/bench 先落)→ 16:44 `3b944fb`(opus-B 级联 + opus-A GuestsLayer/memo 初版)→ 16:45 `479de20`(ReferenceCardVisual/MapLayer)→ 16:47 `dbe2d81`(opus-B 测试跟进)→ **16:49 `9b9774f`(memo 比较器修复;本文全部行号以此为准)**。
- **编号对照:** 沿用 round2-fable-b 的 G1–G6 与 §2.2 残留 1–5;新差距编号 S1–S8。
- **裁决遵守确认:** 未挂载、未建议挂载 `DisplayFrameSubcanvas`/`ItemInspector`/`LayerList`/`FlowFrameEditor`;快照上四组件仍无生产 import(`DisplayFrameSubcanvas` 仅自身两个测试引用;`FlowFrameEditor` 虽 import `resolveDisplayFrameBlockPaint`,其本身无生产挂载点)。死工作台维持死亡,本文不提出任何复活动作。

---

## 1. Round 3 并行修复落点(全部未提交,直接改变验收口径)

### 1.1 opus-fast-B:解析层级联闭环(G2/G3/G5 部分)

| 改动 | 证据 | 对 7 条路径的像素影响 |
| --- | --- | --- |
| `resolvePaint` 增三级级联:item/block style → 卡 fallback(fieldTypography/fieldFonts)→ surface;新 `DisplayFrameFieldPaintInput`(display-frame-style.ts:53)与 `resolveDisplayFrameFieldPaint`(:138) | display-frame-style.ts:94-119 | 无(默认路径值等价);**G2 闭合**,`resolveDisplayFrameBlockPaint`(:129)首获生产消费者 DestinationCard.tsx:206——Round 2 二选一裁决按"扩签名"落地,悬空风险消除 |
| 卡侧 fallback 统一入口 `cardFieldFallback`(DestinationCard.tsx:97);fixed 行仅继承 body item 的 **align+opacity 切片**(`fixedRowStyle` :193-198),city 行 typography 不被 name 项污染 | DestinationCard.tsx:97/:193-198/:204-207 | 无(锁:DestinationCard.test.tsx:274) |
| **flow 模式行/标题接入 align+opacity(G3 闭合)**:`flowAnchorX`(:177-181,center→width/2、right→width−hp)、行 x/textAnchor/opacity(:218/:224) | DestinationCard.tsx:177-183 | **有**:flow 文档若持久化 align center/right,行与标题改锚点;锁 DestinationCard.test.tsx:292、display-frame-style.test.ts:174 |
| fixed 标题 item 的 `fontId` 此前被忽略(旧代码只读 flow block/fieldFonts),现进级联(titlePaint :187-189,fontFamily :279) | DestinationCard.tsx:186-190 | **有**(仅显式 frame + title item fontId 的文档,此前静默丢弃属缺陷) |
| glass-stat 去掉 0.55–0.9 opacity 钳制:`fillOpacity={opacity}` | ReferenceCardVisual.tsx:156 | **有**:opacity<0.55 或 >0.9 的文档;P2-1"滑杆半失效"闭合;锁 ReferenceCardVisual.test.tsx:135 |
| reference 行距/emblem 步进乘 `lineHeightMultiplier`(可选 prop 默认 1;先取 max 再乘) | ReferenceCardVisual.tsx:67/:84-88/:114 | **暂无**——见 §1.4 接线缺口 |

### 1.2 opus-fast-A:R3-1/R3-2/R3-3 全部落地

- **`memo(PosterCanvas)`**(R3-1):`memo(PosterCanvasView, arePosterCanvasPropsEqual)`(PosterCanvas.tsx:1161),自定义比较器 + `paintedSlices` WeakMap(:259/:1144-1157)探测"同一 document 对象原地换 slice"的编辑——生产 App 恒新建对象,该探测专为兼容既有测试/嵌入方写法。`PosterCanvas.performance.test.tsx` 扩了 map/card/guests/canvasBody 四路渲染计数探针,结论 R3-1 的"集成渲染计数"要求兑现。
- **GuestsLayer 抽出**(R3-2):嘉宾面板全部 DOM 迁入新 `GuestsLayer.tsx`(memo 组件,自带拖拽预览调度),几何进 `src/lib/guest-panel-layout.ts` 纯函数 `computeGuestPanelLayout`(PosterCanvas 挂载 :404-405 useMemo);PosterCanvas 净减约 390 行(1470→~1161)。`data-guest-*` 锚点全集随迁保留(export round3 测试断言 `data-guests-layer` 仍在导出中)。
- **MapLayer 投影缓存**(R3-3):`projectFeatures`(MapLayer.tsx:76 起)按投影批次 Map 缓存每 feature 的 path 串/bounds/centroid,`useMemo` 挂两处(:232/:323),消除同一 feature 每帧 4 次序列化。

### 1.3 gpt-sol 侧:Round 2 遗留的三个"补测试"全部兑现

- `DestinationCard.align.round3.test.tsx`:frame 级 `align:"center"` 的几何锁(title 盒 x=12,w=180 → 中点 x="102",与 `displayFrameTextX` middle 公式一致)——Round 2 结论§潜在边界风险第 3 条的欠账还清。
- `export-poster.round3.test.ts`:结论 R3 第 5 条导出契约(剥 grid/三类 selection,保 `data-destination-card`/`data-display-frame-surface`/`data-guests-layer` 与文本)。
- `useCardLayoutWorker.swr-boundary.round3.test.tsx`:SWR pending 期"新省缺席、旧卡不消失"的冻结语义注记——Round 2 结论边界风险第 1 条的欠账还清。
- gpt-sol-A 扩 bench(`buildGuestBenchFixture` 等),不涉渲染像素。

### 1.4 中间态红灯与唯一开放缝隙(主调度器必读)

**验证纪律链(failure→cause→fix→recheck):**

- *failure*:16:46:17 UTC 复跑 15 个目标测试文件 → `PosterCanvas.test.tsx` **2 红**(preset 切换用例 :635 期望 borderless 得 photo;borderless 连接线用例 :684 连接线未回归),143/145。
- *cause*:两用例均**原地改 `project.cards` 后用同一 `project` 引用重渲染**;新落地的 `memo(PosterCanvas)` 默认浅比较合法 bail out,DOM 停在上一帧(此前偶然透出靠的是 layout worker 一次挂起的 setState)。
- *fix*:并行 opus-A 以 `paintedSlices` 比较器修复(非本 agent 所为);opus-B 报告独立归因结论一致。
- *recheck*:16:49:31 UTC 同一命令 15 文件 → **154/154 全绿**(用例数 145→154 系 opus-B 新增级联/对齐锁)。

**接线缺口(本轮唯一开放项):** `ReferenceCardVisual` 已备好 `lineHeightMultiplier` prop,但挂载点 **PosterCanvas.tsx:969-983 未传**(该变量在作用域内,:398)。prop 默认 1 = 现状像素,故 §2.2 残留 1(`canvas.lineHeight≠1` 时 reference 卡底溢出/虚高)**只闭合了组件侧一半**。opus-B 因 PosterCanvas 禁改而显式交接;落地即视觉变更,须按 §5 白名单流程先扩几何断言(opus-B 侧断言已就位)。归 PosterCanvas 持有者或 Cycle 2 首轮,一行了结,勿散佚。

---

## 2. 7 条路径视觉验收(对快照 `9b9774f`)

前置同 Round 2:24 省样例 + 长文本工程各一;✔ = 已有 jsdom 锁,△ = 需浏览器人工核验或记录现状。

**A. 标准卡(derive 路径,displayFrame undefined)——通过**
- [✔] surface rx=6、stroke `#1c3154`(derive 继承 DEFAULT_STYLE,display-frame.ts:83)、stroke-width 1;fill/fill-opacity 跟随 cards(DestinationCard.tsx:240-250;boundary :104 锁 0.37,PosterCanvas.test :776 锁 0.42)。
- [✔] 多行标题:divider `30+headerExtra`(:284)、正文首行 `frameBodyItem.y??42 + headerExtra`(:210);末行 baseline ≤ `height−bottomPadding` 几何恒成立(`destinationHeight=44+…`,PosterCanvas.tsx:133-135)。
- [✔] count 右锚 `width−hp`(:283)、divider x∈[hp, width−hp](:284)。
- [✔] fieldTypography/fieldFonts 逐字段:tspan 级(:226-233)+ 级联 fallback(:204-207);锁 PosterCanvas.test :803-806、DestinationCard.test :274。
- [✔] 显式 displayFrame:custom text/decoration 渲染(:108-135)、item opacity(:122/:130/:133,锁 DestinationCard.test :198 α0.4)、**frame `align:"center"` 几何锁已补**(align.round3 测试 + DestinationCard.test :234/:255 item 覆盖)。Round 2 该项两处"新增测试"欠账均已还清。

**B. ticket——通过(现状记录)**
[✔] rx=12 压过用户 borderRadius(:244)、accent 条 8×height rx4(:264)、打孔圆 (w−18,18) r7 α0.2(:264);卡边框与 connectorDash 分离(connector 在 PosterCanvas strokeNodes,锁 :895-897)。preset 锁 PosterCanvas.test :643-644。

**C. photo——通过,P2-4 维持已知缺陷**
[✔] 头像圆 (hp+13,21) r13 + 首字 fs11(:265);标题与省贴图 +32(photoOffset :165,titleX :190)。[△] **正文行仍不加 +32**(行 x = `anchorXFor(frameBodyItem, paint)` :218,无 photoOffset)——本轮级联重构未顺手修,正确:该修复属像素白名单,须先加几何断言(挪入 S2)。

**D. borderless——通过,观感决策未做**
[✔] rx=0、stroke none(:244/:247-248;boundary :119-122);`opacity<0.9` 连接线隐藏(PosterCanvas.tsx:752 拖拽、:912 渲染,阈值魔数未动);divider 隐藏(:284)、count 仍渲染(:283)。[△]"悬浮人数"观感维持现状,列 S6。

**E. 四 reference 共通**
- [✔] 长文本逐行:`referenceRowLines`(ReferenceCardVisual.tsx:39-47)+ 每行独立 y(reference-styles :74-79 锁唯一性与行宽、round2.test 受控拆分)。
- [✔] `data-card-visual`/`data-card-presentation` 一致;reference→标准往返回 `DestinationCard`(reference-styles :85-101;card-templates.ts:135 presentation 兜底 + :137 `displayFrame: undefined` 契约均已提交在 `ce8f11b`)。
- [△] `canvas.lineHeight` 0.8/1.5 档:**组件侧已修、挂载未传**(§1.4),验收现状 = Round 2 豁免继续有效;接线后须复验 emblem 残余(见 F)。
- [△] 深色画布可读性:color-pill 标题 `#1c3154`(:96)、emblem 标题 `#263b78`(:119)仍硬编码,记录观感,列 S3。

**F. 各 reference 个性**
- color-pill:[✔] 胶囊 rx=min(28,max(18,h/3))(:95)、标题居中 y=19、体行居中(:97-107 区段)。
- emblem-list:[✔] 荧光笔 `#f1c84b`×13(:117)、图钉、有校徽 x=31/无 x=9;[△] 步进改 `max(22, base+3)×multiplier`(:114)——multiplier=1 时仍 22 > rowHeight 下限 20,**≥17 行长名单底部溢出残余不变**(残留 2 → S4)。
- city-label:[✔] 标题白描边 2.5 `paintOrder=stroke`(:138);manual-color 省色/哈希色稳定(PosterCanvas.tsx:974-976 + ReferenceCardVisual.test :145)。
- glass-stat:[✔] **fillOpacity 如实跟随 opacity**(:156,本轮新行为,锁 :135);cityHeading 行 accent 色 fs−1、count 右锚 w−9。
- [△] 全部 reference:非 glass 丢 cityHeading 行但卡高计入其行数(:86 过滤 vs PosterCanvas 行数计高)→ 卡偏高;行内 fragments `join("")` 拍平 per-field typography(:42)。均既往行为未回归,列 S3。

**G. 导出(全部 7 条)——通过**
- [✔] `serializePosterSvg` 剥 grid + 三类 selection、保卡/展示框/嘉宾锚点与文本(export-poster.ts:3-5;旧锁 :47/:63 + **round3 新契约锁**)。grid 仅 `!exportMode` 渲染,"屏幕即导出"机制未破。
- [△] 序列化字节再次变化:行/标题恒显式输出 `opacity="1"`、flow 侧 `text-anchor="start"`、title `fontFamily` 走级联——像素等价、字节不等价。**§5.4 政策续期:golden 取样必须在本轮全部合入后,且显式缺省值此后不得改回缺省。** PNG 3× hairline(P3-4)不在本轮。

---

## 3. `margin` / `fieldOrder`:维持 deprecated,确认未接线 ✔

| Token | 快照消费现状 | 裁决 |
| --- | --- | --- |
| `style.margin`(display-frame.ts:16) | schema 默认 :81、normalize clamp :153、derive 自 `cards.gap` :227;解析层透传(display-frame-style.ts:28/:80);**渲染消费者 0**——DestinationCard/GuestsLayer 均不读 `surface.margin`;卡间距真源仍 `cards.gap` → `bounds.gap`(PosterCanvas.tsx:630 布局请求、:775 拖拽钳制) | **维持:保留 + deprecated,禁止接线**(双写风险不变) |
| `fieldOrder`(display-frame.ts:68) | normalize :139-143/:332、derive :218-219 往返;渲染顺序真源仍 `cards.visibleFields`(`cardRowsForGroup`);本轮唯一新消费者是 bench 合成数据 canvas-render-metrics.ts:66,**非渲染路径,不构成接线** | **维持:derive 回声,禁止接线** |

本轮大规模级联重构**没有**触碰这两个 token 的消费面——纪律良好。未完成项:Round 2 建议的 JSDoc `@deprecated` 注记两处仍未写(display-frame.ts:16/:68 无文档注释),零像素风险,挪入 S8。附:item/block `opacity` 本轮双双激活(fixed :122 起、flow :224),死 opacity token 清零,Round 2 死名单的移除裁决完全兑现。

---

## 4. Cycle 2 剩余样式差距(S1–S8,按优先级)

1. **S4|lineHeightMultiplier 一行接线**(§1.4):PosterCanvas 挂载点传参;随后处理 emblem 步进下限 22 vs rowHeight 下限 20 的溢出残余(残留 2)与非 glass 丢行计高偏差(残留 3)。三者同属"reference 卡高与行距同源化",建议一个 owner 打包。
2. **S1|preset 声明式覆盖表**(原 G1):ticket rx12 / borderless rx0+stroke none / photo 偏移仍是 DestinationCard.tsx:244/:247-248/:165 内联三元,解析层无 preset 概念——把三 preset 纳入 token 系统是 Cycle 2 样式主菜,也是 S2 的前置。
3. **S2|头部几何魔数与 photo 正文 +32**(原 G4 + P2-4):`destinationHeight` 44 常量(PosterCanvas.tsx:133-135)不感知 frame 起点;divider 30、count y=22、头像/打孔坐标散落(DestinationCard.tsx:264-265/:283-284)。建议抽 `card-header-geometry` 纯函数,修 photo 正文偏移时先加几何断言。
4. **S3|reference 卡 token 化**(原 G5 残余):色板 `REFERENCE_CARD_COLORS`(:10)与标题色 `#1c3154`/`#263b78`/`#f1c84b`/白描边 2.5 硬编码;fragments `join("")` 拍平 per-field typography(:42)。深色画布可读性依赖 `readableTextColor`(:24)但标题不走它。
5. **S5|title 字号布局耦合**:fixed/flow 标题字号仍用布局值 `flowTitleFontSize` 而非 `titlePaint.fontSize`(DestinationCard.tsx:276-277 注释已声明"布局赢");frame title item 字号与卡高不一致的场景未建模——需布局侧感知 frame 字号后才能放开,勿单独改渲染。
6. **S6|borderless 悬浮人数与连接线阈值**:count 保留/divider 隐藏的观感决策;`opacity<0.9` 阈值魔数两处(PosterCanvas.tsx:752/:912)宜提常量。
7. **S7|死工作台 CSS 卫生**(原 G6):styles.css:2552/:2858/:2879/:3041-3047 等约 66 行仍在;删时注意 `ReferenceCardStyleWorkspace` 不共用这些类。
8. **S8|JSDoc deprecated 注记**:§3 两处;顺手补 `DestinationCardStyle.flowNameFontSize` 的弃用说明落地情况核验(opus-B 已加注释,消费者为 0,Cycle 2 可评估从接口移除——属 props 形状变化,需与 PosterCanvas 同批)。

**明确不做(承袭两轮裁决):** 虚拟化、换渲染器、复活展示框工作台、改 `data-*` 锚点名、导出离屏重建、布局求解器增量化。

---

## 5. 验收方式声明与交接

- **本轮交付 = 本审计文档**,无生产代码改动、无 git 写操作。复核命令:对 §2 所引 15 个测试文件 `npx vitest run <files>`(16:49:31 UTC 快照 154/154 全绿,含 2 红→绿完整链 §1.4)。
- **提醒主调度器(提交批次纪律):** 全部 Round 3 生产改动在复审时刻**未提交**。① `memo` 包装(:1161)必须与比较器(:1135-1157)及 `paintedSlices.set`(:259)同批,拆分即重现 16:46 的 2 红;② display-frame-style.ts 级联与 DestinationCard.tsx 消费侧、及其三份测试同批;③ GuestsLayer.tsx + guest-panel-layout.ts + PosterCanvas 接线同批;④ glass 去钳制与 ReferenceCardVisual.test.tsx:135 同批(像素变更,交付说明须记录:受影响文档为 opacity∉[0.55,0.9] 的 glass-stat,回滚 = revert 单行恢复钳制)。
- **唯一开放缝隙:** S4 第一半(lineHeightMultiplier 传参)——见 §1.4,勿在 Round 3 收尾时遗漏登记。
