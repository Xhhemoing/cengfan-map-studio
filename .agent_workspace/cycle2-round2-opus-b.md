# Cycle 2 Round 2 — opus-fast-B（rowHeight 单一真源 + photo 正文偏移裁决）

**MODEL: claude-opus-5-thinking-high-fast**（未降级）。分支 `cursor/canvas-render-display-46a1`，全程未 `git checkout`、未 `git commit`。

## 1. C2-1 / D1：rowHeight 单一真源

### 分叉现状（复现）

两处公式：

- **绘制侧**（`PosterCanvas.cardStyle.rowHeight`，卡片实际步进）：可见字段一律取 `fieldTypography[field]?.fontSize ?? fontSize`，再与 city 抬头字号取 max。
- **求高侧**（`computePreparedCardMetrics`）：可见字段走 `cardFieldFontSize`，其中 `city` 被降一档为 `max(9, fontSize−1)`。

`visibleFields === ["city"]`、无 city 字号覆盖、`fontSize ≥ 15` 时两者差 1×lineHeightMultiplier/行。

### 裁决：以「卡片实际绘制的步进」为准，求高侧对齐它

与 fable-b 的 D1 建议（统一到 `cardFieldFontSize`、降低绘制步进）方向相反，理由是渲染事实：

- **city 作为行内字段**时，它是普通正文行里的一个 `tspan`，`fontSize` 只有在 `fieldTypography.city` 显式覆盖时才写出，否则**继承整行的 name 字号 = 完整 `fontSize`**（`DestinationCard.tsx` 行内 tspan + `cardFieldFallback("name")`）。降一档只发生在 **city 抬头行**（走 city 字段级联）。所以绘制侧公式才是准确的那个。
- 取较大的步进保住不变量「末行 baseline ≤ height − bottomPadding」：对齐后是把求出的高度抬高 1px/行，而不是把已绘制的行挤紧。
- 本轮 `PosterCanvas.tsx` 属禁改文件，绘制侧公式无法改动，因此「匹配已绘制者」也是唯一可落地的方向。

### 落地

`src/lib/destination-card-metrics.ts` 新增（该模块成为 fixed 行步进的唯一真源）：

- `DESTINATION_CARD_FIXED_ROW_MIN_HEIGHT = 20` / `DESTINATION_CARD_COMPACT_ROW_MIN_HEIGHT = 18` / `DESTINATION_CARD_FLOW_LINE_HEIGHT = 1.2`；`DESTINATION_CARD_ROW_LINE_LEADING = 6` 改注为 flow/fixed 共用。
- `destinationCardRowFontSize({ visibleFieldFontSizes, cityHeadingFontSize })` — 行内字段按行绘制字号计，抬头字号单独并入；JSDoc 写明为何此处不能用 `cardFieldFontSize`。
- `destinationCardFixedRowHeight({ rowFontSize, compactLayout, lineHeightMultiplier })`。
- `destinationCardBodyRowHeight({ mode, solvedRowHeight, fontSize, lineHeight? })` — 正文步进的唯一入口：fixed 用求解步进，flow 用块自身步进。

消费方：

- `computePreparedCardMetrics` 改用 `destinationCardRowFontSize` + `destinationCardFixedRowHeight`（仅 rowHeight 公式，未动其它）。
- `DestinationCard` 正文行改走 `destinationCardBodyRowHeight`（原来是组件内 `frameMode === "flow" ? ... : rowHeight` 的三元）。

### 高度变化（受影响文档条件 + 新值）

仅「city 在 visibleFields 内、无 city 字号覆盖、且其余可见字段解析字号均小于 `fontSize`」的文档：行步进由 `(fontSize−1)+6` 抬到 `fontSize+6`。
样例（`visibleFields: ["city"]`, `fontSize: 16`, `lineHeightMultiplier: 1`）：rowHeight 21 → 22，单抬头行卡片高度 77 → **78**（`44 + 22 + 12`）。已写成断言：`prepared-card-content.test.ts` 的「steps a city-only card at the size its rows paint」。

其余配置（含默认 `["university","name"]`）**逐字节不变**：新增的 parity 测试用 7 组配置对拍 `computePreparedCardMetrics().rowHeight` 与绘制侧公式的移植版。

**回滚**：改动纯前端几何、无数据/导出/API 形状变化，revert 上述三文件即可；受影响的只有上述窄条件文档的渲染高度（不落盘，重开即按新公式重算）。

