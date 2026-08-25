MODEL: claude-fable-5-thinking-xhigh

# Cycle 3 Round 1 — fable-B:已接受样式遗留(A–E)的 Cycle 3 立项裁决

**分支:** `cursor/canvas-render-display-46a1`(未离开,零 git 操作)｜ **性质:** 纯核查 + 立项裁决,零 src 改动,只写本文件 ｜ **输入:** cycle2-round3-fable-b.md、cycle2-round3-conclusion.md、PROGRESS.md + 工作树实测。

**快照声明:** 核查期间 Cycle 3 Round 1 并行批已在推进:PosterCanvas 于 17:38:31(UTC)再变(polygonsKey/换色批,opus-fast-A 面),并新增 `card-layout-cache.affine.cycle3.test.ts`、`PosterCanvas.recolor.cycle3.test.tsx`。本席全部锚点 grep 均在该 mtime 之后命中,职责面定向测试于 17:38:52 复跑 **50/50 绿**(5 文件:metrics、prepared-card-content、photo-title.cycle2、types.cycle2、DestinationCard;较 Round 3 的 49 增 1 为并行批新增用例)。行号即本快照实测。

---

## 1. A–E 逐项现状核查:五项全部原样留存,无一被并行批顺手处理

| # | Round 3 登记 | 当前锚点实测 | 现状 |
| --- | --- | --- | --- |
| A | `canvasRowHeight` 测试复刻 | prepared-card-content.test:44-51("spelled out rather than solved"),7 组对拍 :120-123 | 留存,双向防漂结构完好(反向硬锁在 metrics.test 仍在) |
| B | `flowContentStart` 内联 12 + city `max(9,fs−1)` | PosterCanvas:427-429,reduce 起点 `12`、回退 `Math.max(9, project.cards.fontSize - 1)` 字面量均在 | 留存 |
| C | flow 标题 fontSize 叉 | PosterCanvas:425 `flowTitleBlock?.style?.fontSize ?? fieldTypography?.title?.fontSize ?? fontSize` vs prepared-card-content:128 `fieldFontSize("title")` | 留存(结论简报已列 P2"已接受可不做") |
| D | flow 求高整体近似 | `destinationCardHeight`(prepared-card-content:111-118)对所有模式套 `HEADER_HEIGHT` 44 + fixed 步进 | 留存 |
| E | name 字号盲区 | 见 §3.1——前提成立且触发面**比登记时更宽** | 留存,登记需修订 |

## 2. 裁决:哪些值得进 Cycle 3

结论先行:**值得的只有 B(零像素收编,Round 1 即可顺带);C、E 条件值得(P2 像素批,Round 2/3 样式余项席有余量再立,单独交付);A、D 不值得。** Cycle 3 主题是 perf(P0 polygonsKey、P1 换色不重投影),样式遗留不得挤占 P0/P1 席位。

### 2.1 值得|B:`flowContentStart` 收编入 metrics —— 唯一推荐 Round 1 顺带做的项

- **理由:** 纯搬运零像素,恰好落在 opus-fast-B"样式余项"所有权面;12 即 `DESTINATION_CARD_TITLE_TOP`,收编后 PosterCanvas 不再持有任何 header 几何字面量,与 Cycle 2 反向硬锁的方向一致。
- **形态:** 抽 `destinationCardFlowContentStart(blocks, fontSize)` 入 destination-card-metrics,PosterCanvas:427-429 改调;metrics.test 加一条与现内联式的对拍。
- **硬边界(本裁决核心):收编必须逐字搬运回退链,禁止"顺手统一"为 `cardFieldFontSize`。** 内联式的块字号回退是 `block.style?.fontSize ?? (city ? max(9, fs−1) : fs)`,**不含 fieldTypography**;而 `cardFieldFontSize` 首查 `fieldTypography?.[field]?.fontSize`。若换用后者,凡设了 fieldTypography 的 flow 文档 flow 光标即变,是伪装成重构的隐性像素批。语义差异在新函数 JSDoc 记载,归入 D 族(§3.2),不在收编批内消除。

### 2.2 条件值得|C:flow 标题 fontSize 叉 —— P2,独立像素批

- **理由:** 真行为缺陷(块设字号时换行宽/行数/步进按 typography 字号、glyph 按块字号,可右溢),重开路径与 Cycle 2 headerOffset 批同构且已写明:options 增已解析标题字号一项,PosterCanvas 传块字号。
- **不进 Round 1 的理由:** 结论简报已裁"已接受可不做";触发面窄(仅 flow + 块显式 `style.fontSize`);须为像素批单独交付 + 回滚说明,Round 1 六席无此余量。
- **联动边界:** 若立项,须与 B 收编后的 `destinationCardFlowContentStart` 喂同一已解析字号,否则 glyph 溢出修掉了、flow 光标推进仍用旧字号,叉从"渲染 vs 求解"移进"求解内部"。故 **C 必须排在 B 之后**。

