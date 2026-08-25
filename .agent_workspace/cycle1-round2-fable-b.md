# Cycle 1 Round 2 — fable-B:展示框样式 SOTA 复审

**模型:** `claude-fable-5-thinking-xhigh` ｜ **分支:** `cursor/canvas-render-display-46a1` ｜ **性质:** 只读复审,无生产代码改动,无 git 操作。

## 0. 复审基线与快照声明

- **HEAD 基线:** `3dc2684`(dispatch Round 2)。
- **工作树是活靶:** 复审期间并行子代理持续向同一工作树落未提交改动(先后观测到 `card-templates.ts`、`ReferenceCardVisual.tsx` 新建、`DestinationCard.tsx` 两次迭代、`PosterCanvas.tsx`、`useCardLayoutWorker.ts` 等)。本文所有"快照"行号以 16:33 UTC 的工作树为准,证据钉:`git stash create` 产物 `7d1d82fdad9a`(悬挂提交,gc 前可 `git show` 复核)。
- **编号对照:** 本文 P0-3/P0-4 采用《Round 1 结论简报》编号(P0-3 = `applyCardTemplate` 不复位 presentation;P0-4 = reference `textFor` 拍平多行),与 round1-fable-b.md 内部编号不同,勿混用。
- **裁决遵守确认:** 未挂载、未建议挂载 `DisplayFrameSubcanvas`/`ItemInspector`/`LayerList`/`FlowFrameEditor`。四组件在快照上仍无生产 import(仅测试与相互引用),旧工作台保持死亡;渲染器与 `display-frame-style.ts` 解析层按裁决保留。

---

## 1. 解析层 vs DestinationCard / reference presentation:差距量化

### 1.1 HEAD 基线(3dc2684)

解析层生产消费者为 **0**:`display-frame-style.ts` 只被三个死工作台组件与自身测试 import。活渲染路径(`DestinationCard.tsx`/`PosterCanvas.tsx`)完全自带一套 fallback:本地 `frameTextAnchor`/`frameTextX`(HEAD 版 DestinationCard.tsx:77-87)逐字复制解析层公式,surface 五属性内联三元(HEAD 版 :183-193)。Round 1 P1-1 在 HEAD 上原样存在。

### 1.2 工作树快照:P1-1 已大部分闭合(opus 侧落地,未提交)

`DestinationCard.tsx` 已接入解析层,覆盖面如下:

| 渲染点 | 解析层入口 | 快照证据 |
| --- | --- | --- |
| surface 矩形 | `resolveDisplayFrameSurface`(带旧 fallback 预合并:`background \|\| style.background`、`opacity ?? style.opacity`、`borderColor ?? style.edgeColor`) | DestinationCard.tsx:147-152 → :203-213 |
| custom text/decoration 项 | `resolveDisplayFrameItemPaint` + `displayFrameTextX/Baseline`,新增 `opacity` 属性输出 | :86-113(text :100、line :108、rect :111) |
| fixed 模式 title/name 字段项 | `titlePaint`/`bodyPaint` = `resolveDisplayFrameItemPaint`,x/textAnchor 走 `displayFrameTextX` | :155-163、:182-184、:234-236 |
| 标题/行字重 | `displayFrameFontWeightValue`(显式 "normal" 首次生效,旧代码强制 700) | :158-159、:187 |
| 城市行字号 | `resolveDisplayFrameFieldFontSize`(取代 `max(9, fs-1)` 魔数) | :171 |

**随之引入的行为增量(全部测试绿,但 Round 3 须知情):**

1. frame 级 `align`/`fontId` 现在级联到无 item 级值的 custom 项与 fixed 字段项(`resolvePaint` 的 `style?.align ?? surface.align`,display-frame-style.ts:88/99)。老文档若持久化了 `displayFrame.style.align:"center"`,fixed 模式字段行会从左对齐变居中——**像素变化,无测试锁旧行为**,属有意接线而非回归,建议 Round 3 补一条显式 align 的锁定测试并在交付说明中记录。
2. DOM 序列化增量:`font-weight="400"`、`opacity="1"`、`text-anchor="start"` 等此前缺省的属性现在显式输出。像素等价、SVG 字节不等价(对第 5 节 golden 策略有约束)。

