MODEL: claude-fable-5-thinking-xhigh

# Cycle 2 Round 3 — fable-B:metrics vs prepared-card-content 分叉终局核查与接受裁决

**分支:** `cursor/canvas-render-display-46a1`(未离开,零 git 操作)｜ **性质:** 纯核查 + 终局裁决,零 src 改动 ｜ **输入:** cycle2-round2-conclusion.md、cycle2-round2-fable-b.md + 工作树实测。

**快照声明:** 本轮漂移比 Round 2 更剧烈:核查期间职责面五个文件在 17:26:50–17:30:14(UTC)间被并行批次连续推进,首轮定向测试(46/46,17:27:53)运行后测试文件又更新两次,遂在末次快照复跑同一组测试(**49/49 绿**,17:30:32,晚于全部 src 变更)。本文行号即末次快照实测;PosterCanvas 因 17:30 批在文件前部插码(地图基几何面,非本席职责)整体下移约 2 行,重定位一律以函数/属性锚点名为准。

---

## 1. Round 2 剩余清单逐项核销(五项全部有动静,四项闭合)

### 1.1 清单 #1|PosterCanvas `cardStyle.rowHeight` 改调 metrics:**已落地,且锁升级为反向硬锁**

- PosterCanvas 现调 `destinationCardFixedRowHeight` + `destinationCardRowFontSize`(:403-410),`cityHeadingFontSize` 经 lib 侧 `cardFieldFontSize` 求得(:406,import 自 prepared-card-content,依赖方向 component→lib 正确)。内联三行公式与注释一并替换,注释明确"与 `buildPreparedCardContents` 求高同源"。
- Round 2 判定的两道**软锁**均被处理,方式优于原建议:44 空转扫描与 rowHeight 正则对拍锁没有简单删除,而是替换为**反向硬锁**(metrics.test "owns the header height and the fixed row step…"):扫全部 canvas 源码,禁止再出现 `\d+ + headerExtra + lineCount * rowHeight` 与 `compactLayout ? d : d` 字面量,并正断言 PosterCanvas 源码含两个函数名。Round 2 登记的"正则不匹配即空转"缺陷由此消除——将来任何人把公式抄回组件,测试必红而非静默。
- **合理偏离登记:** Round 2 清单原文含"删测试复刻",但 `canvasRowHeight` 复刻(prepared-card-content.test.ts:44-53)被保留,注释改为"spelled out rather than solved",继续与 metrics 做 7 组配置对拍(:109-124)。保留后它成为公式在 src 之外的**唯一**手写副本,与反向硬锁互补(硬锁防组件重内联,对拍防 metrics 自身漂移)。判定:偏离成立且更优,核销。

### 1.2 清单 #2|卫生批:**已落地**

- metrics 头部过时 JSDoc("`destinationHeight()` in `PosterCanvas` still inlines this literal")已删(现 :12-17 只述语义);`DESTINATION_CARD_TEXTURE_HEADER_WIDTH` 注释由"`PosterCanvas` subtracts"改为"The card solver subtracts"(:51-55),与消费点搬进 lib 的事实一致。
- prepared-card-content 贴图宽字面量 `36` 已换 `DESTINATION_CARD_TEXTURE_HEADER_WIDTH` import(:17、:131)。

### 1.3 清单 #3|titleLineHeight 内联复刻:**已落地**

prepared-card-content:141 改调 `destinationCardTitleLineHeight(titleFontSize, options.lineHeightMultiplier)`,消掉最后一份 `max(16, fs+4)×m` 拷贝。multiplier 语义未动,与 S5 不冲突,符合 Round 2 "白捡"预判。

### 1.4 清单 #4|photo 标题换行宽度感知 headerOffset:**已落地,像素批,断言先行**

Round 2 §2.2 登记的真残叉(标题按未缩进宽度换行、起笔右移 32,可与 "N 人" 徽章 glyph 带碰撞)按预设的窄路径修复:

- `PreparedCardContentOptions` 增可选 `headerOffset`(:73-77),JSDoc 写死 title-only 语义("only the title wrap width pays for it — body rows keep the padding box"),与 `destinationCardHeaderOffset` 的 header-only 裁决同一措辞体系。
- `titleWidth = contentWidth − max(42, titleFs×3) − texture − headerOffset`,下限 titleFontSize(:144-147)。
- PosterCanvas 传 `destinationCardHeaderOffset(project.cards.preset)`(:470);依赖数组本就含 `project.cards.preset`,无需增项。
- 测试先行三道锁:photo titleWidth = plain −32、texture+photo −68、窄卡下限 floor(prepared-card-content.test:75-90);长标题更早折行且高度差恰等于 headerExtra 差(:92-100);**contentWidth 不变**断言(:82)钉死正文不缩进裁决不被顺手改掉。
- 像素影响与 Round 2 预告一致:仅 photo + 长标题文档(标题更早折行,headerExtra 可能 +1 行,卡高相应增加);贴图对称性(titleX +36 / titleWidth −36)未被破坏。回滚 = revert 该批(options 一项 + 公式一项 + 传参一行 + 测试)。

### 1.5 清单 #5|flow S5:**半落地——multiplier 叉闭合,fontSize 叉留存**