## 2. C2-5：photo 正文 +32 —— 裁决为「不加，并落成可测约束」

**不给正文行加 headerOffset 32**，理由（已写进 `destinationCardHeaderOffset` 的 JSDoc）：

1. 头像圆盘下沿 `AVATAR_CENTER_Y + RADIUS = 21 + 13 = 34`，在首行正文基线 `FIXED_BODY_TOP = 42` 之上——正文本来就没有需要避让的装饰。
2. 正文的折行宽度 `contentWidth = cardWidth − horizontalPadding*2` 由 `prepared-card-content` 求解、经 `PosterCanvas` 喂入，**不含 headerOffset**，且 `PreparedCardContentOptions` 里没有 preset，本轮无法在不改 `PosterCanvas` 的前提下把 32 从折行宽度里扣掉。此时给正文加 32 只会把每一行的末尾字撞出右侧内边距，属净回归。
3. 顺带记录：title 侧的 `titleWidth` 同样只扣了 texture 的 36、没扣 photo 的 32——title 的 +32 本身也带着同一处溢出风险，属 `PosterCanvas` 所有权，留给下一轮。

守护：`destination-card-metrics.test.ts` 断言头像下沿 ≤ 首行正文基线（头像一旦长进正文带，测试即失败并强制重新裁决）；`DestinationCard.test.tsx` 锁 photo 预设下 title x=44、正文 x=12。

## 3. 验证（failure → cause → fix → recheck）

1. **failure（主动构造）**：把 `computePreparedCardMetrics` 还原成旧公式后跑目标测试 → 2 red：parity 用例与 city-only 用例（`expected 15 to be 16`）。证明新测试确实锁住 D1，不是空断言。
2. **cause**：可见字段里的 `city` 被 `cardFieldFontSize` 降一档，而绘制侧不降（见 §1）。
3. **fix**：`destinationCardRowFontSize` / `destinationCardFixedRowHeight` 收口，求高侧改调它们。
4. **recheck**：
   - `npx vitest run src/lib/destination-card-metrics.test.ts src/lib/prepared-card-content.test.ts src/components/canvas/DestinationCard.test.tsx` → **46 passed**。
   - 全量 `node scripts/run-heavy.mjs npx vitest run` → **186 files / 1415 tests passed**。
   - `npx tsc --noEmit -p tsconfig.app.json` → 0 error；六个改动文件 eslint → 0 problem。

源码字节锁（沿用 HEADER_HEIGHT 那条的宽容写法）：`destination-card-metrics.test.ts` 扫描 `components/canvas/*.tsx`，把 `PosterCanvas` 仍内联的 `compactLayout ? 18 : 20 … + 6 … * lineHeightMultiplier` 三个字面量与 token 对拍（已确认当前能匹配到 1 处，非空跑）。

## 4. 遗留（下一轮）

- **`PosterCanvas.cardStyle.rowHeight` 仍是内联表达式**，只靠字节锁守护。下一轮解禁 `PosterCanvas` 时应直接改调 `destinationCardRowFontSize` + `destinationCardFixedRowHeight`，届时字节锁自动变为空匹配（可同时删除）。
- **`titleLineHeight` 与 `textureHeaderWidth: 36` 仍在 `prepared-card-content` 里内联**，与 `destinationCardTitleLineHeight` / `DESTINATION_CARD_TEXTURE_HEADER_WIDTH` 同式重复（本轮授权限定「rowHeight formula ONLY」，故未动）。属 C2-1 同类残留，一行替换即可。
- **photo preset 的 `titleWidth` 未扣 32**（见 §2.3），需与 `PosterCanvas` 一并处理。

## 5. 交付说明

- 改动文件：`src/lib/destination-card-metrics.ts(.test.ts)`、`src/lib/prepared-card-content.ts(.test.ts)`、`src/components/canvas/DestinationCard.tsx(.test.tsx)`。未触碰 `PosterCanvas.tsx` / `DestinationCardsLayer.tsx`。
- 验收方式：上述目标测试 + 全量 Vitest + tsc + eslint（本文件 §3 记录），合入前建议在编辑器里以 photo 预设、以及 `visibleFields=["city"]`+`fontSize=16` 的文档各看一张卡的末行是否仍在底边内。
- 未执行 `git add/commit/push`（本轮明令禁止），改动留在工作区。