### 1.3 快照上仍存的差距(Round 3 认领清单)

| # | 差距 | 位置 | 备注 |
| --- | --- | --- | --- |
| G1 | preset 覆盖仍内联三元(ticket rx=12 / borderless rx=0+stroke none),解析层无 preset 概念 | DestinationCard.tsx:207/:210-211 | Round 1 §5.1 的 L2 声明式覆盖表未建;这是把 ticket/photo/borderless 纳入 token 系统的前置 |
| G2 | 字段行的 fill/fontSize/fontWeight 仍走 `block.style → fieldTypography → cards.*` 手写链;`resolveDisplayFrameBlockPaint` 导出后 0 生产消费者 | DestinationCard.tsx:169-171/:185-187 | 根因:解析层未建模 fieldTypography/fieldFonts 优先级。二选一:扩签名接受 per-field override,或删除 `resolveDisplayFrameBlockPaint` 防悬空 |
| G3 | flow 模式行完全未接 align/opacity(`bodyPaint` 仅 fixed 构造) | DestinationCard.tsx:155-156 | 应与 P1-3(flow 起点双计入、order 失效)同轮修 |
| G4 | count/divider/photo/ticket 装饰魔数原样(44/30+headerExtra/22/8/13/32/36);`destinationHeight` 44 常量仍不感知 frame 起点 | DestinationCard.tsx:227-228/:243-244、PosterCanvas.tsx:161-163 | P1-2 未动,Round 3 布局纯函数化时一并消化 |
| G5 | `ReferenceCardVisual` 零解析层消费:私有色板、`#1c3154`/`#f1c84b`/`#e24d42`/`#263b78`/白描边 2.5 硬编码、glass-stat opacity clamp 0.55–0.9 | ReferenceCardVisual.tsx:10/:88/:109-111/:130/:148 | P2-1/§5.4 范畴,本轮不算回归 |
| G6 | 死工作台的约 66 行 CSS 与 atelier 覆盖仍在(如 `.display-frame-style-grid`) | styles.css:3117-3175 | 裁决保留组件死亡即可;CSS 清理属 P3 卫生项,删时注意 `ReferenceCardStyleWorkspace` 不共用这些类 |

---

## 2. P0-3 / P0-4 状态:并行修复已落地,完整性验证通过

**时间线(验证纪律 failure→cause→fix→recheck):**

- *failure*:16:24:56 UTC 在当时快照复跑 gpt-sol-B 的锁定测试 `card-templates.presentation.test.ts` → **9/9 红**;`PosterCanvas.tsx:244`(当时行号)`textFor` 仍 `join(" ")` 拍平。两缺陷在 HEAD 上确认存在。
- *cause*:与 Round 1 审计一致 —— 模板 patch 不含 `presentation` 键、reference 渲染把 wrap 后多行重拼单行。
- *fix*:并行 opus 侧以未提交工作树改动落地(非本 agent 所为,本 agent 零生产改动)。
- *recheck*:16:33:26 UTC 快照跑 12 个目标测试文件 → **127/127 全绿**(含全部 P0 锁定测试与既有像素锁)。命令:`npx vitest run` 上述 12 文件,输出见快照钉。

### 2.1 P0-3 完整性:通过

