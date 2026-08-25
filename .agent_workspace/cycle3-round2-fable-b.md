MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 2 — fable-B:C3-R2-2(flowContentStart 收编)落地核查

**分支:** `cursor/canvas-render-display-46a1`(未离开,零 git 操作,连只读 git 命令亦未执行,时序全部以文件 mtime 佐证)｜ **性质:** 纯核查,零 src 改动,只写本文件 ｜ **输入:** cycle3-round1-fable-b.md(§2.1 硬边界)、cycle3-round1-conclusion.md(C3-R2-2 登记)+ 工作树实测 + 定向测试。

**快照声明(本席实测目击落地过程):** 本席开始核查时恰逢并行批正在落地该项——17:47 前后首抓 PosterCanvas 时内联 reduce 尚在(:450-452,字面量 12 与 `Math.max(9, …)` 均在);随后 metrics 于 **17:48:04**(UTC)先落函数,PosterCanvas 于 **17:48:11** 改调,metrics.test 于 **17:48:36** 定稿;本席全部结论性锚点抓取与测试复跑(17:49:46)均晚于三文件末次 mtime,17:50:05 复核 mtime 无再变。以下行号即该稳定快照实测。

---

## 1. 核心答案:**已落地,回退链逐字合规**

Round 1 裁决的 B 项(结论简报登记为 C3-R2-2:"抽到 `destinationCardFlowContentStart`,逐字保留回退链,禁止换成 cardFieldFontSize")已完整落地,§2.1 硬边界全部满足:

### 1.1 函数体:回退链逐字符搬运,起点等值换名

`destination-card-metrics.ts:176-183`:reduce 起点 `DESTINATION_CARD_TITLE_TOP`(:20,`= 12`,与旧字面量等值,且对拍测试用字面量 12 复刻锁死等值性,见 §1.4),逐块步进 `block.spacing + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, fontSize - 1) : fontSize)) * block.lineHeight`——与旧内联式逐字符一致,唯一差异是 `project.cards.fontSize` 改为参数 `fontSize`(纯 α 换名)。

### 1.2 fieldTypography 被**签名层面结构性排除**——比"没写"更强

函数签名只收 `(blocks: readonly DisplayFrameFlowBlock[], fontSize: number)`,typography 根本不在入参里,不存在"哪天顺手查一下"的通道。JSDoc(:164-175)按 §2.1 要求逐点记载:回退"deliberately **not** to `fieldTypography`, unlike `cardFieldFontSize`";换用 typography "would move the flow cursor…a pixel change, not a refactor";并把 §3.2 登记的叉(设 `fieldTypography.title` 时 glyph 按 typography 字号画、游标按纯 fontSize 推进)明文归入 flow 求高近似家族(D 族),留待 solver 整体重做时解——与本席"只登记不修复"的裁决措辞一致。

### 1.3 PosterCanvas 改调,输入不变

import(:37)+ 调用(:451-453)`displayFrame.mode === "flow" ? destinationCardFlowContentStart(flowBlocks, project.cards.fontSize) : 0`——喂的是与旧 reduce 相同的 `flowBlocks` 数组与相同的 fontSize,零像素成立。全部画布文件 grep `cursor + block.spacing` 与 `Math.max(9` 确认:旧游标式已清除,PosterCanvas 不再持有 header 几何字面量(fixed 分支的 `: 0` 非几何量)。画布侧仅剩 `ReferenceCardVisual.tsx:170` 的渲染端 `Math.max(9, fontSize - 1)`——那是 paint 侧 city 标题降档的同构规则,不是游标,不在收编范围,留存正确。

### 1.4 对拍测试:§2.1 要求的"与现内联式对拍"按最强形态落地

metrics.test:50-56 保留旧内联式的**逐字符复刻** `inlinedFlowContentStart`(字面量 `12`、`Math.max(9, fontSize - 1)` 原样),:148-152 以 5 组夹具对拍新函数;夹具(:63-97)覆盖回退链全部分支——空块、无 style 的 title/name/city 栈(次链)、自带 `style.fontSize` 的块(首链)、fontSize=9 触 `max(9,…)` 地板、无 field 文本块。另有直接值断言(:155-159)锁 city 降档与地板,注释明言 "never at a typography size"。

### 1.5 反向硬锁:B 项自身获得了与 Cycle 2 同构的双向防漂

metrics.test:162-168 新增:PosterCanvas 源码必须含 `destinationCardFlowContentStart`,且任何画布文件不得再出现 `cursor \+ block\.spacing`(防重内联)。复刻对拍(防 metrics 漂移)+ 源码硬锁(防画布重内联),Round 1 §2.4 论证的双向结构现已覆盖本项。

### 1.6 未越界:C 项边界原样

`flowTitleFontSize`(:449)与 `flowNameFontSize`(:450)的 `fieldTypography` 回退链一字未动——落地批没有"顺手统一",C 项(flow 标题 fontSize 叉,P2 独立像素批)按裁决仍留存未做,§2.2 的"C 必须排 B 后"排序前提保持成立。

## 2. 测试证据

职责面定向 5 文件(metrics、prepared-card-content、photo-title.cycle2、types.cycle2、DestinationCard)于 **17:49:46 复跑 52/52 全绿**,晚于三文件末次 mtime(17:48:36)。较 Round 1 的 50 增 2,恰为 metrics.test 新增的两条 flow 游标测试(§1.4 对拍 + §1.5 硬锁),数目对账吻合。

## 3. 工作台合规

未重挂载(remount)展示框工作台:本席零 src 改动、未引入任何指向它的 import;grep `src/components/canvas` 全目录无 `ProjectWorkbench`/workbench 任何引用——落地批同样未违反结论简报"禁止复活展示框工作台"的禁令。

## 4. 验证链与合规

- **验证:** 无失败,failure→cause→fix→recheck 链无触发点;唯一时序风险(核查中途文件在变)以 mtime 对账 + 末次 mtime 之后全量重抓 + 测试后复核 mtime 无再变的方式消解。
- **合规:** 未离开分支、零 git 操作、零 src 改动、只写本文件;A/D/E 等其余遗留项不在本轮问题面,未重复考古。

**收束陈述:** C3-R2-2 已落地且**完全符合 Round 1 §2.1 硬边界**——回退链逐字符搬运、起点等值换名为 `DESTINATION_CARD_TITLE_TOP`、fieldTypography 被签名结构性排除、语义差异入 JSDoc 并归档 D 族、对拍以旧式逐字符复刻实现、另获反向硬锁,PosterCanvas 输入不变故零像素成立;C 项边界未被顺手越过;5 文件 52/52 绿。B 项可从遗留栈核销。
