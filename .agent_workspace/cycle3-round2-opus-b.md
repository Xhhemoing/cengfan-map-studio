MODEL: claude-opus-5-thinking-high-fast

# Cycle 3 Round 2 — opus-fast-B:C3-R2-2 `destinationCardFlowContentStart` 收编

**分支:** `cursor/canvas-render-display-46a1`(未离开,零 git 提交)｜ **性质:** 纯搬运,零像素 ｜ **输入:** `cycle3-round1-conclusion.md` C3-R2-2、`cycle3-round1-fable-b.md` §2.1(B 项裁决与硬边界)。

## 1. 改了什么

| 文件 | 改动 |
| --- | --- |
| `src/lib/destination-card-metrics.ts` | 新增 `destinationCardFlowContentStart(blocks, fontSize)`,置于 `destinationCardBodyTop` 之前(后者消费它的返回值);`import type` 增 `DisplayFrameFlowBlock`。 |
| `src/components/canvas/PosterCanvas.tsx` | 仅 `flowContentStart` 一处:内联 reduce → `destinationCardFlowContentStart(flowBlocks, project.cards.fontSize)`,并加 import。`displayFrame.mode === "flow" ? … : 0` 三元保持原样。 |
| `src/lib/destination-card-metrics.test.ts` | 新增两条用例:5 组 fixture 与旧内联式逐字对拍;PosterCanvas 锚点 + 全 canvas 源反内联守卫。 |

`MapLayer.tsx`、`prepared-card-content.ts`、`scripts/perf-canvas-bench.ts` 未触碰(bench 第 185 行另有一份同形回退链,属 gpt-sol-A 所有权面,本席不动,登记备查)。

## 2. 逐字搬运的证据(§2.1 硬边界)

旧式(PosterCanvas 原 :451,单行):

```ts
flowBlocks.reduce((cursor, block) => cursor + block.spacing + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize)) * block.lineHeight, 12)
```

新式(metrics,仅换行与形参重命名,表达式结构与运算顺序不变):

```ts
blocks.reduce(
  (cursor, block) => cursor
    + block.spacing
    + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, fontSize - 1) : fontSize)) * block.lineHeight,
  DESTINATION_CARD_TITLE_TOP,
)
```

- 起点 `12` → `DESTINATION_CARD_TITLE_TOP`(常量值即 12,收编后 PosterCanvas 不再持有 header 几何字面量)。
- **未换用 `cardFieldFontSize`。** 回退链保持 `block.style?.fontSize ?? (city ? max(9, fs−1) : fs)`,不含 `fieldTypography`。语义差异写进新函数 JSDoc:与 `prepared-card-content` 的 `cardFieldFontSize` 首查 typography 的差别是**故意**的,换用后者会让所有设了 `fieldTypography` 的 flow 文档光标位移(伪装成重构的像素批);该错配(§3.2 记载的"标题 glyph 按 typography 画、光标按纯 fontSize 推进")归 D 族,留待 flow 求高整体重做时消除,本批只记载不修复。

## 3. 新增测试

1. **"walks the flow cursor exactly as the canvas inlined it before the move"** — 测试文件内保留一份旧内联式 `inlinedFlowContentStart`(字符级复刻),对 5 组 fixture 对拍:空块集 / 派生的 title·name·city 三块栈 / 块自带 `style.fontSize` 与 `lineHeight` / `fontSize = 9`(city 触 `max(9, …)` 地板) / 无 field 的 text 块。另有 4 条绝对值锁:空集 = `DESTINATION_CARD_TITLE_TOP`;name 块 `12 + 0 + 12*1 = 24`;city 块 fs=12 → `12 + 11 = 23`;city 块 fs=9 → `12 + 9 = 21`(地板生效)。
2. **"keeps the flow cursor out of the canvas as a literal"** — PosterCanvas 必须含 `destinationCardFlowContentStart`,且全部 canvas `.tsx` 源不得再出现 `cursor + block.spacing`,防组件侧重内联(与 Cycle 2 反向硬锁同构)。

## 4. 验证链(failure → cause → fix → recheck)

**无失败,四步链无触发点。** 一次通过的实测:

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/lib/destination-card-metrics.test.ts src/components/canvas/DestinationCard.test.tsx`(指定验收命令) | 2 文件 **33/33 绿** |
| `npx vitest run src/components/canvas src/lib/prepared-card-content.test.ts`(外扩回归) | 31 文件 **223/223 绿** |
| `npx tsc --noEmit -p tsconfig.app.json` | 干净 |
| `npx eslint`(三个改动文件) | 干净 |

## 5. 交付与回滚

- **验收方式:** 上述定向测试 + CI;零像素改动,无需人工目视对比(对拍用例即像素等价的机器证据)。
- **回滚:** 纯函数搬运,无持久化格式、无 API 形状、无导出格式变更。回滚 = 把 `destinationCardFlowContentStart(flowBlocks, project.cards.fontSize)` 换回旧内联表达式并删函数与两条用例,单 commit 可逆。
- **合规:** 未 `git checkout`、未 `git commit`;未触碰 `MapLayer.tsx`;PosterCanvas 只改 flowContentStart 调用点与 import。