- **修复形态:** `applyCardTemplate` 兜底 `presentation: template.cards.presentation ?? "standard"`(card-templates.ts:135),单点覆盖全部 11 个内建模板与未来模板,优于逐模板补字段。
- **契约保持:** 返回值仍含 `displayFrame: undefined`(:137),`ReferenceCardStyleWorkspace.test.tsx` 绿(§7.6 红线未破)。
- **副作用闭环:** `ReferenceCardStyleWorkspace.tsx:30` 的双高亮(templateId 与残留 presentation 各命中一项)随复位消失。
- **锁:** `card-templates.presentation.test.ts`(遍历所有无 presentation 模板)+ `PosterCanvas.reference-styles.test.tsx:78-94`(端到端:切标准后 `data-card-presentation="standard"`、无 `data-card-visual`、有 `data-display-frame-surface`)。
- **回滚方案:** revert 单行即可;patch 只是显式写入 `CardSettings` 已有键,无持久化 schema 变化、无迁移。

### 2.2 P0-4 完整性:通过,附 5 项非 P0 残留

- **修复形态:** 抽出 `ReferenceCardVisual.tsx`(memo 组件,顺带完成结论 P1-3 前半),`referenceRowLines`(:39-47)保留 `wrapCardText` 行结构逐行渲染,四 presentation 全覆盖(color-pill :89 / emblem-list :112 / city-label :131 / glass-stat :153),每行带 `data-card-row-line` 与独立 `y`——reference 卡的行级 DOM 契约首次与标准卡对齐。
- **锁:** `ReferenceCardVisual.round2.test.tsx`(受控 5 行拆分断言)+ `reference-styles.test.tsx:50-76`(每行 y 唯一、按 em 估宽 ≤ contentWidth)+ `ReferenceCardVisual.test.tsx`。
- **残留(列入 Round 3,不阻塞本轮):**
  1. 私有行距 `max(17, fs+5)`(ReferenceCardVisual.tsx:80)不乘 `lineHeightMultiplier`,而卡高按 `rowHeight×multiplier`(PosterCanvas.tsx:614)→ `canvas.lineHeight<1` 时 reference 内容底部溢出、`>1` 时虚高。
  2. emblem-list 行距 `max(22, lineHeight+3)`(:106)> 默认 rowHeight 20 → 约 ≥17 行的长名单底部溢出。
  3. 非 glass presentation 丢弃 cityHeading 行(:79)但 `destinationHeight` 计入其行数 → 卡偏高(既往行为,未回归)。
  4. 行内 fragments 的 fieldTypography/fieldFonts 仍被 `join("")` 拍平(:42),仅 titleFont 透传——"按行"已修,"按字段"仍缺。
  5. 色板/标题色硬编码与 glass-stat opacity clamp 原样(= G5/P2-1)。

---

## 3. 死 token 裁决建议(margin / fieldOrder / 字段行 align)

| Token | 快照消费现状 | 裁决建议 | 理由与行动 |
| --- | --- | --- | --- |
| `style.margin`(display-frame.ts:16) | 渲染消费者 0;derive 从 `cards.gap` 写入(:227),normalize clamp 0–120 往返,解析层透传(display-frame-style.ts:67) | **保留 + 文档化 deprecated,禁止接线** | 序列化形状是 §7.1 红线(`display-frame.test.ts` 锁 clamp 与默认值);卡间距真源是 `cards.gap` → 布局求解器 `bounds.gap`,渲染层接线会造双写。行动:在字段上加 JSDoc `@deprecated 卡间距见 cards.gap,仅为序列化兼容保留` |
| `fieldOrder`(display-frame.ts:68) | 渲染消费者 0;derive 从 `visibleFields` 生成(:218-219),normalize 去重往返 | **保留 + 文档化为 derive 回声,禁止接线** | 渲染顺序真源是 `cards.visibleFields`(经 `cardRowsForGroup`/`schoolRowParts`);flow `order` 控件已随死工作台下线,接线 = 制造与 visibleFields 竞争的第二真源。行动:JSDoc 注明"渲染顺序由 cards.visibleFields 决定,本字段仅在 displayFrame 显式存在时往返保真" |
| 字段行 `align` | **裁决前提已被本轮推翻:fixed 模式已接线**(DestinationCard.tsx:160-163/:182-184/:234-236,item align 缺省时回落 frame align) | **认可接线,补锁;flow 模式暂缓** | 需 Round 3 做两件事:① 补 `align:"center"` 显式文档的几何锁定测试(现无测试锁该新行为);② flow 行接线与 P1-3 同轮,且注意 `frameBodyItem.x` 兼任 horizontalPadding/换行宽(PosterCanvas.tsx:544-547 → :617)的耦合仍在,居中锚点是在 item 盒内计算,不解耦 padding 前不要动语义 |
| item `opacity`(display-frame.ts:31) | **已激活**:custom 项三种形态均输出 opacity(DestinationCard.tsx:100/:108/:111) | 从死名单移除 | flow block 的 `style.opacity` 仍无消费者,归入 G3 |