- **已闭合(子叉一,multiplier):** DestinationCard 标题基线步进由 `flowTitleBlock?.lineHeight ?? lineHeightMultiplier` 改为恒 `lineHeightMultiplier`(:301-309),行内注释写死裁决:solver 按此倍率把折行标题计入 headerExtra,渲染若按块倍率(恒 1.2)步进,第二行会掉出已保留的头带。方向与 Round 2 §3 分析一致——统一到**求解侧**语义。像素影响:flow 文档折行标题的第 2+ 行 glyph 位置微移(默认 multiplier=1 时上移),divider/正文位置不变(它们本就用求解步进)。
- **留存(子叉二,fontSize):** PosterCanvas:425 渲染标题字号仍是 `flowTitleBlock?.style?.fontSize ?? typography.title ?? fontSize`,solver 的 `titleFontSize = fieldFontSize("title")`(prepared-card-content:128)仍对流块 style 不可见——块设字号时换行宽度、行数、步进按 typography 字号,glyph 按块字号,可右溢。
- **留存(同族):** flow 求高整体近似(`destinationCardHeight` 对所有模式用 fixed rowHeight + HEADER_HEIGHT 44);PosterCanvas `flowContentStart` 内联 `12` 起点与 city `max(9, fs−1)`(:427-429)。

---

## 2. 终局裁决:按指令接受全部残余样式分叉

本席受命:并行 Round 3 之后,残余样式分叉一律**接受**,不再排后续轮次。逐项登记如下(接受 ≠ 遗忘:每项附触发条件与将来重开的最小路径,供后人翻案时免于重新考古):

| # | 残余分叉 | 级别 | 接受理由 | 触发条件 / 重开最小路径 |
| --- | --- | --- | --- | --- |
| A | `canvasRowHeight` 测试复刻(prepared-card-content.test:44-53) | 样式(测试侧拷贝) | src 之外唯一手写副本,与反向硬锁互补成双向防漂 | 若 metrics 公式合法变更,7 组对拍红,同批改之即可 |
| B | `flowContentStart` 内联 12 + city `max(9,fs−1)`(PosterCanvas:427-429) | 样式(组件侧拷贝) | 12 即 `DESTINATION_CARD_TITLE_TOP`,city 式即 `cardFieldFontSize` 语义,数值同源;收编属 S5 面,本 cycle 关闭 | 重开 = 抽 `destinationCardFlowContentStart(blocks, fontSize)` 入 metrics,纯搬运零像素 |
| C | flow 标题 fontSize 叉(PosterCanvas:425 vs prepared-card-content:128) | 行为(可右溢) | 仅 flow 模式且流块显式设 `style.fontSize` 时触发;fixed 模式与默认 flow 文档两侧严格一致 | 重开 = 与 §1.4 同构:options 增已解析的标题字号一项,PosterCanvas 传块字号;须为像素批单独交付 |
| D | flow 求高整体近似(fixed 步进 + 44 头高套用 flow 文档) | 行为(高度近似) | 修复需布局侧感知逐块步进,改动面横跨 solver 与渲染,超出收尾窄批边界 | 重开 = S5 全批;届时子叉 C 一并解决 |
| E | 共同盲区:`name ∉ visibleFields` 且 `typography.name` 更大时 glyph 大于步进 | 行为(两侧一致盲) | 非模块间分叉,步进两侧算得一致;修复需同批动 solver 与渲染的字段级联 | 重开 = `destinationCardRowFontSize` 入参改喂"行 paint 字号集合"而非 visibleFields 字号集合 |

不属本席面、不重复登记:冻结路径不 clamp(freeze 语义,Round 2 边界风险已记)、feTurbulence seed、pan 触发求解与地图基几何缓存(C2-3/P0,17:30 批正在 PosterCanvas 前部推进,本席未审)。

## 3. 验证链与合规

- **验证:** 首跑 4 文件 46/46 绿(17:27:53)→ 发现测试文件其后仍在更新(至 17:28:30)且 PosterCanvas 17:30:14 再变 → 末次快照**复跑同一命令 49/49 绿**(17:30:32,晚于全部 src/测试变更;+3 为 headerOffset 两条新锁与 fixed 步进下限断言)。无失败,failure→cause→fix→recheck 链无触发点;锚点级 grep 复核确认 17:30 批未触碰本席五项锚点。
- **C2-2 加固顺带核销:** 新增 `prepared-card-content.types.cycle2.test.ts` 把"lib 不得 import components"升为硬锁,Round 2 §4 登记的倒挂修复至此有独立防回归。
- **合规:** 未离开分支、零 git 操作、零 src 改动、只写本文件;未复活(remount)展示框工作台,未引入任何指向它的 import;`data-*` 锚点未触碰。

**收束陈述:** 本席职责面(C2-1、C2-2、C2-5 前半、S5 子叉一)全部闭合且各有硬锁或三值锁;残余五项(A–E)依指令接受并登记在案。metrics ↔ prepared-card-content ↔ 渲染三方在 fixed 模式已做到单一正源、glyph-true、双向防漂,本 cycle 于本席无遗留动作。