### 2.3 条件值得|E:行默认 paint 字号盲区 —— P2,重开路径比登记的窄一个量级(见 §3.1)

- Round 3 登记的重开路径("入参改喂行 paint 字号集合"的字段级联重构)过重;实测后最小修复是 **computePreparedCardMetrics 一行**:给 `destinationCardRowFontSize` 的集合无条件加入行默认 paint 字号 `fieldTypography?.name?.fontSize ?? fontSize`(与渲染侧 `cardFieldFallback(style, "name")`:109 对齐)+ metrics 测试一条。
- 像素影响:`typography.name` 大于全部可见字段字号且 name 不可见的文档,步进变大、卡变高(当前是 glyph 顶破 bottom padding,修后为正确保留)。真实触发配置罕见(隐藏 name 却给它留着更大字号),故仍 P2:有余量再立,单独像素批交付。
- **不与 B 同批**(B 零像素、E 有像素,回滚单元必须分开)。

### 2.4 不值得|A:`canvasRowHeight` 测试复刻 —— 建议从"遗留"出栈,改记"设计决定"

它是双向防漂结构的一半(硬锁防组件重内联、复刻防 metrics 自身漂移),"修复"它等于拆保险。Cycle 3 任何席位不得动它;将来 metrics 公式合法变更时 7 组对拍红、同批改之,这是它在正常工作,不是债务。

### 2.5 不值得|D:flow 求高整体近似 —— 维持接受,S5 全批另立门户

修复需布局侧感知逐块步进,横跨 solver 与渲染,与 Cycle 3 的 perf 主题正交且体量超一轮席位;无用户报告。维持 Round 3 裁决:重开 = S5 全批,届时 C(以及 §3.2 子观察)一并解决。**注意 C 若按 §2.2 提前单独做,S5 全批立项时须核销之,避免重复登记。**

## 3. 核查中的两项新发现(登记入案,不单独立项)

### 3.1 E 项登记修订:触发面比 Round 3 记载的更宽

Round 3 把 E 记为"name ∉ visibleFields 且 typography.name 更大时"的窄盲区。实测渲染链:非标题正文行的**行级** `<text>` 一律以 `cardFieldFallback(style, "name", …)` 为 fallback(DestinationCard:229-231),该 fallback **携带 fontSize**(:109 `typography?.fontSize ?? …`);带 field 的 fragment 有 tspan 覆写(:262),但**分隔符 " · " 与自定义表达式产出的无 field fragment 直接继承行级字号**。即只要设了 `typography.name`,无论 name 是否可见、是否有 name fragment,正文行内都存在按该字号画的 glyph,而 solver 的 `rowFontSize` 集合(prepared-card-content:125)只含 visibleFields + city heading。E 不是"罕见配置的一致盲",是"行默认 paint 字号从未进过求解集合"。最小修复即 §2.3。

### 3.2 D 族新增子观察:flow 光标的块字号回退不含 fieldTypography

同一 useMemo 内,`flowTitleFontSize`(PosterCanvas:425)回退链含 `fieldTypography?.title?.fontSize`,三行之下 `flowContentStart`(:428)的逐块回退不含——设 `fieldTypography.title` 而块无 `style.fontSize` 的 flow 文档,标题 glyph 按 typography 字号画,光标却按纯 fontSize 推进,头带欠保留。属 flow 求高近似家族,归 D,S5 全批时一并解;B 收编批只登记不修复(§2.1 硬边界)。

## 4. 验证链与合规

- **验证:** 无失败,failure→cause→fix→recheck 链无触发点。定向 5 文件 50/50 绿(17:38:52,晚于 PosterCanvas 17:38:31 的并行变更);锚点 grep 全部在末次 mtime 之后命中,确认 C3-R1 并行批(PosterCanvas 前部 polygonsKey/换色面)未触碰本席 A–E 任一锚点。
- **合规:** 未离开分支、零 git 操作、零 src 改动、只写本文件;未重挂载(remount)展示框工作台,未引入任何指向它的 import;A–E 核查全部以只读 grep/测试完成。

**收束陈述:** 五项接受遗留全部原样留存。进 Cycle 3 的裁决:**B 立项(Round 1,opus-fast-B 顺带,零像素,逐字搬运回退链);C、E 条件立项(P2,Round 2/3 有余量再做,各自独立像素批,C 排 B 后);A 出栈改记设计决定;D 维持接受待 S5 全批。** 另将 E 的触发面修订(§3.1)与 D 族子观察(§3.2)登记入案,供后续轮次免于重新考古。