---

## 4. Round 3 视觉验收清单(7 条渲染路径)

前置:24 省样例工程 + 长文本工程(超长校名 + 3 个五字姓名,`maxWidth:180, fontSize:12`)各跑一遍;jsdom 断言列标 ✔ 的已有测试锁,其余为浏览器人工核验或需新增测试。

**A. 标准卡(derive 路径,displayFrame undefined)**
- [ ] surface `rx=6`、stroke `#1c3154`、stroke-width 1,fill/fill-opacity 跟随 cards(✔ boundary :104 锁 0.37)
- [ ] 多行标题时 headerExtra 同步抬升 divider(`30+headerExtra`)与正文首行(`42+headerExtra`)
- [ ] 末行 baseline ≤ `height − bottomPadding`;count 右锚 `width−hp`、divider x∈[hp, width−hp]
- [ ] fieldTypography/fieldFonts 逐字段生效(✔ PosterCanvas.test :803-806)
- [ ] 显式 displayFrame 文档:custom text/decoration 项渲染(✔ :438-441)、item opacity 0.5 半透明可见(新增测试)、`style.align:"center"` 时字段行/custom 项居中(**新增测试,新行为**)

**B. ticket** — rx=12 压过用户 borderRadius;accent 条 8×height rx4 = activeColor;打孔圆 (w−18,18) r7 α0.2;卡边框不受 connectorDash 串扰
**C. photo** — 头像圆 (hp+13,21) r13 + 首字 fs11;标题与省贴图 +32 偏移;**正文行不加 +32 为已知缺陷(P2-4)**,验收时按现状记录,修复须先加几何断言
**D. borderless** — rx=0、stroke none(✔ boundary :119-121);`opacity<0.9` 时连接线隐藏(PosterCanvas.tsx:851/:1010)且 divider 隐藏、count 仍渲染——人工确认"悬浮人数"观感,不可接受则列 Round 3 修复

**E. 四 reference 共通**
- [ ] 长文本逐行渲染:每行 y 唯一、行宽 ≤ contentWidth(✔ reference-styles :50-76、round2.test)
- [ ] `data-card-visual` 与 `data-card-presentation` 一致;应用 reference → 切标准 → 回 `DestinationCard`(✔ :78-94)
- [ ] `canvas.lineHeight` 0.8 / 1.5 两档下卡底不溢出——**当前已知失配(§2.2 残留 1)**,未修则在验收记录豁免
- [ ] 深色画布下 color-pill `#1c3154` 标题、emblem-list `#263b78` 标题可读性(已知硬编码,记录观感)

**F. 各 reference 个性**
- color-pill:胶囊 `rx=min(28,max(18,h/3))`、标题居中 y=19、体行居中
- emblem-list:荧光笔/图钉不压标题;有校徽行 x=31、无校徽 x=9;≥17 行长卡底部溢出(残留 2)记录现状
- city-label:标题白描边 2.5 `paintOrder=stroke`;manual-color 省用省色、否则哈希色,同 key 重渲染颜色稳定(✔ ReferenceCardVisual.test)
- glass-stat:`fillOpacity=clamp(opacity,0.55,0.9)`(现状,滑杆半失效为 P2-1);cityHeading 行 accent 色 fs−1;count 右锚 w−9

**G. 导出对比(全部 7 条)**
- [ ] `serializePosterSvg` 输出含全部卡片文本、不含 `data-editor-grid`/selection 层(✔ export-poster.test :47-48/:63)
- [ ] 屏显 exportMode DOM 与导出 SVG 字符串逐节点一致(机制保证,见 §5);PNG 3× 下 1px 边框变粗为已知 P3-4,不在本轮验收

---

## 5. 导出像素同一性:不得变更清单

**机制事实:** 导出 = exportMode 下的真实画布 SVG DOM → `XMLSerializer`(export-poster.ts:1-20)→ canvas `drawImage` 栅格化(:70)。**没有 golden image、没有 hash 锁**;同一性完全由属性级测试维持,且"屏幕即导出"——任何画布 DOM 改动即导出改动。

**红线(Round 3 起违反即回归):**

1. **DOM 锚点全集与元素类型:** `data-display-frame-surface/-mode/-text/-decoration`、`data-destination-card`、`data-card-preset`、`data-card-presentation`、`data-card-visual`、`data-card-title-line`、`data-card-row-line`、`data-city-section`、`data-destination-connector`、`data-card-accent`、`data-card-avatar`、`data-card-province-texture`、`data-guest-*`;decoration line 必须是 `<line>`、rectangle 必须是 `<rect>`。**本轮新入约:** reference 四 presentation 的行级 `data-card-row-line` + 每行独立 y,自快照起为契约。
2. **属性级像素锁(必须继续绿):** surface stroke `#123456`/width 3(PosterCanvas.test:438-439)、fill-opacity 0.37/0/0.42(boundary :104/:190、test :776)、font-size 8/240 极值(boundary :191-192)、flow 标题 `#123456`/18 与行 `#456789`/15(test :410-414)、connector stroke/dash(test :895-897)、fieldTypography 20/#112233(test :803-804)。
3. **归一化边界与双分支:** fontSize clamp 8–240 等 normalize 边界;`displayFrame === undefined ? derive : normalize`(PosterCanvas.tsx:521-541);derive 结果不得物化写回持久层;`applyCardTemplate` 恒返 `displayFrame: undefined`。
4. **序列化字节非契约,但要克制:** 本轮已把 `font-weight="400"`/`opacity="1"`/`text-anchor="start"` 显式化(像素等价、字节不等价)。若 Round 3 建 SVG 字符串 golden,必须在本轮改动合入后取样,且此后不得把这些显式缺省值改回缺省,避免无像素意义的 churn。
5. **像素可变白名单流程:** 观感必须变的修复(lineHeightMultiplier 接入 reference 行距、emblem 行距对齐 rowHeight、photo 正文 +32、glass-stat 尊重 opacity、hairline 导出 scale)一律"先扩几何/属性断言,再改渲染"(AGENTS.md 验证纪律;P0-4 本轮即按此执行:红锁先行、修复后 recheck)。
6. **架构禁令(承袭 Round 1):** 不改 exportMode 语义、不把导出改为离屏重建(破坏"屏幕即导出"前提)、不虚拟化画布、不复活 `.display-frame-workspace` 编辑台。

---

## 6. 验收方式与遗留提醒

- **本轮交付 = 本审计文档**,无生产代码改动、无 git 操作;12 文件 127 用例的复核命令与快照钉见 §0/§2,Round 3 认领人可直接复跑。
- **提醒主调度器:** P0-3/P0-4/P1-1 的修复在复审时刻仍是**未提交**的工作树改动,提交与推送责任在落地它们的并行代理;若其提交批次拆分,请确保 `card-templates.ts` 修复与 `card-templates.presentation.test.ts` 同批(否则中间提交上测试红)。`App.tsx`/`useCardLayoutWorker` 侧改动属 opus-A/fable-A 域,本文未评审。
